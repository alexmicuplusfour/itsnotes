const { JSDOM } = require('jsdom');

// Block-level containers Tiptap emits that can hold a standalone link.
const BLOCK_SELECTOR = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote';

// Extract unique http/https URLs from note HTML for link previews. Only
// "standalone" links are returned: an anchor is standalone when it is the sole
// content of its block-level ancestor (i.e. a URL sitting alone on its own
// paragraph/line), not a link embedded inline within a run of prose. Results are
// in document order, deduped, capped at `limit`.
function extractLinkUrls(html, limit = 5) {
  if (!html) return [];

  const seen = new Set();
  const urls = [];

  const { document } = new JSDOM(html).window;
  const anchors = document.querySelectorAll('a[href]');

  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) continue;

    const block = a.closest(BLOCK_SELECTOR);
    if (!block) continue;
    // Sole anchor in the block, no other embedded media, and no text outside the
    // link — so the block's only visible content is this one link.
    if (block.querySelectorAll('a[href]').length !== 1) continue;
    if (block.querySelector('img,video,iframe')) continue;
    if (block.textContent.trim() !== a.textContent.trim()) continue;

    if (!seen.has(href)) {
      seen.add(href);
      urls.push(href);
      if (urls.length >= limit) break;
    }
  }

  return urls;
}

module.exports = { extractLinkUrls };
