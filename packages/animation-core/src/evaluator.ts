import {
  PROJECT_FORMAT, parseProjectDocument, parseRuntimeDocument,
  type Clip, type Transform,
} from '@studio/schema';
import { compose, interpolate, localMatrix, requireFinite } from './math';
import { getLoopCycle, normalizeClipTime, sampleKeys } from './sampling';
import type { AffineMatrix, EvaluatedPose, RigEvaluator } from './types';

const channels = ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const;

export function createRigEvaluator(input: unknown, rigId: string): RigEvaluator {
  const project = input !== null && typeof input === 'object' &&
    'format' in input && input.format === PROJECT_FORMAT;
  const document = structuredClone(project ? parseProjectDocument(input) : parseRuntimeDocument(input));
  const selectedRig = document.rigs.find((item) => item.id === rigId);
  if (!selectedRig) throw new Error(`Rig not found: ${rigId}.`);
  const rig = selectedRig;
  const clips = new Map(document.clips.filter((clip) => clip.rigId === rigId).map((clip) => [clip.id, clip]));
  const boneIndices = new Map(rig.bones.map((bone, index) => [bone.id, index]));
  const attachmentIndices = new Map(rig.attachments.map((attachment, index) => [attachment.id, index]));
  const parents = rig.bones.map((bone) => bone.parentId === null ? -1 : boneIndices.get(bone.parentId)!);
  const children: number[][] = rig.bones.map(() => []);
  const order: number[] = [];
  parents.forEach((parent, index) => {
    if (parent === -1) order.push(index);
    else children[parent]!.push(index);
  });
  for (let cursor = 0; cursor < order.length; cursor++) {
    for (const child of children[order[cursor]!]!) order.push(child);
  }

  function getClip(clipId: string): Clip {
    const clip = clips.get(clipId);
    if (!clip) throw new Error(`Clip not found in rig ${rigId}: ${clipId}.`);
    return clip;
  }

  function assemble(locals: Transform[], opacities: number[]): EvaluatedPose {
    const worlds: AffineMatrix[] = new Array(rig.bones.length);
    for (const index of order) {
      try {
        const matrix = localMatrix(locals[index]!);
        worlds[index] = parents[index] === -1 ? matrix : compose(worlds[parents[index]!]!, matrix);
      } catch (error) {
        throw new RangeError(`Bone ${rig.bones[index]!.id} cannot be evaluated: ${String(error)}`);
      }
    }
    return {
      rigId,
      bones: rig.bones.map((bone, index) => ({ id: bone.id, local: locals[index]!, world: worlds[index]! })),
      attachments: rig.attachments.map((attachment, index) => ({ id: attachment.id, opacity: opacities[index]! })),
      drawOrder: [...rig.drawOrder],
    };
  }

  function setupPose(): EvaluatedPose {
    return assemble(rig.bones.map((bone) => ({ ...bone.setup })), rig.attachments.map((attachment) => attachment.opacity));
  }

  function sample(clipId: string, timeSeconds: number, options: { loop?: boolean } = {}): EvaluatedPose {
    const clip = getClip(clipId);
    if (options.loop !== undefined && typeof options.loop !== 'boolean') throw new TypeError('Loop must be boolean.');
    const loop = options.loop ?? clip.loop;
    const time = normalizeClipTime(timeSeconds, clip.duration, loop);
    const cycle = loop ? getLoopCycle(timeSeconds, clip.duration) : 0;
    const loopContext = loop && Number.isSafeInteger(cycle) ? { elapsedSeconds: timeSeconds, cycle, duration: clip.duration } : undefined;
    const locals = rig.bones.map((bone) => ({ ...bone.setup }));
    const opacities = rig.attachments.map((attachment) => attachment.opacity);
    for (const track of clip.tracks) {
      const value = sampleKeys(track.keys, time, loopContext);
      if (track.kind === 'bone') locals[boneIndices.get(track.boneId)!]![track.channel] = value;
      else opacities[attachmentIndices.get(track.attachmentId)!] = value;
    }
    return assemble(locals, opacities);
  }

  function checkPose(pose: EvaluatedPose, label: string): void {
    if (!pose || pose.rigId !== rigId || !Array.isArray(pose.bones) || !Array.isArray(pose.attachments) ||
      pose.bones.length !== rig.bones.length || pose.attachments.length !== rig.attachments.length) {
      throw new TypeError(`${label} must match rig ${rigId}.`);
    }
    for (let index = 0; index < rig.bones.length; index++) {
      const bone = pose.bones[index];
      if (!bone || bone.id !== rig.bones[index]!.id || !bone.local) throw new TypeError(`${label} has mismatched bone identities.`);
      for (const channel of channels) requireFinite(bone.local[channel], `${label} bone ${bone.id}.${channel}`);
    }
    for (let index = 0; index < rig.attachments.length; index++) {
      const attachment = pose.attachments[index];
      if (!attachment || attachment.id !== rig.attachments[index]!.id) throw new TypeError(`${label} has mismatched attachment identities.`);
      requireFinite(attachment.opacity, `${label} attachment ${attachment.id}.opacity`);
      if (attachment.opacity < 0 || attachment.opacity > 1) throw new RangeError(`${label} opacity must be in [0, 1].`);
    }
  }

  function blend(from: EvaluatedPose, to: EvaluatedPose, alpha: number): EvaluatedPose {
    requireFinite(alpha, 'Blend alpha');
    if (alpha < 0 || alpha > 1) throw new RangeError('Blend alpha must be in [0, 1].');
    checkPose(from, 'Source pose');
    checkPose(to, 'Destination pose');
    const locals = from.bones.map((bone, index) => {
      const local = { ...bone.local };
      for (const channel of channels) local[channel] = interpolate(bone.local[channel], to.bones[index]!.local[channel], alpha);
      return local;
    });
    const opacities = from.attachments.map((attachment, index) => interpolate(attachment.opacity, to.attachments[index]!.opacity, alpha));
    return assemble(locals, opacities);
  }

  setupPose();
  return Object.freeze({ rigId, getClip: (clipId: string) => structuredClone(getClip(clipId)), setupPose, sample, blend });
}
