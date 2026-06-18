const sharp = require('sharp');
const path = require('path');
const { JSDOM } = require('jsdom');
const NoteImage = require('../models/NoteImage');
const { safeFetchImage } = require('./safeFetchImage');

/**
 * Download an image from a URL and convert to base64. Rejects private-network
 * targets, oversized bodies, non-image responses, and excessive redirects.
 */
async function downloadImageAsBase64(imageUrl, maxSize = 5 * 1024 * 1024) {
    try {
        const { buffer, contentType } = await safeFetchImage(imageUrl, {
            maxBytes: maxSize,
            timeoutMs: 15000,
        });

        const base64 = buffer.toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        return {
            data: dataUrl,
            type: contentType,
            size: buffer.length,
        };
    } catch (error) {
        console.error(`Failed to download image ${imageUrl}:`, error.message);
        return null;
    }
}

// Single resize/encode policy for every note image (uploads, URL extraction,
// migration). WebP gives ~25-35% smaller files than JPEG at equal quality and
// sharp auto-rotates from EXIF so phone photos aren't sideways.
const FULL_MAX_DIMENSION = 1600; // longest side of the stored "full" image
const FULL_QUALITY = 80;
const THUMB_SIZE = 220; // square gallery/preview thumbnail
const THUMB_QUALITY = 72;

// Strip a `data:<mime>;base64,` prefix if present and return a decoded buffer
// plus the source mime (used to preserve GIF animation through the encoder).
function toBuffer(input) {
    if (Buffer.isBuffer(input)) return { buffer: input, mime: null };
    const match = /^data:([^;]+);base64,(.*)$/s.exec(input);
    if (match) {
        return { buffer: Buffer.from(match[2], 'base64'), mime: match[1] };
    }
    // Assume raw base64
    return { buffer: Buffer.from(input, 'base64'), mime: null };
}

/**
 * Produce the canonical stored representations of a note image: a WebP "full"
 * image (longest side capped, EXIF-oriented) and a square WebP thumbnail.
 *
 * @param {string|Buffer} input - data URL, raw base64, or buffer
 * @returns {Promise<{ data: string, thumbnail: string, type: string, size: number }>}
 */
async function processNoteImage(input) {
    const { buffer, mime } = toBuffer(input);
    const animated = mime === 'image/gif';

    const fullBuffer = await sharp(buffer, { animated })
        .rotate() // auto-orient from EXIF before resizing
        .resize(FULL_MAX_DIMENSION, FULL_MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true,
        })
        .webp({ quality: FULL_QUALITY })
        .toBuffer();

    const thumbBuffer = await sharp(buffer)
        .rotate()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'center' })
        .webp({ quality: THUMB_QUALITY })
        .toBuffer();

    return {
        data: `data:image/webp;base64,${fullBuffer.toString('base64')}`,
        thumbnail: `data:image/webp;base64,${thumbBuffer.toString('base64')}`,
        type: 'image/webp',
        size: fullBuffer.length,
    };
}

/**
 * Create just the square WebP thumbnail (used where only a thumbnail is needed).
 */
async function createThumbnail(base64Data, size = THUMB_SIZE) {
    try {
        const { buffer } = toBuffer(base64Data);
        const thumbnailBuffer = await sharp(buffer)
            .rotate()
            .resize(size, size, { fit: 'cover', position: 'center' })
            .webp({ quality: THUMB_QUALITY })
            .toBuffer();

        return `data:image/webp;base64,${thumbnailBuffer.toString('base64')}`;
    } catch (error) {
        console.error('Failed to create thumbnail:', error.message);
        // Return the original if thumbnail creation fails
        return base64Data;
    }
}

/**
 * Extract image URLs from HTML content
 */
function extractImageUrls(html, baseUrl) {
    const dom = new JSDOM(html);
    const images = dom.window.document.querySelectorAll('img');
    const imageUrls = [];

    images.forEach(img => {
        let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (src) {
            try {
                // Convert relative URLs to absolute
                const absoluteUrl = new URL(src, baseUrl).href;
                // Basic filtering - skip very small images, icons, etc.
                const width = parseInt(img.width) || 0;
                const height = parseInt(img.height) || 0;
                const alt = img.alt || '';

                // Skip tiny images, likely icons or tracking pixels
                if ((width > 0 && width < 50) || (height > 0 && height < 50)) {
                    return;
                }

                // Skip common icon/favicon patterns
                if (src.includes('favicon') || src.includes('icon') ||
                    src.includes('logo') && (width < 100 || height < 100)) {
                    return;
                }

                imageUrls.push({
                    url: absoluteUrl,
                    alt: alt,
                    width: width || null,
                    height: height || null
                });
            } catch (urlError) {
                console.warn(`Invalid image URL: ${src}`);
            }
        }
    });

    return imageUrls;
}

/**
 * Process and upload images for a note
 */
async function processAndUploadImages(imageUrls, noteId, maxImages = 10) {
    const processPromises = [];

    // Limit the number of images to process
    const imagesToProcess = imageUrls.slice(0, maxImages);

    for (const imageInfo of imagesToProcess) {
        const processPromise = (async () => {
            try {
                console.log(`Processing image: ${imageInfo.url}`);

                // Download the image
                const imageData = await downloadImageAsBase64(imageInfo.url);
                if (!imageData) {
                    console.warn(`Skipping image due to download failure: ${imageInfo.url}`);
                    return null;
                }

                // Run through the single resize/encode policy (WebP full + thumb)
                const processed = await processNoteImage(imageData.data);

                const image = await NoteImage.create({
                    note_id: noteId,
                    data: processed.data,
                    thumbnail: processed.thumbnail,
                    name: imageInfo.alt || path.basename(new URL(imageInfo.url).pathname) || 'Extracted Image',
                    type: processed.type,
                    size: processed.size,
                });

                console.log(`Successfully uploaded image ${image.id} for note ${noteId}`);

                // Reference-only: the client inserts <img data-image-id> and resolves
                // the bytes via /api/images/:id/raw, so we don't return base64 here.
                return {
                    id: image.id,
                    originalUrl: imageInfo.url,
                    alt: imageInfo.alt,
                    width: imageInfo.width,
                    height: imageInfo.height
                };
            } catch (error) {
                console.error(`Failed to process image ${imageInfo.url}:`, error.message);
                return null;
            }
        })();

        processPromises.push(processPromise);
    }

    // Wait for all images to be processed
    const results = await Promise.all(processPromises);

    // Filter out failed uploads
    return results.filter(result => result !== null);
}

module.exports = {
    downloadImageAsBase64,
    processNoteImage,
    createThumbnail,
    extractImageUrls,
    processAndUploadImages
};
