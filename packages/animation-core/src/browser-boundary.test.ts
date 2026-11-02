import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { build } from 'vite';
import { expect, it } from 'vitest';
import type { EvaluatedPose, PlaybackMarkerEvent, PlaybackState } from './types';

interface BrowserReport {
  state: PlaybackState;
  pose: EvaluatedPose;
  events: PlaybackMarkerEvent[];
  idleTime: number;
  globals: Record<string, string>;
}

it('bundles and runs the evaluator/player without external, Node or DOM dependencies', async () => {
  const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const result = await build({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'warn',
    build: {
      write: false,
      target: 'es2022',
      minify: false,
      lib: {
        entry: resolve(repositoryRoot, 'packages/animation-core/src/index.ts'),
        formats: ['iife'],
        name: 'AnimationCore',
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => 'output' in item ? item.output : []);
  const entry = outputs.find((item) => item.type === 'chunk' && item.isEntry);
  if (!entry || entry.type !== 'chunk') throw new Error('Expected a standalone browser library entry.');
  expect(entry.imports).toEqual([]);
  expect(entry.dynamicImports).toEqual([]);

  const sandbox: Record<string, unknown> = {
    structuredClone,
    fixtureText: readFileSync(resolve(repositoryRoot, 'packages/test-fixtures/fixtures/priest.runtime.json'), 'utf8'),
  };
  const context = createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  runInContext(entry.code, context, { timeout: 10_000 });
  // Parse within the library realm so strict JSON-prototype validation is exercised correctly.
  runInContext(`
    const evaluator = AnimationCore.createRigEvaluator(JSON.parse(fixtureText), 'rig-priest');
    const player = AnimationCore.createPlaybackController(evaluator);
    player.play('clip-idle');
    player.update(0.5);
    const idleTime = player.getState().timeSeconds;
    player.play('clip-praise', { crossfadeSeconds: 0.2 });
    const events = player.update(0.5);
    globalThis.report = {
      state: player.getState(), pose: player.getPose(), events, idleTime,
      globals: { document: typeof document, window: typeof window, process: typeof process, require: typeof require, Buffer: typeof Buffer },
    };
  `, context, { timeout: 10_000 });

  const report = sandbox.report as BrowserReport;
  expect(report.globals).toEqual({ document: 'undefined', window: 'undefined', process: 'undefined', require: 'undefined', Buffer: 'undefined' });
  expect(report.idleTime).toBe(0.5);
  expect(report.state).toMatchObject({ status: 'playing', clipId: 'clip-praise', timeSeconds: 0.5, mixProgress: 1 });
  expect(report.pose.bones).toHaveLength(12);
  expect(report.pose.attachments).toHaveLength(9);
  expect(report.pose.bones.every((bone) => Object.values(bone.world).every(Number.isFinite))).toBe(true);
  expect(report.events.map((event) => event.marker.name)).toEqual(['praise_peak']);
}, 15_000);
