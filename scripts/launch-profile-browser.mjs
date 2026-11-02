import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Attach without Playwright's launch flags or focus/visibility overrides.
export async function launchProfileBrowser({ url, directory }) {
  const profile = resolve(directory, `native-profile-${Date.now()}`);
  await mkdir(profile, { recursive: true });
  const executable = process.env.STUDIO_BROWSER_EXECUTABLE ?? resolve(
    process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe',
  );
  const processHandle = spawn(executable, [
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--window-size=1440,960', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let launchError;
  processHandle.on('error', (error) => { launchError = error; });
  const diagnostics = [];
  processHandle.stderr.on('data', (chunk) => { diagnostics.push(String(chunk)); if (diagnostics.length > 20) diagnostics.shift(); });
  let browser;
  try {
    const deadline = Date.now() + 30_000;
    let port;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (port > 0) break;
      if (processHandle.exitCode !== null && processHandle.exitCode !== 0) throw new Error(`Browser launch exited ${processHandle.exitCode}.`);
      await new Promise((done) => setTimeout(done, 50));
    }
    if (!port) throw new Error('The native browser did not expose its diagnostic port.');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    const context = browser.contexts()[0];
    if (!context) throw new Error('The native browser has no default context.');
    const page = context.pages()[0] ?? await context.newPage();
    return {
      browser, context, page, profile, diagnostics,
      async dispose() {
        if (browser.isConnected()) {
          const session = await browser.newBrowserCDPSession();
          try { await session.send('Browser.close'); }
          catch (error) { if (browser.isConnected()) throw error; }
          finally { await browser.close(); }
        }
        if (processHandle.exitCode === null) {
          let timer;
          await Promise.race([
            new Promise((done) => processHandle.once('exit', done)),
            new Promise((done) => { timer = setTimeout(() => { processHandle.kill(); done(); }, 5000); }),
          ]);
          clearTimeout(timer);
        }
      },
    };
  } catch (error) {
    await browser?.close();
    if (processHandle.exitCode === null) processHandle.kill();
    throw new Error(`Native browser diagnostic launch failed: ${String(error)} ${diagnostics.join('').slice(-1500)}`);
  }
}
