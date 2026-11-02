import type { Clip, RuntimeDocument, Transform } from '@studio/schema';
import type { EvaluatedPose } from './types';

export const transform = (values: Partial<Transform> = {}): Transform => ({
  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...values,
});

export function linearClip(id: string, start: number, end: number, duration = 2, loop = true): Clip {
  return {
    id, name: id, rigId: 'rig', duration, loop,
    tracks: [{
      kind: 'bone', boneId: 'root', channel: 'x',
      keys: [
        { time: 0, value: start, easing: { type: 'linear' } },
        { time: duration, value: end, easing: { type: 'linear' } },
      ],
    }],
    markers: [],
  };
}

export function testDocument(): RuntimeDocument {
  const once = linearClip('once', 0, 10, 1, false);
  once.markers = [
    { id: 'start', name: 'Start', time: 0, data: { cue: ['zero'] } },
    { id: 'middle', name: 'Middle', time: 0.5 },
    { id: 'end', name: 'End', time: 1 },
  ];
  return {
    format: 'slotstudio-runtime', schemaVersion: 1,
    assets: [{ id: 'pixel', path: 'assets/pixel.png', width: 1, height: 1, mimeType: 'image/png' }],
    rigs: [{
      id: 'rig', name: 'Rig',
      bones: [
        { id: 'root', name: 'Root', parentId: null, setup: transform({ x: 10, y: 20 }) },
        { id: 'child', name: 'Child', parentId: 'root', setup: transform({ x: 2, y: 3 }) },
        { id: 'tip', name: 'Tip', parentId: 'child', setup: transform({ x: 1, y: -2 }) },
      ],
      attachments: [
        { type: 'region', id: 'front', name: 'Front', assetId: 'pixel', boneId: 'child', pivot: { x: 0, y: 0 }, transform: transform(), opacity: 0.8 },
        { type: 'region', id: 'back', name: 'Back', assetId: 'pixel', boneId: 'root', pivot: { x: 0, y: 0 }, transform: transform(), opacity: 0.2 },
      ],
      drawOrder: ['back', 'front'],
    }],
    clips: [linearClip('a', 0, 20), linearClip('b', 100, 120), linearClip('c', 200, 220), once],
  };
}

export function bone(pose: EvaluatedPose, id = 'root') {
  const result = pose.bones.find((item) => item.id === id);
  if (!result) throw new Error(`Expected bone ${id}.`);
  return result;
}

export const rootX = (pose: EvaluatedPose): number => bone(pose).local.x;
