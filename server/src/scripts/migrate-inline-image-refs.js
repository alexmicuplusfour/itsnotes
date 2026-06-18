const { JSDOM } = require('jsdom');
const db = require('../db');
const NoteImage = require('../models/NoteImage');
const { processNoteImage } = require('../utils/imageProcessing');

/**
 * One-time migration: note-body images used to inline their full base64 into the
 * note HTML (and into every note_versions snapshot), duplicating data already
 * held in the note_images table. This rewrites inline <img src="data:..."> into
 * lightweight references (<img data-image-id="..."> with no src), creating
 * note_images rows for any inline image that doesn't already have one.
 *
 * Run with --dry-run to report without writing.
 */

const DRY_RUN = process.argv.includes('--dry-run');

async function imageRowExists(id) {
  if (id == null || id === '') return false;
  const row = await NoteImage.findById(id);
  return !!row;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  return { type: match[1], buffer: Buffer.from(match[2], 'base64') };
}

/**
 * Rewrite inline base64 images in an HTML string to references.
 *
 * @param {string} html
 * @param {number} noteId - note to attach newly-created note_images rows to
 * @param {boolean} allowCreate - create rows for orphan inline images (notes:
 *   yes; versions: no — only strip when the reference already resolves)
 * @returns {Promise<{ html: string, changed: boolean, created: number, stripped: number }>}
 */
async function dereferenceInlineImages(html, noteId, allowCreate) {
  if (!html || !html.includes('data:image')) {
    return { html, changed: false, created: 0, stripped: 0 };
  }

  const dom = new JSDOM(html);
  const { document } = dom.window;
  const imgs = Array.from(document.querySelectorAll('img'));

  let changed = false;
  let created = 0;
  let stripped = 0;

  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (!src || !src.startsWith('data:')) continue;

    let imageId = img.getAttribute('data-image-id');

    const hasRow = await imageRowExists(imageId);

    if (!hasRow) {
      if (!allowCreate) {
        // Conservative: leave this snapshot's base64 in place rather than break
        // history with an unresolvable reference.
        continue;
      }
      if (!parseDataUrl(src)) continue;

      // Re-encode through the single resize/encode policy (WebP full + thumb).
      // Fall back to the raw inline data if processing fails, so a bad image
      // never aborts the migration.
      let processed;
      try {
        processed = await processNoteImage(src);
      } catch (_) {
        const parsed = parseDataUrl(src);
        processed = { data: src, thumbnail: src, type: parsed.type, size: parsed.buffer.length };
      }

      const row = DRY_RUN
        ? { id: '(dry-run)' }
        : await NoteImage.create({
            note_id: noteId,
            data: processed.data,
            thumbnail: processed.thumbnail,
            name: img.getAttribute('alt') || 'Migrated image',
            type: processed.type,
            size: processed.size,
          });

      imageId = row.id;
      img.setAttribute('data-image-id', String(imageId));
      created++;
    }

    img.removeAttribute('src');
    stripped++;
    changed = true;
  }

  return { html: document.body.innerHTML, changed, created, stripped };
}

async function migrate() {
  let notesChanged = 0;
  let rowsCreated = 0;
  let imagesStripped = 0;

  // --- Notes ---
  const notes = await db.query(
    `SELECT id, content FROM notes WHERE content LIKE '%data:image%'`
  );

  // --- Note versions (strip-only; never create rows for historical snapshots) ---
  const versions = await db.query(
    `SELECT id, note_id, raw_content FROM note_versions WHERE raw_content LIKE '%data:image%'`
  );

  // Nothing inline anywhere — stay silent so startup logs aren't spammed.
  if (notes.rows.length === 0 && versions.rows.length === 0) {
    return;
  }

  console.log(`[migrate-inline-image-refs] Starting${DRY_RUN ? ' (dry run)' : ''}...`);
  console.log(`[migrate-inline-image-refs] ${notes.rows.length} notes with inline base64`);

  for (const note of notes.rows) {
    const { html, changed, created, stripped } =
      await dereferenceInlineImages(note.content, note.id, true);
    if (changed) {
      if (!DRY_RUN) {
        await db.query('UPDATE notes SET content = $1 WHERE id = $2', [html, note.id]);
      }
      notesChanged++;
      rowsCreated += created;
      imagesStripped += stripped;
      console.log(`  note ${note.id}: stripped ${stripped}, created ${created} row(s)`);
    }
  }

  let versionsChanged = 0;
  let versionImagesStripped = 0;
  console.log(`[migrate-inline-image-refs] ${versions.rows.length} note_versions with inline base64`);

  for (const version of versions.rows) {
    const { html, changed, stripped } =
      await dereferenceInlineImages(version.raw_content, version.note_id, false);
    if (changed) {
      if (!DRY_RUN) {
        await db.query('UPDATE note_versions SET raw_content = $1 WHERE id = $2', [html, version.id]);
      }
      versionsChanged++;
      versionImagesStripped += stripped;
    }
  }

  console.log('[migrate-inline-image-refs] Done.');
  console.log(`  notes rewritten:      ${notesChanged}`);
  console.log(`  note_images created:  ${rowsCreated}`);
  console.log(`  inline images stripped (notes):    ${imagesStripped}`);
  console.log(`  versions rewritten:   ${versionsChanged}`);
  console.log(`  inline images stripped (versions): ${versionImagesStripped}`);
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[migrate-inline-image-refs] Failed:', error);
      process.exit(1);
    });
}

module.exports = { dereferenceInlineImages, migrate };
