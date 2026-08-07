/**
 * Generate solid-color page fixtures (no network).
 * node scripts/gen-fixtures.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { deflateSync } from "zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "fixtures");
mkdirSync(dir, { recursive: true });

const colors = [
  [0xe74c3c, "Red"],
  [0x3498db, "Blue"],
  [0x2ecc71, "Green"],
  [0xf39c12, "Orange"],
  [0x9b59b6, "Purple"],
  [0x1abc9c, "Teal"],
  [0x34495e, "Slate"],
  [0xe67e22, "Carrot"],
  [0x16a085, "GreenSea"],
  [0xc0392b, "DarkRed"],
  [0x2980b9, "Belize"],
  [0x8e44ad, "Wisteria"],
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/** Minimal RGB PNG */
function makePng(w, h, r, g, b) {
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  // accent bar at top
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = Math.min(255, r + 40);
    row[2 + x * 3] = Math.min(255, g + 40);
    row[3 + x * 3] = Math.min(255, b + 40);
  }
  const raw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    const rr = y < 40 ? row : (() => {
      const base = Buffer.alloc(1 + w * 3);
      base[0] = 0;
      for (let x = 0; x < w; x++) {
        // subtle vertical stripe for fold visibility
        const stripe = x % 80 < 2 ? 20 : 0;
        base[1 + x * 3] = Math.max(0, r - stripe);
        base[2 + x * 3] = Math.max(0, g - stripe);
        base[3 + x * 3] = Math.max(0, b - stripe);
      }
      return base;
    })();
    rr.copy(raw, y * (1 + w * 3));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const W = 400;
const H = 560;
for (let i = 0; i < colors.length; i++) {
  const hex = colors[i][0];
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const png = makePng(W, H, r, g, b);
  const name = `page-${i + 1}.png`;
  writeFileSync(join(dir, name), png);
  console.log("wrote", name, png.length, "bytes", colors[i][1]);
}

// fold front/back wider
writeFileSync(join(dir, "fold-front.png"), makePng(630, 891, 40, 80, 160));
writeFileSync(join(dir, "fold-back.png"), makePng(630, 891, 160, 60, 40));
console.log("wrote fold-front.png fold-back.png");
console.log("done", dir);
