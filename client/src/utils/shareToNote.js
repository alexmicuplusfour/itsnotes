import { formatPlainTextPasteToHtml } from './textToHtml';

// Same URL shapes textToHtml linkifies (kept in sync with its regex)
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>[\](){}'"`,]+/gi;

/**
 * Compose a note from Web Share Target params (/share?title=&text=&url=).
 *
 * Android apps disagree about which field carries what — YouTube puts the URL in
 * `text`, Chrome fills `title` + `text`, some apps only fill `text` — so this
 * normalizes: pick the shared URL (explicit param, else the last URL found in the
 * text), keep it out of the prose, and place it on its own line. A URL standing
 * alone in its paragraph is what the server's link-preview extraction looks for.
 *
 * Returns { title, content, isEmpty } where content is editor HTML.
 */
export function composeSharedNote({ title = '', text = '', url = '' } = {}) {
  const cleanTitle = (title || '').trim();
  let body = (text || '').replace(/\r\n?/g, '\n').trim();
  let link = (url || '').trim();

  if (!link) {
    const matches = body.match(URL_REGEX);
    if (matches && matches.length > 0) {
      link = matches[matches.length - 1];
    }
  }

  // Drop the chosen link from the prose so it appears once, on its own line
  if (link && body.includes(link)) {
    body = body
      .split(link).join('')
      .replace(/[ \t]{2,}/g, ' ')
      .split('\n').map(line => (line.trim() === '' ? '' : line))
      .join('\n')
      .trim();
  }

  const parts = [];
  if (body) parts.push(body);
  if (link) parts.push(link);
  const raw = parts.join('\n');

  return {
    title: cleanTitle,
    content: raw ? formatPlainTextPasteToHtml(raw) : '',
    isEmpty: !cleanTitle && !raw,
  };
}
