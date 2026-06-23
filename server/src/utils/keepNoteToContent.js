/**
 * Convert a Google Keep Takeout note into the app's stored representation.
 *
 * The app stores note bodies as HTML (rendered via dangerouslySetInnerHTML),
 * while Keep gives us either:
 *   - note.textContent: plain text, or
 *   - note.listContent: an array of { text, isChecked } checklist items.
 *
 * Returns { html, plainText }:
 *   - html        -> goes in notes.content      (HTML the editor/cards render)
 *   - plainText   -> goes in notes.plain_content (raw text, used for search)
 *
 * Mirrors the client's formatPlainTextPasteToHtml (client/src/utils/textToHtml.js)
 * so imported notes look the same as text pasted into the editor: each line a
 * <p>, blank lines preserved, leading/clustered spaces kept as &nbsp;, URLs
 * linkified, and everything HTML-escaped so stray <, > or & can't corrupt the
 * render.
 */

// http://, https://, and www. URLs (kept in sync with the client regex)
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>[\](){}'"`,]+/gi;

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    // Preserve leading spaces
    .replace(/^ +/gm, match => '&nbsp;'.repeat(match.length))
    // Preserve runs of 2+ spaces
    .replace(/ {2,}/g, match => '&nbsp;'.repeat(match.length));
}

// Escape a single line and turn bare URLs into <a> links.
function linkifyLine(str) {
  if (!str) return '';

  let result = '';
  let lastIndex = 0;
  URL_REGEX.lastIndex = 0;

  let match;
  while ((match = URL_REGEX.exec(str)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(str.slice(lastIndex, match.index));
    }
    const url = match[0];
    const href = url.startsWith('www.') ? 'https://' + url : url;
    result += `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < str.length) {
    result += escapeHtml(str.slice(lastIndex));
  }

  return result || escapeHtml(str);
}

// Plain text -> paragraph HTML (one <p> per line, blank lines preserved).
function textToHtml(text) {
  const normalized = (text || '').replace(/\r\n?/g, '\n');
  if (normalized === '') return '';

  return normalized
    .split('\n')
    .map(line => (line.trim() === '' ? '<p></p>' : `<p>${linkifyLine(line)}</p>`))
    .join('');
}

// Checklist items -> a Tiptap task list, matching what the editor produces:
//   <ul data-type="taskList">
//     <li data-type="taskItem" data-checked="true|false"><p>...</p></li>
//   </ul>
function listToHtml(listContent) {
  const items = listContent
    .map(item => {
      const checked = item && item.isChecked ? 'true' : 'false';
      const inner = linkifyLine((item && item.text ? item.text : '').replace(/\r\n?/g, ' '));
      return `<li data-type="taskItem" data-checked="${checked}"><p>${inner}</p></li>`;
    })
    .join('');
  return `<ul data-type="taskList">${items}</ul>`;
}

function keepNoteToContent(note) {
  if (note && Array.isArray(note.listContent) && note.listContent.length > 0) {
    const plainText = note.listContent
      .map(item => (item && item.text ? item.text : ''))
      .join('\n');
    return { html: listToHtml(note.listContent), plainText };
  }

  const text = (note && note.textContent) || '';
  return { html: textToHtml(text), plainText: text };
}

module.exports = { keepNoteToContent, textToHtml };
