import type { Easing, Keyframe } from '@studio/schema';
import { interpolate, requireFinite } from './math';

export function getLoopCycle(time: number, duration: number): number {
  const quotient = time / duration;
  const nearest = Math.round(quotient);
  if (Number.isSafeInteger(nearest) && nearest * duration === time) return nearest === 0 ? 0 : nearest;
  let cycle = Math.floor(quotient);
  if (Number.isSafeInteger(cycle)) {
    if (time < cycle * duration) cycle--;
    else if (time >= (cycle + 1) * duration) cycle++;
  }
  return cycle === 0 ? 0 : cycle;
}

export function loopCrossingTime(cycle: number, localTime: number, duration: number): number {
  if (localTime === 0) return cycle * duration;
  if (localTime === duration) return (cycle + 1) * duration;
  return cycle < 0
    ? (cycle + 1) * duration - (duration - localTime)
    : cycle * duration + localTime;
}

export function normalizeClipTime(timeSeconds: number, duration: number, loop: boolean): number {
  requireFinite(timeSeconds, 'Sample time');
  requireFinite(duration, 'Clip duration');
  if (duration <= 0) throw new RangeError('Clip duration must be positive.');
  if (!loop) return Math.min(duration, Math.max(0, timeSeconds));
  const cycle = getLoopCycle(timeSeconds, duration);
  if (Number.isSafeInteger(cycle) && cycle * duration === timeSeconds) return 0;
  const remainder = timeSeconds % duration;
  const result = remainder < 0 ? remainder + duration : remainder;
  return result === 0 || result === duration ? 0 : result;
}

function cubic(t: number, first: number, second: number): number {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
}

function progress(time: number, easing: Easing): number {
  if (easing.type === 'hold') return 0;
  if (easing.type === 'linear' || time === 0 || time === 1) return time;
  let lower = 0;
  let upper = 1;
  let parameter = time;
  for (let iteration = 0; iteration < 56; iteration++) {
    const x = cubic(parameter, easing.x1, easing.x2);
    if (x === time) break;
    if (x < time) lower = parameter;
    else upper = parameter;
    parameter = (lower + upper) / 2;
  }
  return Math.min(1, Math.max(0, cubic(parameter, easing.y1, easing.y2)));
}

export function sampleKeys(
  keys: readonly Keyframe[], time: number,
  loopContext?: { elapsedSeconds: number; cycle: number; duration: number },
): number {
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;
  let lower = 0;
  let upper = keys.length - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (keys[middle]!.time <= time) lower = middle;
    else upper = middle;
  }
  const left = keys[lower]!;
  const right = keys[upper]!;
  if (loopContext) {
    for (const key of [left, right]) {
      if (loopCrossingTime(loopContext.cycle, key.time, loopContext.duration) === loopContext.elapsedSeconds) return key.value;
    }
  }
  if (left.time === time) return left.value;
  const timeProgress = (time - left.time) / (right.time - left.time);
  return interpolate(left.value, right.value, progress(timeProgress, left.easing));
}
