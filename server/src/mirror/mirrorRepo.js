'use strict';

const db = require('../db');
const Note = require('../models/Note');
const Tag = require('../models/Tag');

// Data layer for the Markdown mirror. Loads every note in a render-ready shape
// (note row + its tags/folders/reminders/images/attachments) and owns the
// note_files tracking table. Kept separate from the worker so the worker is just
// orchestration over plain data.

// Load all notes plus their related rows, batched (a handful of queries total,
// not N+1). Returns an array shaped for noteFile.renderNoteFile, each augmented
// with `images`/`attachments` metadata the worker needs to emit resources.
async function loadNotes() {
  const [notes, tags, reminders, images, attachments] = await Promise.all([
    db.query(
      `SELECT id, title, content, plain_content, color,
              is_pinned, is_archived, is_deleted, created_at, updated_at
         FROM notes`
    ),
    db.query(
      `SELECT nt.note_id, t.name, t.is_folder
         FROM note_tags nt JOIN tags t ON t.id = nt.tag_id`
    ),
    db.query(`SELECT note_id, next_run_at, timezone, rrule FROM reminders`),
    db.query(`SELECT id, note_id, type FROM note_images ORDER BY id ASC`),
    db.query(`SELECT id, note_id, original_name, file_path FROM note_attachments ORDER BY id ASC`),
  ]);

  const byId = new Map();
  for (const n of notes.rows) {
    byId.set(n.id, {
      id: n.id,
      title: n.title,
      content: n.content,
      plainContent: n.plain_content,
      color: n.color,
      pinned: n.is_pinned,
      archived: n.is_archived,
      trashed: n.is_deleted,
      created: n.created_at,
      updated: n.updated_at,
      tags: [],
      folders: [],
      reminders: [],
      images: [],
      attachments: [],
    });
  }

  for (const t of tags.rows) {
    const note = byId.get(t.note_id);
    if (!note) continue;
    (t.is_folder ? note.folders : note.tags).push(t.name);
  }
  for (const r of reminders.rows) {
    const note = byId.get(r.note_id);
    if (note) note.reminders.push({ at: r.next_run_at, timezone: r.timezone, rrule: r.rrule });
  }
  for (const img of images.rows) {
    const note = byId.get(img.note_id);
    if (note) note.images.push({ id: img.id, type: img.type });
  }
  for (const att of attachments.rows) {
    const note = byId.get(att.note_id);
    if (note) note.attachments.push({ id: att.id, originalName: att.original_name, filePath: att.file_path });
  }

  return [...byId.values()];
}

// Load a single note in the same render-ready shape as loadNotes, for the live
// (LISTEN/NOTIFY) fast path. Returns null if the note no longer exists.
async function loadNote(noteId) {
  const notes = await db.query(
    `SELECT id, title, content, plain_content, color,
            is_pinned, is_archived, is_deleted, created_at, updated_at
       FROM notes WHERE id = $1`,
    [noteId]
  );
  const n = notes.rows[0];
  if (!n) return null;

  const [tags, reminders, images, attachments] = await Promise.all([
    db.query(
      `SELECT t.name, t.is_folder
         FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
        WHERE nt.note_id = $1`,
      [noteId]
    ),
    db.query(`SELECT next_run_at, timezone, rrule FROM reminders WHERE note_id = $1`, [noteId]),
    db.query(`SELECT id, type FROM note_images WHERE note_id = $1 ORDER BY id ASC`, [noteId]),
    db.query(
      `SELECT id, original_name, file_path FROM note_attachments WHERE note_id = $1 ORDER BY id ASC`,
      [noteId]
    ),
  ]);

  const note = {
    id: n.id,
    title: n.title,
    content: n.content,
    plainContent: n.plain_content,
    color: n.color,
    pinned: n.is_pinned,
    archived: n.is_archived,
    trashed: n.is_deleted,
    created: n.created_at,
    updated: n.updated_at,
    tags: [],
    folders: [],
    reminders: [],
    images: [],
    attachments: [],
  };
  for (const t of tags.rows) (t.is_folder ? note.folders : note.tags).push(t.name);
  for (const r of reminders.rows) note.reminders.push({ at: r.next_run_at, timezone: r.timezone, rrule: r.rrule });
  for (const img of images.rows) note.images.push({ id: img.id, type: img.type });
  for (const att of attachments.rows) note.attachments.push({ id: att.id, originalName: att.original_name, filePath: att.file_path });
  return note;
}

// Object titles (object-card divs carry no title in the note HTML — resolve it here).
async function loadObjectTitles() {
  const { rows } = await db.query(`SELECT id, title FROM objects`);
  const map = new Map();
  for (const o of rows) map.set(o.id, o.title);
  return map;
}

// Raw image bytes live in note_images.data as a `data:<mime>;base64,<payload>` URL.
async function loadImageData(imageId) {
  const { rows } = await db.query(`SELECT data FROM note_images WHERE id = $1`, [imageId]);
  return rows[0] ? rows[0].data : null;
}

// note_files tracking table -------------------------------------------------

async function loadTracked() {
  const { rows } = await db.query(`SELECT note_id, rel_path, content_hash, version FROM note_files`);
  const map = new Map();
  for (const r of rows) {
    map.set(r.note_id, { relPath: r.rel_path, hash: r.content_hash, version: r.version });
  }
  return map;
}

async function upsertTracked(noteId, relPath, hash) {
  await db.query(
    `INSERT INTO note_files (note_id, rel_path, content_hash, last_synced_at, version)
       VALUES ($1, $2, $3, NOW(), 1)
     ON CONFLICT (note_id) DO UPDATE
       SET rel_path = EXCLUDED.rel_path,
           content_hash = EXCLUDED.content_hash,
           last_synced_at = NOW(),
           version = note_files.version + 1`,
    [noteId, relPath, hash]
  );
}

async function deleteTracked(noteId) {
  await db.query(`DELETE FROM note_files WHERE note_id = $1`, [noteId]);
}

// Import writes (folder → DB) ------------------------------------------------
//
// These are the only places the mirror mutates note content, routed through the
// same Note/Tag models the app uses so plain-text indexing, versioning and
// inline-image reconciliation all happen exactly as they do for a normal edit.

// Update an existing note's columns from an imported file.
async function importUpdateNote(noteId, fields) {
  await Note.update(noteId, fields);
}

// Create a note from a hand-made / untracked file. `created` (optional ISO) lets a
// hand-authored file keep its own timestamp. Returns the new note id.
async function importCreateNote(fields, created) {
  const row = await Note.create({ ...fields, created_at: created || undefined });
  return row.id;
}

// Make a note's tag + folder associations match the file's labels exactly: add
// missing ones (creating the tag/folder row by name on first use), drop any the
// file no longer lists. Folders are tag rows with is_folder = true; hierarchical
// names ("a/b") live in a single row, so a plain name lookup is sufficient.
async function syncNoteTags(noteId, { tags = [], folders = [] }) {
  const desired = [
    ...tags.map((name) => ({ name, isFolder: false })),
    ...folders.map((name) => ({ name, isFolder: true })),
  ];

  const desiredIds = new Set();
  for (const { name, isFolder } of desired) {
    if (!name) continue;
    let tag = await Tag.findByName(name);
    if (!tag) tag = await Tag.create(name, true, isFolder);
    desiredIds.add(tag.id);
  }

  const current = await Tag.findTagsByNoteId(noteId);
  const currentIds = new Set(current.map((t) => t.id));

  for (const id of desiredIds) {
    if (!currentIds.has(id)) await Tag.addTagToNote(noteId, id);
  }
  for (const t of current) {
    if (!desiredIds.has(t.id)) await Tag.removeTagFromNote(noteId, t.id);
  }
}

module.exports = {
  loadNotes,
  loadNote,
  loadObjectTitles,
  loadImageData,
  loadTracked,
  upsertTracked,
  deleteTracked,
  importUpdateNote,
  importCreateNote,
  syncNoteTags,
};
