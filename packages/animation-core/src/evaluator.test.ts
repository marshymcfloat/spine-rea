import { describe, expect, it } from 'vitest';
import { createPriestProjectFixture, createPriestRuntimeFixture } from '@studio/test-fixtures';
import { createRigEvaluator } from './index';
import type { AffineMatrix, EvaluatedPose } from './types';
import { bone, linearClip, rootX, testDocument, transform } from './test-data';

function expectMatrix(actual: AffineMatrix, expected: AffineMatrix): void {
  for (const key of ['a', 'b', 'c', 'd', 'tx', 'ty'] as const) {
    expect(actual[key], key).toBeCloseTo(expected[key], 10);
  }
}

describe('hierarchical rig evaluation', () => {
  it('composes nonuniform mirrored transforms without losing shear or source order', () => {
    const document = testDocument();
    const rig = document.rigs[0]!;
    rig.bones[0]!.setup = transform({ x: 10, y: 20, rotation: Math.PI / 2, scaleX: 2, scaleY: 3 });
    rig.bones[1]!.setup = transform({ x: 4, y: 5, rotation: Math.PI / 4, scaleX: -1, scaleY: 2 });
    rig.bones.reverse();
    const pose = createRigEvaluator(document, 'rig').setupPose();
    const r = Math.SQRT1_2;
    expect(pose.bones.map(({ id }) => id)).toEqual(['tip', 'child', 'root']);
    expectMatrix(bone(pose).world, { a: 0, b: 2, c: -3, d: 0, tx: 10, ty: 20 });
    expectMatrix(bone(pose, 'child').world, { a: 3 * r, b: -2 * r, c: -6 * r, d: -4 * r, tx: -5, ty: 28 });
    expectMatrix(bone(pose, 'tip').world, { a: 3 * r, b: -2 * r, c: -6 * r, d: -4 * r, tx: 15 * r - 5, ty: 6 * r + 28 });
    const child = bone(pose, 'child').world;
    expect(child.a * child.c + child.b * child.d).toBeCloseTo(-5);
    expect(pose.attachments.map(({ id }) => id)).toEqual(['front', 'back']);
    expect(pose.drawOrder).toEqual(['back', 'front']);
  });

  it('samples absolute local channels and retains every unkeyed setup channel', () => {
    const evaluator = createRigEvaluator(testDocument(), 'rig');
    const pose = evaluator.sample('a', 0.5, { loop: false });
    expect(bone(pose).local).toEqual(transform({ x: 5, y: 20 }));
    expect(bone(pose, 'child').local).toEqual(transform({ x: 2, y: 3 }));
    expectMatrix(bone(pose, 'tip').world, { a: 1, b: 0, c: 0, d: 1, tx: 8, ty: 21 });
    expect(pose.attachments).toEqual([{ id: 'front', opacity: 0.8 }, { id: 'back', opacity: 0.2 }]);
  });

  it('accepts animated zero scale while rejecting nonfinite derived matrices', () => {
    const document = testDocument();
    document.clips[0]!.tracks = [{
      kind: 'bone', boneId: 'root', channel: 'scaleX',
      keys: [{ time: 0, value: 0, easing: { type: 'linear' } }],
    }];
    expect(bone(createRigEvaluator(document, 'rig').sample('a', 0)).world.a).toBe(0);
    document.rigs[0]!.bones[0]!.setup.scaleX = 1e308;
    document.rigs[0]!.bones[1]!.setup.scaleX = 1e308;
    expect(() => createRigEvaluator(document, 'rig')).toThrow(/bone|finite|evaluat/i);
  });
});

describe('clip sampling', () => {
  it.each([
    [-10, 0], [0, 0], [0.5, 5], [2, 20], [100, 20],
  ])('clamps nonlooping time %s to the expected pose', (time, expected) => {
    expect(rootX(createRigEvaluator(testDocument(), 'rig').sample('a', time, { loop: false }))).toBeCloseTo(expected);
  });

  it.each([
    [-4, 0], [-2.5, 15], [-0.5, 15], [0, 0], [2, 0], [4.5, 5],
  ])('uses Euclidean loop time for %s seconds', (time, expected) => {
    expect(rootX(createRigEvaluator(testDocument(), 'rig').sample('a', time))).toBeCloseTo(expected);
  });

  it.each([
    { duration: 0.1, cycle: 42 }, { duration: 0.1, cycle: 43 },
    { duration: 0.1, cycle: -42 }, { duration: 0.1, cycle: -43 },
    { duration: 1 / 60, cycle: 30 }, { duration: 1 / 60, cycle: 31 },
    { duration: 1 / 60, cycle: -30 }, { duration: 1 / 60, cycle: -31 },
  ])('samples the exact first key at canonical decimal boundary $cycle × $duration', ({ duration, cycle }) => {
    const document = testDocument();
    document.clips = [linearClip('decimal', 10, 30, duration)];
    const evaluator = createRigEvaluator(document, 'rig');
    expect(rootX(evaluator.sample('decimal', cycle * duration))).toBe(10);
  });

  it.each([
    { duration: 0.1, cycle: 42 },
    { duration: 1 / 60, cycle: 30 },
  ])('uses the exact right hold key at a canonical decimal offset in cycle $cycle', ({ duration, cycle }) => {
    const document = testDocument();
    const clip = linearClip('decimal-hold', 10, 50, duration);
    const keyTime = duration / 2;
    clip.tracks[0]!.keys = [
      { time: 0, value: 10, easing: { type: 'hold' } },
      { time: keyTime, value: 30, easing: { type: 'hold' } },
      { time: duration, value: 50, easing: { type: 'linear' } },
    ];
    document.clips = [clip];
    expect(rootX(createRigEvaluator(document, 'rig').sample('decimal-hold', cycle * duration + keyTime))).toBe(30);
  });

  it('holds endpoints and uses outgoing hold easing until the exact next key', () => {
    const document = testDocument();
    const clip = linearClip('hold', 0, 1, 4, false);
    clip.tracks[0]!.keys = [
      { time: 1, value: 10, easing: { type: 'hold' } },
      { time: 2, value: 30, easing: { type: 'linear' } },
      { time: 3, value: 50, easing: { type: 'linear' } },
    ];
    document.clips = [clip];
    const evaluator = createRigEvaluator(document, 'rig');
    for (const [time, expected] of [[0, 10], [1, 10], [1.999, 10], [2, 30], [2.5, 40], [4, 50]]) {
      expect(rootX(evaluator.sample('hold', time!))).toBeCloseTo(expected!);
    }
  });

  it.each([
    { controlX: 0, time: 0.125 },
    { controlX: 1, time: 0.875 },
  ])('inverts cubic X before sampling Y for controls $controlX', ({ controlX, time }) => {
    const document = testDocument();
    const clip = linearClip('curve', 10, 30, 1, false);
    clip.tracks[0]!.keys[0]!.easing = { type: 'bezier', x1: controlX, y1: 0, x2: controlX, y2: 1 };
    document.clips = [clip];
    // Both X values correspond to curve parameter 1/2, where Y = 1/2.
    expect(rootX(createRigEvaluator(document, 'rig').sample('curve', time))).toBeCloseTo(20, 10);
  });

  it('keeps large finite times and opposite-sign values finite when the result permits', () => {
    const document = testDocument();
    document.clips = [linearClip('large', -Number.MAX_VALUE, Number.MAX_VALUE, 1.5e308)];
    const evaluator = createRigEvaluator(document, 'rig');
    expect(rootX(evaluator.sample('large', 0.75e308))).toBe(0);
    expect(rootX(evaluator.sample('large', 1e308))).toBeGreaterThan(0);
    expect(Number.isFinite(rootX(evaluator.sample('large', 1e308)))).toBe(true);
    expect(Number.isFinite(rootX(evaluator.sample('large', -Number.MIN_VALUE)))).toBe(true);
  });
});

describe('local pose blending', () => {
  it('blends unwrapped local transforms and opacity, then recomputes the hierarchy', () => {
    const evaluator = createRigEvaluator(testDocument(), 'rig');
    const from = evaluator.setupPose();
    const to = evaluator.setupPose();
    bone(to).local = transform({ x: 30, y: 20, rotation: Math.PI * 4, scaleX: 3, scaleY: -1 });
    to.attachments[0]!.opacity = 0;
    to.attachments[1]!.opacity = 1;
    bone(from).world.tx = 999;
    bone(to, 'child').world.a = -999;
    const beforeFrom = structuredClone(from);
    const beforeTo = structuredClone(to);
    const pose = evaluator.blend(from, to, 0.25);
    expect(bone(pose).local.x).toBe(15);
    expect(bone(pose).local.rotation).toBeCloseTo(Math.PI);
    expect(bone(pose).local.scaleX).toBe(1.5);
    expect(bone(pose).local.scaleY).toBe(0.5);
    expect(pose.attachments[0]!.opacity).toBeCloseTo(0.6);
    expect(pose.attachments[1]!.opacity).toBeCloseTo(0.4);
    expectMatrix(bone(pose, 'child').world, { a: -1.5, b: 0, c: 0, d: -0.5, tx: 12, ty: 18.5 });
    expect(from).toEqual(beforeFrom);
    expect(to).toEqual(beforeTo);
    bone(pose).local.x = -100;
    expect(from).toEqual(beforeFrom);
    expect(to).toEqual(beforeTo);
  });

  it('preserves exact endpoint values without aliasing endpoint poses', () => {
    const evaluator = createRigEvaluator(testDocument(), 'rig');
    const from = evaluator.sample('a', 0.5);
    const to = evaluator.sample('b', 0.5);
    expect(evaluator.blend(from, to, 0)).toEqual(from);
    expect(evaluator.blend(from, to, 1)).toEqual(to);
    const mixed = evaluator.blend(from, to, 1);
    mixed.drawOrder.reverse();
    mixed.attachments[0]!.opacity = 0;
    expect(to.drawOrder).toEqual(['back', 'front']);
    expect(to.attachments[0]!.opacity).toBe(0.8);
  });

  it.each([-0.1, 1.1, NaN, Infinity])('rejects invalid blend alpha %s', (alpha) => {
    const evaluator = createRigEvaluator(testDocument(), 'rig');
    expect(() => evaluator.blend(evaluator.setupPose(), evaluator.setupPose(), alpha)).toThrow();
  });

  it.each([
    (pose: EvaluatedPose) => { pose.rigId = 'other'; },
    (pose: EvaluatedPose) => { pose.bones.pop(); },
    (pose: EvaluatedPose) => { pose.bones[0]!.id = 'other'; },
    (pose: EvaluatedPose) => { pose.attachments[0]!.id = 'other'; },
    (pose: EvaluatedPose) => { pose.bones[0]!.local.x = Infinity; },
    (pose: EvaluatedPose) => { pose.attachments[0]!.opacity = -0.1; },
  ])('rejects incompatible or invalid supplied poses', (mutate) => {
    const evaluator = createRigEvaluator(testDocument(), 'rig');
    const invalid = evaluator.setupPose();
    mutate(invalid);
    expect(() => evaluator.blend(invalid, evaluator.setupPose(), 0.5)).toThrow();
    expect(() => evaluator.blend(evaluator.setupPose(), invalid, 0.5)).toThrow();
  });
});

describe('evaluator boundaries and fixture equivalence', () => {
  it('captures input and returns independent clip and pose snapshots', () => {
    const document = testDocument();
    const evaluator = createRigEvaluator(document, 'rig');
    document.rigs[0]!.bones[0]!.setup.x = 999;
    document.clips[0]!.tracks[0]!.keys[0]!.value = 999;
    const clip = evaluator.getClip('once');
    clip.tracks[0]!.keys[0]!.value = 999;
    (clip.markers[0]!.data as { cue: string[] }).cue[0] = 'changed';
    const pose = evaluator.setupPose();
    bone(pose).local.x = 999;
    bone(pose).world.tx = 999;
    pose.attachments[0]!.opacity = 0;
    pose.drawOrder.reverse();
    expect(rootX(evaluator.setupPose())).toBe(10);
    expect(rootX(evaluator.sample('a', 0))).toBe(0);
    expect(evaluator.getClip('once').markers[0]!.data).toEqual({ cue: ['zero'] });
    expect(evaluator.setupPose().drawOrder).toEqual(['back', 'front']);
    expect(evaluator.setupPose().attachments[0]!.opacity).toBe(0.8);
  });

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite sample time %s', (time) => {
    expect(() => createRigEvaluator(testDocument(), 'rig').sample('a', time)).toThrow();
  });

  it('rejects invalid data, absent rigs/clips and malformed loop options', () => {
    expect(() => createRigEvaluator({}, 'rig')).toThrow();
    expect(() => createRigEvaluator(testDocument(), 'missing')).toThrow(/rig/i);
    const evaluator = createRigEvaluator(testDocument(), 'rig');
    expect(() => evaluator.getClip('missing')).toThrow(/clip/i);
    expect(() => evaluator.sample('missing', 0)).toThrow(/clip/i);
    expect(() => evaluator.sample('a', 0, { loop: 'yes' } as unknown as { loop?: boolean })).toThrow();
  });

  it('produces equivalent bones and opacity from serialized authoring/runtime priest inputs', () => {
    const project = JSON.parse(JSON.stringify(createPriestProjectFixture())) as unknown;
    const runtime = JSON.parse(JSON.stringify(createPriestRuntimeFixture())) as unknown;
    const fromProject = createRigEvaluator(project, 'rig-priest');
    const fromRuntime = createRigEvaluator(runtime, 'rig-priest');
    expect(fromProject.setupPose()).toEqual(fromRuntime.setupPose());
    for (const clip of createPriestProjectFixture().clips) {
      for (const loop of [false, true]) {
        for (const time of [-clip.duration / 2, 0, clip.duration / 4, clip.duration / 2, clip.duration, clip.duration * 2]) {
          expect(fromProject.sample(clip.id, time, { loop })).toEqual(fromRuntime.sample(clip.id, time, { loop }));
        }
      }
    }
  });
});
