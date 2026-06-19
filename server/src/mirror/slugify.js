'use strict';

// Builds the deterministic, Windows-safe `.md` filename for a note.
// Identity lives in frontmatter `id:`; the filename is cosmetic but must be stable.
// See docs/md-mirroring-roadmap.md → "Filename rules".

const MAX_SLUG = 80;

// Windows reserved device names — illegal as a file stem even with an extension.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function slugify(text) {
  let s = String(text == null ? '' : text);
  // Strip Windows-forbidden characters and control chars.
  s = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ');
  s = s.toLowerCase();
  // Whitespace runs → single hyphen.
  s = s.replace(/\s+/g, '-');
  // Collapse repeated hyphens.
  s = s.replace(/-{2,}/g, '-');
  // Trim leading/trailing hyphens, dots, spaces.
  s = s.replace(/^[-.\s]+|[-.\s]+$/g, '');
  // Cap length, then re-trim in case the cut landed on a separator.
  if (s.length > MAX_SLUG) s = s.slice(0, MAX_SLUG).replace(/[-.\s]+$/, '');
  return s;
}

function shortId(id) {
  return String(id || '').replace(/-/g, '').slice(0, 8) || 'noid';
}

// slug source: title → first non-empty line of plain_content → 'untitled'.
function slugSource({ title, plainContent }) {
  const fromTitle = slugify(title);
  if (fromTitle) return fromTitle;
  const firstLine = String(plainContent || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const fromContent = slugify(firstLine);
  if (fromContent) return fromContent;
  return 'untitled';
}

// Base filename `<slug>-<shortid>.md`. `extraId` lets the worker extend the
// shortid on the rare 8-char clash (pass more hex chars).
function noteFileName({ id, title, plainContent }, extraId = '') {
  let slug = slugSource({ title, plainContent });
  if (RESERVED.test(slug)) slug = `_${slug}`;
  return `${slug}-${shortId(id)}${extraId}.md`;
}

module.exports = { slugify, slugSource, shortId, noteFileName };
