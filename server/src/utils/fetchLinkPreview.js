const fs = require('fs').promises;
const path = require('path');
const ogs = require('open-graph-scraper');
const { safeFetchImage } = require('./safeFetchImage');

async function downloadPreviewImage(imageUrl, linkId, suffix) {
  if (!imageUrl) return null;
  try {
    const dir = path.join(__dirname, '../../uploads/links');
    await fs.mkdir(dir, { recursive: true });

    const urlObj = new URL(imageUrl);
    let ext = path.extname(urlObj.pathname).toLowerCase().split('?')[0];
    if (!ext || ext.length > 5 || !['.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.svg'].includes(ext)) {
      ext = '.jpg';
    }

    const filename = `${linkId}${suffix}${ext}`;
    const filepath = path.join(dir, filename);

    const requireImageContentType = suffix !== '_fav';
    const { buffer } = await safeFetchImage(imageUrl, {
      maxBytes: 3 * 1024 * 1024,
      timeoutMs: 8000,
      requireImageContentType,
    });

    await fs.writeFile(filepath, buffer);
    return `/uploads/links/${filename}`;
  } catch (e) {
    console.error(`[fetchLinkPreview] Image download failed (${suffix}):`, e.message);
    return null;
  }
}

async function fetchLinkPreview(url, linkId) {
  try {
    const { result } = await ogs({ url, timeout: 8000 });

    const title = result.ogTitle || result.twitterTitle || null;
    const description = result.ogDescription || result.twitterDescription || null;

    // Pick the first image that looks like a real preview (skip tiny icons, SVGs, spacer gifs)
    const ogImages = result.ogImage || [];
    const goodImage = ogImages.find(img => {
      const src = (img.url || '').toLowerCase();
      if (!src) return false;
      if (src.endsWith('.svg')) return false;
      if (/spacer|pixel|blank|s\.gif/.test(src)) return false;
      if (img.height != null && img.height < 50) return false;
      if (img.width != null && img.width < 50) return false;
      return true;
    });

    let ogImageUrl = goodImage?.url || null;
    if (ogImageUrl && !ogImageUrl.startsWith('http')) {
      try { ogImageUrl = new URL(ogImageUrl, url).href; } catch { ogImageUrl = null; }
    }

    console.log(`[fetchLinkPreview] ${url} → title="${title}" ogImage="${ogImageUrl}" favicon="${result.favicon}"`);

    let faviconUrl = result.favicon || null;
    if (faviconUrl && !faviconUrl.startsWith('http')) {
      try {
        faviconUrl = new URL(faviconUrl, url).href;
      } catch {
        faviconUrl = `${new URL(url).origin}/favicon.ico`;
      }
    } else if (!faviconUrl) {
      faviconUrl = `${new URL(url).origin}/favicon.ico`;
    }

    const [image_url, favicon_url] = await Promise.all([
      downloadPreviewImage(ogImageUrl, linkId, ''),
      downloadPreviewImage(faviconUrl, linkId, '_fav'),
    ]);

    return { title, description, image_url, favicon_url };
  } catch (e) {
    console.error(`[fetchLinkPreview] Failed for ${url}:`, e.message || e);
    return { title: null, description: null, image_url: null, favicon_url: null };
  }
}

module.exports = { fetchLinkPreview };
