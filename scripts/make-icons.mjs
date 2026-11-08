import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n >>> 0; });
function chunk(type, bytes) {
  const data = Buffer.concat([Buffer.from(type), bytes]); let crc = 0xffffffff;
  for (const b of data) crc = crcTable[(crc ^ b) & 255] ^ crc >>> 8;
  const header = Buffer.alloc(4), tail = Buffer.alloc(4); header.writeUInt32BE(bytes.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, data, tail]);
}
await mkdir('icons', { recursive: true });
for (const [size, name, maskable] of [[192, 'icon-192', false], [512, 'icon-512', false], [512, 'maskable-512', true]]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let color = [16, 18, 21, 255];
    const margin = maskable ? .19 : .13;
    if (u >= margin + .05 * (1 - v) && u <= 1 - margin - .05 * v && v >= margin && v <= 1 - margin) color = [216, 247, 130, 255];
    const t = (u > .28 && u < .52 && v > .32 && v < .4) || (u > .36 && u < .44 && v > .38 && v < .68);
    const f = (u > .55 && u < .63 && v > .32 && v < .68) || (u > .55 && u < .75 && v > .32 && v < .4) || (u > .55 && u < .71 && v > .47 && v < .55);
    if (t || f) color = [16, 18, 21, 255];
    const at = y * (size * 4 + 1) + 1 + x * 4; raw.set(color, at);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  await writeFile(`icons/${name}.png`, png);
}
console.log('Created real 192px, 512px, and maskable PNG app icons.');
