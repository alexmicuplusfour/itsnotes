'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');

const repo = require('./mirrorRepo');
const Note = require('../models/Note');
const mirrorListener = require('./mirrorListener');
const { renderNoteFile, parseNoteFile } = require('./noteFile');
const { noteFileName } = require('./slugify');
const { planReconcile } = require('./reconcile');
const { planImport } = require('./importPlan');
const { fileToNoteFields } = require('./importApply');
const { imageResourceName, attachmentResourceName } = require('./resourceNames');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const RESOURCES_DIR = '_resources';
const TRASH_DIR = 'trash';

function getConfig() {
  return {
    enabled: process.env.MD_MIRROR_ENABLED === 'true',
    root: process.env.MD_MIRROR_PATH,
    // When on, file edits are pulled into the DB on a background poll without the
    // user pressing Import. Off by default — import stays a deliberate action.
    autoImport: process.env.MD_MIRROR_AUTO_IMPORT === 'true',
    // The live LISTEN/NOTIFY path keeps the folder fresh between sweeps, so the
    // periodic sweep can be a slower correctness backstop rather than the primary
    // freshness mechanism — lighter on a large library.
    cron: process.env.MD_MIRROR_SWEEP_CRON || '*/15 * * * *',
  };
}

// Socket.io instance, set at init(). Lets auto-import (and the manual import route)
// push note_created/note_updated to clients for changes made straight to the DB,
// which bypass the note routes that normally broadcast.
let io = null;

// How often auto-import re-checks the folder for edits to pull in. Disk has no
// LISTEN/NOTIFY equivalent, so this side polls; a cheap hash scan gates the heavy
// render so an idle library doesn't re-render every tick.
const AUTO_IMPORT_POLL_MS = Number(process.env.MD_MIRROR_IMPORT_POLL_MS) || 15000;

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// Frontmatter block at the very top: head fence / body / closing fence. Mirrors
// noteFile's FRONTMATTER_RE but keeps the fences so we can rewrite just the body.
const FRONTMATTER_BLOCK_RE = /^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*\r?\n?)/;

// Drift fingerprint. Identical to sha256 of the file EXCEPT the volatile `updated:`
// frontmatter line is blanked first, so a file that differs from its note only by
// that timestamp hashes the same. Without this, every import bumps the note's
// updated_at, which makes the next export see "drift" and rewrite the file — an
// echo that pops an "external changes" prompt in any editor that has the file open.
// `updated` is purely derived (import never reads it back into the note), so
// dropping it from the fingerprint loses nothing; the DB stays its source of truth.
function fingerprint(text) {
  const s = text || '';
  const m = FRONTMATTER_BLOCK_RE.exec(s);
  if (!m) return sha256(s);
  const fmBody = m[2].replace(/^updated:.*$/m, 'updated:');
  return sha256(m[1] + fmBody + m[3] + s.slice(m[0].length));
}

// Next wall-clock time the cron will fire. Only the "*/N * * * *" interval form
// (the default and the only shape the UI produces) is computed; anything more
// exotic returns null so the UI simply hides the countdown.
function nextRunAt(cronExpr, from = new Date()) {
  const m = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec((cronExpr || '').trim());
  const step = m && parseInt(m[1], 10);
  if (!step) return null;
  const next = new Date(from);
  next.setSeconds(0, 0);
  do { next.setMinutes(next.getMinutes() + 1); } while (next.getMinutes() % step !== 0);
  return next.toISOString();
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// rel paths are stored with forward slashes; map to an OS path under the mount.
const toAbs = (root, rel) => path.join(root, ...rel.split('/'));

// --- Desired state -----------------------------------------------------------

// Rendering a note (HTML→Markdown + hash) is synchronous CPU work. On a large
// library this loop would otherwise monopolize the single event-loop thread and
// freeze the whole app for the duration of a sweep, so we pause to let pending
// requests run every YIELD_EVERY notes. Sweeps are background work — trading a
// lot of wall-clock time for a responsive app is the right call: we yield often
// and sleep a real beat each time so request handling reliably wins the thread.
const YIELD_EVERY = 8;
const YIELD_PAUSE_MS = 20;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Render every note, assign a unique rel_path, hash the file. `tracked` (the
// note_files rows) makes filenames sticky: a note keeps the filename it was first
// written under instead of being renamed every time its title changes. Returns the
// desired list (for the planner) plus a cache of rendered content keyed by note id.
async function buildDesired(notes, objectTitles, tracked = new Map()) {
  const used = new Set();
  const desired = [];
  const rendered = new Map();

  let sinceYield = 0;
  for (const note of notes) {
    const imagesById = new Map(note.images.map((i) => [String(i.id), i.type]));
    const content = renderNoteFile(note, {
      resolveImage: (id) => imageResourceName(id, imagesById.get(String(id))),
      resolveObjectTitle: (id) => objectTitles.get(id) || null,
    });

    const prefix = note.trashed ? `${TRASH_DIR}/` : '';
    const relPath = stickyRelPath(note, prefix, tracked.get(note.id), used);
    used.add(relPath);

    desired.push({ noteId: note.id, relPath, hash: fingerprint(content) });
    rendered.set(note.id, content);

    if (++sinceYield >= YIELD_EVERY) {
      sinceYield = 0;
      await sleep(YIELD_PAUSE_MS);
    }
  }

  return { desired, rendered };
}

// Filenames are sticky: once a note has a file, that filename is kept for the life
// of the note. We only ever change it when the human renames the *file* (the import
// side detects that by frontmatter id and repoints tracking, which we then honour
// here). This stops a note's title edits from churning its filename, and — crucially
// for hand-made files imported from disk — keeps a freshly imported file at the name
// the user gave it, so re-saving it from an open editor is matched by path (an edit)
// rather than mistaken for a brand-new note. The trash prefix is still applied live,
// so trashing/untrashing moves the existing filename between root and trash/.
function stickyRelPath(note, prefix, prev, used) {
  if (prev && prev.relPath) {
    const base = prev.relPath.split('/').pop();
    const candidate = prefix + base;
    if (!used.has(candidate)) return candidate;
    // Sticky name unexpectedly taken this pass — fall through to a fresh unique one.
  }
  return uniqueRelPath(note, prefix, used);
}

// Resolve the rare filename clash by extending the shortid with more UUID hex.
function uniqueRelPath(note, prefix, used) {
  let rel = prefix + noteFileName(note);
  if (!used.has(rel)) return rel;
  const hex = String(note.id).replace(/-/g, '');
  for (let take = 12; take <= hex.length; take += 4) {
    rel = prefix + noteFileName(note, `-${hex.slice(8, take)}`);
    if (!used.has(rel)) return rel;
  }
  return prefix + noteFileName(note, `-${Date.now().toString(16)}`);
}

// --- On-disk scan ------------------------------------------------------------

async function scanOnDisk(root) {
  const set = new Set();
  const add = async (dir, prefix) => {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md')) set.add(prefix + e.name);
    }
  };
  await add(root, '');
  await add(path.join(root, TRASH_DIR), `${TRASH_DIR}/`);
  return set;
}

// --- Import: gather disk state (folder → DB) ----------------------------------

const CONFLICTS_DIR = 'conflicts';

// Read every `.md` file under the mount, fingerprinting each the same way the
// export side stored it (see `fingerprint`: the whole file minus the volatile
// `updated:` line), so a disk hash equal to the tracked content_hash means
// "untouched since we wrote it". We also pull the frontmatter id so a moved/renamed file can still
// be matched to its note, and keep the raw text so apply can convert it without
// a second read. Unreadable files are skipped rather than aborting the run.
async function gatherDiskFiles(root) {
  const relPaths = await scanOnDisk(root);
  const diskFiles = [];
  for (const relPath of relPaths) {
    let raw;
    try {
      raw = await fs.readFile(toAbs(root, relPath), 'utf8');
    } catch {
      continue;
    }
    const { frontmatter } = parseNoteFile(raw);
    diskFiles.push({ relPath, hash: fingerprint(raw), id: frontmatter.id, raw });
  }
  return diskFiles;
}

// Shared gather + plan for both the dry-run preview and the real apply. Builds the
// current render hash of every live note (dbHashes) so a one-sided file edit can
// be told apart from a true two-sided conflict, and caches the canonical rendered
// content so the apply step can re-export a conflicting note without re-rendering.
async function loadImportState() {
  const [notes, objectTitles, tracked, diskFiles] = await Promise.all([
    repo.loadNotes(),
    repo.loadObjectTitles(),
    repo.loadTracked(),
    gatherDiskFiles(getConfig().root),
  ]);
  const { desired, rendered } = await buildDesired(notes, objectTitles, tracked);
  const dbHashes = new Map(desired.map((d) => [d.noteId, d.hash]));
  const plan = planImport({ diskFiles, tracked, dbHashes });
  return { tracked, diskFiles, rendered, plan };
}

// Strip the `raw`/`hash` internals from a plan so the preview the UI gets is just
// the human-meaningful buckets and counts.
function summarizePlan(plan) {
  const counts = {};
  for (const key of Object.keys(plan)) counts[key] = plan[key].length;
  return { ...plan, counts };
}

// Read-only dry run: classify every file on disk against what we last wrote and
// the current DB state. Touches nothing — returns the buckets (unchanged / edited
// / conflict / created / renamed / missing) the UI shows before the user applies.
async function previewImport() {
  const { enabled, root } = getConfig();
  if (!enabled || !root) return { skipped: true, reason: 'disabled' };
  if (!(await exists(root))) return { skipped: true, reason: 'no-path' };

  const { plan } = await loadImportState();
  return summarizePlan(plan);
}

// Apply an import: pull edited/new/renamed files into the DB, resolve conflicts in
// the DB's favour while preserving the on-disk edits in a conflict file, and leave
// missing files alone (the next export re-creates them). Returns a per-bucket count.
async function applyImport() {
  const { enabled, root } = getConfig();
  if (!enabled || !root) return { skipped: true, reason: 'disabled' };
  if (!(await exists(root))) return { skipped: true, reason: 'no-path' };

  const { diskFiles, rendered, plan } = await loadImportState();
  const rawByPath = new Map(diskFiles.map((f) => [f.relPath, f.raw]));

  // Track which notes the import actually changed in the DB so the route can push
  // live socket updates to connected clients (the import bypasses the note routes
  // that normally broadcast). Conflicts and pure renames don't touch note content,
  // so they need no broadcast.
  const createdIds = [];
  const updatedIds = [];

  // Import a file's contents into an existing note, then point tracking at the
  // file's hash so we don't immediately re-detect it (the export side will
  // reconcile any canonical-form drift on its next pass).
  const importInto = async (noteId, relPath, hash) => {
    const { fields, tags, folders } = fileToNoteFields(rawByPath.get(relPath));
    await repo.importUpdateNote(noteId, fields);
    await repo.syncNoteTags(noteId, { tags, folders });
    await repo.upsertTracked(noteId, relPath, hash);
    updatedIds.push(noteId);
  };

  for (const e of plan.edited) await importInto(e.noteId, e.relPath, e.hash);

  for (const c of plan.created) {
    const { fields, tags, folders, created } = fileToNoteFields(rawByPath.get(c.relPath));
    const newId = await repo.importCreateNote(fields, created);
    await repo.syncNoteTags(newId, { tags, folders });
    await repo.upsertTracked(newId, c.relPath, c.hash);
    createdIds.push(newId);
  }

  for (const r of plan.renamed) {
    if (r.alsoEdited) await importInto(r.noteId, r.relPath, r.hash);
    else await repo.upsertTracked(r.noteId, r.relPath, r.hash);
  }

  // Conflicts: DB wins. Preserve the user's on-disk edits in conflicts/ (outside
  // the scanned dirs so it's never re-imported), then re-export the note so the
  // main file matches the DB again and re-point tracking at the DB's hash.
  for (const c of plan.conflict) {
    await saveConflictFile(root, c.relPath, rawByPath.get(c.relPath));
    await writeFileAt(root, c.relPath, rendered.get(c.noteId));
    await repo.upsertTracked(c.noteId, c.relPath, fingerprint(rendered.get(c.noteId)));
  }

  return { ...summarizePlan(plan).counts, createdIds, updatedIds };
}

// Park a conflicting file's contents under conflicts/<name>.<timestamp>.md so the
// user's manual edits survive even though the DB version wins the note itself.
async function saveConflictFile(root, relPath, raw) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.basename(relPath).replace(/\.md$/i, '');
  const rel = `${CONFLICTS_DIR}/${base}.${stamp}.md`;
  await writeFileAt(root, rel, raw == null ? '' : raw);
  return rel;
}

// --- Resources ---------------------------------------------------------------

// Write each note's images/attachments into _resources/ when missing. Image bytes
// are immutable per id, so an existence check avoids rewriting them every sweep.
async function ensureResources(root, notes) {
  const dir = path.join(root, RESOURCES_DIR);
  let wrote = 0;

  for (const note of notes) {
    for (const img of note.images) {
      const abs = path.join(dir, imageResourceName(img.id, img.type));
      if (await exists(abs)) continue;
      const dataUrl = await repo.loadImageData(img.id);
      const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
      if (!m) continue;
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(abs, Buffer.from(m[2], 'base64'));
      wrote++;
    }
    for (const att of note.attachments) {
      const abs = path.join(dir, attachmentResourceName(att.id, att.originalName));
      if (await exists(abs)) continue;
      const src = path.join(UPLOADS_DIR, att.filePath || '');
      if (!att.filePath || !(await exists(src))) continue;
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(src, abs);
      wrote++;
    }
  }
  return wrote;
}

// --- Execution ---------------------------------------------------------------

async function writeFileAt(root, rel, content) {
  const abs = toAbs(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
}

async function applyAction(root, action, rendered) {
  switch (action.type) {
    case 'create':
    case 'update': {
      await writeFileAt(root, action.relPath, rendered.get(action.noteId));
      await repo.upsertTracked(action.noteId, action.relPath, action.hash);
      break;
    }
    case 'rename': {
      const from = toAbs(root, action.oldPath);
      const to = toAbs(root, action.relPath);
      await fs.mkdir(path.dirname(to), { recursive: true });
      try {
        await fs.rename(from, to);
      } catch {
        // Source vanished between scan and now — just write the target.
        await writeFileAt(root, action.relPath, rendered.get(action.noteId));
      }
      if (action.rewrite) await writeFileAt(root, action.relPath, rendered.get(action.noteId));
      await repo.upsertTracked(action.noteId, action.relPath, action.hash);
      break;
    }
    case 'delete': {
      try { await fs.unlink(toAbs(root, action.oldPath)); } catch { /* already gone */ }
      await repo.deleteTracked(action.noteId);
      break;
    }
  }
}

// --- Sweep -------------------------------------------------------------------

let running = false;
let lastSweep = null; // { at, summary } of the most recent real sweep

// Every mirror mutation — the periodic sweep and each live single-note reconcile
// — runs through this one-at-a-time queue. They all compute a plan from a snapshot
// of the tracking table + folder and then write both back; if two ran at once the
// second would plan against state the first hadn't committed yet. The concrete
// failure that caused: a burst of edits to a note's leading text fires several
// reconciles in quick succession, and an overlapping pair both read the pre-rename
// tracking row, so the first renames old→new while the second — finding the old
// file already moved — writes a *fresh* file instead of moving it, orphaning a
// duplicate on every overlap. Serializing makes each reconcile see the previous
// one's committed tracking, so a slug change is always a single rename.
let chain = Promise.resolve();
function serialize(task) {
  const result = chain.then(task, task);
  chain = result.then(() => {}, () => {});
  return result;
}

async function runOnce() {
  const { enabled, root } = getConfig();
  if (!enabled || !root) return { skipped: true, reason: 'disabled' };
  // A sweep already in flight (or queued behind live reconciles) will cover
  // whatever changed, so a second full sweep would just repeat the work — skip
  // it. Live reconciles still queue normally; they each target one note.
  if (running) return { skipped: true, reason: 'busy' };
  return serialize(async () => {
    running = true;
    try {
      await fs.mkdir(root, { recursive: true });

      const [notes, objectTitles, tracked] = await Promise.all([
        repo.loadNotes(),
        repo.loadObjectTitles(),
        repo.loadTracked(),
      ]);

      const { desired, rendered } = await buildDesired(notes, objectTitles, tracked);
      const onDisk = await scanOnDisk(root);
      const actions = planReconcile({ desired, tracked, onDisk });

      for (const action of actions) await applyAction(root, action, rendered);
      const resourcesWritten = await ensureResources(root, notes);

      const summary = {
        notes: notes.length,
        created: actions.filter((a) => a.type === 'create').length,
        updated: actions.filter((a) => a.type === 'update').length,
        renamed: actions.filter((a) => a.type === 'rename').length,
        deleted: actions.filter((a) => a.type === 'delete').length,
        resourcesWritten,
      };
      if (actions.length || resourcesWritten) {
        console.log('[md-mirror] sweep:', JSON.stringify(summary));
      }
      lastSweep = { at: new Date().toISOString(), summary };
      return summary;
    } catch (err) {
      console.error('[md-mirror] sweep failed:', err.message);
      return { error: err.message };
    } finally {
      running = false;
    }
  });
}

// --- Live single-note reconcile (LISTEN/NOTIFY fast path) ---------------------

// Reconcile just one note's file, triggered by a DB NOTIFY. Reuses the same
// render → plan → apply pipeline as the sweep, scoped to a single note: a no-op
// when nothing changed (hash matches), a rename/rewrite on edit, a delete when
// the note is gone. The sweep stays the correctness backstop; if it's mid-run we
// skip (it will cover this note anyway).
async function reconcileOne(noteId) {
  const { enabled, root } = getConfig();
  if (!enabled || !root) return { skipped: true, reason: 'disabled' };
  // No early-skip when busy: each reconcile targets a specific note and must run
  // to capture that note's latest state. The queue serializes it behind any
  // in-flight sweep or sibling reconcile so they never race on the same file.
  return serialize(async () => {
    running = true;
    try {
      await fs.mkdir(root, { recursive: true });

      const note = await repo.loadNote(noteId);

      // Resolve object titles only when the note actually embeds an object — avoids
      // loading the whole objects table on every keystroke-debounced edit.
      const needsObjects =
        note && /data-type="object-(card|mention)"|data-object-id|objectid=/.test(note.content || '');
      const objectTitles = needsObjects ? await repo.loadObjectTitles() : new Map();

      const trackedAll = await repo.loadTracked();
      const tracked = new Map();
      const prev = trackedAll.get(noteId);
      if (prev) tracked.set(noteId, prev);

      let desired = [];
      let rendered = new Map();
      if (note) ({ desired, rendered } = await buildDesired([note], objectTitles, tracked));
      // note === null (deleted/hard-removed) → empty desired → planReconcile emits
      // a delete for the tracked row.

      const onDisk = await scanOnDisk(root);
      const actions = planReconcile({ desired, tracked, onDisk });
      for (const action of actions) await applyAction(root, action, rendered);
      if (note) await ensureResources(root, [note]);

      if (actions.length) {
        console.log('[md-mirror] live:', JSON.stringify({ noteId, actions: actions.map((a) => a.type) }));
      }
      return { actions: actions.length };
    } catch (err) {
      console.error('[md-mirror] live reconcile failed:', err.message);
      return { error: err.message };
    } finally {
      running = false;
    }
  });
}

// --- Auto-import (folder → DB, unattended) -----------------------------------

// Re-fetch each changed note in the full API shape and emit the same socket events
// a normal note write would, so live clients update for DB changes the import made
// directly. No-op until init() wires io (e.g. in tests). Used by both the auto poll
// and the manual import route.
async function broadcastImportResult(result) {
  if (!io || !result) return;
  const emit = async (id, event) => {
    const note = await Note.findById(id, true);
    if (!note) return;
    await Note.addObjects([note]);
    io.emit(event, note);
  };
  for (const id of result.createdIds || []) await emit(id, 'note_created');
  for (const id of result.updatedIds || []) await emit(id, 'note_updated');
}

// Cheap gate before the heavy applyImport: hash every file on disk (no note
// rendering) and compare to what we last wrote. Any file whose hash drifted, or
// that sits at a path we aren't tracking, means there's something to pull in. Lets
// an idle folder cost just a disk scan per tick instead of a full library render.
async function hasPendingImport(root) {
  const [tracked, diskFiles] = await Promise.all([repo.loadTracked(), gatherDiskFiles(root)]);
  const trackedByPath = new Map();
  for (const t of tracked.values()) trackedByPath.set(t.relPath, t);
  for (const f of diskFiles) {
    const atPath = trackedByPath.get(f.relPath);
    if (!atPath) return true;          // new or moved/renamed file
    if (atPath.hash !== f.hash) return true; // edited in place
  }
  return false;
}

let autoImporting = false;

// One unattended import pass: only fires when the feature + auto-import are on and
// the cheap gate finds work. Serializes the real apply behind any in-flight sweep/
// reconcile (same queue as runOnce) so the two writers never race on note_files,
// then broadcasts whatever notes it changed.
async function autoImportTick() {
  const { enabled, root, autoImport } = getConfig();
  if (!enabled || !root || !autoImport || autoImporting) return;
  autoImporting = true;
  try {
    if (!(await exists(root))) return;
    if (!(await hasPendingImport(root))) return;

    const result = await serialize(async () => {
      running = true;
      try { return await applyImport(); }
      finally { running = false; }
    });

    if (result && !result.skipped) {
      const changed = (result.createdIds || []).length + (result.updatedIds || []).length;
      if (changed) {
        console.log('[md-mirror] auto-import:', JSON.stringify({
          created: (result.createdIds || []).length,
          updated: (result.updatedIds || []).length,
          conflict: result.conflict || 0,
        }));
        await broadcastImportResult(result);
      }
    }
  } catch (err) {
    console.error('[md-mirror] auto-import failed:', err.message);
  } finally {
    autoImporting = false;
  }
}

// Bring the live listener up or down to match the current config. Idempotent —
// called at startup and on every sweep tick so toggling the feature at runtime
// takes effect without a restart (mirrors how runOnce self-gates).
function ensureListener() {
  const { enabled, root } = getConfig();
  if (enabled && root) {
    mirrorListener.start({ reconcileOne, runSweep: runOnce });
  } else {
    mirrorListener.stop();
  }
}

// Report the worker's current state for the Settings UI. Cheap — only scans the
// folder (no DB) when a path is configured.
async function getStatus() {
  const cfg = getConfig();
  const status = {
    enabled: cfg.enabled,
    path: cfg.root || '',
    cron: cfg.cron,
    running,
    lastSweepAt: lastSweep ? lastSweep.at : null,
    lastSummary: lastSweep ? lastSweep.summary : null,
    nextSweepAt: cfg.enabled && cfg.root ? nextRunAt(cfg.cron) : null,
    liveConnected: mirrorListener.isConnected(),
    pathExists: false,
    fileCount: 0,
  };
  if (cfg.root) {
    status.pathExists = await exists(cfg.root);
    if (status.pathExists) status.fileCount = (await scanOnDisk(cfg.root)).size;
  }
  return status;
}

function init(options = {}) {
  io = options.io || null;
  const cfg = getConfig();
  // Always schedule the periodic sweep; runOnce self-gates on enabled+path, so
  // toggling the feature on at runtime (Settings → Mirror) takes effect without
  // a server restart. Each tick also reconciles the live listener with the
  // current config so it connects/disconnects on a runtime toggle too.
  cron.schedule(cfg.cron, () => { ensureListener(); runOnce(); });
  ensureListener();
  // Auto-import poll. Always running but self-gates on enabled+autoImport every
  // tick, so the Settings toggle takes effect without a restart.
  setInterval(autoImportTick, AUTO_IMPORT_POLL_MS);
  if (cfg.enabled && cfg.root) {
    console.log(`[md-mirror] enabled → ${cfg.root} (sweep: ${cfg.cron}, auto-import: ${cfg.autoImport ? 'on' : 'off'})`);
    runOnce(); // startup full reconcile
  } else {
    console.log('[md-mirror] idle (enable in Settings → Mirror).');
  }
}

module.exports = { init, runOnce, reconcileOne, getStatus, buildDesired, scanOnDisk, gatherDiskFiles, previewImport, applyImport, autoImportTick, broadcastImportResult };
