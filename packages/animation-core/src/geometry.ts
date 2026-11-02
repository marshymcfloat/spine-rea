import {
  PROJECT_FORMAT, parseProjectDocument, parseRuntimeDocument,
  type Asset, type Attachment,
} from '@studio/schema';
import { createRigEvaluator } from './evaluator';
import { localMatrix, requireFinite } from './math';
import type {
  AffineMatrix, AttachmentGeometry, EvaluatedPose, GeometryEvaluator, RigGeometryFrame,
} from './types';

interface CompiledAttachment {
  id: string;
  assetId: string;
  type: 'region' | 'mesh';
  opacity: number;
  offsets: Uint32Array;
  boneIndices: Uint32Array;
  weightedX: Float64Array;
  weightedY: Float64Array;
  weights: Float64Array;
  uvs: Float32Array;
  indices: Uint32Array;
  staged: Float32Array;
}

interface OwnedAttachment {
  attachment: AttachmentGeometry;
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

interface OwnedOutput {
  attachments: AttachmentGeometry[];
  drawOrder: string[];
  buffers: OwnedAttachment[];
}

const matrixComponents = ['a', 'b', 'c', 'd', 'tx', 'ty'] as const;

function inverseBind(matrix: AffineMatrix, boneId: string): AffineMatrix {
  const { a, b, c, d, tx, ty } = matrix;
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  const na = a / scale;
  const nb = b / scale;
  const nc = c / scale;
  const nd = d / scale;
  const normalizedDeterminant = na * nd - nb * nc;
  let ia = (nd / normalizedDeterminant) / scale;
  let ib = (-nb / normalizedDeterminant) / scale;
  let ic = (-nc / normalizedDeterminant) / scale;
  let id = (na / normalizedDeterminant) / scale;
  const usable = () => Number.isFinite(ia) && Number.isFinite(ib) && Number.isFinite(ic) && Number.isFinite(id) &&
    !(d !== 0 && ia === 0) && !(b !== 0 && ib === 0) && !(c !== 0 && ic === 0) && !(a !== 0 && id === 0);
  if (!usable()) {
    // Mixed very large/small axes can lose a normalized coefficient while their determinant is representable.
    const determinant = a * d - b * c;
    if (!Number.isFinite(determinant) || determinant === 0) {
      throw new RangeError(`Bone ${boneId} has a singular or unrepresentable inverse bind.`);
    }
    ia = d / determinant;
    ib = -b / determinant;
    ic = -c / determinant;
    id = a / determinant;
  }
  if (!usable()) {
    throw new RangeError(`Bone ${boneId} has an unrepresentable inverse bind.`);
  }
  const inverse = { a: ia, b: ib, c: ic, d: id, tx: -(ia * tx + ic * ty), ty: -(ib * tx + id * ty) };
  for (const value of Object.values(inverse)) requireFinite(value, `Bone ${boneId} inverse bind`);
  return inverse;
}

function compileAttachment(
  attachment: Attachment, assets: Map<string, Asset>, boneIndices: Map<string, number>, inverses: AffineMatrix[], binds: AffineMatrix[],
): CompiledAttachment {
  const vertexCount = attachment.type === 'mesh' ? attachment.vertices.length : 4;
  let influenceCount = 4;
  if (attachment.type === 'mesh') {
    influenceCount = 0;
    for (const vertex of attachment.vertices) {
      for (const influence of vertex.influences) if (influence.weight !== 0) influenceCount++;
    }
  }
  const result: CompiledAttachment = {
    id: attachment.id, assetId: attachment.assetId, type: attachment.type, opacity: attachment.opacity,
    offsets: new Uint32Array(vertexCount + 1), boneIndices: new Uint32Array(influenceCount),
    weightedX: new Float64Array(influenceCount), weightedY: new Float64Array(influenceCount),
    weights: new Float64Array(influenceCount), uvs: new Float32Array(vertexCount * 2),
    indices: attachment.type === 'mesh' ? new Uint32Array(attachment.triangles) : new Uint32Array([0, 1, 2, 0, 2, 3]),
    staged: new Float32Array(vertexCount * 2),
  };
  if (attachment.type === 'region') {
    const asset = assets.get(attachment.assetId)!;
    const matrix = localMatrix(attachment.transform);
    const corners = [0, 0, asset.width, 0, asset.width, asset.height, 0, asset.height];
    result.uvs.set([0, 0, 1, 0, 1, 1, 0, 1]);
    for (let vertex = 0; vertex < 4; vertex++) {
      const x = corners[vertex * 2]! - attachment.pivot.x;
      const y = corners[vertex * 2 + 1]! - attachment.pivot.y;
      result.offsets[vertex] = vertex;
      result.boneIndices[vertex] = boneIndices.get(attachment.boneId)!;
      result.weights[vertex] = 1;
      result.weightedX[vertex] = matrix.a * x + matrix.c * y + matrix.tx;
      result.weightedY[vertex] = matrix.b * x + matrix.d * y + matrix.ty;
    }
    result.offsets[4] = 4;
  } else {
    let cursor = 0;
    for (let vertexIndex = 0; vertexIndex < attachment.vertices.length; vertexIndex++) {
      const vertex = attachment.vertices[vertexIndex]!;
      result.offsets[vertexIndex] = cursor;
      result.uvs[vertexIndex * 2] = vertex.u;
      result.uvs[vertexIndex * 2 + 1] = vertex.v;
      for (const influence of vertex.influences) {
        const weight = influence.weight;
        if (weight === 0) continue;
        const index = boneIndices.get(influence.boneId)!;
        const inverse = inverses[index]!;
        const bind = binds[index]!;
        const x = vertex.x * weight;
        const y = vertex.y * weight;
        const dx = vertex.x - bind.tx;
        const dy = vertex.y - bind.ty;
        const localX = inverse.a * dx + inverse.c * dy;
        const localY = inverse.b * dx + inverse.d * dy;
        result.boneIndices[cursor] = index;
        result.weights[cursor] = weight;
        result.weightedX[cursor] = Number.isFinite(localX) ? localX * weight : inverse.a * x + inverse.c * y + inverse.tx * weight;
        result.weightedY[cursor] = Number.isFinite(localY) ? localY * weight : inverse.b * x + inverse.d * y + inverse.ty * weight;
        cursor++;
      }
    }
    result.offsets[vertexCount] = cursor;
  }
  for (let index = 0; index < influenceCount; index++) {
    requireFinite(result.weightedX[index]!, `Attachment ${attachment.id} bind coordinate`);
    requireFinite(result.weightedY[index]!, `Attachment ${attachment.id} bind coordinate`);
  }
  return result;
}

export function createGeometryEvaluator(input: unknown, rigId: string): GeometryEvaluator {
  const project = input !== null && typeof input === 'object' && 'format' in input && input.format === PROJECT_FORMAT;
  const document = project ? parseProjectDocument(input) : parseRuntimeDocument(input);
  const selectedRig = document.rigs.find((item) => item.id === rigId);
  if (!selectedRig) throw new Error(`Rig not found: ${rigId}.`);
  const rig = selectedRig;
  const setup = createRigEvaluator(document, rigId).setupPose();
  const inverseBinds = setup.bones.map((bone) => inverseBind(bone.world, bone.id));
  const boneIndices = new Map(rig.bones.map((bone, index) => [bone.id, index]));
  const assets = new Map(document.assets.map((asset) => [asset.id, asset]));
  const binds = setup.bones.map((bone) => bone.world);
  const compiled = rig.attachments.map((attachment) => compileAttachment(attachment, assets, boneIndices, inverseBinds, binds));
  const worlds = new Float64Array(rig.bones.length * 6);
  const opacities = new Float64Array(compiled.length);
  const outputs = new WeakMap<RigGeometryFrame, OwnedOutput>();

  function readPose(pose: EvaluatedPose): void {
    if (!pose || pose.rigId !== rigId || !Array.isArray(pose.bones) || !Array.isArray(pose.attachments) ||
      !Array.isArray(pose.drawOrder) || pose.bones.length !== rig.bones.length ||
      pose.attachments.length !== compiled.length || pose.drawOrder.length !== rig.drawOrder.length) {
      throw new TypeError(`Pose must match geometry rig ${rigId}.`);
    }
    for (let index = 0; index < rig.bones.length; index++) {
      const bone = pose.bones[index];
      if (!bone || bone.id !== rig.bones[index]!.id || !bone.world) throw new TypeError('Pose bone identities must match the geometry revision.');
      const world = bone.world;
      const offset = index * 6;
      for (let component = 0; component < 6; component++) {
        const value = world[matrixComponents[component]!];
        if (!Number.isFinite(value)) throw new RangeError(`Bone ${bone.id} world matrix must contain finite numbers.`);
        worlds[offset + component] = value;
      }
    }
    for (let index = 0; index < compiled.length; index++) {
      const attachment = pose.attachments[index];
      if (!attachment || attachment.id !== compiled[index]!.id) throw new TypeError('Pose attachment identities must match the geometry revision.');
      requireFinite(attachment.opacity, `Attachment ${attachment.id} opacity`);
      if (attachment.opacity < 0 || attachment.opacity > 1) throw new RangeError('Attachment opacity must be in [0, 1].');
      opacities[index] = attachment.opacity;
    }
    for (let index = 0; index < rig.drawOrder.length; index++) {
      if (pose.drawOrder[index] !== rig.drawOrder[index]) throw new TypeError('Pose draw order must match the geometry revision.');
    }
  }

  function stageGeometry(): void {
    for (let attachmentIndex = 0; attachmentIndex < compiled.length; attachmentIndex++) {
      const attachment = compiled[attachmentIndex]!;
      for (let vertex = 0; vertex + 1 < attachment.offsets.length; vertex++) {
        let x = 0;
        let y = 0;
        for (let influence = attachment.offsets[vertex]!; influence < attachment.offsets[vertex + 1]!; influence++) {
          const matrix = attachment.boneIndices[influence]! * 6;
          const wx = attachment.weightedX[influence]!;
          const wy = attachment.weightedY[influence]!;
          const weight = attachment.weights[influence]!;
          x += worlds[matrix]! * wx + worlds[matrix + 2]! * wy + worlds[matrix + 4]! * weight;
          y += worlds[matrix + 1]! * wx + worlds[matrix + 3]! * wy + worlds[matrix + 5]! * weight;
        }
        const fx = Math.fround(x);
        const fy = Math.fround(y);
        if (!Number.isFinite(fx) || !Number.isFinite(fy)) throw new RangeError(`Attachment ${attachment.id} produces nonfinite or Float32-overflow geometry.`);
        attachment.staged[vertex * 2] = fx;
        attachment.staged[vertex * 2 + 1] = fy;
      }
    }
  }

  function requireOwnedOutput(output: RigGeometryFrame): OwnedOutput {
    const owned = outputs.get(output);
    if (!owned || output.rigId !== rigId || output.attachments !== owned.attachments || output.drawOrder !== owned.drawOrder ||
      output.attachments.length !== compiled.length || output.drawOrder.length !== rig.drawOrder.length) {
      throw new TypeError('Output must retain the shape created by this geometry evaluator.');
    }
    for (let index = 0; index < compiled.length; index++) {
      const actual = output.attachments[index];
      const expected = owned.buffers[index]!;
      const source = compiled[index]!;
      if (actual !== expected.attachment || actual.id !== source.id || actual.assetId !== source.assetId || actual.type !== source.type ||
        actual.positions !== expected.positions || actual.uvs !== expected.uvs || actual.indices !== expected.indices ||
        actual.positions.length !== source.staged.length || actual.uvs.length !== source.uvs.length || actual.indices.length !== source.indices.length ||
        Object.getOwnPropertyDescriptor(actual, 'opacity')?.writable !== true) {
        throw new TypeError('Output attachment buffers and writable opacity must match their geometry revision.');
      }
    }
    for (let index = 0; index < rig.drawOrder.length; index++) {
      if (output.drawOrder[index] !== rig.drawOrder[index]) throw new TypeError('Output draw order must match its geometry revision.');
    }
    return owned;
  }

  readPose(setup);
  stageGeometry();
  const initialPositions = compiled.map((attachment) => attachment.staged.slice());

  function createOutput(): RigGeometryFrame {
    const attachments = compiled.map((attachment, index): AttachmentGeometry => ({
      id: attachment.id, assetId: attachment.assetId, type: attachment.type, opacity: attachment.opacity,
      positions: initialPositions[index]!.slice(), uvs: attachment.uvs.slice(), indices: attachment.indices.slice(),
    }));
    const drawOrder = [...rig.drawOrder];
    const output: RigGeometryFrame = { rigId, attachments, drawOrder };
    outputs.set(output, {
      attachments, drawOrder,
      buffers: attachments.map((attachment) => ({ attachment, positions: attachment.positions, uvs: attachment.uvs, indices: attachment.indices })),
    });
    return output;
  }

  function write(pose: EvaluatedPose, output: RigGeometryFrame): void {
    const owned = requireOwnedOutput(output);
    readPose(pose);
    stageGeometry();
    for (let index = 0; index < compiled.length; index++) {
      Float32Array.prototype.set.call(owned.buffers[index]!.positions, compiled[index]!.staged);
      owned.buffers[index]!.attachment.opacity = opacities[index]!;
    }
  }

  return Object.freeze({ rigId, createOutput, write });
}
