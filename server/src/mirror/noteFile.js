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

// --- Parsing (inverse of build/render): .md file -> metadata + Markdown body ---
//
// The body stays Markdown here; the import step converts it with markdownToHtml,
// the same way renderNoteFile delegates the forward body conversion to
// htmlToMarkdown. Parsing is deliberately tolerant: a file with no frontmatter (a
// note someone created by hand) comes back as all-body with default metadata.

// Leading `---` … `---` block, tolerating a BOM, CRLF, and trailing spaces on the
// closing fence. Group 1 is the YAML between the fences.
const FRONTMATTER_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function toBool(value) {
  return value === true || value === 'true';
}

// Frontmatter timestamps are written Joplin-style (UTC, no zone) and js-yaml
// parses them back into Dates; normalize anything date-like to ISO-8601 UTC.
function toIso(value) {
  if (!value && value !== 0) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseReminders(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((r) => (r && typeof r === 'object' ? r : {}))
    .map((r) => ({
      at: toIso(r.at),
      timezone: r.timezone != null ? String(r.timezone) : null,
      rrule: r.rrule != null ? String(r.rrule) : null,
    }))
    .filter((r) => r.at);
}

// Coerce the raw YAML object into the exact shape buildFrontmatter emits.
function normalizeFrontmatter(raw) {
  const fm = raw && typeof raw === 'object' ? raw : {};
  return {
    id: fm.id != null ? String(fm.id) : null,
    title: fm.title != null ? String(fm.title) : '',
    color: fm.color != null ? String(fm.color) : 'default',
    pinned: toBool(fm.pinned),
    archived: toBool(fm.archived),
    trashed: toBool(fm.trashed),
    tags: toStringArray(fm.tags),
    folders: toStringArray(fm.folders),
    created: toIso(fm.created),
    updated: toIso(fm.updated),
    reminders: parseReminders(fm.reminders),
  };
}

function parseFrontmatter(text) {
  if (!text || !text.trim()) return normalizeFrontmatter({});
  return normalizeFrontmatter(yaml.load(text));
}

// Split a `.md` mirror file into { frontmatter, body }. `body` is the Markdown
// after the fenced block, with the single separating blank line and trailing
// whitespace stripped.
function parseNoteFile(raw) {
  const text = raw || '';
  const m = FRONTMATTER_RE.exec(text);
  if (!m) {
    return { frontmatter: normalizeFrontmatter({}), body: text.replace(/^﻿/, '').trim() };
  }
  const frontmatter = parseFrontmatter(m[1]);
  const body = text.slice(m[0].length).replace(/^\r?\n/, '').replace(/\s+$/, '');
  return { frontmatter, body };
}

module.exports = {
  buildFrontmatter,
  renderNoteFile,
  formatTimestamp,
  parseFrontmatter,
  parseNoteFile,
};
