import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { checkPreview, snapshot } from './preview-checks';

let server: Server;
let address: string;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL('../apps/runtime-demo/dist/', import.meta.url));
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, 'http://127.0.0.1');
      const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (relative(root, path).startsWith('..')) throw new Error('Outside build.');
      const data = await readFile(path);
      response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream' });
      response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  address = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
});
test.afterAll(async () => {
  const stopped = new Promise<void>((done) => server.close(() => done()));
  server.closeAllConnections();
  await stopped;
});

test('standalone build shares geometry, transport and cached-page lifetime without desktop services', async ({ page, context }, info) => {
  const errors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.addInitScript(() => {
    (window as unknown as { __studioDiagnosticsRequested: object }).__studioDiagnosticsRequested = {};
  });
  await context.route('**/*', async (route) => {
    if (!route.request().url().startsWith(address)) { unexpectedRequests.push(route.request().url()); await route.abort(); }
    else await route.continue();
  });
  await page.goto(address);
  await expect(page.locator('#status')).toHaveText('Canvas ready');
  await checkPreview(page);
  expect(await page.evaluate(() => ({ studio: typeof (window as unknown as { studio?: unknown }).studio, require: typeof (window as unknown as { require?: unknown }).require }))).toEqual({ studio: 'undefined', require: 'undefined' });
  const before = await snapshot(page);
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  expect((await snapshot(page)).geometry).toEqual(before.geometry);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).state.elapsedSeconds).toBeGreaterThan(.05);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: info.outputPath('runtime-preview.png') });
  expect(errors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});
