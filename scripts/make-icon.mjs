// draws assets/icon.png (a nurt's face and sprout) with no image tools, so it can be remade anywhere.
// `npm run icon`
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const SAMPLES = 3; // smooth edges by checking several points per pixel

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function nearSegment(x, y, x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy) <= width;
}

function colourAt(x, y) {
  const inside = Math.abs(x - 256) <= 240 && Math.abs(y - 256) <= 240;
  const corner = Math.hypot(Math.max(0, Math.abs(x - 256) - 140), Math.max(0, Math.abs(y - 256) - 140)) <= 100;
  if (!inside || !corner) return [0, 0, 0, 0];
  if (inEllipse(x, y, 215, 195, 34, 42)) {
    if (inEllipse(x, y, 225, 197, 19, 23)) return [20, 32, 42, 255];
    return [255, 255, 255, 255];
  }
  if (inEllipse(x, y, 315, 195, 34, 42)) {
    if (inEllipse(x, y, 325, 197, 19, 23)) return [20, 32, 42, 255];
    return [255, 255, 255, 255];
  }
  if (inEllipse(x, y, 256, 92, 26, 26)) return [255, 226, 138, 255];
  if (nearSegment(x, y, 256, 110, 256, 150, 9)) return [53, 168, 153, 255];
  if (inEllipse(x, y, 262, 325, 104, 66)) return [189, 243, 233, 255];
  if (inEllipse(x, y, 256, 262, 152, 132)) return [79, 214, 195, 255];
  return [23, 26, 38, 255];
}

const pixels = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  const row = py * (SIZE * 4 + 1);
  pixels[row] = 0;
  for (let px = 0; px < SIZE; px++) {
    const sum = [0, 0, 0, 0];
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const c = colourAt(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES);
        for (let i = 0; i < 3; i++) sum[i] += c[i] * c[3];
        sum[3] += c[3];
      }
    }
    const at = row + 1 + px * 4;
    for (let i = 0; i < 3; i++) pixels[at + i] = sum[3] ? Math.round(sum[i] / sum[3]) : 0;
    pixels[at + 3] = Math.round(sum[3] / (SAMPLES * SAMPLES));
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(body));
  return Buffer.concat([head, body, tail]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bits per channel
header[9] = 6; // rgba
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(import.meta.dirname, '..', 'assets', 'icon.png');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`Wrote ${out}`);
