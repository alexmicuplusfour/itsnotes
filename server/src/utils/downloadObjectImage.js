const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Download an image from a URL and save it to the uploads/objects directory
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
    // Ensure the objects directory exists
    const uploadsDir = path.join(__dirname, '../../uploads');
    const objectsDir = path.join(uploadsDir, 'objects');
    const typeDir = path.join(objectsDir, objectType);

    await fs.mkdir(typeDir, { recursive: true });

    // Determine file extension from URL
    const urlObj = new URL(imageUrl);
    const urlPath = urlObj.pathname;
    let ext = path.extname(urlPath).toLowerCase();

    // Default to .jpg if no extension found or if it's suspicious
    if (!ext || ext.length > 5 || !['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      ext = '.jpg';
    }

    // Generate filename: objectId + extension
    const filename = `${objectId}${ext}`;
    const filepath = path.join(typeDir, filename);

    // Download the image
    const imageBuffer = await downloadImage(imageUrl);

    // Save to disk
    await fs.writeFile(filepath, imageBuffer);

    // Return the relative path from the server root for serving
    const relativePath = `/uploads/objects/${objectType}/${filename}`;
    console.log(`[downloadObjectImage] Successfully saved image to ${relativePath}`);
    return relativePath;
  } catch (error) {
    console.error('[downloadObjectImage] Error downloading image:', error.message);
    return null;
  }
}

/**
 * Download image from URL
 * @param {string} url - The URL to download from
 * @returns {Promise<Buffer>} The image data as a buffer
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000 // 10 second timeout
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        console.log(`[downloadImage] Redirecting to ${redirectUrl}`);
        return downloadImage(redirectUrl).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

module.exports = { downloadObjectImage };
