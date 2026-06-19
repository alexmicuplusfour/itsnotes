'use strict';

const TurndownService = require('turndown');

// Converts a note's stored HTML (Tiptap output) into Markdown for the .md mirror.
// Pure function: no DB access. Custom nodes that need DB-only data (object titles,
// image file extensions) accept optional resolvers; sensible fallbacks otherwise.
//
// See docs/md-mirroring-roadmap.md → "Content conversion" for the agreed mapping.

const DEFAULTS = {
  // id (note_images.id) -> resource filename (without folder). Default: img-<id>.
  resolveImage: (id) => `img-${id}`,
  // object uuid -> human title for the alt text. Default: null (fall back to type).
  resolveObjectTitle: () => null,
};

// Tiptap renders object cards and attachments as EMPTY divs. Turndown treats
// empty block elements as "blank" and routes them to blankReplacement, bypassing
// addRule entirely — so these renderers are shared by the rules (for the rare
// non-empty case) and by blankReplacement below (the real path).
function objectCardMd(node, opts) {
  const id = node.getAttribute('objectid');
  const type = node.getAttribute('objecttype') || 'object';
  const title = opts.resolveObjectTitle(id) || type;
  return `\n\n![${title}](object:${id})\n\n`;
}

function attachmentMd(node) {
  const id = node.getAttribute('id');
  const filename = node.getAttribute('filename') || `attachment-${id}`;
  return `\n\n[${filename}](_resources/att-${id}-${filename})\n\n`;
}

function buildTurndown(opts) {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    blankReplacement: (content, node) => {
      if (node.nodeName === 'DIV') {
        const dt = node.getAttribute('data-type');
        if (dt === 'object-card') return objectCardMd(node, opts);
        if (dt === 'attachment') return attachmentMd(node);
      }
      // A bare empty <p> is an intentional blank line in the note — render it as a
      // `&nbsp;` paragraph so the vertical gap survives Markdown rendering (a plain
      // blank line would just collapse into normal paragraph spacing).
      if (node.nodeName === 'P') return '\n\n&nbsp;\n\n';
      return node.isBlock ? '\n\n' : '';
    },
  });

  // --- Empty paragraph carrying a <br> (Tiptap writes empty lines as
  // <p><br class="ProseMirror-trailingBreak"></p>). The <br> makes turndown treat
  // the node as non-blank, so blankReplacement never sees it; emit the same gap. ---
  td.addRule('emptyParagraph', {
    filter: (node) =>
      node.nodeName === 'P' &&
      !node.textContent.trim() &&
      !!(node.querySelector && node.querySelector('br')),
    replacement: () => '\n\n&nbsp;\n\n',
  });

  // --- Verbatim passthrough: no faithful Markdown equivalent, keep raw HTML ---
  // Tables (block-content cells, no header row) and <details> blocks.
  td.addRule('verbatimBlock', {
    filter: (node) =>
      node.nodeName === 'TABLE' ||
      node.nodeName === 'DETAILS',
    replacement: (_content, node) => `\n\n${node.outerHTML}\n\n`,
  });

  // --- Tag mention: <span data-type="tag-mention" data-label="work">#work</span> ---
  td.addRule('tagMention', {
    filter: (node) =>
      node.nodeName === 'SPAN' && node.getAttribute('data-type') === 'tag-mention',
    replacement: (_content, node) => {
      const label = node.getAttribute('data-label') || node.textContent.replace(/^#/, '');
      return `#${label}`;
    },
  });

  // --- Note reference (inline mark): span[data-note-uuid] -> [text](note:<uuid>) ---
  td.addRule('noteReference', {
    filter: (node) =>
      node.nodeName === 'SPAN' && node.getAttribute('data-note-uuid'),
    replacement: (content, node) => {
      const uuid = node.getAttribute('data-note-uuid');
      const label = (content || node.textContent || '').trim() || uuid;
      return `[${label}](note:${uuid})`;
    },
  });

  // --- Object mention (inline): @Title -> [Title](object:<uuid>) ---
  td.addRule('objectMention', {
    filter: (node) =>
      node.nodeName === 'SPAN' && node.getAttribute('data-type') === 'object-mention',
    replacement: (_content, node) => {
      const id = node.getAttribute('data-object-id');
      const label = node.getAttribute('data-label') || node.textContent.replace(/^@/, '');
      return `[${label}](object:${id})`;
    },
  });

  // --- Object card (block): empty <div objectid objecttype data-type="object-card"> ---
  // The title isn't in the HTML; use a resolver if given, else the object type.
  td.addRule('objectCard', {
    filter: (node) =>
      node.nodeName === 'DIV' && node.getAttribute('data-type') === 'object-card',
    replacement: (_content, node) => objectCardMd(node, opts),
  });

  // --- Attachment (block): <div id filename size mimetype data-type="attachment"> ---
  td.addRule('attachment', {
    filter: (node) =>
      node.nodeName === 'DIV' && node.getAttribute('data-type') === 'attachment',
    replacement: (_content, node) => attachmentMd(node),
  });

  // --- Images ---
  // Tiptap inline image references note_images by data-image-id (src stripped).
  // Legacy/remote images may still carry a src (data: URI or http URL).
  td.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const alt = node.getAttribute('alt') || '';
      const imageId = node.getAttribute('data-image-id');
      const src = node.getAttribute('src');

      if (imageId) {
        return `![${alt}](_resources/${opts.resolveImage(imageId)})`;
      }
      if (src && /^https?:\/\//.test(src)) {
        return `![${alt}](${src})`; // remote URL kept verbatim
      }
      if (src && src.startsWith('data:')) {
        // base64 inline (legacy) — Phase 2 writes the bytes; mark deterministically.
        return `![${alt}](_resources/img-inline)`;
      }
      return alt ? `![${alt}]()` : '';
    },
  });

  // --- Task list items: <li data-type="taskItem" data-checked="true"> -> - [x] ---
  td.addRule('taskItem', {
    filter: (node) =>
      node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
    replacement: (content, node) => {
      const checked = node.getAttribute('data-checked') === 'true';
      const text = content.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n/g, ' ').trim();
      return `- [${checked ? 'x' : ' '}] ${text}\n`;
    },
  });

  // --- Strikethrough: <s>/<del>/<strike> -> ~~text~~ ---
  td.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => `~~${content}~~`,
  });

  return td;
}

function htmlToMarkdown(html, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (!html || !html.trim()) return '';
  let md = buildTurndown(opts).turndown(html);
  // Collapse 3+ blank lines (from stacked empty paragraphs) down to one, trim ends.
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  // Empty paragraphs render as `&nbsp;` lines so their gap survives; drop any that
  // end up at the very start or end (Tiptap pads notes with a trailing empty one).
  md = md
    .replace(/^(?:&nbsp;(?:\n\n|$))+/, '')
    .replace(/(?:(?:\n\n|^)&nbsp;)+$/, '')
    .trim();
  return md;
}

module.exports = { htmlToMarkdown };
