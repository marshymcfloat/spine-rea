import { build } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';

const root = resolve(process.argv[2] ?? process.cwd());
const reportPath = resolve(process.argv[3] ?? 'test-results/performance/core-report.json');
mkdirSync(dirname(reportPath), { recursive: true });
const built = await build({
  configFile: false, root, logLevel: 'silent',
  resolve: { alias: { '@studio/schema': resolve(root, 'packages/schema/src/index.ts') } },
  build: { write: false, minify: false, target: 'es2022', lib: { entry: resolve(root, 'packages/animation-core/src/index.ts'), formats: ['es'] } },
});
const outputs = (Array.isArray(built) ? built : [built]).flatMap((item) => 'output' in item ? item.output : []);
const entry = outputs.find((item) => item.type === 'chunk' && item.isEntry);
if (!entry || entry.imports.length || entry.dynamicImports.length) throw Error('Expected a self-contained core bundle.');
const { createRigEvaluator, createPlaybackController, createGeometryEvaluator } = await import(`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`);
const document = JSON.parse(readFileSync(resolve(root, 'packages/test-fixtures/fixtures/priest.runtime.json'), 'utf8'));
const evaluator = createRigEvaluator(document, 'rig-priest');

function measure(label, operation, iterations, warmup) {
  for (let i = 0; i < warmup; i++) operation(i);
  const runs = [];
  for (let run = 0; run < 3; run++) {
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      operation(i);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    runs.push({
      p50_ms: times[Math.floor(times.length * 0.5)], p95_ms: times[Math.floor(times.length * 0.95)],
      p99_ms: times[Math.floor(times.length * 0.99)], max_ms: times.at(-1),
    });
  }
  return { label, iterationsPerRun: iterations, warmup, runs };
}

const player = createPlaybackController(evaluator);
player.play('clip-idle');
const fade = createPlaybackController(evaluator);
fade.play('clip-idle');
fade.play('clip-pray', { loop: true, crossfadeSeconds: 1000 });
const results = [
  measure('createRigEvaluator/full runtime document', () => createRigEvaluator(document, 'rig-priest'), 100, 20),
  measure('sample idle/independent pose', (i) => evaluator.sample('clip-idle', (i % 120) / 60), 3000, 500),
  measure('controller idle update + public getPose', () => { player.update(1 / 60); player.getPose(); }, 3000, 500),
  measure('active crossfade update + public getPose', () => { fade.update(1 / 60); fade.getPose(); }, 3000, 500),
];
if (createGeometryEvaluator) {
  const geometry = createGeometryEvaluator(document, 'rig-priest');
  const output = geometry.createOutput();
  const pose = evaluator.sample('clip-idle', 0.5);
  results.push(measure('geometry write/reused output', () => geometry.write(pose, output), 3000, 500));
  results.push(measure('createGeometryEvaluator/full runtime document', () => createGeometryEvaluator(document, 'rig-priest'), 100, 20));
}
const report = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  capturedAtUtc: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  cpu: cpus()[0]?.model, ramGiB: totalmem() / 1024 ** 3,
  fixture: { bones: document.rigs[0].bones.length, attachments: document.rigs[0].attachments.length, clips: document.clips.length },
  protocol: 'In-process CPU timings; warmup then three repeated runs. Update uses 1/60 simulated seconds; a 1000-second fade keeps its hot path active. Bundle build/import excluded. No forced GC, tracing, or controlled power/load.',
  limits: 'Ad hoc Node CPU diagnostic only; unminified production browser bundle. Not Electron/Chromium renderer, GPU/FPS, allocations, retained memory, lower-spec hardware or a performance guarantee/budget pass.',
  results,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, sourceCommit: report.sourceCommit, results: results.map(({ label, runs }) => ({
  label, p50Range_ms: [Math.min(...runs.map((run) => run.p50_ms)), Math.max(...runs.map((run) => run.p50_ms))],
  p95Range_ms: [Math.min(...runs.map((run) => run.p95_ms)), Math.max(...runs.map((run) => run.p95_ms))],
})) }, null, 2));
