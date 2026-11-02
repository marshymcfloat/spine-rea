import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { priestLayers } from './priest-shapes.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rigId = 'rig-priest';
const transform = (x = 0, y = 0, rotation = 0) => ({ x, y, rotation, scaleX: 1, scaleY: 1 });
const bone = (id, name, parentId, setup) => ({ id, name, parentId, setup });
const linear = { type: 'linear' };
const eased = { type: 'bezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
const boneTrack = (boneId, channel, values) => ({
  kind: 'bone', boneId, channel,
  keys: values.map(([time, value, easing = eased]) => ({ time, value, easing })),
});

const assets = priestLayers.map((layer) => ({
  id: `asset-priest-${layer.id}`,
  path: `assets/priest/${layer.id}.png`,
  width: layer.width,
  height: layer.height,
  mimeType: 'image/png',
}));

const bones = [
  bone('root', 'Root', null, transform(160, 180)),
  bone('torso', 'Torso', 'root', transform()),
  bone('head', 'Head', 'torso', transform(0, -6)),
  bone('upper-arm-right', 'Right upper arm', 'torso', transform(32, 12, 0.12)),
  bone('forearm-right', 'Right forearm', 'upper-arm-right', transform(0, 59)),
  bone('hand-right', 'Right hand', 'forearm-right', transform(0, 54)),
  bone('upper-arm-left', 'Left upper arm', 'torso', transform(-32, 12, -0.12)),
  bone('forearm-left', 'Left forearm', 'upper-arm-left', transform(0, 59)),
  bone('hand-left', 'Left hand', 'forearm-left', transform(0, 54)),
  bone('robe-top', 'Robe top', 'root', transform(0, 64)),
  bone('robe-mid', 'Robe middle', 'robe-top', transform(0, 80)),
  bone('robe-hem', 'Robe hem', 'robe-mid', transform(0, 80)),
];

const region = (id, name, pivot) => ({
  type: 'region', id, name, assetId: `asset-priest-${id}`, boneId: id,
  pivot, transform: transform(), opacity: 1,
});

const vertices = [];
const triangles = [];
for (let row = 0; row < 3; row++) {
  for (let column = 0; column < 3; column++) {
    const influences = row === 0
      ? [{ boneId: 'robe-top', weight: 1 }]
      : row === 1
        ? [{ boneId: 'robe-top', weight: 0.25 }, { boneId: 'robe-mid', weight: 0.75 }]
        : [{ boneId: 'robe-mid', weight: 0.25 }, { boneId: 'robe-hem', weight: 0.75 }];
    vertices.push({ x: 100 + column * 60, y: 244 + row * 80, u: column / 2, v: row / 2, influences });
    if (row < 2 && column < 2) {
      const topLeft = row * 3 + column;
      triangles.push(topLeft, topLeft + 1, topLeft + 3, topLeft + 1, topLeft + 4, topLeft + 3);
    }
  }
}

const rigs = [{
  id: rigId,
  name: 'Geometric priest',
  bones,
  attachments: [
    region('torso', 'Torso', { x: 40, y: 16 }),
    region('head', 'Head', { x: 32, y: 66 }),
    region('upper-arm-right', 'Front upper sleeve', { x: 16, y: 14 }),
    region('forearm-right', 'Front forearm', { x: 14, y: 11 }),
    region('hand-right', 'Front hand', { x: 12, y: 5 }),
    region('upper-arm-left', 'Rear upper sleeve', { x: 16, y: 14 }),
    region('forearm-left', 'Rear forearm', { x: 14, y: 11 }),
    region('hand-left', 'Rear hand', { x: 12, y: 5 }),
    { type: 'mesh', id: 'robe', name: 'Weighted robe', assetId: 'asset-priest-robe', opacity: 1, vertices, triangles },
  ],
  drawOrder: [
    'upper-arm-left', 'forearm-left', 'hand-left', 'robe', 'torso', 'head',
    'upper-arm-right', 'forearm-right', 'hand-right',
  ],
}];

// These are fixed format/playback test inputs, not final production animations.
const clips = [
  {
    id: 'clip-idle', name: 'priest_idle', rigId, duration: 2, loop: true,
    tracks: [
      boneTrack('torso', 'y', [[0, 0], [1, -2], [2, 0]]),
      boneTrack('head', 'rotation', [[0, 0], [1, 0.015], [2, 0]]),
      boneTrack('robe-mid', 'rotation', [[0, 0], [1, 0.025], [2, 0]]),
      boneTrack('robe-hem', 'rotation', [[0, 0], [1, -0.02], [2, 0]]),
    ],
    markers: [],
  },
  {
    id: 'clip-pray', name: 'priest_pray', rigId, duration: 1.2, loop: false,
    tracks: [
      boneTrack('upper-arm-right', 'rotation', [[0, 0.12], [0.6, 0.8, { type: 'hold' }], [1.2, 0.8]]),
      boneTrack('upper-arm-left', 'rotation', [[0, -0.12], [0.6, -0.8, { type: 'hold' }], [1.2, -0.8]]),
      boneTrack('forearm-right', 'rotation', [[0, 0], [0.6, 1], [1.2, 1]]),
      boneTrack('forearm-left', 'rotation', [[0, 0], [0.6, -1], [1.2, -1]]),
    ],
    markers: [{ id: 'marker-pray-hold', name: 'prayer_hold', time: 0.6, data: { phase: 'hold' } }],
  },
  {
    id: 'clip-kneel', name: 'priest_kneel', rigId, duration: 1.6, loop: false,
    tracks: [
      boneTrack('root', 'y', [[0, 180], [0.8, 250], [1.6, 180]]),
      boneTrack('torso', 'rotation', [[0, 0], [0.8, 0.12], [1.6, 0]]),
      boneTrack('robe-mid', 'rotation', [[0, 0], [0.8, -0.2], [1.6, 0]]),
    ],
    markers: [{ id: 'marker-kneel-low', name: 'kneel_low', time: 0.8 }],
  },
  {
    id: 'clip-praise', name: 'priest_praise', rigId, duration: 1.4, loop: false,
    tracks: [
      boneTrack('upper-arm-right', 'rotation', [[0, 0.12], [0.5, 2.2], [1.4, 0.12]]),
      boneTrack('upper-arm-left', 'rotation', [[0, -0.12], [0.5, -2.2], [1.4, -0.12]]),
    ],
    markers: [{ id: 'marker-praise-peak', name: 'praise_peak', time: 0.5, data: { cue: 'large-win' } }],
  },
  {
    id: 'clip-entity', name: 'priest_entity', rigId, duration: 1.8, loop: false,
    tracks: [
      boneTrack('root', 'x', [[0, 160, linear], [0.2, 156, linear], [0.4, 164, linear], [0.6, 160], [1.8, 160]]),
      boneTrack('torso', 'rotation', [[0, 0], [0.6, -0.08], [1.8, 0]]),
      {
        kind: 'attachment', attachmentId: 'robe', channel: 'opacity',
        keys: [0, 0.6, 1.8].map((time, index) => ({ time, value: index === 1 ? 0.85 : 1, easing: linear })),
      },
    ],
    markers: [{ id: 'marker-altar-cue', name: 'altar_cue', time: 0.6, data: { effectId: 'placeholder-altar' } }],
  },
];

const documents = {
  'fixtures/priest.project.json': {
    format: 'slotstudio-project', schemaVersion: 1, id: 'project-priest-fixture',
    name: 'Geometric priest technical fixture', canvas: { width: 320, height: 480 },
    assets, rigs, clips, editor: { activeRigId: rigId },
  },
  'fixtures/priest.runtime.json': { format: 'slotstudio-runtime', schemaVersion: 1, assets, rigs, clips },
};

const checkOnly = process.argv.includes('--check');
for (const [path, document] of Object.entries(documents)) {
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  const outputPath = resolve(packageRoot, path);
  if (checkOnly) {
    if (!readFileSync(outputPath).equals(bytes)) throw new Error(`Generated fixture differs: ${path}`);
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes);
  }
}
process.stdout.write(`${checkOnly ? 'Verified' : 'Generated'} 2 priest JSON documents.\n`);
