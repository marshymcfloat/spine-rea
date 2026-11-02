import { z } from 'zod';

export const PROJECT_FORMAT = 'slotstudio-project';
export const PROJECT_SCHEMA_VERSION = 1;
export const RUNTIME_FORMAT = 'slotstudio-runtime';
export const RUNTIME_SCHEMA_VERSION = 1;

const finite = z.number().finite();
const nonblank = z.string().refine((value) => value.trim().length > 0, 'Must not be blank.');
const opacity = finite.min(0).max(1);
const nonzeroScale = finite.refine((value) => value !== 0, 'Setup scale must not be zero.');
const WEIGHT_EPSILON = 1e-6;

function isPortableAssetPath(value: string): boolean {
  if (!value || /[\\<>:"|?*#\u0000-\u001f\u007f]/.test(value)) return false;
  return value.split('/').every((segment) =>
    segment.length > 0 && segment !== '.' && segment !== '..' &&
    !/[. ]$/.test(segment) &&
    !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment),
  );
}

const AssetSchema = z.strictObject({
  id: nonblank,
  path: z.string().refine(isPortableAssetPath, 'Use a clean, portable project-relative asset path with forward slashes.'),
  width: finite.int().positive(),
  height: finite.int().positive(),
  mimeType: z.literal('image/png'),
});

const TransformSchema = z.strictObject({
  x: finite,
  y: finite,
  rotation: finite,
  scaleX: nonzeroScale,
  scaleY: nonzeroScale,
});

const BoneSchema = z.strictObject({
  id: nonblank,
  name: nonblank,
  parentId: nonblank.nullable(),
  setup: TransformSchema,
});

const InfluenceSchema = z.strictObject({ boneId: nonblank, weight: finite.min(0).max(1) });
const MeshVertexSchema = z.strictObject({
  x: finite,
  y: finite,
  u: finite.min(0).max(1),
  v: finite.min(0).max(1),
  influences: z.array(InfluenceSchema).min(1).max(4),
});

const RegionAttachmentSchema = z.strictObject({
  type: z.literal('region'),
  id: nonblank,
  name: nonblank,
  assetId: nonblank,
  boneId: nonblank,
  pivot: z.strictObject({ x: finite, y: finite }),
  transform: TransformSchema,
  opacity,
});

const MeshAttachmentSchema = z.strictObject({
  type: z.literal('mesh'),
  id: nonblank,
  name: nonblank,
  assetId: nonblank,
  opacity,
  vertices: z.array(MeshVertexSchema).min(3),
  triangles: z.array(finite.int().nonnegative()).min(3),
});

const AttachmentSchema = z.discriminatedUnion('type', [RegionAttachmentSchema, MeshAttachmentSchema]);
const RigSchema = z.strictObject({
  id: nonblank,
  name: nonblank,
  bones: z.array(BoneSchema).min(1),
  attachments: z.array(AttachmentSchema),
  drawOrder: z.array(nonblank),
});

const EasingSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('linear') }),
  z.strictObject({ type: z.literal('hold') }),
  z.strictObject({
    type: z.literal('bezier'),
    x1: finite.min(0).max(1),
    y1: finite.min(0).max(1),
    x2: finite.min(0).max(1),
    y2: finite.min(0).max(1),
  }),
]);

const KeyframeSchema = z.strictObject({ time: finite.nonnegative(), value: finite, easing: EasingSchema });
const BoneTrackSchema = z.strictObject({
  kind: z.literal('bone'),
  boneId: nonblank,
  channel: z.enum(['x', 'y', 'rotation', 'scaleX', 'scaleY']),
  keys: z.array(KeyframeSchema).min(1),
});
const AttachmentTrackSchema = z.strictObject({
  kind: z.literal('attachment'),
  attachmentId: nonblank,
  channel: z.literal('opacity'),
  keys: z.array(KeyframeSchema).min(1),
});
const TrackSchema = z.discriminatedUnion('kind', [BoneTrackSchema, AttachmentTrackSchema]);

type JsonData = z.infer<ReturnType<typeof z.json>>;

function isJsonValue(input: unknown): input is JsonData {
  const active = new Set<object>();
  const pending: { value: unknown; exit?: boolean }[] = [{ value: input }];
  while (pending.length > 0) {
    const item = pending.pop()!;
    const value = item.value;
    if (item.exit) {
      active.delete(value as object);
      continue;
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return false;
      continue;
    }
    if (typeof value !== 'object' || active.has(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (Array.isArray(value) && prototype !== Array.prototype) return false;
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
    active.add(value);
    pending.push({ value, exit: true });
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length || Reflect.ownKeys(value).length !== value.length + 1) return false;
      for (let i = value.length - 1; i >= 0; i--) pending.push({ value: value[i] });
    } else {
      const keys = Reflect.ownKeys(value);
      for (const key of keys) {
        if (typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key)) return false;
        pending.push({ value: (value as Record<string, unknown>)[key] });
      }
    }
  }
  return true;
}

const JsonValueSchema = z.custom<JsonData>(isJsonValue, 'Marker data must be JSON values without cycles or non-finite numbers.');
const MarkerSchema = z.strictObject({
  id: nonblank,
  name: nonblank,
  time: finite.nonnegative(),
  data: JsonValueSchema.optional(),
});
const ClipSchema = z.strictObject({
  id: nonblank,
  name: nonblank,
  rigId: nonblank,
  duration: finite.positive(),
  loop: z.boolean(),
  tracks: z.array(TrackSchema),
  markers: z.array(MarkerSchema),
});
const CanvasSchema = z.strictObject({ width: finite.positive(), height: finite.positive() });
const ProjectShape = z.strictObject({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: nonblank,
  name: nonblank,
  canvas: CanvasSchema,
  assets: z.array(AssetSchema),
  rigs: z.array(RigSchema),
  clips: z.array(ClipSchema),
  editor: z.strictObject({ activeRigId: nonblank.nullable() }).optional(),
});
const RuntimeShape = z.strictObject({
  format: z.literal(RUNTIME_FORMAT),
  schemaVersion: z.literal(RUNTIME_SCHEMA_VERSION),
  assets: z.array(AssetSchema),
  rigs: z.array(RigSchema),
  clips: z.array(ClipSchema),
});

type DocumentData = z.infer<typeof RuntimeShape> | z.infer<typeof ProjectShape>;
type IssuePath = (string | number)[];

function addIssue(context: z.RefinementCtx, path: IssuePath, message: string): void {
  context.addIssue({ code: 'custom', path, message });
}

function uniqueIds(items: readonly { id: string }[], path: IssuePath, context: z.RefinementCtx): Set<string> {
  const ids = new Set<string>();
  items.forEach((item, index) => {
    if (ids.has(item.id)) addIssue(context, [...path, index, 'id'], `Duplicate ID: ${item.id}.`);
    ids.add(item.id);
  });
  return ids;
}

function validateRig(rig: z.infer<typeof RigSchema>, index: number, assets: Set<string>, context: z.RefinementCtx): void {
  const rigPath: IssuePath = ['rigs', index];
  const boneIds = uniqueIds(rig.bones, [...rigPath, 'bones'], context);
  const attachmentIds = uniqueIds(rig.attachments, [...rigPath, 'attachments'], context);
  const boneById = new Map(rig.bones.map((bone, boneIndex) => [bone.id, { bone, boneIndex }]));
  rig.bones.forEach((bone, boneIndex) => {
    if (bone.parentId !== null && !boneIds.has(bone.parentId)) {
      addIssue(context, [...rigPath, 'bones', boneIndex, 'parentId'], 'Parent must reference a bone in the same rig.');
    }
  });
  const visited = new Map<string, 'active' | 'complete'>();
  for (const bone of rig.bones) {
    const chain: string[] = [];
    let currentId: string | null = bone.id;
    while (currentId !== null) {
      const current = boneById.get(currentId);
      if (!current || visited.get(currentId) === 'complete') break;
      if (visited.get(currentId) === 'active') {
        addIssue(context, [...rigPath, 'bones', current.boneIndex, 'parentId'], 'Bone hierarchy must not contain cycles.');
        break;
      }
      visited.set(currentId, 'active');
      chain.push(currentId);
      currentId = current.bone.parentId;
    }
    for (const id of chain) visited.set(id, 'complete');
  }

  const ordered = new Set<string>();
  rig.drawOrder.forEach((id, orderIndex) => {
    if (!attachmentIds.has(id)) addIssue(context, [...rigPath, 'drawOrder', orderIndex], 'Draw order must reference an attachment in the same rig.');
    if (ordered.has(id)) addIssue(context, [...rigPath, 'drawOrder', orderIndex], 'Each attachment must appear exactly once in draw order.');
    ordered.add(id);
  });
  if (rig.drawOrder.length !== rig.attachments.length || [...attachmentIds].some((id) => !ordered.has(id))) {
    addIssue(context, [...rigPath, 'drawOrder'], 'Draw order must contain every attachment exactly once.');
  }

  rig.attachments.forEach((attachment, attachmentIndex) => {
    const attachmentPath = [...rigPath, 'attachments', attachmentIndex];
    if (!assets.has(attachment.assetId)) addIssue(context, [...attachmentPath, 'assetId'], 'Attachment must reference an asset in this document.');
    if (attachment.type === 'region') {
      if (!boneIds.has(attachment.boneId)) addIssue(context, [...attachmentPath, 'boneId'], 'Attachment must reference a bone in the same rig.');
      return;
    }
    attachment.vertices.forEach((vertex, vertexIndex) => {
      const vertexPath = [...attachmentPath, 'vertices', vertexIndex];
      const influenced = new Set<string>();
      let total = 0;
      vertex.influences.forEach((influence, influenceIndex) => {
        const influencePath = [...vertexPath, 'influences', influenceIndex, 'boneId'];
        if (!boneIds.has(influence.boneId)) addIssue(context, influencePath, 'Influence must reference a bone in the same rig.');
        if (influenced.has(influence.boneId)) addIssue(context, influencePath, 'Each bone may influence a vertex only once.');
        influenced.add(influence.boneId);
        total += influence.weight;
      });
      if (!Number.isFinite(total) || Math.abs(total - 1) > WEIGHT_EPSILON) {
        addIssue(context, [...vertexPath, 'influences'], 'Vertex weights must sum to one within 0.000001.');
      }
    });
    if (attachment.triangles.length % 3 !== 0) addIssue(context, [...attachmentPath, 'triangles'], 'Triangle indices must form complete groups of three.');
    attachment.triangles.forEach((vertexIndex, triangleIndex) => {
      if (vertexIndex >= attachment.vertices.length) addIssue(context, [...attachmentPath, 'triangles', triangleIndex], 'Triangle index is outside the vertex array.');
    });
    for (let triangleIndex = 0; triangleIndex + 2 < attachment.triangles.length; triangleIndex += 3) {
      const [ia, ib, ic] = attachment.triangles.slice(triangleIndex, triangleIndex + 3);
      if (ia === ib || ib === ic || ia === ic) {
        addIssue(context, [...attachmentPath, 'triangles', triangleIndex], 'A triangle must reference three distinct vertices.');
        continue;
      }
      const a = attachment.vertices[ia!];
      const b = attachment.vertices[ib!];
      const c = attachment.vertices[ic!];
      if (a && b && c) {
        const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (!Number.isFinite(area) || area === 0) addIssue(context, [...attachmentPath, 'triangles', triangleIndex], 'Triangle bind area must be finite and nonzero.');
      }
    }
  });
}

function validateDocument(document: DocumentData, context: z.RefinementCtx): void {
  const assets = uniqueIds(document.assets, ['assets'], context);
  const rigs = uniqueIds(document.rigs, ['rigs'], context);
  uniqueIds(document.clips, ['clips'], context);
  document.rigs.forEach((rig, index) => validateRig(rig, index, assets, context));
  const rigById = new Map(document.rigs.map((rig) => [rig.id, rig]));
  document.clips.forEach((clip, clipIndex) => {
    const clipPath: IssuePath = ['clips', clipIndex];
    const rig = rigById.get(clip.rigId);
    if (!rig) addIssue(context, [...clipPath, 'rigId'], 'Clip must reference a rig in this document.');
    const boneIds = new Set(rig?.bones.map((bone) => bone.id));
    const attachmentIds = new Set(rig?.attachments.map((attachment) => attachment.id));
    const trackTargets = new Set<string>();
    clip.tracks.forEach((track, trackIndex) => {
      const trackPath = [...clipPath, 'tracks', trackIndex];
      const targetId = track.kind === 'bone' ? track.boneId : track.attachmentId;
      const targetKey = JSON.stringify([track.kind, targetId, track.channel]);
      if (trackTargets.has(targetKey)) addIssue(context, trackPath, 'A clip may contain only one track per target and channel.');
      trackTargets.add(targetKey);
      if (rig && track.kind === 'bone' && !boneIds.has(track.boneId)) addIssue(context, [...trackPath, 'boneId'], 'Track must reference a bone in the clip rig.');
      if (rig && track.kind === 'attachment' && !attachmentIds.has(track.attachmentId)) addIssue(context, [...trackPath, 'attachmentId'], 'Track must reference an attachment in the clip rig.');
      track.keys.forEach((key, keyIndex) => {
        const keyPath = [...trackPath, 'keys', keyIndex];
        if (key.time > clip.duration) addIssue(context, [...keyPath, 'time'], 'Key time must not exceed clip duration.');
        if (keyIndex > 0 && key.time <= track.keys[keyIndex - 1]!.time) addIssue(context, [...keyPath, 'time'], 'Key times must be strictly increasing.');
        if (track.kind === 'attachment' && (key.value < 0 || key.value > 1)) addIssue(context, [...keyPath, 'value'], 'Animated opacity must be between zero and one.');
      });
    });
    uniqueIds(clip.markers, [...clipPath, 'markers'], context);
    clip.markers.forEach((marker, markerIndex) => {
      const markerPath = [...clipPath, 'markers', markerIndex, 'time'];
      if (marker.time > clip.duration) addIssue(context, markerPath, 'Marker time must not exceed clip duration.');
      if (markerIndex > 0 && marker.time < clip.markers[markerIndex - 1]!.time) addIssue(context, markerPath, 'Marker times must be nondecreasing.');
    });
  });
  if ('editor' in document && document.editor?.activeRigId !== undefined && document.editor.activeRigId !== null && !rigs.has(document.editor.activeRigId)) {
    addIssue(context, ['editor', 'activeRigId'], 'Active rig must reference a rig in this document.');
  }
}

export const ProjectDocumentSchema = ProjectShape.superRefine(validateDocument);
export const RuntimeDocumentSchema = RuntimeShape.superRefine(validateDocument);

export const parseProjectDocument = (input: unknown) => ProjectDocumentSchema.parse(input);
export const safeParseProjectDocument = (input: unknown) => ProjectDocumentSchema.safeParse(input);
export const parseRuntimeDocument = (input: unknown) => RuntimeDocumentSchema.parse(input);
export const safeParseRuntimeDocument = (input: unknown) => RuntimeDocumentSchema.safeParse(input);

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;
export type RuntimeDocument = z.infer<typeof RuntimeDocumentSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Bone = z.infer<typeof BoneSchema>;
export type Rig = z.infer<typeof RigSchema>;
export type RegionAttachment = z.infer<typeof RegionAttachmentSchema>;
export type MeshAttachment = z.infer<typeof MeshAttachmentSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type MeshVertex = z.infer<typeof MeshVertexSchema>;
export type Influence = z.infer<typeof InfluenceSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type Marker = z.infer<typeof MarkerSchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type BoneTrack = z.infer<typeof BoneTrackSchema>;
export type AttachmentTrack = z.infer<typeof AttachmentTrackSchema>;
export type Transform = z.infer<typeof TransformSchema>;
export type Canvas = z.infer<typeof CanvasSchema>;
export type Easing = z.infer<typeof EasingSchema>;
export type JsonValue = z.infer<typeof JsonValueSchema>;
