// Helpers for turning extracted article HTML into a stored note body, used by
// the browser-extension clip endpoint (POST /api/notes/clip). These mirror what
// the in-app extraction path does on the client so a clipped note looks the same
// as one created by pasting a URL into the editor:
//   - cleanArticleHtml: server-side (JSDOM) port of the client's
//     cleanHtmlForTiptap (client/src/utils/noteUtils.js)
//   - buildClippedNoteHtml: the article + separator + "Original URL" footer,
//     matching client/src/hooks/useUrlExtraction.js

const { JSDOM } = require('jsdom');

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Clean and sanitize extracted HTML for Tiptap compatibility. JSDOM port of the
// browser-only cleanHtmlForTiptap: strip Readability wrappers and unsafe/unsupported
// tags, drop empty paragraphs, convert bare <div>s to <p>, and add spacer
// paragraphs between blocks so the rendered note breathes the same way.
function cleanArticleHtml(html) {
    if (!html || typeof html !== 'string') return '<p></p>';

    const dom = new JSDOM(`<!DOCTYPE html><body><div id="__clip_root">${html}</div></body>`);
    const doc = dom.window.document;
    const root = doc.getElementById('__clip_root');

    // Remove wrapper elements Readability adds, keeping their children.
    root.querySelectorAll('#readability-page-1, .page').forEach((wrapper) => {
        while (wrapper.firstChild) wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
        wrapper.remove();
    });

    // Remove elements that break Tiptap or are unsafe to store.
    root.querySelectorAll('script, style, meta, link, title, iframe, object, embed, applet')
        .forEach((el) => el.remove());

    // Remove empty paragraphs (only whitespace, &nbsp;, or <br>).
    root.querySelectorAll('p').forEach((p) => {
        const textContent = p.textContent.replace(/\s/g, '').replace(/ /g, '');
        const hasOnlyBr = p.innerHTML.trim().match(/^(<br[^>]*>\s*)+$/i);
        if (!textContent && (hasOnlyBr || !p.innerHTML.trim())) p.remove();
    });

    // Convert <div>s to <p> (or unwrap them if they hold block children).
    root.querySelectorAll('div').forEach((div) => {
        if (div.closest('table')) return;
        const hasBlockChildren = div.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, div, table');
        if (!hasBlockChildren) {
            const p = doc.createElement('p');
            p.innerHTML = div.innerHTML;
            div.parentNode.replaceChild(p, div);
        } else {
            while (div.firstChild) div.parentNode.insertBefore(div.firstChild, div);
            div.remove();
        }
    });

    // Insert empty spacer paragraphs after blocks (matches client spacing).
    const addSpacersAfter = (selector) => {
        Array.from(root.querySelectorAll(selector)).forEach((el) => {
            const next = el.nextElementSibling;
            if (next && !(next.tagName === 'P' && next.innerHTML === '')) {
                const emptyP = doc.createElement('p');
                emptyP.innerHTML = '';
                el.parentNode.insertBefore(emptyP, next);
            }
        });
    };
    addSpacersAfter('p');
    ['blockquote', 'pre', 'code', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4'].forEach(addSpacersAfter);

    let cleaned = root.innerHTML.replace(/>\s+</g, '><').trim();
    cleaned = cleaned.replace(/^\s+|\s+$/g, '');
    if (!cleaned) return '<p></p>';

    // Wrap in a paragraph if it doesn't start with a block element.
    if (!cleaned.match(/^<(p|h[1-6]|ul|ol|blockquote|div|table)/i)) {
        return `<p>${cleaned}</p>`;
    }
    return cleaned;
}

// Inline style used for every reference-only image, matching the in-app
// extraction path (useUrlExtraction.js).
const EXTRACTED_IMG_STYLE =
    'max-width: 100%; height: auto; display: block; margin: 0.5rem 0; border-radius: 8px;';

// Swap remote <img src> nodes for reference-only <img data-image-id> nodes after
// the images have been re-hosted server-side. `uploaded` is the array returned by
// processAndUploadImages ({ id, originalUrl, alt, ... }); `baseUrl` resolves any
// relative src so it can be matched against the (absolute) originalUrl.
//
// Every uploaded image MUST end up referenced in the returned HTML — Note.update's
// reconcileInlineImages deletes note_images rows whose id isn't present in the
// body. So any upload not matched to an <img> in the markup is appended at the end.
function applyRehostedImages({ html, baseUrl, uploaded }) {
    if (!uploaded || uploaded.length === 0) return html;

    const byUrl = new Map(uploaded.map((u) => [u.originalUrl, u]));
    const dom = new JSDOM(`<!DOCTYPE html><body><div id="__clip_root">${html}</div></body>`);
    const doc = dom.window.document;
    const root = doc.getElementById('__clip_root');
    const referenced = new Set();

    root.querySelectorAll('img').forEach((img) => {
        const raw = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (!raw) return;
        let abs;
        try { abs = new URL(raw, baseUrl).href; } catch (_) { return; }
        const up = byUrl.get(abs);
        if (!up) return;
        // Strip anything that could re-introduce the remote URL.
        ['src', 'srcset', 'data-src', 'data-lazy-src', 'sizes', 'loading'].forEach((a) => img.removeAttribute(a));
        img.setAttribute('alt', up.alt || 'Extracted image');
        img.setAttribute('data-image-id', String(up.id));
        img.setAttribute('style', EXTRACTED_IMG_STYLE);
        referenced.add(String(up.id));
    });

    // Append any re-hosted image that didn't match an <img> in the markup, so its
    // row survives reconciliation (mirrors the client's "unmatched images" path).
    const extras = uploaded.filter((u) => !referenced.has(String(u.id)));
    if (extras.length > 0) {
        const sep = doc.createElement('p');
        sep.textContent = '---';
        root.appendChild(sep);
        for (const u of extras) {
            const img = doc.createElement('img');
            img.setAttribute('alt', u.alt || 'Extracted image');
            img.setAttribute('data-image-id', String(u.id));
            img.setAttribute('style', EXTRACTED_IMG_STYLE);
            root.appendChild(img);
        }
    }

    return root.innerHTML;
}

// Assemble the final note body: cleaned article, a separator, then a footer
// linking back to the original URL. Mirrors the in-app format from
// useUrlExtraction.js (without the "remaining editor text", which a fresh clip
// doesn't have).
function buildClippedNoteHtml({ articleHtml, url }) {
    const safeUrl = escapeHtml(url);
    return [
        cleanArticleHtml(articleHtml),
        '<p>---</p>',
        `<p>Original URL: <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a></p>`,
    ].join('\n');
}

module.exports = { cleanArticleHtml, buildClippedNoteHtml, applyRehostedImages };
