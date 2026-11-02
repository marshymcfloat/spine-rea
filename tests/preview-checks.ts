import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { RuntimeDocument } from '../packages/schema/src/index';
import { createGeometryEvaluator, createRigEvaluator, type EvaluatedPose, type PlaybackState } from '../packages/animation-core/src/index';

interface PreviewSnapshot {
  pose: EvaluatedPose;
  geometry: { rigId: string; drawOrder: string[]; attachments: { id: string; positions: number[]; uvs: number[]; indices: number[]; opacity: number }[] };
  state: PlaybackState;
  counts: { renderedFrames: number; rafScheduled: boolean };
}

export async function snapshot(page: Page): Promise<PreviewSnapshot> {
  return page.evaluate(() => (window as unknown as { __studioPreview: { snapshot(): PreviewSnapshot } }).__studioPreview.snapshot());
}

export async function checkPreview(page: Page) {
  await page.waitForFunction(() => Boolean((window as unknown as { __studioPreview?: unknown }).__studioPreview));
  const initial = await snapshot(page);
  expect(initial.geometry.attachments).toHaveLength(9);
  expect(initial.state.status).toBe('paused');
  expect(initial.counts.rafScheduled).toBe(false);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).state.elapsedSeconds).toBeGreaterThan(.05);
  await page.getByLabel('Playback speed', { exact: true }).selectOption('2');
  expect((await snapshot(page)).state.speed).toBe(2);
  await page.getByLabel('Crossfade duration', { exact: true }).selectOption('2');
  await page.getByLabel('Animation clip', { exact: true }).selectOption('clip-pray');
  const fading = await snapshot(page);
  expect(fading.state.clipId).toBe('clip-pray');
  expect(fading.state.mixProgress).toBeLessThan(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await snapshot(page);
  await page.waitForTimeout(150);
  expect((await snapshot(page)).state.elapsedSeconds).toBe(paused.state.elapsedSeconds);
  expect((await snapshot(page)).counts.rafScheduled).toBe(false);

  const canvas = page.getByTestId('studio-canvas');
  const beforeSeek = await canvas.screenshot();
  await page.getByLabel('Seek animation', { exact: true }).press('Home');
  await page.getByLabel('Seek animation', { exact: true }).press('End');
  const sought = await snapshot(page);
  expect(sought.state.timeSeconds).toBe(1.2);
  expect(sought.state.mixProgress).toBe(1);
  expect((await canvas.screenshot()).equals(beforeSeek)).toBe(false);

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
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const stopped = await snapshot(page);
  expect(stopped.state.status).toBe('stopped');
  expect(stopped.counts.rafScheduled).toBe(false);
  const rendered = stopped.counts.renderedFrames;
  await page.waitForTimeout(150);
  expect((await snapshot(page)).counts.renderedFrames).toBe(rendered);
  await page.getByLabel('Playback speed', { exact: true }).selectOption('1');
}
