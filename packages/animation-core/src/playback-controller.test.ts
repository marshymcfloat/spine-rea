import type { Clip, RuntimeDocument } from '@studio/schema';
import { describe, expect, it } from 'vitest';
import { createRigEvaluator } from './evaluator';
import { createPlaybackController } from './playback';
import type { RigEvaluator } from './types';

function createEvaluator(): RigEvaluator {
  const clip = (id: string, duration: number, x: number): Clip => ({
    id, name: id, rigId: 'rig', duration, loop: false,
    tracks: [{
      kind: 'bone', boneId: 'root', channel: 'x',
      keys: [
        { time: 0, value: x, easing: { type: 'linear' } },
        { time: duration, value: x + duration, easing: { type: 'linear' } },
      ],
    }],
    markers: [{ id: 'start', name: 'Start', time: 0 }, { id: 'end', name: 'End', time: duration }],
  });
  const looping = clip('loop', 1, 0);
  looping.loop = true;
  looping.markers.splice(1, 0, { id: 'middle', name: 'Middle', time: 0.5 });
  const zero = clip('zero', 1, 0);
  zero.loop = true;
  zero.markers.pop();
  const document: RuntimeDocument = {
    format: 'slotstudio-runtime', schemaVersion: 1, assets: [],
    rigs: [{
      id: 'rig', name: 'Rig',
      bones: [{ id: 'root', name: 'Root', parentId: null, setup: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }],
      attachments: [], drawOrder: [],
    }],
    clips: [clip('a', 4, 0), clip('b', 4, 10), clip('c', 4, 20), clip('short', 1, 10), looping, zero],
  };
  return createRigEvaluator(document, 'rig');
}

describe('playback controller integration', () => {
  it('advances normal fade sources and freezes an interrupted mixed pose', () => {
    const player = createPlaybackController(createEvaluator());
    player.play('a');
    player.update(1);
    player.play('b', { crossfadeSeconds: 2 });
    expect(player.getPose().bones[0]!.local.x).toBe(1);
    player.update(1);
    expect(player.getPose().bones[0]!.local.x).toBe(6.5);
    player.play('c', { crossfadeSeconds: 2 });
    expect(player.getPose().bones[0]!.local.x).toBe(6.5);
    player.update(1);
    expect(player.getPose().bones[0]!.local.x).toBe(13.75);
  });

  it('holds a completed destination while a longer fade finishes', () => {
    const player = createPlaybackController(createEvaluator());
    player.play('short', { crossfadeSeconds: 3 });
    expect(player.update(1.5).map((event) => event.marker.id)).toEqual(['start', 'end']);
    expect(player.getState()).toMatchObject({ status: 'playing', elapsedSeconds: 1, mixProgress: 0.5 });
    expect(player.getPose().bones[0]!.local.x).toBe(5.5);
    expect(player.update(1.5)).toEqual([]);
    expect(player.getState()).toMatchObject({ status: 'completed', elapsedSeconds: 1, mixProgress: 1 });
    expect(player.getPose().bones[0]!.local.x).toBe(11);
  });

  it('orders loop end/start markers and supports negative seek crossings', () => {
    const player = createPlaybackController(createEvaluator());
    player.play('loop');
    expect(player.update(2).map((event) => [event.marker.id, event.loopIndex, event.elapsedSeconds])).toEqual([
      ['start', 0, 0], ['middle', 0, 0.5], ['end', 0, 1],
      ['start', 1, 1], ['middle', 1, 1.5], ['end', 1, 2], ['start', 2, 2],
    ]);
    player.seek(-0.25);
    expect(player.update(0.25).map((event) => [event.marker.id, event.loopIndex, event.elapsedSeconds])).toEqual([
      ['end', -1, 0], ['start', 0, 0],
    ]);
    expect(player.update(0.25)).toEqual([]);
  });

  it('rejects excess events without consuming the initial marker or advancing time', () => {
    const player = createPlaybackController(createEvaluator());
    player.play('zero');
    const state = player.getState();
    const pose = player.getPose();
    expect(() => player.update(10_000)).toThrow(RangeError);
    expect(player.getState()).toEqual(state);
    expect(player.getPose()).toEqual(pose);
    expect(player.update(0.25).map((event) => event.marker.id)).toEqual(['start']);
  });

  it('retains clocks and zero-marker eligibility while paused or speed is zero', () => {
    const player = createPlaybackController(createEvaluator());
    player.play('b', { crossfadeSeconds: 2 });
    player.setSpeed(0);
    expect(player.update(1)).toEqual([]);
    player.setSpeed(1);
    player.pause();
    expect(player.update(1)).toEqual([]);
    player.resume();
    expect(player.update(0.5).map((event) => event.marker.id)).toEqual(['start']);
    expect(player.getState()).toMatchObject({ elapsedSeconds: 0.5, mixProgress: 0.25 });
  });

  it('rejects clock overflow and unsafe seeks atomically', () => {
    const player = createPlaybackController(createEvaluator());
    player.play('loop');
    player.setSpeed(Number.MAX_VALUE);
    const state = player.getState();
    expect(() => player.update(2)).toThrow(RangeError);
    expect(player.getState()).toEqual(state);
    expect(() => player.seek(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(player.getState()).toEqual(state);
    player.setSpeed(1);
    expect(player.update(0.25).map((event) => event.marker.id)).toEqual(['start']);
  });

  it('leaves controller state unchanged when prospective evaluation fails', () => {
    const evaluator = createEvaluator();
    const player = createPlaybackController({
      ...evaluator,
      sample(id, time, options) {
        if (time > 1) throw new RangeError('Prospective pose overflow.');
        return evaluator.sample(id, time, options);
      },
    });
    player.play('a');
    const state = player.getState();
    const pose = player.getPose();
    expect(() => player.update(2)).toThrow('Prospective pose overflow.');
    expect(player.getState()).toEqual(state);
    expect(player.getPose()).toEqual(pose);
    expect(player.update(0.25).map((event) => event.marker.id)).toEqual(['start']);
  });

  it('rejects a null fade duration without restarting the selected clip', () => {
    const player = createPlaybackController(createEvaluator());
    player.play('a');
    player.update(1);
    const state = player.getState();
    expect(() => player.play('b', { crossfadeSeconds: null as unknown as number })).toThrow();
    expect(player.getState()).toEqual(state);
  });
});
