'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');

const repo = require('./mirrorRepo');
const { renderNoteFile } = require('./noteFile');
const { noteFileName } = require('./slugify');
const { planReconcile } = require('./reconcile');
const { imageResourceName, attachmentResourceName } = require('./resourceNames');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const RESOURCES_DIR = '_resources';
const TRASH_DIR = 'trash';

function getConfig() {
  return {
    enabled: process.env.MD_MIRROR_ENABLED === 'true',
    root: process.env.MD_MIRROR_PATH,
    cron: process.env.MD_MIRROR_SWEEP_CRON || '*/5 * * * *',
  };
}

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

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
// little wall-clock time for a responsive app is the right call.
const YIELD_EVERY = 25;

// Render every note, assign a unique rel_path, hash the file. Returns the desired
// list (for the planner) plus a cache of rendered content keyed by note id.
async function buildDesired(notes, objectTitles) {
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
    const relPath = uniqueRelPath(note, prefix, used);
    used.add(relPath);

    desired.push({ noteId: note.id, relPath, hash: sha256(content) });
    rendered.set(note.id, content);

    if (++sinceYield >= YIELD_EVERY) {
      sinceYield = 0;
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  return { desired, rendered };
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

async function runOnce() {
  const { enabled, root } = getConfig();
  if (!enabled || !root) return { skipped: true, reason: 'disabled' };
  if (running) return { skipped: true, reason: 'busy' };
  running = true;
  try {
    await fs.mkdir(root, { recursive: true });

    const [notes, objectTitles, tracked] = await Promise.all([
      repo.loadNotes(),
      repo.loadObjectTitles(),
      repo.loadTracked(),
    ]);

    const { desired, rendered } = await buildDesired(notes, objectTitles);
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
    pathExists: false,
    fileCount: 0,
  };
  if (cfg.root) {
    status.pathExists = await exists(cfg.root);
    if (status.pathExists) status.fileCount = (await scanOnDisk(cfg.root)).size;
  }
  return status;
}

function init() {
  const cfg = getConfig();
  // Always schedule the periodic sweep; runOnce self-gates on enabled+path, so
  // toggling the feature on at runtime (Settings → Mirror) takes effect without
  // a server restart.
  cron.schedule(cfg.cron, runOnce);
  if (cfg.enabled && cfg.root) {
    console.log(`[md-mirror] enabled → ${cfg.root} (sweep: ${cfg.cron})`);
    runOnce(); // startup full reconcile
  } else {
    console.log('[md-mirror] idle (enable in Settings → Mirror).');
  }
}

module.exports = { init, runOnce, getStatus, buildDesired, scanOnDisk };
