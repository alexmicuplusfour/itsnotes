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
// Collect the labels of inline #tag mentions in the rendered content, so a tag
// written by hand in the body (not listed in frontmatter) still tags the note —
// matching the app, where typing #cooking both renders the mention and tags the
// note. markdownToHtml has already decided what's a real mention (skipping code
// spans etc.), so we read its output rather than re-scanning the markdown.
function inlineTagLabels(html) {
  const labels = new Set();
  const re = /data-type="tag-mention"[^>]*?\bdata-label="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) if (m[1]) labels.add(m[1]);
  return [...labels];
}

// `resolveTag` (label -> tag uuid) lets the inline #tag spans recover their
// data-tag-id, which the `.md` form drops (tags are written as plain `#label`).
// Without it the round-trip strips the id off every tag mention. Optional: a
// hand-made file referencing an unknown tag simply gets an id-less span.
function fileToNoteFields(raw, { resolveTag } = {}) {
  const { frontmatter, body } = parseNoteFile(raw);
  const content = markdownToHtml(body, resolveTag ? { resolveTag } : {});
  // Union frontmatter tags with any written inline in the body. Purely additive:
  // an app-exported file lists every tag in frontmatter already, so this only adds
  // tags for hand-written files; it never drops one the frontmatter still names.
  const tags = [...new Set([...frontmatter.tags, ...inlineTagLabels(content)])];
  return {
    id: frontmatter.id,
    fields: {
      title: frontmatter.title || '',
      content,
      color: frontmatter.color || 'default',
      is_pinned: frontmatter.pinned,
      is_archived: frontmatter.archived,
      is_deleted: frontmatter.trashed,
    },
    // Tag/folder associations are reconciled separately by label.
    tags,
    folders: frontmatter.folders,
    // Only forwarded when creating a brand-new note (so a hand-made file can keep
    // its authored timestamp); ignored on update so we never rewrite history.
    created: frontmatter.created,
  };
}

module.exports = { fileToNoteFields };
