'use strict';

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');
const yaml = require('js-yaml');
const { db } = require('./knex');
const { processNoteImage } = require('./utils/imageProcessing');

// Race-safe find-or-create for a single tag at a specific hierarchy level.
async function findOrCreateTagAtLevel(trx, name, parentId = null) {
  let q = trx('tags').whereRaw('LOWER(name) = LOWER(?)', [name]);
  q = parentId ? q.where('parent_id', parentId) : q.whereNull('parent_id');
  const existing = await q.first();
  if (existing) return existing.id;

  const insertSql = parentId
    ? `INSERT INTO tags (name, parent_id) VALUES (?, ?)
       ON CONFLICT (LOWER(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO NOTHING RETURNING id`
    : `INSERT INTO tags (name) VALUES (?)
       ON CONFLICT (LOWER(name), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
       DO NOTHING RETURNING id`;
  const inserted = await trx.raw(insertSql, parentId ? [name, parentId] : [name]);
  if (inserted.rows.length > 0) return inserted.rows[0].id;

  // Race lost — re-select the winner
  let rq = trx('tags').whereRaw('LOWER(name) = LOWER(?)', [name]);
  rq = parentId ? rq.where('parent_id', parentId) : rq.whereNull('parent_id');
  const winner = await rq.first();
  return winner ? winner.id : null;
}

// Find or create a tag path like "project/frontend/ui", walking each level and
// creating parent tags as needed. Returns the leaf tag id.
async function findOrCreateTagPath(trx, tagPath) {
  const parts = tagPath.split('/').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  let parentId = null;
  for (const part of parts) {
    const id = await findOrCreateTagAtLevel(trx, part, parentId);
    if (!id) return null;
    parentId = id;
  }
  return parentId;
}

// ---- Frontmatter parsing ----

const FRONTMATTER_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

function parseObsidianFile(raw, filePath) {
  const text = raw || '';
  const m = FRONTMATTER_RE.exec(text);

  let fm = {};
  let body = text;

  if (m) {
    try { fm = yaml.load(m[1]) || {}; } catch (_) {}
    body = text.slice(m[0].length).replace(/^\r?\n/, '').replace(/\s+$/, '');
  }

  // Title: frontmatter field, else filename
  const filename = path.basename(filePath, '.md');
  const title = (fm.title != null ? String(fm.title) : '').trim() || filename;

  // Tags: array or space/comma-separated string; also handle singular 'tag'.
  // Strip a leading '#' that Obsidian sometimes includes in frontmatter tag values.
  const cleanTag = (v) => String(v).replace(/^#/, '').trim();
  let tags = [];
  if (Array.isArray(fm.tags)) tags = fm.tags.map(cleanTag).filter(Boolean);
  else if (typeof fm.tags === 'string' && fm.tags) tags = fm.tags.split(/[\s,]+/).map(cleanTag).filter(Boolean);
  if (Array.isArray(fm.tag)) tags = [...tags, ...fm.tag.map(cleanTag).filter(Boolean)];

  const toIso = (v) => {
    if (!v && v !== 0) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const created = toIso(fm.created || fm.date || fm['date created']);
  const updated = toIso(fm.modified || fm.updated || fm['date modified']);
  const pinned = fm.pinned === true || fm.pinned === 'true';
  const archived = fm.archived === true || fm.archived === 'true';

  return { title, tags, created, updated, pinned, archived, body };
}

// ---- Markdown → HTML (Obsidian flavour) ----

// Replace ![[filename]] with an inline HTML span before `marked` sees it so
// the Obsidian embed syntax doesn't collide with markdown image parsing.
// Skips content inside fenced / inline code.
function preProcessObsidian(md) {
  const parts = md.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // inside code block / inline code
    return part
      // Strip Obsidian comments %%...%% (can be multiline, invisible in Obsidian)
      .replace(/%%[\s\S]*?%%/g, '')
      // Replace ![[filename]] with an inline HTML span
      .replace(/!\[\[([^\]\n]+)\]\]/g, (_, target) => {
        const display = path.basename(target, path.extname(target))
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safe = path.basename(target).replace(/"/g, '&quot;');
        return `<span data-obsidian-embed="${safe}">${display}</span>`;
      });
  }).join('');
}

const WIKILINK_RE = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;
const HIGHLIGHT_RE = /==([^=\n]+)==/g;
const TAG_RE = /(^|[\s(])#([A-Za-z0-9_][A-Za-z0-9_-]*)/g;
const WS_BLOCK_PARENTS = new Set(['BODY', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR']);

function skipInline(textNode) {
  let el = textNode.parentElement;
  while (el && el.tagName !== 'BODY') {
    if (['A', 'CODE', 'PRE'].includes(el.tagName)) return true;
    if (el.getAttribute('data-type') || el.getAttribute('data-note-uuid') || el.getAttribute('data-wikilink')) return true;
    el = el.parentElement;
  }
  return false;
}

function getTextNodes(root, doc) {
  const { NodeFilter } = doc.defaultView;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function isSoleChild(parent, node) {
  for (const child of parent.childNodes) {
    if (child === node) continue;
    if (child.nodeType === 3 && !child.textContent.trim()) continue;
    return false;
  }
  return true;
}

// [[Title]] / [[Title|Alias]] → <span data-wikilink="Title" data-wikilink-display="Alias">Alias</span>
// Resolved to note-reference-link spans in pass 2.
function transformWikilinks(doc, root) {
  for (const textNode of getTextNodes(root, doc)) {
    const value = textNode.nodeValue;
    if (!value || !value.includes('[[') || skipInline(textNode)) continue;
    WIKILINK_RE.lastIndex = 0;
    if (!WIKILINK_RE.test(value)) continue;

    const frag = doc.createDocumentFragment();
    let last = 0;
    WIKILINK_RE.lastIndex = 0;
    let m;
    while ((m = WIKILINK_RE.exec(value))) {
      // Strip heading fragments (#heading) and block refs (^block-id) — they
      // don't affect which note is being referenced, only where inside it.
      const target = m[1].trim().replace(/[#^].*$/, '').trim();
      const display = (m[2] || m[1]).trim();
      if (m.index > last) frag.appendChild(doc.createTextNode(value.slice(last, m.index)));
      const span = doc.createElement('span');
      span.setAttribute('data-wikilink', target);
      span.setAttribute('data-wikilink-display', display);
      span.textContent = display;
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < value.length) frag.appendChild(doc.createTextNode(value.slice(last)));
    textNode.replaceWith(frag);
  }
}

// ==text== → <mark>text</mark>
function transformHighlights(doc, root) {
  for (const textNode of getTextNodes(root, doc)) {
    const value = textNode.nodeValue;
    if (!value || !value.includes('==') || skipInline(textNode)) continue;
    HIGHLIGHT_RE.lastIndex = 0;
    if (!HIGHLIGHT_RE.test(value)) continue;

    const frag = doc.createDocumentFragment();
    let last = 0;
    HIGHLIGHT_RE.lastIndex = 0;
    let m;
    while ((m = HIGHLIGHT_RE.exec(value))) {
      if (m.index > last) frag.appendChild(doc.createTextNode(value.slice(last, m.index)));
      const mark = doc.createElement('mark');
      mark.textContent = m[1];
      frag.appendChild(mark);
      last = m.index + m[0].length;
    }
    if (last < value.length) frag.appendChild(doc.createTextNode(value.slice(last)));
    textNode.replaceWith(frag);
  }
}

// #tag → <span data-type="tag-mention" data-label="tag">#tag</span>
function transformTagMentions(doc, root) {
  for (const textNode of getTextNodes(root, doc)) {
    const value = textNode.nodeValue;
    if (!value || !value.includes('#') || skipInline(textNode)) continue;
    TAG_RE.lastIndex = 0;
    if (!TAG_RE.test(value)) continue;

    const frag = doc.createDocumentFragment();
    let last = 0;
    TAG_RE.lastIndex = 0;
    let m;
    while ((m = TAG_RE.exec(value))) {
      const boundary = m[1];
      const label = m[2];
      const before = value.slice(last, m.index) + boundary;
      if (before) frag.appendChild(doc.createTextNode(before));
      const span = doc.createElement('span');
      span.setAttribute('data-type', 'tag-mention');
      span.setAttribute('data-label', label);
      span.textContent = `#${label}`;
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < value.length) frag.appendChild(doc.createTextNode(value.slice(last)));
    textNode.replaceWith(frag);
  }
}

function firstElementChild(el) {
  for (const c of el.childNodes) {
    if (c.nodeType === 1) return c;
    if (c.nodeType === 3 && c.textContent.trim()) return null;
  }
  return null;
}

function wrapLiContent(doc, li) {
  const only = firstElementChild(li);
  if (only && only.tagName === 'P' && isSoleChild(li, only)) return;
  const p = doc.createElement('p');
  while (li.firstChild) p.appendChild(li.firstChild);
  if (p.firstChild && p.firstChild.nodeType === 3) {
    p.firstChild.nodeValue = p.firstChild.nodeValue.replace(/^\s+/, '');
  }
  li.appendChild(p);
}

function transformTaskLists(doc, root) {
  for (const ul of [...root.querySelectorAll('ul')]) {
    const items = [...ul.children].filter((el) => el.tagName === 'LI');
    if (!items.length) continue;
    const allTasks = items.every((li) => {
      const first = firstElementChild(li);
      return first && first.tagName === 'INPUT' && first.getAttribute('type') === 'checkbox';
    });
    if (!allTasks) continue;
    ul.setAttribute('data-type', 'taskList');
    for (const li of items) {
      const input = firstElementChild(li);
      const checked = input.hasAttribute('checked');
      input.remove();
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', checked ? 'true' : 'false');
      wrapLiContent(doc, li);
    }
  }
}

function normalizeEmptyParagraphs(root) {
  for (const p of [...root.querySelectorAll('p')]) {
    if (p.children.length) continue;
    if (p.textContent.replace(/ /g, '').trim() === '') p.textContent = '';
  }
}

function stripBlockWhitespace(root) {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!WS_BLOCK_PARENTS.has(el.tagName)) continue;
    for (const child of [...el.childNodes]) {
      if (child.nodeType === 3 && child.textContent.trim() === '') child.remove();
    }
  }
}

function obsidianMarkdownToHtml(md) {
  if (!md || !md.trim()) return '';
  const preprocessed = preProcessObsidian(md);
  const rawHtml = marked.parse(preprocessed, { gfm: true, breaks: false });
  const dom = new JSDOM(`<!DOCTYPE html><body>${rawHtml}</body>`);
  const doc = dom.window.document;
  const body = doc.body;

  transformWikilinks(doc, body);
  transformHighlights(doc, body);
  transformTaskLists(doc, body);
  transformTagMentions(doc, body);
  normalizeEmptyParagraphs(body);
  stripBlockWhitespace(body);

  return body.innerHTML.trim();
}

function extractPlainContent(md) {
  return md
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}([\s\S]*?)`{1,3}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+>]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract inline #tag labels from rendered HTML so they can be associated as
// real tags, not just decorative spans.
function extractInlineTagLabels(html) {
  if (!html || !html.includes('data-type="tag-mention"')) return [];
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  return [...dom.window.document.querySelectorAll('[data-type="tag-mention"][data-label]')]
    .map((s) => s.getAttribute('data-label'))
    .filter(Boolean);
}

// Extract wikilink targets from rendered HTML (for pass-2 resolution)
function extractWikilinkTargets(html) {
  if (!html || !html.includes('data-wikilink=')) return [];
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  return [...dom.window.document.querySelectorAll('[data-wikilink]')].map((s) => ({
    target: s.getAttribute('data-wikilink'),
    display: s.getAttribute('data-wikilink-display') || s.getAttribute('data-wikilink'),
  }));
}

// ---- Pass 1: create a single note ----

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg']);

async function importMdFile(filePath, resourceMap, origNameMap = {}) {
  const raw = fs.readFileSync(filePath, 'utf8');
  // Use the original filename for title derivation when multer has renamed the file
  const effectivePath = origNameMap[filePath] || filePath;
  const { title, tags, created, updated, pinned, archived, body } = parseObsidianFile(raw, effectivePath);

  const content = obsidianMarkdownToHtml(body);
  const plainContent = extractPlainContent(body);
  const wikilinks = extractWikilinkTargets(content);

  // Union frontmatter tags with inline #tag mentions from the rendered body
  const inlineTags = extractInlineTagLabels(content);
  const allTags = [...new Set([...tags, ...inlineTags])];

  const now = new Date().toISOString();
  const createdAt = created || now;
  const updatedAt = updated || createdAt;

  const noteId = await db.transaction(async (trx) => {
    const rows = await trx('notes').insert({
      title,
      content,
      plain_content: plainContent,
      is_pinned: pinned,
      is_archived: archived,
      is_deleted: false,
      color: 'default',
      created_at: createdAt,
      updated_at: updatedAt,
      pinned_at: pinned ? updatedAt : null,
      archived_at: archived ? updatedAt : null,
      trashed_at: null,
    }).returning('id');

    const id = rows[0].id;

    for (const label of allTags) {
      const tagId = await findOrCreateTagPath(trx, label);
      if (tagId) {
        await trx('note_tags')
          .insert({ note_id: id, tag_id: tagId })
          .onConflict(['note_id', 'tag_id'])
          .ignore();
      }
    }

    return id;
  });

  // Resolve ![[embed]] spans and standard ![](path) images now that we have a noteId
  const imagesImported = Object.keys(resourceMap).length > 0
    ? await resolveEmbeds(noteId, content, resourceMap)
    : 0;

  return { noteId, title, tagsImported: allTags.length, wikilinks, imagesImported };
}

// Import a single image file into note_images and return the new row id.
async function importImageFile(trx, noteId, srcPath, name) {
  const processed = await processNoteImage(fs.readFileSync(srcPath));
  const rows = await trx('note_images').insert({
    note_id: noteId,
    data: processed.data,
    thumbnail: processed.thumbnail,
    name,
    type: processed.type,
    size: processed.size,
  }).returning('id');
  return rows[0].id;
}

// Replace data-obsidian-embed spans AND standard <img src="relative"> tags with
// real note_images rows, then update the note content.
async function resolveEmbeds(noteId, content, resourceMap) {
  const hasEmbeds = content.includes('data-obsidian-embed');
  const hasImgs = content.includes('<img');
  if (!hasEmbeds && !hasImgs) return 0;

  const dom = new JSDOM(`<!DOCTYPE html><body>${content}</body>`);
  const doc = dom.window.document;
  const body = doc.body;

  let imported = 0;
  let changed = false;

  await db.transaction(async (trx) => {
    // ---- ![[embed]] spans ----
    for (const span of [...body.querySelectorAll('[data-obsidian-embed]')]) {
      const target = span.getAttribute('data-obsidian-embed');
      const ext = path.extname(target).toLowerCase();
      const srcPath = resourceMap[target] || resourceMap[path.basename(target)];

      if (IMAGE_EXTS.has(ext) && srcPath) {
        try {
          const imgId = await importImageFile(trx, noteId, srcPath, path.basename(target));
          const img = doc.createElement('img');
          img.setAttribute('data-image-id', String(imgId));
          img.setAttribute('alt', path.basename(target, ext));
          const p = span.parentElement;
          if (p && p.tagName === 'P' && isSoleChild(p, span)) p.replaceWith(img);
          else span.replaceWith(img);
          imported++;
          changed = true;
          continue;
        } catch (_) {}
      }
      span.replaceWith(doc.createTextNode(span.textContent));
      changed = true;
    }

    // ---- Standard markdown images: ![alt](relative/path) ----
    for (const img of [...body.querySelectorAll('img:not([data-image-id])')]) {
      const src = img.getAttribute('src') || '';
      // Skip external URLs and data URIs — only resolve relative paths
      if (!src || src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) continue;

      // Normalise: strip leading ./ or ../
      const normalised = src.replace(/^\.\.?\//, '');
      const srcPath = resourceMap[normalised]
        || resourceMap[src]
        || resourceMap[path.basename(src)];
      const ext = path.extname(src).toLowerCase();

      if (IMAGE_EXTS.has(ext) && srcPath) {
        try {
          const imgId = await importImageFile(trx, noteId, srcPath, path.basename(src));
          const newImg = doc.createElement('img');
          newImg.setAttribute('data-image-id', String(imgId));
          const alt = img.getAttribute('alt') || '';
          if (alt) newImg.setAttribute('alt', alt);
          img.replaceWith(newImg);
          imported++;
          changed = true;
        } catch (_) {}
      }
    }

    if (changed) {
      await trx('notes').where('id', noteId).update({ content: body.innerHTML.trim() });
    }
  });

  return imported;
}

// ---- Pass 2: resolve [[wikilinks]] to note-reference-link spans ----

async function resolveWikilinks(wikilinkNotes, titleToId) {
  // Collect targets not yet in the batch map, look them up in existing DB notes
  const allTargets = [
    ...new Set(wikilinkNotes.flatMap((n) => n.wikilinks.map((w) => w.target.toLowerCase()))),
  ].filter((t) => !titleToId[t]);

  if (allTargets.length > 0) {
    const placeholders = allTargets.map(() => '?').join(',');
    const rows = await db.raw(
      `SELECT id, title FROM notes WHERE LOWER(title) IN (${placeholders})`,
      allTargets
    ).then((r) => r.rows);
    for (const row of rows) {
      if (!titleToId[row.title.toLowerCase()]) {
        titleToId[row.title.toLowerCase()] = row.id;
      }
    }
  }

  let resolved = 0;

  for (const { noteId, wikilinks } of wikilinkNotes) {
    // Skip if none of this note's targets resolved
    if (!wikilinks.some((w) => titleToId[w.target.toLowerCase()])) continue;

    const row = await db('notes').where('id', noteId).first('content');
    if (!row?.content?.includes('data-wikilink=')) continue;

    const dom = new JSDOM(`<!DOCTYPE html><body>${row.content}</body>`);
    const doc = dom.window.document;
    const body = doc.body;

    let changed = false;
    for (const span of [...body.querySelectorAll('[data-wikilink]')]) {
      const target = span.getAttribute('data-wikilink');
      const display = span.getAttribute('data-wikilink-display') || target;
      const targetId = titleToId[target.toLowerCase()];

      if (targetId) {
        const ref = doc.createElement('span');
        ref.setAttribute('data-note-uuid', targetId);
        ref.setAttribute('class', 'note-reference-link');
        ref.textContent = display;
        span.replaceWith(ref);
        resolved++;
      } else {
        span.replaceWith(doc.createTextNode(display));
      }
      changed = true;
    }

    if (changed) {
      await db('notes').where('id', noteId).update({ content: body.innerHTML.trim() });
    }
  }

  return resolved;
}

// ---- Main entry point ----

async function processObsidianImport(mdFiles, resourceMap, onProgress, origNameMap = {}, onStatus = null) {
  const results = {
    total: mdFiles.length,
    successful: 0,
    failed: 0,
    tagsImported: 0,
    imagesImported: 0,
    wikilinksResolved: 0,
    failures: [],
  };

  const titleToId = {};
  const wikilinkNotes = [];

  // Pass 1: create all notes
  for (let i = 0; i < mdFiles.length; i++) {
    try {
      const { noteId, title, tagsImported, wikilinks, imagesImported } = await importMdFile(mdFiles[i], resourceMap, origNameMap);
      titleToId[title.toLowerCase()] = noteId;
      if (wikilinks.length) wikilinkNotes.push({ noteId, wikilinks });
      results.successful++;
      results.tagsImported += tagsImported;
      results.imagesImported += imagesImported;
    } catch (e) {
      results.failed++;
      results.failures.push({ file: path.basename(mdFiles[i]), error: e.message });
      console.error(`Obsidian import failed for ${path.basename(mdFiles[i])}: ${e.message}`);
    }

    if (onProgress) onProgress(i + 1, mdFiles.length);
  }

  // Pass 2: resolve wikilinks against the completed batch + existing notes
  if (wikilinkNotes.length > 0) {
    if (onStatus) onStatus(`Resolving wikilinks in ${wikilinkNotes.length} note${wikilinkNotes.length !== 1 ? 's' : ''}…`);
    results.wikilinksResolved = await resolveWikilinks(wikilinkNotes, titleToId);
  }

  return results;
}

module.exports = { processObsidianImport };
