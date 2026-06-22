'use strict';

const { parseNoteFile } = require('./noteFile');
const { markdownToHtml } = require('./markdownToHtml');

// Pure translation: a raw `.md` mirror file → the note column values + the tag /
// folder label lists the DB write path needs. The DB orchestration (find-or-create
// tags, update vs create, tracking) lives in the worker/repo; this stays pure so
// the markdown→HTML conversion and field mapping can be unit-tested in isolation.
//
// reminders are deliberately not mapped: editing a reminder schedule in a text
// file is unusual and has scheduling side effects, so import leaves the DB's
// reminders as the source of truth (they are never deleted — just not synced
// from the file). See docs/md-mirroring-roadmap.md → "Phase 3 — Import".
function fileToNoteFields(raw) {
  const { frontmatter, body } = parseNoteFile(raw);
  return {
    id: frontmatter.id,
    fields: {
      title: frontmatter.title || '',
      content: markdownToHtml(body),
      color: frontmatter.color || 'default',
      is_pinned: frontmatter.pinned,
      is_archived: frontmatter.archived,
      is_deleted: frontmatter.trashed,
    },
    // Tag/folder associations are reconciled separately by label.
    tags: frontmatter.tags,
    folders: frontmatter.folders,
    // Only forwarded when creating a brand-new note (so a hand-made file can keep
    // its authored timestamp); ignored on update so we never rewrite history.
    created: frontmatter.created,
  };
}

module.exports = { fileToNoteFields };
