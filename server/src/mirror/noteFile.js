'use strict';

const yaml = require('js-yaml');
const { htmlToMarkdown } = require('./htmlToMarkdown');

// Assembles a note's `.md` mirror file: YAML frontmatter + Markdown body.
// Pure functions, no DB access. Callers pass an already-resolved note shape
// (note row + its tags/folders/reminders + optional image/object resolvers).
//
// See docs/md-mirroring-roadmap.md → "Frontmatter fields (final)" for the schema.

// Joplin-style timestamp: ISO 8601 in UTC, 'T'→space, no fractional seconds/zone.
// Accepts a Date, an ISO string, or a Postgres timestamptz string.
function formatTimestamp(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '');
}

// Serialize a single scalar via js-yaml so quoting/escaping is correct, then strip
// the trailing newline js-yaml appends. Used for titles and tag names.
function yamlScalar(value) {
  return yaml.dump(value, { lineWidth: -1 }).replace(/\n$/, '');
}

// Inline (flow) sequence: [a, b, c] with each element safely quoted.
function yamlInlineList(items) {
  if (!items.length) return '[]';
  return `[${items.map((i) => yamlScalar(i)).join(', ')}]`;
}

// Build the frontmatter block (without the surrounding `---` fences).
function buildFrontmatter(note) {
  const lines = [];
  lines.push(`id: ${note.id}`);
  lines.push(`title: ${yamlScalar(note.title || '')}`);
  lines.push(`color: ${yamlScalar(note.color || 'default')}`);
  lines.push(`pinned: ${Boolean(note.pinned)}`);
  lines.push(`archived: ${Boolean(note.archived)}`);
  lines.push(`trashed: ${Boolean(note.trashed)}`);
  lines.push(`tags: ${yamlInlineList(note.tags || [])}`);
  lines.push(`folders: ${yamlInlineList(note.folders || [])}`);

  const created = formatTimestamp(note.created);
  const updated = formatTimestamp(note.updated);
  if (created) lines.push(`created: ${created}`);
  if (updated) lines.push(`updated: ${updated}`);

  const reminders = (note.reminders || [])
    .map((r) => ({ at: formatTimestamp(r.at), timezone: r.timezone, rrule: r.rrule }))
    .filter((r) => r.at);
  if (reminders.length) {
    lines.push('reminders:');
    for (const r of reminders) {
      lines.push(`  - at: ${r.at}`);
      if (r.timezone) lines.push(`    timezone: ${yamlScalar(r.timezone)}`);
      if (r.rrule) lines.push(`    rrule: ${yamlScalar(r.rrule)}`);
    }
  }

  return lines.join('\n');
}

// Render the complete `.md` file: frontmatter + blank line + converted body.
// `options` is forwarded to htmlToMarkdown (resolveImage / resolveObjectTitle).
function renderNoteFile(note, options = {}) {
  const frontmatter = buildFrontmatter(note);
  const body = htmlToMarkdown(note.content || '', options);
  const doc = `---\n${frontmatter}\n---\n`;
  return body ? `${doc}\n${body}\n` : doc;
}

module.exports = { buildFrontmatter, renderNoteFile, formatTimestamp };
