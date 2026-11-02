import { describe, expect, it } from 'vitest';
import type { MeshAttachment, RuntimeDocument } from '@studio/schema';
import { createPriestProjectFixture, createPriestRuntimeFixture } from '@studio/test-fixtures';
import { createGeometryEvaluator, createRigEvaluator } from './index';
import type { EvaluatedPose, GeometryEvaluator, RigGeometryFrame } from './types';
import { bone, testDocument, transform } from './test-data';

function geometryDocument(): RuntimeDocument {
  const document = testDocument();
  document.clips = [];
  document.assets[0]!.width = 4;
  document.assets[0]!.height = 6;
  const mesh: MeshAttachment = {
    type: 'mesh', id: 'mesh', name: 'Mesh', assetId: 'pixel', opacity: 0.75,
    vertices: [
      { x: 10, y: 20, u: 0, v: 0, influences: [{ boneId: 'root', weight: 1 }] },
      { x: 14, y: 20, u: 1, v: 0, influences: [{ boneId: 'root', weight: 1 }] },
      { x: 10, y: 24, u: 0, v: 1, influences: [{ boneId: 'root', weight: 1 }] },
    ],
    triangles: [0, 1, 2],
  };
  const region = document.rigs[0]!.attachments[0]!;
  if (region.type !== 'region') throw new Error('Expected a region fixture.');
  region.pivot = { x: 1, y: 2 };
  region.transform = transform({ x: 3, y: 4, rotation: Math.PI / 2, scaleX: 2 });
  document.rigs[0]!.attachments = [mesh, region];
  document.rigs[0]!.drawOrder = ['front', 'mesh'];
  return document;
}

function meshOf(document: RuntimeDocument): MeshAttachment {
  const mesh = document.rigs[0]!.attachments.find((attachment) => attachment.type === 'mesh');
  if (!mesh) throw new Error('Expected a mesh fixture.');
  return mesh;
}

function expectPositions(actual: Float32Array, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index++) expect(actual[index]).toBeCloseTo(expected[index]!, 4);
}

function expectAtomicFailure(geometry: GeometryEvaluator, pose: EvaluatedPose, output: RigGeometryFrame): void {
  const before = structuredClone(output);
  expect(() => geometry.write(pose, output)).toThrow();
  expect(output).toEqual(before);
}

describe('weighted geometry', () => {
  it('reproduces bind vertices, UVs, triangle indices and independent flat draw order', () => {
    const document = geometryDocument();
    const evaluator = createGeometryEvaluator(document, 'rig');
    const output = evaluator.createOutput();
    evaluator.write(createRigEvaluator(document, 'rig').setupPose(), output);
    expect(output.rigId).toBe('rig');
    expect(output.attachments.map(({ id }) => id)).toEqual(['mesh', 'front']);
    expect(output.drawOrder).toEqual(['front', 'mesh']);
    expect(output.attachments[0]).toMatchObject({ id: 'mesh', type: 'mesh', assetId: 'pixel', opacity: 0.75 });
    expectPositions(output.attachments[0]!.positions, [10, 20, 14, 20, 10, 24]);
    expect([...output.attachments[0]!.uvs]).toEqual([0, 0, 1, 0, 0, 1]);
    expect([...output.attachments[0]!.indices]).toEqual([0, 1, 2]);
  });

  it('moves a single-influence mesh once, without double-applying its bone transform', () => {
    const document = geometryDocument();
    const poses = createRigEvaluator(document, 'rig');
    const evaluator = createGeometryEvaluator(document, 'rig');
    const pose = poses.setupPose();
    bone(pose).world.tx += 5;
    const output = evaluator.createOutput();
    evaluator.write(pose, output);
    expectPositions(output.attachments[0]!.positions, [15, 20, 19, 20, 15, 24]);
  });

  it('blends two bone deltas by their weights in rig space', () => {
    const document = geometryDocument();
    meshOf(document).vertices[0]!.influences = [{ boneId: 'root', weight: 0.25 }, { boneId: 'child', weight: 0.75 }];
    const evaluator = createGeometryEvaluator(document, 'rig');
    const pose = createRigEvaluator(document, 'rig').setupPose();
    bone(pose, 'child').world.tx += 4;
    const output = evaluator.createOutput();
    evaluator.write(pose, output);
    expectPositions(output.attachments[0]!.positions, [13, 20, 14, 20, 10, 24]);
  });

  it('supports four influences and leaves validated weights unnormalized', () => {
    const document = geometryDocument();
    document.rigs[0]!.bones.push({ id: 'fourth', name: 'Fourth', parentId: null, setup: transform() });
    meshOf(document).vertices[0]!.influences = [
      { boneId: 'root', weight: 0.1 }, { boneId: 'child', weight: 0.2 },
      { boneId: 'tip', weight: 0.3 }, { boneId: 'fourth', weight: 0.4 },
    ];
    const evaluator = createGeometryEvaluator(document, 'rig');
    const pose = createRigEvaluator(document, 'rig').setupPose();
    for (const [id, delta] of [['root', 0], ['child', 4], ['tip', 8], ['fourth', 12]] as const) bone(pose, id).world.tx += delta;
    const output = evaluator.createOutput();
    evaluator.write(pose, output);
    expect(output.attachments[0]!.positions[0]).toBeCloseTo(18);

    meshOf(document).vertices[0]!.influences = [{ boneId: 'root', weight: 1 - 5e-7 }];
    const unnormalized = createGeometryEvaluator(document, 'rig').createOutput();
    expect(unnormalized.attachments[0]!.positions[0]).toBe(Math.fround(10 * (1 - 5e-7)));
  });

  it('preserves bind identity with unordered, mirrored, nonuniform and sheared hierarchy transforms', () => {
    const document = geometryDocument();
    const rig = document.rigs[0]!;
    rig.bones[0]!.setup = transform({ x: 10, y: 20, rotation: Math.PI / 2, scaleX: 2, scaleY: 3 });
    rig.bones[1]!.setup = transform({ x: 4, y: 5, rotation: Math.PI / 4, scaleX: -1, scaleY: 2 });
    meshOf(document).vertices[0]!.influences = [{ boneId: 'child', weight: 0.4 }, { boneId: 'tip', weight: 0.6 }];
    meshOf(document).vertices[1]!.influences = [{ boneId: 'child', weight: 1 }];
    meshOf(document).vertices[2]!.influences = [{ boneId: 'tip', weight: 1 }];
    rig.bones.reverse();
    const evaluator = createGeometryEvaluator(document, 'rig');
    const output = evaluator.createOutput();
    evaluator.write(createRigEvaluator(document, 'rig').setupPose(), output);
    expectPositions(output.attachments[0]!.positions, [10, 20, 14, 20, 10, 24]);
  });

  it('permits a singular animated transform without requiring a current inverse', () => {
    const document = geometryDocument();
    const poses = createRigEvaluator(document, 'rig');
    const pose = poses.setupPose();
    bone(pose).local.scaleX = 0;
    const collapsed = poses.blend(pose, pose, 0);
    const evaluator = createGeometryEvaluator(document, 'rig');
    const output = evaluator.createOutput();
    evaluator.write(collapsed, output);
    expectPositions(output.attachments[0]!.positions, [10, 20, 10, 20, 10, 24]);
  });

  it('applies pixel pivots and attachment-local transforms before the current bone transform', () => {
    const document = geometryDocument();
    const evaluator = createGeometryEvaluator(document, 'rig');
    const output = evaluator.createOutput();
    evaluator.write(createRigEvaluator(document, 'rig').setupPose(), output);
    const region = output.attachments[1]!;
    expectPositions(region.positions, [17, 25, 17, 33, 11, 33, 11, 25]);
    expect([...region.uvs]).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect([...region.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  });
});

describe('geometry buffers and failure atomicity', () => {
  it('reuses every frame buffer while keeping independently created outputs and input data isolated', () => {
    const document = geometryDocument();
    const poses = createRigEvaluator(document, 'rig');
    const evaluator = createGeometryEvaluator(document, 'rig');
    const first = evaluator.createOutput();
    const second = evaluator.createOutput();
    const beforeSecond = structuredClone(second);
    const buffers = first.attachments.map((attachment) => ({ positions: attachment.positions, uvs: attachment.uvs, indices: attachment.indices }));
    const pose = poses.setupPose();
    bone(pose).world.tx += 5;
    pose.attachments[0]!.opacity = 0.1;
    const beforePose = structuredClone(pose);
    meshOf(document).vertices[0]!.x = 999;
    meshOf(document).vertices[0]!.influences[0]!.weight = 0;
    for (let iteration = 0; iteration < 20; iteration++) evaluator.write(pose, first);
    expect(first.attachments[0]!.positions[0]).toBe(15);
    expect(first.attachments[0]!.opacity).toBe(0.1);
    first.attachments.forEach((attachment, index) => {
      expect(attachment.positions).toBe(buffers[index]!.positions);
      expect(attachment.uvs).toBe(buffers[index]!.uvs);
      expect(attachment.indices).toBe(buffers[index]!.indices);
      expect(attachment.positions).not.toBe(second.attachments[index]!.positions);
      expect(attachment.uvs).not.toBe(second.attachments[index]!.uvs);
      expect(attachment.indices).not.toBe(second.attachments[index]!.indices);
    });
    expect(second).toEqual(beforeSecond);
    expect(pose).toEqual(beforePose);
    expect(evaluator.createOutput()).toEqual(beforeSecond);
  });

  it.each([
    (pose: EvaluatedPose) => { pose.rigId = 'other'; },
    (pose: EvaluatedPose) => { pose.bones.pop(); },
    (pose: EvaluatedPose) => { delete pose.bones[0]; },
    (pose: EvaluatedPose) => { pose.bones[0]!.id = 'other'; },
    (pose: EvaluatedPose) => { pose.bones[0]!.world.a = NaN; },
    (pose: EvaluatedPose) => { Object.assign(pose.bones[0]!.world, { a: '1' }); },
    (pose: EvaluatedPose) => { pose.attachments[0]!.id = 'other'; },
    (pose: EvaluatedPose) => { delete pose.attachments[0]; },
    (pose: EvaluatedPose) => { pose.attachments[0]!.opacity = 1.1; },
    (pose: EvaluatedPose) => { pose.drawOrder.reverse(); },
  ])('rejects invalid poses before modifying any output', (mutate) => {
    const document = geometryDocument();
    const evaluator = createGeometryEvaluator(document, 'rig');
    const output = evaluator.createOutput();
    const pose = createRigEvaluator(document, 'rig').setupPose();
    mutate(pose);
    expectAtomicFailure(evaluator, pose, output);
  });

  it('does not commit earlier attachments when a later attachment exceeds Float32 range', () => {
    const document = geometryDocument();
    const evaluator = createGeometryEvaluator(document, 'rig');
    const output = evaluator.createOutput();
    const pose = createRigEvaluator(document, 'rig').setupPose();
    bone(pose).world.tx += 5;
    bone(pose, 'child').world.tx = 1e39;
    pose.attachments[0]!.opacity = 0.1;
    expectAtomicFailure(evaluator, pose, output);
    evaluator.write(createRigEvaluator(document, 'rig').setupPose(), output);
    expectPositions(output.attachments[0]!.positions, [10, 20, 14, 20, 10, 24]);
  });

  it('accepts only original outputs from this evaluator and rejects changed buffer identities', () => {
    const document = geometryDocument();
    const evaluator = createGeometryEvaluator(document, 'rig');
    const pose = createRigEvaluator(document, 'rig').setupPose();
    expectAtomicFailure(evaluator, pose, createGeometryEvaluator(document, 'rig').createOutput());
    expectAtomicFailure(evaluator, pose, structuredClone(evaluator.createOutput()));
    const output = evaluator.createOutput();
    Object.assign(output.attachments[0]!, { positions: new Float32Array(6) });
    expectAtomicFailure(evaluator, pose, output);
  });

  it('rejects unwritable opacity before any buffer commit', () => {
    const document = geometryDocument();
    const evaluator = createGeometryEvaluator(document, 'rig');
    const pose = createRigEvaluator(document, 'rig').setupPose();
    bone(pose).world.tx += 5;
    const output = evaluator.createOutput();
    Object.freeze(output.attachments[1]);
    expectAtomicFailure(evaluator, pose, output);
  });

  it('rejects a detached output buffer without changing other attachments', () => {
    const document = geometryDocument();
    const evaluator = createGeometryEvaluator(document, 'rig');
    const pose = createRigEvaluator(document, 'rig').setupPose();
    const output = evaluator.createOutput();
    const before = structuredClone(output.attachments[1]);
    structuredClone(null, { transfer: [output.attachments[0]!.positions.buffer as ArrayBuffer] });
    expect(() => evaluator.write(pose, output)).toThrow();
    expect(output.attachments[1]).toEqual(before);
  });
});

describe('geometry revision validation and data equivalence', () => {
  it('rejects invalid documents, missing rigs and unrepresentable setup inverses', () => {
    expect(() => createGeometryEvaluator({}, 'rig')).toThrow();
    expect(() => createGeometryEvaluator(geometryDocument(), 'missing')).toThrow(/rig/i);
    const document = geometryDocument();
    document.rigs[0]!.bones[0]!.setup.scaleX = Number.MIN_VALUE;
    expect(() => createGeometryEvaluator(document, 'rig')).toThrow(/inverse|finite|singular/i);
  });

  it.each([1e-200, 1e200])('handles representable inverse binds when direct determinants underflow/overflow: %s', (scale) => {
    const document = geometryDocument();
    document.rigs[0]!.attachments = [meshOf(document)];
    document.rigs[0]!.drawOrder = ['mesh'];
    document.rigs[0]!.bones[0]!.setup.scaleX = scale;
    document.rigs[0]!.bones[0]!.setup.scaleY = scale;
    expectPositions(createGeometryEvaluator(document, 'rig').createOutput().attachments[0]!.positions, [10, 20, 14, 20, 10, 24]);
  });

  it.each([
    { scaleX: 1e308, scaleY: 0.1 },
    { scaleX: 0.1, scaleY: 1e308 },
  ])('retains representable inverses across very different axis magnitudes: $scaleX/$scaleY', ({ scaleX, scaleY }) => {
    const document = geometryDocument();
    const rig = document.rigs[0]!;
    rig.attachments = [meshOf(document)];
    rig.drawOrder = ['mesh'];
    rig.bones = [{ ...rig.bones[0]!, setup: transform({ x: 10, y: 20, scaleX, scaleY }) }];
    expectPositions(createGeometryEvaluator(document, 'rig').createOutput().attachments[0]!.positions, [10, 20, 14, 20, 10, 24]);
  });

  it('produces the same evaluated geometry from serialized project/runtime priest data', () => {
    const project = JSON.parse(JSON.stringify(createPriestProjectFixture())) as unknown;
    const runtime = JSON.parse(JSON.stringify(createPriestRuntimeFixture())) as unknown;
    const projectPoses = createRigEvaluator(project, 'rig-priest');
    const runtimePoses = createRigEvaluator(runtime, 'rig-priest');
    const projectGeometry = createGeometryEvaluator(project, 'rig-priest');
    const runtimeGeometry = createGeometryEvaluator(runtime, 'rig-priest');
    const projectOutput = projectGeometry.createOutput();
    const runtimeOutput = runtimeGeometry.createOutput();
    for (const clip of createPriestProjectFixture().clips) {
      for (const time of [0, clip.duration / 4, clip.duration / 2, clip.duration]) {
        projectGeometry.write(projectPoses.sample(clip.id, time, { loop: false }), projectOutput);
        runtimeGeometry.write(runtimePoses.sample(clip.id, time, { loop: false }), runtimeOutput);
        expect(projectOutput).toEqual(runtimeOutput);
      }
    }
  });
});
