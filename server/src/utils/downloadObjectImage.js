const fs = require('fs').promises;
const path = require('path');
const { safeFetchImage } = require('./safeFetchImage');

/**
 * Download an image from a URL and save it to the uploads/objects directory.
 * Rejects URLs that target private networks, oversized bodies, non-image
 * responses, or excessive redirects.
 *
 * @param {string} imageUrl - The URL of the image to download
 * @param {string} objectType - The type of object (book, movie, etc.)
 * @param {string} objectId - The ID of the object
 * @returns {Promise<string|null>} The local path to the saved image, or null if download failed
 */
async function downloadObjectImage(imageUrl, objectType, objectId) {
  if (!imageUrl) {
    console.log('[downloadObjectImage] No image URL provided');
    return null;
  }

  try {
    const uploadsDir = path.join(__dirname, '../../uploads');
    const typeDir = path.join(uploadsDir, 'objects', objectType);
    await fs.mkdir(typeDir, { recursive: true });

    const urlObj = new URL(imageUrl);
    let ext = path.extname(urlObj.pathname).toLowerCase();
    if (!ext || ext.length > 5 || !['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      ext = '.jpg';
    }

    const filename = `${objectId}${ext}`;
    const filepath = path.join(typeDir, filename);

    const { buffer } = await safeFetchImage(imageUrl, {
      maxBytes: 5 * 1024 * 1024,
      timeoutMs: 10000,
    });

    await fs.writeFile(filepath, buffer);

    const relativePath = `/uploads/objects/${objectType}/${filename}`;
    console.log(`[downloadObjectImage] Successfully saved image to ${relativePath}`);
    return relativePath;
  } catch (error) {
    console.error('[downloadObjectImage] Error downloading image:', error.message);
    return null;
  }
}

module.exports = { downloadObjectImage };
