const sharp = require('sharp');

// Image types every provider's vision API takes: Ollama accepts only these
// three (OpenAI and Claude also take GIF). Anything else gets re-encoded.
const SAFE_FORMATS = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
// Claude's API caps an image at 10 MB after base64 (~7.5 MB raw) and 8000 px a
// side. Staying well inside both lets one image work with every provider.
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 8000;
// Fallback when a re-encode is still too big: above Claude's largest native
// resolution (2576 px), so it drops nothing Claude would see.
const SHRUNK_SIDE = 3072;

// HEIC (Apple's photo format) needs an HEVC decoder that sharp doesn't ship.
const isHeic = (buffer, mimeType) =>
  /hei[cf]/i.test(mimeType || '') || /^ftyphe(ic|ix|vc|vx)/.test(buffer.toString('latin1', 4, 12));

// The OCR route shows these messages as-is (respondAIError passes
// nonRetryable errors through).
function unreadable(message) {
  const err = new Error(message);
  err.nonRetryable = true;
  return err;
}

/**
 * Make an uploaded image acceptable to every vision provider. Images that
 * already are go through untouched; the rest (other formats, animated, too
 * big, EXIF-rotated) are auto-oriented, capped, and re-encoded as JPEG.
 *
 * @param {Buffer} buffer - uploaded file
 * @param {string} [mimeType] - type the browser claimed (only used to spot HEIC)
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
async function prepareOcrImage(buffer, mimeType) {
  try {
    const meta = await sharp(buffer).metadata();
    const safeType = SAFE_FORMATS[meta.format];
    if (
      safeType &&
      buffer.length <= MAX_BYTES &&
      Math.max(meta.width, meta.height) <= MAX_SIDE &&
      (meta.orientation || 1) === 1 &&
      (meta.pages || 1) === 1
    ) {
      // Label it by what's actually inside, not what the browser claimed.
      return { buffer, mimeType: safeType };
    }

    const encode = (side, quality) => sharp(buffer) // first frame only
      .rotate() // auto-orient from EXIF
      .resize(side, side, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // transparency → white, not black
      .jpeg({ quality })
      .toBuffer();

    let out = await encode(MAX_SIDE, 90);
    if (out.length > MAX_BYTES) out = await encode(SHRUNK_SIDE, 85);
    return { buffer: out, mimeType: 'image/jpeg' };
  } catch (error) {
    if (isHeic(buffer, mimeType)) {
      throw unreadable("HEIC images aren't supported for OCR — save it as JPEG or PNG and try again.");
    }
    throw unreadable("Couldn't read that image — try a JPEG, PNG, WebP or GIF.");
  }
}

module.exports = { prepareOcrImage };
