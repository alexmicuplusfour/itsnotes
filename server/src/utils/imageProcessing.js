const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const { JSDOM } = require('jsdom');
const NoteImage = require('../models/NoteImage');

/**
 * Download an image from a URL and convert to base64
 */
async function downloadImageAsBase64(imageUrl, maxSize = 5 * 1024 * 1024) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: maxSize,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
        });

        // Check if it's actually an image by content type
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
            console.warn(`Invalid content type for image ${imageUrl}: ${contentType}`);
            return null;
        }

        // Convert to base64
        const base64 = Buffer.from(response.data).toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        return {
            data: dataUrl,
            type: contentType,
            size: response.data.length
        };
    } catch (error) {
        console.error(`Failed to download image ${imageUrl}:`, error.message);
        return null;
    }
}

/**
 * Create a small thumbnail from base64 image data (160px for gallery/preview)
 */
async function createThumbnail(base64Data, size = 160) {
    try {
        // Remove data URL prefix to get just the base64 data
        const base64Image = base64Data.split(',')[1];
        const imageBuffer = Buffer.from(base64Image, 'base64');

        // Use sharp to create a square thumbnail
        const thumbnailBuffer = await sharp(imageBuffer)
            .resize(size, size, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 60 }) // Reasonable quality for small thumbnails
            .toBuffer();

        return `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
    } catch (error) {
        console.error('Failed to create thumbnail:', error.message);
        // Return a smaller version of the original if thumbnail creation fails
        return base64Data;
    }
}

/**
 * Create a resized "full resolution" image for extracted content (700px width max, for inline display)
 */
async function createExtractedFullImage(base64Data) {
    try {
        // Remove data URL prefix to get just the base64 data
        const base64Image = base64Data.split(',')[1];
        const imageBuffer = Buffer.from(base64Image, 'base64');

        // Use sharp to resize to 700px width max, preserving aspect ratio
        const resizedBuffer = await sharp(imageBuffer)
            .resize(700, null, {
                fit: 'inside',
                withoutEnlargement: true // Don't enlarge images smaller than 700px
            })
            .jpeg({ quality: 30 }) // Low quality for database storage
            .toBuffer();

        return `data:image/jpeg;base64,${resizedBuffer.toString('base64')}`;
    } catch (error) {
        console.error('Failed to create extracted full image:', error.message);
        // Return the original if resizing fails
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

                // Create full resolution image (700px max width) for inline display
                const fullImage = await createExtractedFullImage(imageData.data);

                // Create small thumbnail (160px) for gallery/preview
                const thumbnail = await createThumbnail(imageData.data);

                // Create the image record
                const image = await NoteImage.create({
                    note_id: noteId,
                    data: fullImage, // Store the 700px version as "full resolution"
                    thumbnail: thumbnail, // Store the 160px version as thumbnail
                    name: imageInfo.alt || path.basename(new URL(imageInfo.url).pathname) || 'Extracted Image',
                    type: 'image/jpeg', // Since we're converting to JPEG
                    size: Buffer.from(fullImage.split(',')[1], 'base64').length
                });

                console.log(`Successfully uploaded image ${image.id} for note ${noteId}`);

                return {
                    id: image.id,
                    thumbnail: fullImage, // Return full image for inline display (not the small thumbnail)
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
    createThumbnail,
    createExtractedFullImage,
    extractImageUrls,
    processAndUploadImages
};
