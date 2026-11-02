import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { RuntimeDocument } from '../packages/schema/src/index';
import { createGeometryEvaluator, createRigEvaluator, type EvaluatedPose, type PlaybackState } from '../packages/animation-core/src/index';

interface PreviewSnapshot {
  pose: EvaluatedPose;
  geometry: { rigId: string; drawOrder: string[]; attachments: { id: string; positions: number[]; uvs: number[]; indices: number[]; opacity: number }[] };
  state: PlaybackState;
  counts: { renderedFrames: number; rafScheduled: boolean };
}

const controlledPages = new WeakSet<Page>();

export async function clickControl(control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  // Native frame stability polling is unsuitable while the functional host clock is paused.
  await control.click({ force: true });
}

export async function canvasPixels(page: Page) {
  const canvas = page.getByTestId('studio-canvas');
  await expect(canvas).toBeVisible();
  const clip = await canvas.boundingBox();
  if (!clip || clip.width <= 0 || clip.height <= 0) throw new Error('Canvas has no visible screenshot bounds.');
  return page.screenshot({ clip });
}

export async function resumePreviewClock(page: Page) {
  if (controlledPages.delete(page) && !page.isClosed()) await page.clock.resume();
}

export async function snapshot(page: Page): Promise<PreviewSnapshot> {
  return page.evaluate(() => (window as unknown as { __studioPreview: { snapshot(): PreviewSnapshot } }).__studioPreview.snapshot());
}

export async function checkPreview(page: Page) {
  await page.waitForFunction(() => Boolean((window as unknown as { __studioPreview?: unknown }).__studioPreview), undefined, { polling: 50 });
  const initial = await snapshot(page);
  expect(initial.geometry.attachments).toHaveLength(9);
  expect(initial.state.status).toBe('paused');
  expect(initial.counts.rafScheduled).toBe(false);

  // Install only at this idle boundary: no preview frame or previous frame timestamp survives.
  // Virtual host time tests behavior; real-device profiling measures cadence separately.
  // https://playwright.dev/docs/clock#tick-through-time-manually-firing-all-the-timers-consistently
  await page.clock.install({ time: new Date('2026-11-03T00:00:00Z') });
  controlledPages.add(page);
  await page.clock.pauseAt(new Date('2026-11-03T00:01:00Z'));

  await clickControl(page.getByRole('button', { name: 'Play', exact: true }));
  await page.clock.runFor(200);
  expect((await snapshot(page)).state.elapsedSeconds).toBeGreaterThan(.05);
  await page.getByLabel('Playback speed', { exact: true }).selectOption('2');
  expect((await snapshot(page)).state.speed).toBe(2);
  await page.getByLabel('Playback speed', { exact: true }).selectOption('0');
  await page.getByLabel('Crossfade duration', { exact: true }).selectOption('2');
  await page.getByLabel('Animation clip', { exact: true }).selectOption('clip-pray');
  const fading = await snapshot(page);
  expect(fading.state.clipId).toBe('clip-pray');
  expect(fading.state.mixProgress).toBe(0);
  expect(fading.counts.rafScheduled).toBe(false);
  await page.getByLabel('Animation clip', { exact: true }).selectOption('clip-idle');
  expect((await snapshot(page)).state.mixProgress).toBe(0);
  await page.getByLabel('Playback speed', { exact: true }).selectOption('0.5');
  await page.clock.runFor(200);
  expect((await snapshot(page)).state.mixProgress).toBeGreaterThan(0);
  await clickControl(page.getByRole('button', { name: 'Pause', exact: true }));
  const paused = await snapshot(page);
  await page.clock.runFor(150);
  expect((await snapshot(page)).state.elapsedSeconds).toBe(paused.state.elapsedSeconds);
  expect((await snapshot(page)).counts.rafScheduled).toBe(false);

  await page.getByLabel('Animation clip', { exact: true }).selectOption('clip-pray');

  const beforeSeek = await canvasPixels(page);
  await page.getByLabel('Seek animation', { exact: true }).press('Home');
  await page.getByLabel('Seek animation', { exact: true }).press('End');
  const sought = await snapshot(page);
  expect(sought.state.timeSeconds).toBe(1.2);
  expect(sought.state.mixProgress).toBe(1);
  expect((await canvasPixels(page)).equals(beforeSeek)).toBe(false);

  const document = JSON.parse(readFileSync(new URL('../packages/test-fixtures/fixtures/priest.runtime.json', import.meta.url), 'utf8')) as RuntimeDocument;
  const evaluator = createRigEvaluator(document, 'rig-priest');
  const geometry = createGeometryEvaluator(document, 'rig-priest');
  const output = geometry.createOutput();
  geometry.write(evaluator.sample('clip-pray', 1.2), output);
  expect(sought.geometry.drawOrder).toEqual([...output.drawOrder]);
  for (const expected of output.attachments) {
    const actual = sought.geometry.attachments.find((item) => item.id === expected.id)!;
    expect(actual.indices).toEqual(Array.from(expected.indices));
    expect(actual.uvs).toEqual(Array.from(expected.uvs));
    expect(actual.opacity).toBeCloseTo(expected.opacity, 6);
    for (let index = 0; index < expected.positions.length; index++) {
      expect(actual.positions[index]).toBeCloseTo(expected.positions[index]!, 4);
    }
  }
  await clickControl(page.getByRole('button', { name: 'Stop', exact: true }));
  const stopped = await snapshot(page);
  expect(stopped.state.status).toBe('stopped');
  expect(stopped.counts.rafScheduled).toBe(false);
  const rendered = stopped.counts.renderedFrames;
  await page.clock.runFor(150);
  expect((await snapshot(page)).counts.renderedFrames).toBe(rendered);
  await page.getByLabel('Playback speed', { exact: true }).selectOption('1');
}
