import { describe, expect, it } from 'vitest';
import type { Marker, RuntimeDocument } from '@studio/schema';
import { createPriestProjectFixture } from '@studio/test-fixtures';
import { createRigEvaluator } from './evaluator';
import { createPlaybackController } from './playback';

function loopController(duration: number, markers: Marker[]) {
  const document: RuntimeDocument = {
    format: 'slotstudio-runtime', schemaVersion: 1, assets: [],
    rigs: [{
      id: 'rig', name: 'Rig',
      bones: [{ id: 'root', name: 'Root', parentId: null, setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }],
      attachments: [], drawOrder: [],
    }],
    clips: [{ id: 'loop', name: 'Loop', rigId: 'rig', duration, loop: true, tracks: [], markers }],
  };
  return createPlaybackController(createRigEvaluator(document, 'rig'));
}

describe('evaluator review regressions', () => {
  it.each([
    ['bones', 'source'],
    ['bones', 'destination'],
    ['attachments', 'source'],
    ['attachments', 'destination'],
  ] as const)('rejects a sparse %s array in the %s pose', (collection, side) => {
    const evaluator = createRigEvaluator(createPriestProjectFixture(), 'rig-priest');
    const from = evaluator.setupPose();
    const to = evaluator.sample('clip-idle', 0.5);
    Reflect.deleteProperty((side === 'source' ? from : to)[collection], 0);
    expect(() => evaluator.blend(from, to, 0.5)).toThrow(/mismatched .* identities/);
    expect(evaluator.setupPose().attachments.every((attachment) => Number.isFinite(attachment.opacity))).toBe(true);
  });

  it('preserves equal extreme finite values through sampling and blending', () => {
    const document = createPriestProjectFixture();
    const rig = document.rigs[0];
    const clip = document.clips[0];
    const root = rig?.bones.find((bone) => bone.parentId === null);
    if (!rig || !clip || !root) throw new Error('Expected the technical priest rig and clip.');
    root.setup.x = Number.MAX_VALUE;
    clip.tracks = [{
      kind: 'bone', boneId: root.id, channel: 'x',
      keys: [0, clip.duration].map((time) => ({
        time, value: Number.MAX_VALUE, easing: { type: 'linear' },
      })),
    }];
    const evaluator = createRigEvaluator(document, rig.id);
    const sample = evaluator.sample(clip.id, clip.duration * 0.3, { loop: false });
    expect(sample.bones.find((bone) => bone.id === root.id)?.local.x).toBe(Number.MAX_VALUE);
    const mixed = evaluator.blend(evaluator.setupPose(), sample, 0.3);
    expect(mixed.bones.find((bone) => bone.id === root.id)?.local.x).toBe(Number.MAX_VALUE);
  });

  it('recomputes derived world matrices and retains canonical draw order', () => {
    const evaluator = createRigEvaluator(createPriestProjectFixture(), 'rig-priest');
    const expected = evaluator.blend(evaluator.setupPose(), evaluator.sample('clip-idle', 1), 0.5);
    const from = evaluator.setupPose();
    const to = evaluator.sample('clip-idle', 1);
    for (const pose of [from, to]) {
      pose.drawOrder.reverse();
      for (const bone of pose.bones) {
        bone.world = { a: NaN, b: Infinity, c: NaN, d: -Infinity, tx: NaN, ty: NaN };
      }
    }
    expect(evaluator.blend(from, to, 0.5)).toEqual(expected);
  });
});

describe('playback numeric review regressions', () => {
  it.each([
    [1, Number.MIN_VALUE, 0.1],
    [1e308, 1e-100, 1e292],
  ])('rolls back a marker collapsed onto a negative cycle start: duration %s', (duration, markerTime, delta) => {
    const player = loopController(duration, [{ id: 'tiny', name: 'Tiny', time: markerTime }]);
    player.play('loop');
    player.seek(-duration);
    const state = player.getState();
    const pose = player.getPose();
    expect(() => player.update(delta)).toThrow(RangeError);
    expect(player.getState()).toEqual(state);
    expect(player.getPose()).toEqual(pose);
  });

  it('includes an interior decimal marker at its exact unwrapped timestamp', () => {
    const player = loopController(0.1, [
      { id: 'start', name: 'Start', time: 0 },
      { id: 'inside', name: 'Inside', time: 0.05 },
      { id: 'end', name: 'End', time: 0.1 },
    ]);
    player.play('loop');
    player.seek(4.2);
    const events = player.update(0.05);
    expect(events.map((event) => [event.marker.id, event.loopIndex, event.elapsedSeconds])).toEqual([
      ['inside', 42, 4.25],
    ]);
  });

  it.each([
    [0.1, 43],
    [1 / 60, 31],
  ])('emits both sides of a canonical decimal boundary: duration %s, cycle %s', (duration, cycle) => {
    const player = loopController(duration, [
      { id: 'start', name: 'Start', time: 0 },
      { id: 'end', name: 'End', time: duration },
    ]);
    const previous = (cycle - 1) * duration;
    const boundary = cycle * duration;
    player.play('loop');
    player.seek(previous);
    const events = player.update(boundary - previous);
    expect(events.map((event) => [event.marker.id, event.loopIndex])).toEqual([
      ['end', cycle - 1], ['start', cycle],
    ]);
    expect(events.every((event) => event.elapsedSeconds === boundary)).toBe(true);
    expect(player.update(duration / 100)).toEqual([]);
  });

  it('rolls back an update when a valid loop index cannot represent a marker crossing', () => {
    const player = loopController(1, [{ id: 'quarter', name: 'Quarter', time: 0.25 }]);
    player.play('loop');
    player.seek(2 ** 52);
    const state = player.getState();
    const pose = player.getPose();
    expect(() => player.update(1)).toThrow(RangeError);
    expect(player.getState()).toEqual(state);
    expect(player.getPose()).toEqual(pose);
  });

  it('retains interior and tied boundary markers near negative finite limits', () => {
    const player = loopController(1e308, [
      { id: 'start', name: 'Start', time: 0 },
      { id: 'inside', name: 'Inside', time: 9e307 },
      { id: 'end', name: 'End', time: 1e308 },
    ]);
    player.play('loop');
    player.seek(-Number.MAX_VALUE);
    const events = player.update(8e307);
    expect(events.map((event) => [event.marker.id, event.loopIndex])).toEqual([
      ['inside', -2], ['end', -2], ['start', -1],
    ]);
    expect(events[0]!.elapsedSeconds / -1.1e308).toBeCloseTo(1, 15);
    expect(events[1]!.elapsedSeconds).toBe(-1e308);
    expect(events[2]!.elapsedSeconds).toBe(-1e308);
    expect(events.every((event) => Number.isFinite(event.elapsedSeconds))).toBe(true);
  });

  it('keeps stored ties and end-before-start ordering across negative decimal cycles', () => {
    const player = loopController(0.1, [
      { id: 'start-a', name: 'Start A', time: 0 },
      { id: 'start-b', name: 'Start B', time: 0 },
      { id: 'inside', name: 'Inside', time: 0.03 },
      { id: 'end-a', name: 'End A', time: 0.1 },
      { id: 'end-b', name: 'End B', time: 0.1 },
    ]);
    player.play('loop');
    player.seek(-0.25);
    const events = player.update(0.25);
    expect(events.map((event) => [event.marker.id, event.loopIndex])).toEqual([
      ['end-a', -3], ['end-b', -3], ['start-a', -2], ['start-b', -2], ['inside', -2],
      ['end-a', -2], ['end-b', -2], ['start-a', -1], ['start-b', -1], ['inside', -1],
      ['end-a', -1], ['end-b', -1], ['start-a', 0], ['start-b', 0],
    ]);
    expect(events.filter((event) => event.elapsedSeconds === -0.2).map((event) => event.marker.id)).toEqual([
      'end-a', 'end-b', 'start-a', 'start-b',
    ]);
    expect(events.slice(-4).every((event) => event.elapsedSeconds === 0)).toBe(true);
    expect(player.update(0.05).map((event) => [event.marker.id, event.loopIndex])).toEqual([['inside', 0]]);
    expect(player.update(0)).toEqual([]);
  });
});
