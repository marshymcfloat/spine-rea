import type { Clip } from '@studio/schema';
import { getLoopCycle, loopCrossingTime, normalizeClipTime } from './sampling';
import type {
  EvaluatedPose, PlaybackController, PlaybackMarkerEvent, PlaybackState,
  PlaybackStatus, PlayOptions, RigEvaluator,
} from './types';

export const MAX_MARKER_EVENTS_PER_UPDATE = 10_000;

interface ClipCursor {
  clip: Clip;
  elapsedSeconds: number;
  loop: boolean;
}

type FadeSource = { kind: 'clip'; cursor: ClipCursor } | { kind: 'pose'; pose: EvaluatedPose };
interface Fade {
  source: FadeSource;
  elapsedSeconds: number;
  duration: number;
}

function requireNonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative.`);
}

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
}

function loopIndex(cursor: ClipCursor): number {
  const index = getLoopCycle(cursor.elapsedSeconds, cursor.clip.duration);
  if (!Number.isSafeInteger(index)) throw new RangeError('Loop index exceeds safe integer precision.');
  return index === 0 ? 0 : index;
}

function validateCursor(cursor: ClipCursor): void {
  requireFinite(cursor.elapsedSeconds, 'Playback cursor');
  if (cursor.loop) loopIndex(cursor);
}

function advanceCursor(cursor: ClipCursor, elapsed: number): ClipCursor {
  const nextTime = cursor.elapsedSeconds + elapsed;
  requireFinite(nextTime, 'Advanced playback cursor');
  const next = {
    ...cursor,
    elapsedSeconds: cursor.loop ? nextTime : Math.min(cursor.clip.duration, nextTime),
  };
  validateCursor(next);
  return next;
}

function collectMarkers(previous: ClipCursor, next: ClipCursor, includeZero: boolean): PlaybackMarkerEvent[] {
  const { clip } = previous;
  const events: PlaybackMarkerEvent[] = [];
  const append = (marker: Clip['markers'][number], index: number, elapsedSeconds: number) => {
    if (events.length >= MAX_MARKER_EVENTS_PER_UPDATE) {
      throw new RangeError(`An update may emit at most ${MAX_MARKER_EVENTS_PER_UPDATE} marker events.`);
    }
    requireFinite(elapsedSeconds, 'Marker crossing time');
    events.push({ clipId: clip.id, marker: structuredClone(marker), loopIndex: index, elapsedSeconds });
  };

  if (includeZero) {
    for (const marker of clip.markers) {
      if (marker.time === 0) append(marker, 0, 0);
    }
  }
  if (clip.markers.length === 0 || next.elapsedSeconds <= previous.elapsedSeconds) return events;
  if (!previous.loop) {
    for (const marker of clip.markers) {
      if (marker.time > previous.elapsedSeconds && marker.time <= next.elapsedSeconds) append(marker, 0, marker.time);
    }
    return events;
  }

  const firstCycle = loopIndex(previous);
  const lastCycle = loopIndex(next);
  const completeCycles = Math.max(0, lastCycle - firstCycle - 1);
  if (completeCycles > Math.floor((MAX_MARKER_EVENTS_PER_UPDATE - events.length) / clip.markers.length)) {
    throw new RangeError(`An update may emit at most ${MAX_MARKER_EVENTS_PER_UPDATE} marker events.`);
  }
  for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
    const start = loopCrossingTime(cycle, 0, clip.duration);
    const end = loopCrossingTime(cycle, clip.duration, clip.duration);
    for (const marker of clip.markers) {
      const elapsedSeconds = loopCrossingTime(cycle, marker.time, clip.duration);
      const crosses = elapsedSeconds > previous.elapsedSeconds && elapsedSeconds <= next.elapsedSeconds;
      if (marker.time > 0 && marker.time < clip.duration &&
          (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= start || elapsedSeconds >= end)) {
        const afterPrevious = cycle > firstCycle || (Number.isFinite(start)
          ? marker.time > previous.elapsedSeconds - start
          : clip.duration - marker.time < end - previous.elapsedSeconds);
        const beforeNext = cycle < lastCycle || (Number.isFinite(start)
          ? marker.time <= next.elapsedSeconds - start
          : clip.duration - marker.time >= end - next.elapsedSeconds);
        if (crosses || (afterPrevious && beforeNext)) {
          throw new RangeError('Interior marker crossing cannot be represented within its loop.');
        }
      }
      if (crosses) append(marker, cycle, elapsedSeconds);
    }
  }
  return events;
}

export function createPlaybackController(evaluator: RigEvaluator): PlaybackController {
  let status: PlaybackStatus = 'stopped';
  let selected: ClipCursor | null = null;
  let fade: Fade | null = null;
  let speed = 1;
  let pendingZeroMarkers = false;
  let pose = evaluator.setupPose();

  const sample = (cursor: ClipCursor) => evaluator.sample(cursor.clip.id, cursor.elapsedSeconds, { loop: cursor.loop });
  const progress = () => fade ? fade.elapsedSeconds / fade.duration : 1;

  return {
    play(clipId: string, options: PlayOptions = {}): void {
      if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Play options must be an object.');
      if (options.loop !== undefined && typeof options.loop !== 'boolean') throw new TypeError('Loop must be a boolean.');
      const duration = options.crossfadeSeconds === undefined ? 0 : options.crossfadeSeconds;
      requireNonnegative(duration, 'Crossfade duration');
      const clip = evaluator.getClip(clipId);
      const next: ClipCursor = { clip, elapsedSeconds: 0, loop: options.loop ?? clip.loop };
      validateCursor(next);
      const destination = sample(next);
      let nextFade: Fade | null = null;
      let nextPose = destination;
      if (duration > 0) {
        const source: FadeSource = fade || !selected
          ? { kind: 'pose', pose: structuredClone(pose) }
          : { kind: 'clip', cursor: selected };
        nextFade = { source, elapsedSeconds: 0, duration };
        nextPose = evaluator.blend(pose, destination, 0);
      }
      selected = next;
      fade = nextFade;
      pose = nextPose;
      status = 'playing';
      pendingZeroMarkers = true;
    },

    update(deltaSeconds: number): PlaybackMarkerEvent[] {
      requireNonnegative(deltaSeconds, 'Elapsed time');
      if (status !== 'playing' || !selected || deltaSeconds === 0 || speed === 0) return [];
      const elapsed = deltaSeconds * speed;
      requireFinite(elapsed, 'Scaled elapsed time');
      if (elapsed === 0) return [];
      const next = advanceCursor(selected, elapsed);
      let nextFade: Fade | null = null;
      if (fade) {
        const fadeTime = fade.elapsedSeconds + elapsed;
        requireFinite(fadeTime, 'Advanced crossfade time');
        if (fadeTime < fade.duration) {
          const source: FadeSource = fade.source.kind === 'clip'
            ? { kind: 'clip', cursor: advanceCursor(fade.source.cursor, elapsed) }
            : fade.source;
          nextFade = { ...fade, source, elapsedSeconds: fadeTime };
        }
      }
      const events = collectMarkers(selected, next, pendingZeroMarkers);
      let nextPose = sample(next);
      if (nextFade) {
        const source = nextFade.source.kind === 'clip' ? sample(nextFade.source.cursor) : nextFade.source.pose;
        nextPose = evaluator.blend(source, nextPose, nextFade.elapsedSeconds / nextFade.duration);
      }
      const nextStatus = !next.loop && next.elapsedSeconds >= next.clip.duration && !nextFade ? 'completed' : 'playing';
      selected = next;
      fade = nextFade;
      pose = nextPose;
      status = nextStatus;
      pendingZeroMarkers = false;
      return events;
    },

    seek(timeSeconds: number): void {
      requireFinite(timeSeconds, 'Seek time');
      if (!selected) throw new Error('Select a clip before seeking.');
      const elapsedSeconds = selected.loop
        ? (timeSeconds === 0 ? 0 : timeSeconds)
        : normalizeClipTime(timeSeconds, selected.clip.duration, false);
      const next: ClipCursor = { ...selected, elapsedSeconds };
      validateCursor(next);
      const nextPose = sample(next);
      const nextStatus = status === 'completed' && elapsedSeconds < next.clip.duration ? 'paused' : status;
      selected = next;
      fade = null;
      pose = nextPose;
      status = nextStatus;
      pendingZeroMarkers = false;
    },

    pause(): void {
      if (status === 'playing') status = 'paused';
    },

    resume(): void {
      if (status === 'paused') status = 'playing';
    },

    stop(): void {
      const setup = evaluator.setupPose();
      selected = null;
      fade = null;
      pose = setup;
      status = 'stopped';
      pendingZeroMarkers = false;
    },

    setSpeed(value: number): void {
      requireNonnegative(value, 'Playback speed');
      speed = value;
    },

    getState(): PlaybackState {
      return {
        status,
        clipId: selected?.clip.id ?? null,
        timeSeconds: selected ? normalizeClipTime(selected.elapsedSeconds, selected.clip.duration, selected.loop) : 0,
        elapsedSeconds: selected?.elapsedSeconds ?? 0,
        loop: selected?.loop ?? false,
        speed,
        mixProgress: progress(),
      };
    },

    getPose(): EvaluatedPose {
      return structuredClone(pose);
    },
  };
}
