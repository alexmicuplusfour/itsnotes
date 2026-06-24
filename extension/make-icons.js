// Generates the extension's PNG icons (16/48/128) without any image library:
// a solid accent-yellow square with a simple white "note" rectangle, encoded as
// PNG via Node's built-in zlib. Run with `node make-icons.js`.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 (PNG chunk checksums).
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size) {
  const bg = [0xf5, 0xc5, 0x18]; // accent yellow
  const fg = [0x1a, 0x1a, 0x1a]; // near-black "note" outline
  const paper = [0xff, 0xff, 0xff];

  // Note rectangle bounds (centered, ~55% of the icon).
  const m = Math.round(size * 0.24);
  const right = size - m;
  const bottom = size - Math.round(size * 0.18);

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let color = bg;
      const inNote = x >= m && x < right && y >= m && y < bottom;
      if (inNote) {
        const border = Math.max(1, Math.round(size * 0.03));
        const onEdge =
          x < m + border || x >= right - border || y < m + border || y >= bottom - border;
        color = onEdge ? fg : paper;
        // A couple of "text lines" inside the paper.
        if (!onEdge) {
          const lineH = Math.max(1, Math.round(size * 0.04));
          const l1 = m + Math.round((bottom - m) * 0.35);
          const l2 = m + Math.round((bottom - m) * 0.6);
          if ((y >= l1 && y < l1 + lineH) || (y >= l2 && y < l2 + lineH)) {
            if (x > m + border * 2 && x < right - border * 2) color = fg;
          }
        }
      }
      const off = rowStart + 1 + x * 4;
      raw[off] = color[0];
      raw[off + 1] = color[1];
      raw[off + 2] = color[2];
      raw[off + 3] = 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), makePng(size));
  console.log(`wrote icons/icon${size}.png`);
}
