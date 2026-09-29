const sharp = require('sharp');
const { prepareOcrImage } = require('./ocrImage');

const solid = (width, height, format, extra = {}) =>
  sharp({ create: { width, height, channels: 4, background: { r: 30, g: 60, b: 90, alpha: 1 }, ...extra } })
    .toFormat(format)
    .toBuffer();

describe('prepareOcrImage', () => {
  it('passes a small PNG through untouched', async () => {
    const png = await solid(200, 100, 'png');
    const out = await prepareOcrImage(png, 'image/png');
    expect(out.buffer).toBe(png);
    expect(out.mimeType).toBe('image/png');
  });

  it('labels an image by its contents, not the claimed type', async () => {
    const jpeg = await solid(200, 100, 'jpeg');
    const out = await prepareOcrImage(jpeg, 'image/png');
    expect(out.buffer).toBe(jpeg);
    expect(out.mimeType).toBe('image/jpeg');
  });

  it('re-encodes a GIF (Ollama rejects it) as JPEG', async () => {
    const gif = await solid(200, 100, 'gif');
    const out = await prepareOcrImage(gif, 'image/gif');
    expect(out.mimeType).toBe('image/jpeg');
    expect((await sharp(out.buffer).metadata()).format).toBe('jpeg');
  });

  it('turns transparent areas white, not black', async () => {
    const clear = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .gif()
      .toBuffer();
    const out = await prepareOcrImage(clear, 'image/gif');
    const { channels } = await sharp(out.buffer).stats();
    expect(channels[0].mean).toBeGreaterThan(250);
  });

  it('applies EXIF orientation so photos are upright', async () => {
    const rotated = await sharp(await solid(200, 100, 'jpeg')).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await prepareOcrImage(rotated, 'image/jpeg');
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([100, 200]);
    expect(meta.orientation || 1).toBe(1);
  });

  it('caps sides at 8000 px', async () => {
    const wide = await solid(9000, 40, 'png');
    const out = await prepareOcrImage(wide, 'image/png');
    expect((await sharp(out.buffer).metadata()).width).toBe(8000);
  });

  it('shrinks an image over 5 MB until it fits', async () => {
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#888', noise: { type: 'gaussian', mean: 128, sigma: 40 } },
    }).png({ compressionLevel: 0 }).toBuffer();
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
    const out = await prepareOcrImage(big, 'image/png');
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.buffer.length).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('explains HEIC instead of failing vaguely', async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(64)]);
    await expect(prepareOcrImage(heic, 'application/octet-stream'))
      .rejects.toMatchObject({ nonRetryable: true, message: expect.stringContaining('HEIC') });
  });

  it('rejects something that is not an image', async () => {
    await expect(prepareOcrImage(Buffer.from('not an image'), 'image/png'))
      .rejects.toMatchObject({ nonRetryable: true, message: expect.stringContaining("Couldn't read") });
  });
});
