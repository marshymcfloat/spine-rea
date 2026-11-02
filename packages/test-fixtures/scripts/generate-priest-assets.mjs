import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { constants, deflateSync } from 'node:zlib';
import { priestLayers } from './priest-shapes.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const samples = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, bytes) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length, 0);
  name.copy(result, 4);
  bytes.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, bytes])), bytes.length + 8);
  return result;
}

function contains(shape, x, y) {
  if (shape.kind === 'rectangle') {
    return x >= shape.x && x < shape.x + shape.width && y >= shape.y && y < shape.y + shape.height;
  }
  if (shape.kind === 'ellipse') {
    return ((x - shape.cx) / shape.rx) ** 2 + ((y - shape.cy) / shape.ry) ** 2 <= 1;
  }
  let inside = false;
  const points = shape.points;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function rasterize(layer) {
  const rgba = Buffer.alloc(layer.width * layer.height * 4);
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const pixel = [0, 0, 0, 0];
      for (const shape of layer.shapes) {
        const coverage = samples.filter(([dx, dy]) => contains(shape, x + dx, y + dy)).length / samples.length;
        const alpha = shape.color[3] / 255 * coverage;
        if (!alpha) continue;
        for (let channel = 0; channel < 3; channel++) {
          pixel[channel] = shape.color[channel] * alpha + pixel[channel] * (1 - alpha);
        }
        pixel[3] = alpha + pixel[3] * (1 - alpha);
      }
      const offset = (y * layer.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        rgba[offset + channel] = pixel[3] ? Math.round(pixel[channel] / pixel[3]) : 0;
      }
      rgba[offset + 3] = Math.round(pixel[3] * 255);
    }
  }
  return rgba;
}

function encodePng(layer) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(layer.width, 0);
  header.writeUInt32BE(layer.height, 4);
  header[8] = 8;
  header[9] = 6;
  const rgba = rasterize(layer);
  const stride = layer.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * layer.height);
  for (let y = 0; y < layer.height; y++) {
    rgba.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = deflateSync(scanlines, { level: 9, strategy: constants.Z_FIXED });
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function generatePriestAssets() {
  const files = new Map();
  const assets = priestLayers.map((layer) => {
    const path = `assets/priest/${layer.id}.png`;
    const bytes = encodePng(layer);
    files.set(path, bytes);
    return { path, width: layer.width, height: layer.height, sha256: sha256(bytes), purpose: layer.purpose };
  });
  const provenance = {
    name: 'Original geometric priest technical fixture',
    authoredOn: '2026-11-02',
    origin: 'Explicit original shape definitions authored for Slot Animation Studio with Codex assistance.',
    intendedUse: 'Deterministic schema, layered attachment and weighted-mesh tests; not final game artwork.',
    externalAssets: [],
    generativeImageService: null,
    sources: ['scripts/priest-shapes.mjs', 'scripts/generate-priest-assets.mjs'].map((path) => ({
      path, sha256: sha256(readFileSync(resolve(packageRoot, path))),
    })),
    rasterFormat: 'PNG RGBA8; transparent background; fixed sample positions; filter 0; fixed-Huffman zlib.',
    assets,
  };
  files.set('assets/priest/provenance.json', Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`));
  return files;
}

function run(checkOnly) {
  const files = generatePriestAssets();
  for (const [path, bytes] of files) {
    const outputPath = resolve(packageRoot, path);
    if (checkOnly) {
      if (!readFileSync(outputPath).equals(bytes)) throw new Error(`Generated fixture differs: ${path}`);
    } else {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, bytes);
    }
  }
  process.stdout.write(`${checkOnly ? 'Verified' : 'Generated'} ${files.size - 1} priest PNG layers and provenance.\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv.includes('--check'));
}
