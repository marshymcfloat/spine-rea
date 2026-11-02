# Shared evaluation and playback contract

Decision date: 2026-11-02. Data shapes: [FORMATS.md](FORMATS.md).
`@studio/animation-core` owns these rules for both editor and standalone hosts.
It uses schema data and math, with no renderer, DOM, filesystem or wall clock.
Shared CPU geometry and fixture rendering use [MESHES.md](MESHES.md).
Export compilation remains a separate task.

```ts
import { createRigEvaluator, createPlaybackController } from '@studio/animation-core';

const evaluator = createRigEvaluator(document, 'rig-priest');
const player = createPlaybackController(evaluator);
player.play('clip-idle');
const markers = player.update(1 / 60);
const pose = player.getPose();
```

Here `document` is already-parsed project/runtime data; the host consumes the pose
and marker records. These functions do not create a canvas or start a ticker.

## Evaluator

`createRigEvaluator(document, rigId)` validates a project or runtime document and
captures an independent snapshot of the selected rig and its clips. IDs are exact;
names are labels. Missing rig/clip IDs fail clearly. Source edits require a new evaluator.

The evaluator exposes `setupPose()`, `sample(clipId, timeSeconds, { loop? })`,
`blend(from, to, alpha)` and `getClip(clipId)`. Returned clips and poses are independent
data; caller mutation cannot change later evaluations. `blend` requires matching rig,
bone and attachment identities, finite local values and opacity, and alpha in `[0, 1]`.
It recomputes world matrices rather than trusting supplied world matrices.

Poses contain `rigId`, bone records `{ id, local, world }`, attachment records
`{ id, opacity }`, and an independent flat `drawOrder`. Bone/attachment arrays retain
their source order; evaluation resolves parents first even when the source is unordered.
Mesh positions are written separately by `createGeometryEvaluator`, using this pose.

For each local transform use translation × rotation × scale:

```text
a = cos(rotation) * scaleX    c = -sin(rotation) * scaleY    tx = x
b = sin(rotation) * scaleX    d =  cos(rotation) * scaleY    ty = y
x' = a*x + c*y + tx           y' = b*x + d*y + ty
world = parentWorld * local  (root world = local)
```

Positive rotations appear clockwise in the Y-down coordinate system. Compose full
affine matrices so nonuniform/mirrored parents preserve shear. Animated zero scales
are valid. Nonfinite derived arithmetic fails rather than returning unusable poses.

## Sampling and mixing

- All time values must be finite seconds. A nonlooping sample clamps to `[0, duration]`.
- A looping sample uses Euclidean modulo in `[0, duration)`, including negative seeks.
  Canonical multiples computed as `cycle * duration` sample time zero, including
  decimal periods whose floating-point division/remainder lands just below a boundary.
  There is no implicit end-to-start interpolation. Canonical `cycle * duration + keyTime`
  crossings select the exact key value (negative cycles use equivalent stable arithmetic).
- Missing channels retain setup values. Before the first key hold its value; after
  the final key hold its value. An exact key time uses that key's value.
- The left key's easing controls the segment to the next key: linear interpolation,
  hold until the next key, or cubic Bézier. Bézier sampling solves the curve's X
  coordinate for normalized segment time, then evaluates Y; control values are not
  interpreted as polynomial coefficients applied directly to time.
- Blend complete local X/Y/rotation/scales and attachment opacity linearly, then
  recompute hierarchy matrices. Rotation is an unwrapped scalar, including intentional
  full turns; no shortest-angle conversion or matrix decomposition occurs.

## Host-controlled player

`createPlaybackController(evaluator)` provides `play`, `update`, `seek`, `pause`,
`resume`, `stop`, `setSpeed`, `getState` and `getPose`. `update(deltaSeconds)` returns
ordered marker records; the host dispatches callbacks and owns the only ticker.
State/pose/event snapshots cannot mutate the controller's future behavior.

| Operation | Behavior |
| --- | --- |
| Initial state | Stopped, no selected clip, setup pose, speed 1. |
| `play(id, { loop?, crossfadeSeconds? })` | Restart the selected clip at zero and enter Playing. Loop defaults to clip data; fade defaults to zero. Invalid options/IDs leave state unchanged. |
| `update(dt)` | Require finite nonnegative elapsed seconds. Advance clip and fade clocks by `dt * speed` only while Playing. No clock is read internally. |
| `pause()` / `resume()` | Freeze/resume clip and fade. Both have no effect on Stopped or Completed. |
| `setSpeed(value)` | Require finite nonnegative speed. Zero freezes clip, fade and marker eligibility. |
| `seek(t)` | Require a selected clip and finite time; cancel any fade and sample destination directly. Looping cursors retain unwrapped time; nonlooping cursors clamp. Never emit markers. Preserve Playing/Paused; seeking a Completed clip before its end makes it Paused. |
| `stop()` | Clear selected clip/fade and restore setup pose. Retain configured speed. |
| One-shot end | Hold the final pose. Enter Completed after the clip ends and any fade finishes. |

An ordinary crossfade advances both source and destination clips. Fade progress uses
the same scaled clock as playback. If interrupted, snapshot the current mixed local
pose as a frozen source for the new fade, avoiding a jump or recursive transition
graph. A fade from Stopped uses setup as its source. A source one-shot holds at its
end. A destination ending before its fade holds there while the fade completes.
Pause and speed zero freeze both clocks.

`getState()` returns status, selected clip ID, normalized `timeSeconds`, unwrapped
`elapsedSeconds` (clamped for a one-shot), loop flag, speed and `mixProgress` (one when no fade is active).
`getPose()` returns the current evaluated data.

## Marker crossings

Only the selected destination clip emits markers during a fade. `play` itself is
silent; its first positive effective update includes markers at zero before later
crossings. Zero-duration updates, speed zero and pause do not consume that eligibility.
Seeking cancels it; starting playback again creates it again.

Subsequent forward updates emit every crossing in `(oldElapsed, newElapsed]`.
Loop boundaries emit the previous cycle's duration markers, then the next cycle's
zero markers, exactly once. Tied markers retain their stored order. Multi-loop
updates retain all crossings. Nonlooping end markers emit once, and reverse seeks
are always silent. Marker data never decides game outcomes.

Crossings use canonical absolute timestamps, rather than comparing remainder phases;
this preserves decimal-period boundaries and avoids tiny marker/duration division underflow.

Each event is `{ clipId, marker, loopIndex, elapsedSeconds }`; `marker` retains its
ID/name/local time/data, and `elapsedSeconds` is its crossing on the unwrapped clock.
Loop indices may be negative after a seek. Nonlooping events use loop index zero.

Updates producing more than 10,000 marker events fail with `RangeError` before any
playback state changes. Hosts can split large advances. Marker-free clips do not
enumerate cycles. Nonfinite derived clocks, unsafe loop counters or unrepresentable
crossing timestamps also fail without partial advancement. No crossings are silently dropped.

## Evidence boundaries

Deterministic tests must cover nested/mirrored transforms, curves, unkeyed channels,
mixing, interrupted fades, silent seeking, loop/end/start markers and failed-update
atomicity. Sampling the authoring and runtime fixtures after JSON serialization must
produce matching bones and opacity. Shared geometry tests also compare skinned
vertices between these fixture documents. This is data/evaluation equivalence;
compiler/export parity remains a later acceptance gate.

The browser-boundary integration test builds the public entry as a self-contained
browser bundle and exercises evaluation, crossfades and markers in an isolated host
without DOM/Node globals or dynamic code generation. This checks the pure package's
consumption boundary; it does not render geometry or test the desktop authoring UI.
