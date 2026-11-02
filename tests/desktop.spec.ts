import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { checkPreview, snapshot } from './preview-checks';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

function getExecutablePath(): string {
  const executablePath = process.env.STUDIO_EXECUTABLE
    ? path.resolve(process.env.STUDIO_EXECUTABLE)
    : path.join(
        repositoryRoot,
        'apps/desktop/out/slot-animation-studio-win32-x64/slot-animation-studio.exe',
      );

  if (!existsSync(executablePath)) {
    throw new Error(
      `Packaged desktop app not found at ${executablePath}. Run pnpm build first, or set STUDIO_EXECUTABLE.`,
    );
  }
  return executablePath;
}

test('packaged desktop canvas works offline with an isolated preload boundary', async ({}, testInfo) => {
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  environment.STUDIO_SMOKE_TEST = '1';
  delete environment.ELECTRON_RUN_AS_NODE;

  const application = await electron.launch({
    executablePath: getExecutablePath(),
    cwd: repositoryRoot,
    args: [`--user-data-dir=${testInfo.outputPath('user-data')}`],
    env: environment,
    chromiumSandbox: true,
    timeout: 30_000,
  });

  const pageErrors: string[] = [];
  const processErrors: string[] = [];
  const externalRequests: string[] = [];
  const diagnostics: string[] = [];
  const childProcess = application.process();
  let page: Page | undefined;
  let screenshotCaptured = false;

  childProcess.on('error', (error) => processErrors.push(error.message));
  childProcess.stdout?.on('data', (chunk: Buffer) => diagnostics.push(`stdout: ${chunk.toString()}`));
  childProcess.stderr?.on('data', (chunk: Buffer) => diagnostics.push(`stderr: ${chunk.toString()}`));
  application.on('console', (message) => diagnostics.push(`main ${message.type()}: ${message.text()}`));

  try {
    const context = application.context();
    await context.addInitScript(() => {
      (window as unknown as { __studioDiagnosticsRequested: object }).__studioDiagnosticsRequested = {};
    });
    await context.route(/^https?:\/\//, async (route) => {
      externalRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });

    page = await application.firstWindow();
    const browserWindow = await application.browserWindow(page);
    await browserWindow.evaluate((window) => window.showInactive());
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => diagnostics.push(`renderer ${message.type()}: ${message.text()}`));

    // Reload after installing the network guard so startup is exercised offline too.
    await expect(page).toHaveURL('app://studio/index.html');
    await expect(page.getByRole('heading', { name: 'Workspace', exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveTitle('Slot Animation Studio');
    await expect(page.getByRole('heading', { name: 'Workspace', exact: true })).toBeVisible();
    const canvasStatus = page.getByRole('contentinfo').getByRole('status');
    await expect(canvasStatus).toHaveText('Canvas ready');
    expect(page.url()).toBe('app://studio/index.html');

    const canvas = page.getByTestId('studio-canvas');
    await expect(canvas).toBeVisible();
    const canvasSize = await canvas.evaluate((element) => {
      const canvasElement = element as HTMLCanvasElement;
      return { width: canvasElement.width, height: canvasElement.height };
    });
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);

    const preferences = await browserWindow.evaluate((window) => {
      const preferences = window.webContents.getLastWebPreferences();
      return {
        sandbox: preferences.sandbox,
        contextIsolation: preferences.contextIsolation,
        nodeIntegration: preferences.nodeIntegration,
      };
    });
    expect(preferences).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });

    const rendererBoundary = await page.evaluate(async () => {
      const renderer = window as unknown as {
        require?: unknown;
        process?: unknown;
        studio: { getAppInfo: (...args: unknown[]) => Promise<unknown> };
      };
      let unexpectedArgumentsRejected = false;
      try {
        await renderer.studio.getAppInfo('unexpected');
      } catch {
        unexpectedArgumentsRejected = true;
      }
      return {
        requireType: typeof renderer.require,
        processType: typeof renderer.process,
        bridgeKeys: Object.keys(renderer.studio),
        appInfo: await renderer.studio.getAppInfo(),
        unexpectedArgumentsRejected,
      };
    });
    expect(rendererBoundary).toEqual({
      requireType: 'undefined',
      processType: 'undefined',
      bridgeKeys: ['getAppInfo'],
      appInfo: { name: 'Slot Animation Studio', version: '0.0.1', platform: 'win32' },
      unexpectedArgumentsRejected: true,
    });

    await checkPreview(page);

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => (await snapshot(page!)).state.elapsedSeconds).toBeGreaterThan(.05);
    await browserWindow.evaluate((window) => window.minimize());
    await page.waitForFunction(() => document.hidden, null, { polling: 50 });
    const hidden = await snapshot(page);
    await page.waitForTimeout(150);
    expect((await snapshot(page)).state.elapsedSeconds).toBe(hidden.state.elapsedSeconds);
    expect((await snapshot(page)).counts.rafScheduled).toBe(false);
    await browserWindow.evaluate((window) => { window.restore(); window.showInactive(); });
    await page.waitForFunction(() => !document.hidden, null, { polling: 50 });
    await expect.poll(async () => (await snapshot(page!)).state.elapsedSeconds).toBeGreaterThan(hidden.state.elapsedSeconds);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();

    const zoomValue = page.getByTestId('zoom-value');
    await page.getByRole('button', { name: 'Fit artboard', exact: true }).click();
    const fitZoomText = await zoomValue.innerText();
    const fitZoom = Number.parseFloat(fitZoomText);
    expect(Number.isFinite(fitZoom)).toBe(true);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(async () => Number.parseFloat(await zoomValue.innerText())).toBeGreaterThan(fitZoom);
    const zoomedIn = Number.parseFloat(await zoomValue.innerText());
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect.poll(async () => Number.parseFloat(await zoomValue.innerText())).toBeLessThan(zoomedIn);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Fit artboard', exact: true }).click();
    await expect(zoomValue).toHaveText(fitZoomText);

    const gridButton = page.getByRole('button', { name: 'Grid', exact: true });
    const initialGrid = await gridButton.getAttribute('aria-pressed');
    expect(initialGrid).toMatch(/^(true|false)$/);
    const initialGridPixels = await canvas.screenshot();
    await gridButton.click();
    await expect(gridButton).toHaveAttribute('aria-pressed', initialGrid === 'true' ? 'false' : 'true');
    await expect.poll(async () => (await canvas.screenshot()).equals(initialGridPixels)).toBe(false);
    await gridButton.click();
    await expect(gridButton).toHaveAttribute('aria-pressed', initialGrid!);

    const initialCanvasWidth = (await canvas.boundingBox())?.width;
    await browserWindow.evaluate((window) => window.setSize(1200, 800));
    await expect.poll(async () => (await canvas.boundingBox())?.width).not.toBe(initialCanvasWidth);
    await expect(canvasStatus).toHaveText('Canvas ready');
    await expect(canvas).toBeVisible();

    const screenshotPath = testInfo.outputPath('desktop-workspace.png');
    await page.screenshot({ path: screenshotPath, animations: 'disabled' });
    await testInfo.attach('Desktop workspace', { path: screenshotPath, contentType: 'image/png' });
    screenshotCaptured = true;

    expect(await page.evaluate(() => window.open('https://popup.invalid/') === null)).toBe(true);
    expect(application.windows()).toHaveLength(1);

    const navigationAttempt = await application.evaluateHandle(({ BrowserWindow }) => {
      const attempt: { url: string | null; prevented: boolean } = { url: null, prevented: false };
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('Desktop window disappeared.');
      const recordAttempt = (event: { url: string; defaultPrevented: boolean }) => {
        attempt.url = event.url;
        attempt.prevented ||= event.defaultPrevented;
      };
      window.webContents.once('will-frame-navigate', recordAttempt);
      window.webContents.once('will-navigate', recordAttempt);
      return attempt;
    });
    try {
      await page.evaluate(() => window.location.assign('https://navigation.invalid/'));
      await expect.poll(() => navigationAttempt.jsonValue()).toEqual({
        url: 'https://navigation.invalid/',
        prevented: true,
      });
      expect(page.url()).toBe('app://studio/index.html');
      const remainingDocument = await browserWindow.evaluate((window) =>
        window.webContents.executeJavaScript("({ url: location.href, status: document.querySelector('.canvas-status')?.textContent.trim() })"),
      );
      expect(remainingDocument).toEqual({ url: 'app://studio/index.html', status: 'Canvas ready' });
    } finally {
      await navigationAttempt.dispose();
    }

    expect(externalRequests, 'The packaged renderer must not request external resources.').toEqual([]);
    expect(pageErrors, 'The renderer must not emit uncaught errors.').toEqual([]);
    expect(processErrors, 'The Electron process must remain healthy.').toEqual([]);
    expect(childProcess.exitCode).toBeNull();
  } finally {
    if (page && !page.isClosed() && !screenshotCaptured) {
      try {
        diagnostics.push(`Page content: ${await page.locator('body').innerText({ timeout: 2_000 })}`);
        const screenshotPath = testInfo.outputPath('desktop-failure.png');
        await page.screenshot({ path: screenshotPath, animations: 'disabled', timeout: 5_000 });
        await testInfo.attach('Desktop failure', { path: screenshotPath, contentType: 'image/png' });
      } catch (error) {
        diagnostics.push(`Failure screenshot unavailable: ${String(error)}`);
      }
    }
    try {
      await application.close();
    } finally {
      const diagnosticsPath = testInfo.outputPath('electron-diagnostics.json');
      writeFileSync(diagnosticsPath, JSON.stringify({ pageErrors, processErrors, externalRequests, diagnostics }, null, 2));
      await testInfo.attach('Electron diagnostics', {
        path: diagnosticsPath,
        contentType: 'application/json',
      });
    }
  }
});
