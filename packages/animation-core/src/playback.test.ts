import { describe, expect, it } from 'vitest';
import { createPlaybackController, createRigEvaluator, MAX_MARKER_EVENTS_PER_UPDATE } from './index';
import type { PlaybackController, PlaybackMarkerEvent } from './types';
import { bone, linearClip, rootX, testDocument } from './test-data';

function controller(document = testDocument()): PlaybackController {
  return createPlaybackController(createRigEvaluator(document, 'rig'));
}

function crossings(events: PlaybackMarkerEvent[]) {
  return events.map(({ clipId, marker, loopIndex, elapsedSeconds }) => ({
    clipId, id: marker.id, loopIndex, elapsedSeconds,
  }));
}

function expectAtomicFailure(player: PlaybackController, operation: () => unknown): void {
  const state = player.getState();
  const pose = player.getPose();
  expect(operation).toThrow();
  expect(player.getState()).toEqual(state);
  expect(player.getPose()).toEqual(pose);
}

describe('host-controlled playback', () => {
  it('starts and stops on setup, retaining speed while clearing the selected clip', () => {
    const player = controller();
    expect(player.getState()).toMatchObject({ status: 'stopped', clipId: null, timeSeconds: 0, elapsedSeconds: 0, speed: 1, mixProgress: 1 });
    expect(rootX(player.getPose())).toBe(10);
    expectAtomicFailure(player, () => player.seek(0));
    player.pause();
    player.resume();
    expect(player.getState().status).toBe('stopped');
    player.setSpeed(2);
    player.play('a');
    player.update(0.25);
    expect(rootX(player.getPose())).toBe(5);
    player.stop();
    expect(player.getState()).toMatchObject({ status: 'stopped', clipId: null, speed: 2, mixProgress: 1 });
    expect(rootX(player.getPose())).toBe(10);
    expect(player.update(100)).toEqual([]);
    player.resume();
    expect(player.getState().status).toBe('stopped');
  });

  it('completes one-shots once, holds the last pose and can restart the same clip', () => {
    const player = controller();
    player.play('once');
    expect(player.getState()).toMatchObject({ status: 'playing', clipId: 'once', timeSeconds: 0, elapsedSeconds: 0, loop: false });
    expect(rootX(player.getPose())).toBe(0);
    expect(crossings(player.update(0.5))).toEqual([
      { clipId: 'once', id: 'start', loopIndex: 0, elapsedSeconds: 0 },
      { clipId: 'once', id: 'middle', loopIndex: 0, elapsedSeconds: 0.5 },
    ]);
    expect(crossings(player.update(10))).toEqual([
      { clipId: 'once', id: 'end', loopIndex: 0, elapsedSeconds: 1 },
    ]);
    expect(player.getState()).toMatchObject({ status: 'completed', timeSeconds: 1, elapsedSeconds: 1 });
    expect(rootX(player.getPose())).toBe(10);
    const completed = player.getState();
    player.pause();
    player.resume();
    expect(player.getState()).toEqual(completed);
    expect(player.update(10)).toEqual([]);
    player.play('once');
    expect(crossings(player.update(0.1))).toEqual([
      { clipId: 'once', id: 'start', loopIndex: 0, elapsedSeconds: 0 },
    ]);
  });

  it('freezes pause/speed-zero and preserves initial zero-marker eligibility', () => {
    const player = controller();
    player.play('once');
    expect(player.update(0)).toEqual([]);
    player.pause();
    const paused = player.getState();
    expect(player.update(100)).toEqual([]);
    expect(player.getState()).toEqual(paused);
    player.setSpeed(0);
    player.resume();
    const frozen = player.getState();
    expect(player.update(100)).toEqual([]);
    expect(player.getState()).toEqual(frozen);
    player.setSpeed(2);
    expect(crossings(player.update(0.25))).toEqual([
      { clipId: 'once', id: 'start', loopIndex: 0, elapsedSeconds: 0 },
      { clipId: 'once', id: 'middle', loopIndex: 0, elapsedSeconds: 0.5 },
    ]);
    expect(rootX(player.getPose())).toBe(5);
  });

  it('seeks silently, cancels fades and preserves playing/paused state', () => {
    const player = controller();
    player.play('a');
    player.update(0.5);
    player.play('b', { crossfadeSeconds: 2 });
    player.update(0.5);
    player.seek(1);
    expect(player.getState()).toMatchObject({ status: 'playing', clipId: 'b', timeSeconds: 1, elapsedSeconds: 1, mixProgress: 1 });
    expect(rootX(player.getPose())).toBe(110);
    expect(player.update(0)).toEqual([]);
    player.pause();
    player.seek(-0.5);
    expect(player.getState()).toMatchObject({ status: 'paused', timeSeconds: 1.5, elapsedSeconds: -0.5 });
    expect(rootX(player.getPose())).toBe(115);
    expect(player.update(100)).toEqual([]);
    player.play('once');
    player.seek(0.2);
    expect(crossings(player.update(0.3))).toEqual([
      { clipId: 'once', id: 'middle', loopIndex: 0, elapsedSeconds: 0.5 },
    ]);
    player.seek(0.1);
    expect(player.update(0)).toEqual([]);
  });

  it('seeking a completed one-shot before its end makes it paused', () => {
    const player = controller();
    player.play('once');
    player.update(1);
    player.seek(10);
    expect(player.getState()).toMatchObject({ status: 'completed', timeSeconds: 1, elapsedSeconds: 1 });
    player.seek(-1);
    expect(player.getState()).toMatchObject({ status: 'paused', timeSeconds: 0, elapsedSeconds: 0 });
    player.resume();
    expect(crossings(player.update(0.5))).toEqual([
      { clipId: 'once', id: 'middle', loopIndex: 0, elapsedSeconds: 0.5 },
    ]);
  });
});

describe('ordered marker crossings', () => {
  it('keeps all loop crossings, ordering duration before the next zero', () => {
    const player = controller();
    player.play('once', { loop: true });
    expect(crossings(player.update(2.25))).toEqual([
      { clipId: 'once', id: 'start', loopIndex: 0, elapsedSeconds: 0 },
      { clipId: 'once', id: 'middle', loopIndex: 0, elapsedSeconds: 0.5 },
      { clipId: 'once', id: 'end', loopIndex: 0, elapsedSeconds: 1 },
      { clipId: 'once', id: 'start', loopIndex: 1, elapsedSeconds: 1 },
      { clipId: 'once', id: 'middle', loopIndex: 1, elapsedSeconds: 1.5 },
      { clipId: 'once', id: 'end', loopIndex: 1, elapsedSeconds: 2 },
      { clipId: 'once', id: 'start', loopIndex: 2, elapsedSeconds: 2 },
    ]);
    expect(player.getState()).toMatchObject({ status: 'playing', timeSeconds: 0.25, elapsedSeconds: 2.25 });
    expect(player.update(0)).toEqual([]);
  });

  it('preserves tied markers in stored order and excludes an already-crossed boundary', () => {
    const document = testDocument();
    document.clips[3]!.markers.splice(2, 0, { id: 'middle-two', name: 'Middle two', time: 0.5 });
    const player = controller(document);
    player.play('once', { loop: true });
    expect(player.update(0.5).map(({ marker }) => marker.id)).toEqual(['start', 'middle', 'middle-two']);
    expect(player.update(0.5).map(({ marker }) => marker.id)).toEqual(['end', 'start']);
    expect(player.update(0.1)).toEqual([]);
  });

  it('crosses negative loop cursors through zero without duplicating boundary events', () => {
    const player = controller();
    player.play('once', { loop: true });
    player.seek(-0.5);
    expect(crossings(player.update(0.5))).toEqual([
      { clipId: 'once', id: 'end', loopIndex: -1, elapsedSeconds: 0 },
      { clipId: 'once', id: 'start', loopIndex: 0, elapsedSeconds: 0 },
    ]);
    expect(crossings(player.update(0.5))).toEqual([
      { clipId: 'once', id: 'middle', loopIndex: 0, elapsedSeconds: 0.5 },
    ]);
  });

  it('preserves a tiny finite first-cycle marker within a very long looping clip', () => {
    const document = testDocument();
    const clip = linearClip('long', 0, 1, 1e308);
    clip.markers = [{ id: 'tiny', name: 'Tiny', time: 1e-308 }];
    document.clips = [clip];
    const player = controller(document);
    player.play('long');
    expect(crossings(player.update(1e-308))).toEqual([
      { clipId: 'long', id: 'tiny', loopIndex: 0, elapsedSeconds: 1e-308 },
    ]);
  });

  it('emits only the destination markers while a source one-shot reaches its end', () => {
    const document = testDocument();
    document.clips[1]!.markers = [{ id: 'b-start', name: 'B start', time: 0 }, { id: 'b-quarter', name: 'B quarter', time: 0.25 }];
    const player = controller(document);
    player.play('once');
    player.update(0.9);
    player.play('b', { crossfadeSeconds: 2 });
    expect(player.update(0.5).map(({ marker }) => marker.id)).toEqual(['b-start', 'b-quarter']);
    expect(rootX(player.getPose())).toBeCloseTo(33.75);
  });
});

describe('crossfade clocks and interruption', () => {
  it('fades from setup when stopped and advances both ordinary source and destination clips', () => {
    const player = controller();
    player.play('a', { crossfadeSeconds: 1 });
    expect(rootX(player.getPose())).toBe(10);
    player.update(0.5);
    expect(rootX(player.getPose())).toBeCloseTo(7.5);
    player.play('a');
    player.update(0.5);
    player.play('b', { crossfadeSeconds: 1 });
    expect(rootX(player.getPose())).toBe(5);
    player.update(0.5);
    expect(rootX(player.getPose())).toBeCloseTo(57.5);
    expect(player.getState()).toMatchObject({ clipId: 'b', timeSeconds: 0.5, mixProgress: 0.5 });
    player.update(0.5);
    expect(rootX(player.getPose())).toBe(110);
    expect(player.getState().mixProgress).toBe(1);
  });

  it('freezes the current mixed local pose when another fade interrupts it', () => {
    const player = controller();
    player.play('a');
    player.update(0.5);
    player.play('b', { crossfadeSeconds: 1 });
    player.update(0.5);
    expect(rootX(player.getPose())).toBeCloseTo(57.5);
    player.play('c', { crossfadeSeconds: 1 });
    expect(rootX(player.getPose())).toBeCloseTo(57.5);
    player.update(0.5);
    expect(rootX(player.getPose())).toBeCloseTo(131.25);
    player.update(0.5);
    expect(rootX(player.getPose())).toBe(210);
  });

  it('holds an ended destination until its fade finishes before completing', () => {
    const player = controller();
    player.play('a');
    player.update(0.5);
    player.play('once', { crossfadeSeconds: 2 });
    expect(player.update(1).map(({ marker }) => marker.id)).toEqual(['start', 'middle', 'end']);
    expect(player.getState()).toMatchObject({ status: 'playing', timeSeconds: 1, elapsedSeconds: 1, mixProgress: 0.5 });
    expect(rootX(player.getPose())).toBeCloseTo(12.5);
    expect(player.update(0.5)).toEqual([]);
    expect(player.getState()).toMatchObject({ status: 'playing', timeSeconds: 1, elapsedSeconds: 1, mixProgress: 0.75 });
    expect(rootX(player.getPose())).toBeCloseTo(7.5);
    expect(player.update(0.5)).toEqual([]);
    expect(player.getState()).toMatchObject({ status: 'completed', timeSeconds: 1, elapsedSeconds: 1, mixProgress: 1 });
    expect(rootX(player.getPose())).toBe(10);
  });

  it('freezes both fade clocks while paused or at zero speed', () => {
    const player = controller();
    player.play('a');
    player.update(0.5);
    player.play('b', { crossfadeSeconds: 2 });
    player.update(0.5);
    expect(rootX(player.getPose())).toBeCloseTo(33.75);
    player.pause();
    const paused = { state: player.getState(), pose: player.getPose() };
    expect(player.update(10)).toEqual([]);
    expect({ state: player.getState(), pose: player.getPose() }).toEqual(paused);
    player.resume();
    player.setSpeed(0);
    const stoppedClock = { state: player.getState(), pose: player.getPose() };
    expect(player.update(10)).toEqual([]);
    expect({ state: player.getState(), pose: player.getPose() }).toEqual(stoppedClock);
    player.setSpeed(2);
    player.update(0.25);
    expect(rootX(player.getPose())).toBeCloseTo(62.5);
    expect(player.getState()).toMatchObject({ timeSeconds: 1, elapsedSeconds: 1, mixProgress: 0.5 });
  });
});

describe('atomic failures and snapshot isolation', () => {
  it.each([
    (player: PlaybackController) => player.play('missing'),
    (player: PlaybackController) => player.play('b', { loop: 'yes' } as unknown as { loop?: boolean }),
    (player: PlaybackController) => player.play('b', { crossfadeSeconds: -1 }),
    (player: PlaybackController) => player.play('b', { crossfadeSeconds: NaN }),
    (player: PlaybackController) => player.play('b', { crossfadeSeconds: Infinity }),
    (player: PlaybackController) => player.seek(NaN),
    (player: PlaybackController) => player.setSpeed(-1),
    (player: PlaybackController) => player.setSpeed(NaN),
    (player: PlaybackController) => player.setSpeed(Infinity),
    (player: PlaybackController) => player.update(-1),
    (player: PlaybackController) => player.update(NaN),
    (player: PlaybackController) => player.update(Infinity),
  ])('leaves a live fade unchanged when an API argument is invalid', (operation) => {
    const player = controller();
    player.play('a');
    player.update(0.5);
    player.play('b', { crossfadeSeconds: 2 });
    player.update(0.5);
    expectAtomicFailure(player, () => operation(player));
    player.update(0.5);
    expect(rootX(player.getPose())).toBeCloseTo(62.5);
  });

  it('fails over the marker budget before advancing fades or consuming initial eligibility', () => {
    const player = controller();
    player.play('a');
    player.update(0.25);
    player.play('once', { loop: true, crossfadeSeconds: 1 });
    expect(MAX_MARKER_EVENTS_PER_UPDATE).toBe(10_000);
    expectAtomicFailure(player, () => player.update(MAX_MARKER_EVENTS_PER_UPDATE));
    const events = player.update(0.1);
    expect(crossings(events)).toEqual([{ clipId: 'once', id: 'start', loopIndex: 0, elapsedSeconds: 0 }]);
    expect(player.getState()).toMatchObject({ timeSeconds: 0.1, elapsedSeconds: 0.1, mixProgress: 0.1 });
  });

  it('allows exactly the documented marker-event budget', () => {
    const document = testDocument();
    document.clips[3]!.markers = [{ id: 'tick', name: 'Tick', time: 0.5 }];
    const player = controller(document);
    player.play('once', { loop: true });
    const events = player.update(MAX_MARKER_EVENTS_PER_UPDATE);
    expect(events).toHaveLength(MAX_MARKER_EVENTS_PER_UPDATE);
    expect(events[0]).toMatchObject({ loopIndex: 0, elapsedSeconds: 0.5 });
    expect(events.at(-1)).toMatchObject({ loopIndex: 9_999, elapsedSeconds: 9_999.5 });
    expect(player.getState()).toMatchObject({ elapsedSeconds: 10_000, timeSeconds: 0 });
  });

  it('rejects overflowing clocks and unsafe loop cursors without partial advancement', () => {
    const player = controller();
    player.play('once', { loop: true });
    player.setSpeed(Number.MAX_VALUE);
    expectAtomicFailure(player, () => player.update(2));
    player.setSpeed(1);
    expectAtomicFailure(player, () => player.seek(Number.MAX_SAFE_INTEGER + 1));
    expect(player.update(0.1).map(({ marker }) => marker.id)).toEqual(['start']);

    const document = testDocument();
    document.clips = [linearClip('large', 0, 1, 1.5e308)];
    const large = controller(document);
    large.play('large');
    large.seek(1e308);
    expectAtomicFailure(large, () => large.update(1e308));
  });

  it('advances marker-free clips across large safe loop counts', () => {
    const player = controller();
    player.play('a');
    expect(player.update(1e12 + 0.5)).toEqual([]);
    expect(player.getState()).toMatchObject({ timeSeconds: 0.5, elapsedSeconds: 1e12 + 0.5 });
    expect(rootX(player.getPose())).toBe(5);
  });

  it('rolls back a failed animated matrix evaluation before consuming zero markers', () => {
    const document = testDocument();
    const clip = linearClip('overflow', 0, 1, 1, false);
    clip.tracks = [{
      kind: 'bone', boneId: 'root', channel: 'scaleX',
      keys: [
        { time: 0, value: 1, easing: { type: 'linear' } },
        { time: 1, value: Number.MAX_VALUE, easing: { type: 'linear' } },
      ],
    }];
    clip.markers = [{ id: 'zero', name: 'Zero', time: 0 }];
    document.clips = [clip];
    document.rigs[0]!.bones[1]!.setup.scaleX = 2;
    const player = controller(document);
    player.play('overflow');
    expectAtomicFailure(player, () => player.update(1));
    expect(player.update(0.1).map(({ marker }) => marker.id)).toEqual(['zero']);
    expect(player.getState().timeSeconds).toBe(0.1);
  });

  it('returns independent states, poses and nested marker payloads', () => {
    const player = controller();
    player.play('once');
    const events = player.update(0.1);
    const state = player.getState();
    const pose = player.getPose();
    state.clipId = 'changed';
    state.speed = 999;
    bone(pose).local.x = 999;
    bone(pose).world.tx = 999;
    pose.drawOrder.reverse();
    events[0]!.loopIndex = 999;
    (events[0]!.marker.data as { cue: string[] }).cue[0] = 'changed';
    expect(player.getState()).toMatchObject({ clipId: 'once', speed: 1, timeSeconds: 0.1 });
    expect(rootX(player.getPose())).toBe(1);
    expect(player.getPose().drawOrder).toEqual(['back', 'front']);
    player.stop();
    player.play('once');
    expect(player.update(0.1)[0]).toEqual({
      clipId: 'once', marker: { id: 'start', name: 'Start', time: 0, data: { cue: ['zero'] } }, loopIndex: 0, elapsedSeconds: 0,
    });
  });
});
