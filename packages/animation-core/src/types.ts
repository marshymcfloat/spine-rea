import type { Clip, Marker, Transform } from '@studio/schema';

/** x' = a*x + c*y + tx; y' = b*x + d*y + ty. */
export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export interface BonePose {
  id: string;
  local: Transform;
  world: AffineMatrix;
}

export interface AttachmentPose {
  id: string;
  opacity: number;
}

export interface EvaluatedPose {
  rigId: string;
  bones: BonePose[];
  attachments: AttachmentPose[];
  drawOrder: string[];
}

export interface RigEvaluator {
  readonly rigId: string;
  /** Returns independent data; mutating it does not change the evaluator. */
  getClip(clipId: string): Clip;
  setupPose(): EvaluatedPose;
  sample(clipId: string, timeSeconds: number, options?: { loop?: boolean }): EvaluatedPose;
  blend(from: EvaluatedPose, to: EvaluatedPose, alpha: number): EvaluatedPose;
}

export interface PlayOptions {
  loop?: boolean;
  crossfadeSeconds?: number;
}

export type PlaybackStatus = 'stopped' | 'playing' | 'paused' | 'completed';

export interface PlaybackState {
  status: PlaybackStatus;
  clipId: string | null;
  timeSeconds: number;
  elapsedSeconds: number;
  loop: boolean;
  speed: number;
  /** One when no transition is active. */
  mixProgress: number;
}

export interface PlaybackMarkerEvent {
  clipId: string;
  marker: Marker;
  /** Zero for a one-shot; loop cursors may be negative after a seek. */
  loopIndex: number;
  elapsedSeconds: number;
}

export interface PlaybackController {
  play(clipId: string, options?: PlayOptions): void;
  update(deltaSeconds: number): PlaybackMarkerEvent[];
  seek(timeSeconds: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  setSpeed(speed: number): void;
  getState(): PlaybackState;
  getPose(): EvaluatedPose;
}
