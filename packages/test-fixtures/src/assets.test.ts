import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import provenance from '../assets/priest/provenance.json';

const packageUrl = new URL('../', import.meta.url);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function decodeFixturePng(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const imageData: Buffer[] = [];
  let header: Buffer | undefined;
  let ended = false;
  let offset = 8;
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    expect(data.length).toBe(size);
    if (type === 'IHDR') header = data;
    if (type === 'IDAT') imageData.push(data);
    if (type === 'IEND') ended = true;
    offset += size + 12;
  }
  expect(ended).toBe(true);
  expect(offset).toBe(bytes.length);
  if (!header) throw new Error('Fixture has no PNG header.');
  expect(header.length).toBe(13);
  expect([...header.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const stride = width * 4;
  const scanlines = inflateSync(Buffer.concat(imageData));
  expect(scanlines.length).toBe((stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    expect(scanlines[rowStart]).toBe(0);
    scanlines.copy(pixels, y * stride, rowStart + 1, rowStart + 1 + stride);
  }
  return { width, height, pixels };
}

describe('original priest art fixtures', () => {
  it('records original sources without third-party or generated-image assets', () => {
    expect(provenance.externalAssets).toEqual([]);
    expect(provenance.generativeImageService).toBeNull();
    expect(provenance.sources.map((source) => source.path)).toEqual([
      'scripts/priest-shapes.mjs',
      'scripts/generate-priest-assets.mjs',
    ]);
    expect(provenance.assets).toHaveLength(9);
    expect(new Set(provenance.assets.map((asset) => asset.path)).size).toBe(9);
  });

  it.each(provenance.sources)('matches the recorded source hash: $path', (source) => {
    expect(sha256(readFileSync(new URL(source.path, packageUrl)))).toBe(source.sha256);
  });

  it.each(provenance.assets)('contains valid RGBA art with real transparency: $path', (asset) => {
    const bytes = readFileSync(new URL(asset.path, packageUrl));
    expect(sha256(bytes)).toBe(asset.sha256);
    const { width, height, pixels } = decodeFixturePng(bytes);
    expect(width).toBe(asset.width);
    expect(height).toBe(asset.height);
    const alpha = new Set<number>();
    let transparentRgbIsZero = true;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const value = pixels.readUInt8(offset + 3);
      alpha.add(value);
      if (value === 0 && pixels.readUIntBE(offset, 3) !== 0) transparentRgbIsZero = false;
    }
    expect(transparentRgbIsZero).toBe(true);
    expect(alpha.has(0)).toBe(true);
    expect(alpha.has(255)).toBe(true);
    expect([...alpha].some((value) => value > 0 && value < 255)).toBe(true);
    expect(pixels.subarray(0, 4)).toEqual(Buffer.from([0, 0, 0, 0]));
  });

  it('regenerates the committed PNGs and provenance without changing files', () => {
    const generator = fileURLToPath(new URL('scripts/generate-priest-assets.mjs', packageUrl));
    expect(execFileSync(process.execPath, [generator, '--check'], { encoding: 'utf8' })).toContain(
      'Verified 9 priest PNG layers and provenance.',
    );
  });
});
