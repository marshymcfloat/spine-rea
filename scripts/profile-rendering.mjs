import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, totalmem, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { _electron, chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const host = option('--host', 'desktop');
const baseline = args.includes('--baseline');
const seconds = Number(option('--seconds', baseline ? '5' : '30'));
const runs = Number(option('--runs', baseline ? '1' : '3'));
const stressGridSide = Number(option('--stress', '0'));
const label = option('--label', `${host}-${baseline ? 'foundation' : stressGridSide ? 'stress' : 'priest'}`);
if (!['desktop', 'browser'].includes(host) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 120 ||
    !Number.isInteger(runs) || runs < 1 || runs > 10 || !/^[a-zA-Z0-9_-]+$/.test(label) ||
    !Number.isInteger(stressGridSide) || (stressGridSide !== 0 && (stressGridSide < 3 || stressGridSide > 129))) {
  throw new Error('Use --host desktop|browser, --seconds 1..120, --runs 1..10, safe --label and --stress 3..129.');
}
const output = resolve(root, 'test-results/performance', label);
await mkdir(output, { recursive: true });
const errors = [];
let application, browser, server, page, session;
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (fraction) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : null;
  return { count: sorted.length, p50: p(.5), p95: p(.95), p99: p(.99), worst: sorted.at(-1) ?? null };
};
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function serveDemo() {
  const directory = resolve(root, 'apps/runtime-demo/dist');
  if (!existsSync(resolve(directory, 'index.html'))) throw new Error('Run pnpm build first.');
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const target = resolve(directory, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      if (relative(directory, target).startsWith('..')) throw new Error('Outside build directory.');
      const content = await readFile(target);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[extname(target)] ?? 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': mime });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${server.address().port}/`;
}

async function installDiagnostics(target) {
  await target.addInitScript(({ baseline, stressGridSide }) => {
    if (!baseline) window.__studioDiagnosticsRequested = stressGridSide ? { stressGridSide } : {};
    window.__profileLongTasks = [];
    window.__profileVisibilityEvents = [];
    document.addEventListener('visibilitychange', () => window.__profileVisibilityEvents.push({ time: performance.now(), state: document.visibilityState }));
    new PerformanceObserver((list) => {
      for (const item of list.getEntries()) window.__profileLongTasks.push({ startTime: item.startTime, duration: item.duration });
    }).observe({ type: 'longtask', buffered: true });
    window.__profileDrawCalls = 0;
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Context) continue;
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = Context.prototype[name];
        if (!original) continue;
        Context.prototype[name] = function (...values) {
          window.__profileDrawCalls++;
          return original.apply(this, values);
        };
      }
    }
  }, { baseline, stressGridSide });
}

async function readiness() {
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((node) => node.textContent.includes('Canvas ready')));
  if (!baseline) await page.waitForFunction(() => !!window.__studioPreview);
}

function listenForErrors(target) {
  target.on('pageerror', (error) => errors.push(error.message));
  target.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
}

async function metrics(session) {
  const values = await session.send('Performance.getMetrics');
  const dom = await session.send('Memory.getDOMCounters');
  return { ...Object.fromEntries(values.metrics.filter((x) => /JSHeapUsedSize|JSHeapTotalSize|Nodes|Documents|JSEventListeners|TaskDuration|ScriptDuration|LayoutDuration/.test(x.name)).map((x) => [x.name, x.value])), dom };
}

async function endTrace(session, file) {
  const completion = new Promise((done) => session.once('Tracing.tracingComplete', done));
  await session.send('Tracing.end');
  const result = await completion;
  if (!result.stream) throw new Error('Trace stream missing.');
  let source = '';
  while (true) {
    const chunk = await session.send('IO.read', { handle: result.stream });
    source += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data;
    if (chunk.eof) break;
  }
  await session.send('IO.close', { handle: result.stream });
  await writeFile(file, gzipSync(source));
  const trace = JSON.parse(source);
  const eventCounts = {};
  let gcDurationUs = 0;
  for (const event of trace.traceEvents ?? []) {
    if (/DrawFrame|DroppedFrame|BeginFrame|FramePresented|GC/.test(event.name)) eventCounts[event.name] = (eventCounts[event.name] ?? 0) + 1;
    if (/^(MinorGC|MajorGC)$/.test(event.name) && event.ph === 'X') gcDurationUs += event.dur ?? 0;
  }
  return { file, dataLossOccurred: result.dataLossOccurred ?? false, eventCounts, gcDurationMs: gcDurationUs / 1000,
    droppedFrameEvents: eventCounts.DroppedFrame ?? null,
    attribution: 'Trace-wide frame events require frame-track/process correlation; not an application-dropped-frame total. No event does not prove zero drops.' };
}

const report = { label, host, baseline, stressGridSide, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  uncommittedChanges: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  capturedAt: new Date().toISOString(), environment: { platform: process.platform, osRelease: release(), node: process.version, cpu: cpus()[0]?.model, ramBytes: totalmem(), powerMode: 'record separately', displayRefreshHz: 'record separately' },
  methodology: { seconds, runs, warmupSeconds: baseline ? 2 : 5, build: 'packaged Electron / Vite production browser build',
    instrumentation: 'Opt-in phase timings, WebGL draw-call wrapper, long-task observer and CDP trace. Timing overhead is included; render submission is not GPU completion. Idle is not an FPS measurement.' }, runs: [], errors };
try {
  report.environment.windows = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', '[pscustomobject]@{OS=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber);GPU=(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentRefreshRate);Power=(powercfg /getactivescheme)} | ConvertTo-Json -Depth 4'], { encoding: 'utf8' }));
} catch (error) { report.environment.metadataError = String(error); }

try {
  const started = performance.now();
  if (host === 'desktop') {
    const executablePath = resolve(root, 'apps/desktop/out/slot-animation-studio-win32-x64/slot-animation-studio.exe');
    report.artifactSha256 = createHash('sha256').update(await readFile(resolve(executablePath, '../resources/app.asar'))).digest('hex');
    const env = { ...process.env, STUDIO_SMOKE_TEST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, args: [`--user-data-dir=${resolve(output, 'user-data')}`] });
    await installDiagnostics(application.context());
    page = await application.firstWindow();
    listenForErrors(page);
    const window = await application.browserWindow(page);
    await window.evaluate((target) => { target.setSize(1440, 960); target.show(); target.focus(); });
    await page.reload();
    report.versions = await application.evaluate(({ app }) => ({ ...process.versions, gpuFeatures: app.getGPUFeatureStatus() }));
  } else {
    const url = await serveDemo();
    report.artifactSha256 = createHash('sha256').update(await readFile(resolve(root, 'apps/runtime-demo/dist/index.html'))).digest('hex');
    browser = await chromium.launch({ channel: process.env.STUDIO_BROWSER_CHANNEL ?? 'msedge', headless: false });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    await installDiagnostics(context);
    page = await context.newPage();
    listenForErrors(page);
    await page.goto(url);
    report.versions = { browser: browser.version() };
  }
  await readiness();
  report.launchReloadToReadyMs = performance.now() - started;
  report.startupLimit = 'Includes diagnostic reload for desktop; not a cold-start claim.';
  await page.bringToFront();
  session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  report.renderer = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], canvas: canvas ? [canvas.width, canvas.height] : null, DPR: devicePixelRatio,
      gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable', visibility: document.visibilityState };
  });
  if (!baseline) await page.getByRole('button', { name: 'Play', exact: true }).click();
  await wait(baseline ? 2000 : 5000);
  for (let run = 0; run < runs; run++) {
    const before = await metrics(session);
    const processBefore = application ? await application.evaluate(({ app }) => app.getAppMetrics()) : null;
    await session.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.frame,v8,gpu,cc,viz,blink.user_timing', options: 'record-as-much-as-possible', transferMode: 'ReturnAsStream' });
    const captureStarted = await page.evaluate(() => {
      window.__profileLongTasks = []; window.__profileDrawCalls = 0;
      window.__profileVisibilityEvents = [];
      if (document.hidden) throw new Error('The measured preview must be visible.');
      performance.mark('studio:capture-start');
      window.__studioPreview?.startCapture();
      return performance.now();
    });
    await wait(seconds * 1000);
    const captured = await page.evaluate((start) => {
      const data = window.__studioPreview?.endCapture() ?? null;
      const endedAt = performance.now();
      performance.mark('studio:capture-end');
      return { captured: data, endedAt, snapshot: window.__studioPreview?.snapshot() ?? null,
        longTasks: window.__profileLongTasks.filter((entry) => entry.startTime >= start && entry.startTime <= endedAt),
        visibilityEvents: window.__profileVisibilityEvents,
        drawCalls: window.__profileDrawCalls, visibility: document.visibilityState, focused: document.hasFocus() };
    }, captureStarted);
    const durationMs = captured.endedAt - captureStarted;
    if (!baseline && (!captured.captured || !captured.snapshot || !captured.captured.frameTimestampsMs.length || captured.captured.droppedSamples)) {
      throw new Error('Incomplete rendered capture: missing preview, no rendered samples or diagnostic sample overflow.');
    }
    const after = await metrics(session);
    const processAfter = application ? await application.evaluate(({ app }) => app.getAppMetrics()) : null;
    const trace = await endTrace(session, resolve(output, `run-${run + 1}.trace.json.gz`));
    const phases = {};
    for (const key of ['frameIntervalsMs', 'evaluationMs', 'skinningMs', 'uploadMs', 'renderMs', 'totalMs']) phases[key] = summary(captured.captured?.[key] ?? []);
    const evaluation = captured.captured?.evaluationMs ?? [], skinning = captured.captured?.skinningMs ?? [];
    phases.evaluationAndSkinningMs = summary(evaluation.map((value, index) => value + (skinning[index] ?? 0)));
    const intervals = captured.captured?.frameIntervalsMs ?? [];
    const entry = { run: run + 1, durationMs, phases, frameIntervalsOver17_67ms: intervals.filter((x) => x > 1000 / 60 + 1).length, frameIntervalsOver25ms: intervals.filter((x) => x > 25).length,
      trace, before, after, processBefore, processAfter, ...captured };
    report.runs.push(entry);
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ label, run: run + 1, durationMs, phases, longTasks: captured.longTasks.length, drawCalls: captured.drawCalls, visibility: captured.visibility, traceEvents: trace.eventCounts }));
  }
  if (!baseline) await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'preview.png') });
  report.lifecycle = [];
  for (let cycle = 0; cycle < 6; cycle++) {
    await page.reload(); await readiness(); await wait(300);
    await session.send('HeapProfiler.collectGarbage');
    report.lifecycle.push({ cycle: cycle + 1, metrics: await metrics(session), snapshot: await page.evaluate(() => window.__studioPreview?.snapshot() ?? null) });
  }
  report.lifecycleLimit = 'Reload/GC retention diagnostic; does not replace document-switch or unmount testing. Forced GC is outside steady capture.';
  if (errors.length) process.exitCode = 1;
} catch (error) {
  errors.push(String(error)); process.exitCode = 1;
} finally {
  report.cleanup = [];
  let cleanupFailed = false;
  async function clean(name, action) {
    const started = performance.now();
    let timer;
    if (process.env.STUDIO_PROFILE_DEBUG) console.log(`Cleanup: ${name}`);
    try {
      await Promise.race([action(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} cleanup exceeded 30 seconds.`)), 30_000); })]);
      report.cleanup.push({ name, durationMs: performance.now() - started, ok: true });
    } catch (error) {
      cleanupFailed = true; errors.push(String(error)); process.exitCode = 1;
      report.cleanup.push({ name, durationMs: performance.now() - started, error: String(error) });
    } finally { clearTimeout(timer); }
  }
  try {
    await clean('detach tracing session', async () => session?.detach());
    if (browser) await clean('close measured page', async () => page?.close());
    if (application) await clean('close owned Electron', async () => application.close());
    if (browser) await clean('close owned browser', async () => browser.close());
  } finally {
    if (server) await clean('close local file server', async () => {
      const closed = new Promise((done) => server.close(done));
      server.closeAllConnections();
      await closed;
    });
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  }
  console.log(`Performance report: ${resolve(output, 'report.json')}`);
  if (errors.length) console.error(errors);
  if (cleanupFailed) process.exit(1);
}
