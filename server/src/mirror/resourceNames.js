'use strict';

// Canonical `_resources/` filenames. Shared by the worker's htmlToMarkdown
// resolver (what the link points at) and the resource writer (what gets written),
// so the two can never disagree. Pure, no I/O.

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/tiff': 'tiff',
};

// note_images.type may be a full mime ("image/png") or already a bare ext ("png").
function imageExt(type) {
  if (!type) return 'png';
  const t = String(type).toLowerCase();
  if (MIME_EXT[t]) return MIME_EXT[t];
  if (t.includes('/')) {
    const sub = t.split('/')[1].replace('+xml', '');
    return sub || 'png';
  }
  return t.replace(/^\./, '');
}

// Image resource basename: img-<id>.<ext> (id makes it deterministic + round-trippable).
function imageResourceName(id, type) {
  return `img-${id}.${imageExt(type)}`;
}

// Attachment resource basename: att-<id>-<originalName>. Must match htmlToMarkdown's
// attachment rule, which builds the same string from the node's id/filename attrs.
function attachmentResourceName(id, originalName) {
  return `att-${id}-${originalName || `attachment-${id}`}`;
}

module.exports = { imageExt, imageResourceName, attachmentResourceName };
