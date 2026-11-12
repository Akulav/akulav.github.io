'use strict';
// Draws the site icon (no dependencies): assets/icon.svg and assets/icon.png (256 px).
// A rounded square with the violet → cyan gradient and a geometric lowercase "a".
// Run: node tools/make-icon.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'assets');
const FROM = [0x7c, 0x5c, 0xff];
const TO = [0x00, 0xd4, 0xff];
// in a 64×64 space: the bowl (ring) and the stem of the "a"
const BOWL = { cx: 29, cy: 37, r: 12, inner: 6.2 };
const STEM = { x0: 35.5, y0: 22, x1: 42.5, y1: 49, r: 3.5 };

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function sample(x, y) {
  if (!inRoundRect(x, y, 0, 0, 64, 64, 16)) return null;
  const d = Math.hypot(x - BOWL.cx, y - BOWL.cy);
  if ((d <= BOWL.r && d >= BOWL.inner) || inRoundRect(x, y, STEM.x0, STEM.y0, STEM.x1, STEM.y1, STEM.r)) return [255, 255, 255];
  const t = Math.min(1, Math.max(0, (x + y) / 128));
  return FROM.map((c, i) => Math.round(c + (TO[i] - c) * t));
}

function png(size) {
  const N = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const c = sample(((px + (sx + 0.5) / N) * 64) / size, ((py + (sy + 0.5) / N) * 64) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      if (a) { raw[o] = Math.round(r / a); raw[o + 1] = Math.round(g / a); raw[o + 2] = Math.round(b / a); }
      raw[o + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hex(FROM)}"/><stop offset="1" stop-color="${hex(TO)}"/></linearGradient></defs>
  <rect width="64" height="64" rx="16" fill="url(#g)"/>
  <circle cx="${BOWL.cx}" cy="${BOWL.cy}" r="${(BOWL.r + BOWL.inner) / 2}" fill="none" stroke="#fff" stroke-width="${BOWL.r - BOWL.inner}"/>
  <rect x="${STEM.x0}" y="${STEM.y0}" width="${STEM.x1 - STEM.x0}" height="${STEM.y1 - STEM.y0}" rx="${STEM.r}" fill="#fff"/>
</svg>
`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg);
fs.writeFileSync(path.join(OUT, 'icon.png'), png(256));
console.log('wrote assets/icon.svg and assets/icon.png');
