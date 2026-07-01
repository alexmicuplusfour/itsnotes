const db = require('../db');
const NoteLink = require('../models/NoteLink');
const Note = require('../models/Note');
const { fetchLinkPreview } = require('../utils/fetchLinkPreview');
const { extractLinkUrls } = require('../utils/extractLinkUrls');

/**
 * One-time backfill: notes created before the link-preview feature have URLs in
 * their body but no note_links rows. Find those, create the rows, and fetch each
 * link's OpenGraph preview.
 *
 * Idempotent — a note that already has any link row (or has no URLs) is skipped,
 * so this is a no-op once every note has been processed. Replaces the old
 * per-request backfill that ran on every list load.
 *
 * When given a socket.io instance, each processed note is broadcast via
 * note_updated as its previews land, so already-open clients update live.
 *
 * Runs under a Postgres advisory lock so that when the app is started in cluster
 * mode (PM2 -i / multiple workers) or with several replicas, exactly ONE process
 * does the work — the others get the lock refused and return immediately. Without
 * this, every worker would fetch every link in parallel and spike CPU/bandwidth.
 *
 * Run standalone with:  node src/scripts/backfill-link-previews.js [--dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');
// Arbitrary app-wide key identifying this one-time backfill (nod to migration 0013).
const ADVISORY_LOCK_KEY = 130013;

async function backfillLinkPreviews(io = null) {
  // Hold a session-level advisory lock on a dedicated connection for the whole
  // run. Sibling workers calling this at the same time get `locked = false` and
  // bail out. The lock auto-releases if this process dies mid-run.
  const lockClient = await db.pool.connect();
  try {
    const { rows } = await lockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_KEY]);
    if (!rows[0].locked) return;

    try {
      await runBackfill(io);
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
}

async function runBackfill(io) {
  // Candidate notes: contain an anchor and have no link rows yet. The precise
  // URL match happens in extractLinkUrls; the ILIKE is just a cheap prefilter.
  const { rows } = await db.query(`
    SELECT n.id, n.content
    FROM notes n
    WHERE n.content ILIKE '%href%'
      AND NOT EXISTS (SELECT 1 FROM note_links l WHERE l.note_id = n.id)
  `);

  if (rows.length === 0) return;

  console.log(`[backfill-link-previews] Starting${DRY_RUN ? ' (dry run)' : ''}: ${rows.length} candidate note(s)`);

  let notesSynced = 0;
  let linksCreated = 0;

  for (const note of rows) {
    const urls = extractLinkUrls(note.content);
    if (urls.length === 0) continue;

    if (DRY_RUN) {
      console.log(`  note ${note.id}: would create ${urls.length} link(s)`);
      notesSynced++;
      linksCreated += urls.length;
      continue;
    }

    try {
      const newLinks = await NoteLink.syncNoteLinks(note.id, urls);
      if (newLinks.length === 0) continue;

      await Promise.all(newLinks.map(async (link) => {
        const preview = await fetchLinkPreview(link.url, link.id);
        await NoteLink.updatePreview(link.id, preview);
      }));

      if (io) {
        const updated = await Note.findById(note.id, true);
        if (updated) io.emit('note_updated', updated);
      }

      notesSynced++;
      linksCreated += newLinks.length;
      console.log(`  note ${note.id}: created ${newLinks.length} link(s)`);
    } catch (e) {
      console.error(`  note ${note.id}: failed —`, e.message);
    }
  }

  console.log(`[backfill-link-previews] Done. notes: ${notesSynced}, links: ${linksCreated}`);
}

if (require.main === module) {
  backfillLinkPreviews()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[backfill-link-previews] Failed:', error);
      process.exit(1);
    });
}

module.exports = { backfillLinkPreviews };
