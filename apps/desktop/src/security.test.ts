import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTrustedRendererUrl, resolveRendererAsset, STUDIO_URL } from './security';

describe('desktop trust boundary', () => {
  it('accepts the exact application page and rejects other origins and frames', () => {
    expect(isTrustedRendererUrl(STUDIO_URL)).toBe(true);
    for (const value of ['https://example.com', 'app://other/index.html', 'app://studio/other.html', 'not-a-url']) {
      expect(isTrustedRendererUrl(value)).toBe(false);
    }
  });

  it('uses only the configured development URL during development', () => {
    const devUrl = 'http://127.0.0.1:5173/';
    expect(isTrustedRendererUrl(devUrl, devUrl)).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:5174/', devUrl)).toBe(false);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173.evil.test/', devUrl)).toBe(false);
    expect(isTrustedRendererUrl(STUDIO_URL, devUrl)).toBe(false);
  });
});

describe('application asset resolution', () => {
  const root = path.resolve('renderer-fixture');

  it('resolves bundled pages and nested assets inside the renderer root', () => {
    expect(resolveRendererAsset(STUDIO_URL, root)).toBe(path.join(root, 'index.html'));
    expect(resolveRendererAsset('app://studio/assets/index.js', root)).toBe(path.join(root, 'assets/index.js'));
    expect(resolveRendererAsset('app://studio/', root)).toBe(path.join(root, 'index.html'));
  });

  it.each([
    'https://studio/assets/index.js',
    'app://other/index.html',
    'app://studio/%2e%2e%2fprivate.txt',
    'app://studio/%2e%2e%5cprivate.txt',
    'app://studio/C%3A/private.txt',
    'app://studio/%00.txt',
    'app://studio/%xx',
  ])('rejects an invalid or escaped asset path: %s', (request) => {
    expect(resolveRendererAsset(request, root)).toBeNull();
  });
});
