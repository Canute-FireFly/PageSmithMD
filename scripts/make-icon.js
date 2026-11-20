// Generates build/icon.ico (PNG-in-ICO) with plain Node, no image libraries.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 256;
const SS = 3; // supersampling for smooth edges

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inTri(px, py, [x1, y1], [x2, y2], [x3, y3]) {
  const d = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const a = d(px, py, x1, y1, x2, y2), b = d(px, py, x2, y2, x3, y3), c = d(px, py, x3, y3, x1, y1);
  return !((a < 0 || b < 0 || c < 0) && (a > 0 || b > 0 || c > 0));
}
function inRoundRect(px, py, m, r) {
  const x = Math.min(Math.max(px, m + r), N - m - r);
  const y = Math.min(Math.max(py, m + r), N - m - r);
  return px >= m && px <= N - m && py >= m && py <= N - m && Math.hypot(px - x, py - y) <= r;
}
function glyph(px, py) {
  const w = 10; // half thickness
  return (
    segDist(px, py, 52, 82, 52, 174) < w ||
    segDist(px, py, 140, 82, 140, 174) < w ||
    segDist(px, py, 52, 82, 96, 140) < w ||
    segDist(px, py, 140, 82, 96, 140) < w ||
    segDist(px, py, 202, 84, 202, 146) < 9 ||
    inTri(px, py, [176, 140], [228, 140], [202, 178])
  );
}

const raw = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  for (let x = 0; x < N; x++) {
    let bg = 0, fg = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
        if (inRoundRect(px, py, 10, 44)) { bg++; if (glyph(px, py)) fg++; }
      }
    }
    const total = SS * SS;
    const a = bg / total;
    const f = bg ? fg / bg : 0;
    const o = y * (N * 4 + 1) + 1 + x * 4;
    raw[o] = Math.round(9 + (255 - 9) * f);      // R: #0969da -> white
    raw[o + 1] = Math.round(105 + (255 - 105) * f);
    raw[o + 2] = Math.round(218 + (255 - 218) * f);
    raw[o + 3] = Math.round(a * 255);
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);

const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = 0; header[7] = 0; // 256x256
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, png]));
fs.writeFileSync(path.join(out, 'icon.png'), png);
console.log('icon written');
