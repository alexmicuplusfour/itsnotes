'use strict';

const { marked } = require('marked');
const { JSDOM } = require('jsdom');

// Inverse of htmlToMarkdown: turn a mirrored note's Markdown body back into the
// Tiptap HTML shape stored in notes.content. Pure function: no DB access.
//
// `marked` handles standard Markdown; a DOM pass then rewrites the custom markers
// we emit (tags, object/note references, images, attachments, task lists) into the
// exact element shapes the Tiptap extensions parse. Atoms whose extra attributes
// aren't recoverable from the text (object type, attachment mime/size) take an
// optional resolver; for the HTML→MD→HTML round-trip the defaults suffice.
//
// See docs/md-mirroring-roadmap.md → "Phase 3 — Import".

const DEFAULTS = {
  // tag label -> tag uuid (rendered as data-tag-id). Default: omitted (the
  // note↔tag association is reconciled from frontmatter, not this inline span).
  resolveTag: () => null,
  // object uuid -> type (book/movie/...). Default: fall back to the alt text,
  // which for resolver-less mirror output already holds the type.
  resolveObjectType: () => null,
};

// #tag at a word boundary. Group 1 is the boundary char (start, space, or "("),
// group 2 the label. Tags never contain spaces (the editor forbids them).
const TAG_RE = /(^|[\s(])#([A-Za-z0-9_][A-Za-z0-9_-]*)/g;
// _resources/img-<id>(.ext)? — id is the note_images serial, so it's digits.
const IMG_RES_RE = /^_resources\/img-(\d+)(?:\.\w+)?$/;
// _resources/att-<id>-<filename>
const ATT_RES_RE = /^_resources\/att-(\d+)-(.+)$/;

function markdownToHtml(md, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (!md || !md.trim()) return '';

  const rawHtml = marked.parse(md, { gfm: true, breaks: false });
  const dom = new JSDOM(`<!DOCTYPE html><body>${rawHtml}</body>`);
  const doc = dom.window.document;
  const body = doc.body;

  transformLinks(doc, body, opts);
  transformImages(doc, body, opts);
  transformTaskLists(doc, body);
  transformTagMentions(doc, body, opts);
  normalizeEmptyParagraphs(body);

  return body.innerHTML.trim();
}

// --- helpers -----------------------------------------------------------------

function firstElementChild(el) {
  for (const c of el.childNodes) {
    if (c.nodeType === 1) return c;
    if (c.nodeType === 3 && c.textContent.trim()) return null; // real text first
  }
  return null;
}

function isSoleChild(parent, node) {
  for (const child of parent.childNodes) {
    if (child === node) continue;
    if (child.nodeType === 3 && !child.textContent.trim()) continue; // whitespace
    return false;
  }
  return true;
}

// A block-level replacement (object card, attachment, block image) lands inside a
// <p> that marked wrapped it in. If that <p> holds nothing else, replace the <p>
// outright so we don't leave an invalid block-in-paragraph; otherwise swap in place
// and let ProseMirror split the paragraph on parse.
function replaceBlock(doc, node, replacement) {
  const p = node.parentElement;
  if (p && p.tagName === 'P' && isSoleChild(p, node)) {
    p.replaceWith(replacement);
  } else {
    node.replaceWith(replacement);
  }
}

// --- transforms --------------------------------------------------------------

function transformLinks(doc, root, opts) {
  for (const a of [...root.querySelectorAll('a[href]')]) {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('object:')) {
      const id = href.slice(7);
      const label = a.textContent || '';
      const span = doc.createElement('span');
      span.setAttribute('data-type', 'object-mention');
      span.setAttribute('data-object-id', id);
      const type = opts.resolveObjectType(id);
      if (type) span.setAttribute('data-object-type', type);
      span.setAttribute('data-label', label);
      span.textContent = `@${label}`;
      a.replaceWith(span);
    } else if (href.startsWith('note:')) {
      const uuid = href.slice(5);
      const span = doc.createElement('span');
      span.setAttribute('data-note-uuid', uuid);
      span.setAttribute('class', 'note-reference-link');
      span.textContent = a.textContent || uuid;
      a.replaceWith(span);
    } else {
      const m = ATT_RES_RE.exec(href);
      if (m) {
        const div = doc.createElement('div');
        div.setAttribute('data-type', 'attachment');
        div.setAttribute('id', m[1]);
        div.setAttribute('filename', m[2]);
        replaceBlock(doc, a, div);
      }
    }
  }
}

function transformImages(doc, root, opts) {
  for (const img of [...root.querySelectorAll('img[src]')]) {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';

    if (src.startsWith('object:')) {
      const id = src.slice(7);
      const div = doc.createElement('div');
      div.setAttribute('data-type', 'object-card');
      div.setAttribute('objectid', id);
      div.setAttribute('objecttype', opts.resolveObjectType(id) || alt || 'object');
      replaceBlock(doc, img, div);
      continue;
    }

    const m = IMG_RES_RE.exec(src);
    if (m) {
      const nimg = doc.createElement('img');
      nimg.setAttribute('data-image-id', m[1]);
      if (alt) nimg.setAttribute('alt', alt);
      replaceBlock(doc, img, nimg);
      continue;
    }
    // Remote (http) or inline (data:) images keep their src verbatim.
  }
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

// Tiptap task items hold a paragraph: <li ...><p>text</p></li>. Tight-list items
// from marked are bare inline content, so wrap them (trimming the leading space
// left where the checkbox was).
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

function skipForTags(textNode) {
  let el = textNode.parentElement;
  while (el && el.tagName !== 'BODY') {
    const tag = el.tagName;
    if (tag === 'A' || tag === 'CODE' || tag === 'PRE') return true;
    if (el.getAttribute('data-type') || el.getAttribute('data-note-uuid')) return true;
    el = el.parentElement;
  }
  return false;
}

function transformTagMentions(doc, root, opts) {
  const NodeFilter = doc.defaultView.NodeFilter;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts = [];
  let n;
  while ((n = walker.nextNode())) texts.push(n);

  for (const textNode of texts) {
    const value = textNode.nodeValue;
    if (!value || !value.includes('#') || skipForTags(textNode)) continue;
    TAG_RE.lastIndex = 0;
    if (!TAG_RE.test(value)) continue;

    const frag = doc.createDocumentFragment();
    let last = 0;
    let m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(value))) {
      const boundary = m[1];
      const label = m[2];
      const before = value.slice(last, m.index) + boundary;
      if (before) frag.appendChild(doc.createTextNode(before));

      const span = doc.createElement('span');
      span.setAttribute('data-type', 'tag-mention');
      const id = opts.resolveTag(label);
      if (id) span.setAttribute('data-tag-id', id);
      span.setAttribute('data-label', label);
      span.textContent = `#${label}`;
      frag.appendChild(span);

      last = m.index + m[0].length;
    }
    if (last < value.length) frag.appendChild(doc.createTextNode(value.slice(last)));
    textNode.replaceWith(frag);
  }
}

// An intentional blank line round-trips through Markdown as a `&nbsp;` paragraph;
// turn those (and any whitespace-only <p>) back into Tiptap's empty paragraph.
function normalizeEmptyParagraphs(root) {
  for (const p of [...root.querySelectorAll('p')]) {
    if (p.children.length) continue;
    if (p.textContent.replace(/ /g, '').trim() === '') p.textContent = '';
  }
}

module.exports = { markdownToHtml };
