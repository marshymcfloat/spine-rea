import { describe, expect, it } from 'vitest';
import {
  ProjectDocumentSchema,
  RuntimeDocumentSchema,
  parseProjectDocument,
  parseRuntimeDocument,
  safeParseProjectDocument,
  safeParseRuntimeDocument,
  type ProjectDocument,
  type RuntimeDocument,
} from './index';

function createProject(): ProjectDocument {
  const setup = () => ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  return {
    format: 'slotstudio-project',
    schemaVersion: 1,
    id: 'project',
    name: 'Validation fixture',
    canvas: { width: 320, height: 240 },
    assets: [{ id: 'texture', path: 'assets/texture.png', width: 4, height: 4, mimeType: 'image/png' }],
    rigs: [{
      id: 'priest',
      name: 'Priest',
      bones: [
        { id: 'root', name: 'Root', parentId: null, setup: setup() },
        { id: 'upper', name: 'Upper arm', parentId: 'root', setup: setup() },
        { id: 'lower', name: 'Lower arm', parentId: 'upper', setup: setup() },
        { id: 'hand', name: 'Hand', parentId: 'lower', setup: setup() },
      ],
      attachments: [
        {
          type: 'mesh', id: 'sleeve', name: 'Sleeve', assetId: 'texture', opacity: 1,
          vertices: [
            { x: 0, y: 0, u: 0, v: 0, influences: [{ boneId: 'upper', weight: 1 }] },
            { x: 4, y: 0, u: 1, v: 0, influences: [{ boneId: 'upper', weight: 0.5 }, { boneId: 'lower', weight: 0.5 }] },
            { x: 0, y: 4, u: 0, v: 1, influences: [{ boneId: 'hand', weight: 1 }] },
          ],
          triangles: [0, 1, 2],
        },
        {
          type: 'region', id: 'body', name: 'Body', assetId: 'texture', boneId: 'root',
          pivot: { x: 0.5, y: 0.5 }, transform: setup(), opacity: 1,
        },
      ],
      drawOrder: ['sleeve', 'body'],
    }],
    clips: [{
      id: 'idle', name: 'Idle', rigId: 'priest', duration: 1, loop: true,
      tracks: [
        {
          kind: 'bone', boneId: 'upper', channel: 'rotation',
          keys: [
            { time: 0, value: 0, easing: { type: 'linear' } },
            { time: 1, value: 0.25, easing: { type: 'hold' } },
          ],
        },
        {
          kind: 'attachment', attachmentId: 'body', channel: 'opacity',
          keys: [{ time: 0, value: 1, easing: { type: 'bezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } }],
        },
      ],
      markers: [{ id: 'cue', name: 'Cue', time: 0.5, data: { sound: 'gong', nested: [true, null, 1] } }],
    }],
    editor: { activeRigId: 'priest' },
  };
}

function asRuntime(project: ProjectDocument): RuntimeDocument {
  return {
    format: 'slotstudio-runtime', schemaVersion: 1,
    assets: project.assets, rigs: project.rigs, clips: project.clips,
  };
}

const rig = (project: ProjectDocument) => project.rigs[0]!;
const mesh = (project: ProjectDocument) => rig(project).attachments.find((attachment) => attachment.type === 'mesh')!;
const region = (project: ProjectDocument) => rig(project).attachments.find((attachment) => attachment.type === 'region')!;
const clip = (project: ProjectDocument) => project.clips[0]!;
const boneTrack = (project: ProjectDocument) => clip(project).tracks.find((track) => track.kind === 'bone')!;
const attachmentTrack = (project: ProjectDocument) => clip(project).tracks.find((track) => track.kind === 'attachment')!;

type IssuePath = readonly (string | number)[];
type DocumentSchema = typeof ProjectDocumentSchema | typeof RuntimeDocumentSchema;

function expectIssue(schema: DocumentSchema, input: unknown, expectedPath: IssuePath): void {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Invalid document unexpectedly passed validation.');
  const issue = result.error.issues.find((issue) => expectedPath.every((part, index) => issue.path[index] === part));
  expect(issue, `Expected issue at ${expectedPath.join('.')}: ${JSON.stringify(result.error.issues)}`).toBeDefined();
  expect(issue!.message.trim()).not.toBe('');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const meshPath = ['rigs', 0, 'attachments', 0] as const;
const clipPath = ['clips', 0] as const;
const invalidCases: Array<[string, (project: ProjectDocument) => void, IssuePath]> = [
  ['duplicate asset IDs', (project) => { project.assets.push(structuredClone(project.assets[0]!)); }, ['assets']],
  ['duplicate rig IDs', (project) => { project.rigs.push(structuredClone(rig(project))); }, ['rigs']],
  ['duplicate bone IDs', (project) => { rig(project).bones[1]!.id = 'root'; }, ['rigs', 0, 'bones']],
  ['duplicate attachment IDs', (project) => { region(project).id = 'sleeve'; }, ['rigs', 0, 'attachments']],
  ['duplicate clip IDs', (project) => { project.clips.push(structuredClone(clip(project))); }, ['clips']],
  ['blank stable IDs', (project) => { project.assets[0]!.id = ' '; }, ['assets', 0, 'id']],
  ['missing parent bones', (project) => { rig(project).bones[1]!.parentId = 'missing'; }, ['rigs', 0, 'bones', 1, 'parentId']],
  ['self parenting', (project) => { rig(project).bones[0]!.parentId = 'root'; }, ['rigs', 0, 'bones']],
  ['indirect parent cycles', (project) => { rig(project).bones[0]!.parentId = 'lower'; }, ['rigs', 0, 'bones']],
  ['singular setup scale', (project) => { rig(project).bones[0]!.setup.scaleX = 0; }, ['rigs', 0, 'bones', 0, 'setup', 'scaleX']],
  ['nonfinite setup transforms', (project) => { rig(project).bones[0]!.setup.y = Infinity; }, ['rigs', 0, 'bones', 0, 'setup', 'y']],
  ['singular rigid setup transforms', (project) => { region(project).transform.scaleY = 0; }, ['rigs', 0, 'attachments', 1, 'transform', 'scaleY']],
  ['missing texture assets', (project) => { mesh(project).assetId = 'missing'; }, [...meshPath, 'assetId']],
  ['missing rigid attachment bones', (project) => { region(project).boneId = 'missing'; }, ['rigs', 0, 'attachments', 1, 'boneId']],
  ['incomplete draw order', (project) => { rig(project).drawOrder = ['body']; }, ['rigs', 0, 'drawOrder']],
  ['duplicate draw-order entries', (project) => { rig(project).drawOrder = ['sleeve', 'sleeve']; }, ['rigs', 0, 'drawOrder']],
  ['unknown draw-order entries', (project) => { rig(project).drawOrder[0] = 'missing'; }, ['rigs', 0, 'drawOrder']],
  ['nonfinite bind vertices', (project) => { mesh(project).vertices[0]!.x = NaN; }, [...meshPath, 'vertices', 0, 'x']],
  ['meshes without three vertices', (project) => { mesh(project).vertices.pop(); }, [...meshPath, 'vertices']],
  ['UVs outside the texture', (project) => { mesh(project).vertices[0]!.u = 1.1; }, [...meshPath, 'vertices', 0, 'u']],
  ['incomplete triangle triplets', (project) => { mesh(project).triangles = [0, 1]; }, [...meshPath, 'triangles']],
  ['fractional triangle indices', (project) => { mesh(project).triangles[2] = 1.5; }, [...meshPath, 'triangles']],
  ['triangle indices outside the mesh', (project) => { mesh(project).triangles[2] = 3; }, [...meshPath, 'triangles']],
  ['repeated triangle corners', (project) => { mesh(project).triangles[2] = 1; }, [...meshPath, 'triangles']],
  ['zero-area bind triangles', (project) => { mesh(project).vertices[2]!.x = 2; mesh(project).vertices[2]!.y = 0; }, [...meshPath, 'triangles']],
  ['empty influence lists', (project) => { mesh(project).vertices[0]!.influences = []; }, [...meshPath, 'vertices', 0, 'influences']],
  ['more than four influences', (project) => {
    rig(project).bones.push({ ...structuredClone(rig(project).bones[0]!), id: 'extra' });
    mesh(project).vertices[0]!.influences = ['root', 'upper', 'lower', 'hand', 'extra'].map((boneId) => ({ boneId, weight: 0.2 }));
  }, [...meshPath, 'vertices', 0, 'influences']],
  ['duplicate influenced bones', (project) => {
    mesh(project).vertices[0]!.influences = [{ boneId: 'upper', weight: 0.5 }, { boneId: 'upper', weight: 0.5 }];
  }, [...meshPath, 'vertices', 0, 'influences']],
  ['missing influenced bones', (project) => { mesh(project).vertices[0]!.influences[0]!.boneId = 'missing'; }, [...meshPath, 'vertices', 0, 'influences', 0, 'boneId']],
  ['negative weights', (project) => { mesh(project).vertices[0]!.influences[0]!.weight = -1; }, [...meshPath, 'vertices', 0, 'influences', 0, 'weight']],
  ['nonfinite weights', (project) => { mesh(project).vertices[0]!.influences[0]!.weight = Infinity; }, [...meshPath, 'vertices', 0, 'influences', 0, 'weight']],
  ['unnormalized weights', (project) => { mesh(project).vertices[0]!.influences[0]!.weight = 0.8; }, [...meshPath, 'vertices', 0, 'influences']],
  ['zero-length clips', (project) => { clip(project).duration = 0; }, [...clipPath, 'duration']],
  ['missing clip rigs', (project) => { clip(project).rigId = 'missing'; }, [...clipPath, 'rigId']],
  ['missing bone channel targets', (project) => { boneTrack(project).boneId = 'missing'; }, [...clipPath, 'tracks', 0, 'boneId']],
  ['missing attachment channel targets', (project) => { attachmentTrack(project).attachmentId = 'missing'; }, [...clipPath, 'tracks', 1, 'attachmentId']],
  ['channels for the wrong target kind', (project) => { Object.assign(boneTrack(project), { channel: 'opacity' }); }, [...clipPath, 'tracks', 0, 'channel']],
  ['duplicate target-channel tracks', (project) => { clip(project).tracks.push(structuredClone(boneTrack(project))); }, [...clipPath, 'tracks']],
  ['descending key times', (project) => { boneTrack(project).keys.reverse(); }, [...clipPath, 'tracks', 0, 'keys']],
  ['duplicate key times', (project) => { boneTrack(project).keys[1]!.time = 0; }, [...clipPath, 'tracks', 0, 'keys']],
  ['negative key times', (project) => { boneTrack(project).keys[0]!.time = -0.1; }, [...clipPath, 'tracks', 0, 'keys', 0, 'time']],
  ['key times beyond the clip', (project) => { boneTrack(project).keys[1]!.time = 1.1; }, [...clipPath, 'tracks', 0, 'keys', 1, 'time']],
  ['nonfinite animated values', (project) => { boneTrack(project).keys[0]!.value = NaN; }, [...clipPath, 'tracks', 0, 'keys', 0, 'value']],
  ['opacity outside its range', (project) => { attachmentTrack(project).keys[0]!.value = 1.1; }, [...clipPath, 'tracks', 1, 'keys', 0, 'value']],
  ['out-of-range Bezier controls', (project) => {
    boneTrack(project).keys[0]!.easing = { type: 'bezier', x1: -0.1, y1: 0, x2: 1, y2: 1 };
  }, [...clipPath, 'tracks', 0, 'keys', 0, 'easing']],
  ['duplicate marker IDs', (project) => { clip(project).markers.push(structuredClone(clip(project).markers[0]!)); }, [...clipPath, 'markers']],
  ['descending marker times', (project) => { clip(project).markers.push({ id: 'earlier', name: 'Earlier', time: 0.25 }); }, [...clipPath, 'markers']],
  ['markers beyond the clip', (project) => { clip(project).markers[0]!.time = 1.1; }, [...clipPath, 'markers', 0, 'time']],
  ['non-JSON marker payloads', (project) => { Object.assign(clip(project).markers[0]!, { data: () => null }); }, [...clipPath, 'markers', 0, 'data']],
];

describe.each([
  { name: 'project', schema: ProjectDocumentSchema, document: (project: ProjectDocument) => project },
  { name: 'runtime', schema: RuntimeDocumentSchema, document: asRuntime },
])('$name document', ({ schema, document }) => {
  it('accepts the complete small weighted-rig contract', () => {
    const input = document(createProject());
    expect(schema.parse(input)).toEqual(input);
  });

  it.each(invalidCases)('rejects %s with an actionable issue path', (_name, mutate, expectedPath) => {
    const project = createProject();
    mutate(project);
    expectIssue(schema, document(project), expectedPath);
  });

  it('preserves JSON values and does not mutate frozen valid inputs', () => {
    const input = document(createProject());
    const roundtrip = JSON.parse(JSON.stringify(input)) as unknown;
    deepFreeze(input);
    expect(schema.parse(input)).toEqual(roundtrip);
    expect(schema.parse(roundtrip)).toEqual(input);
    expect(input).toEqual(roundtrip);
  });

  it('does not repair or mutate invalid weights', () => {
    const project = createProject();
    mesh(project).vertices[0]!.influences[0]!.weight = 0.8;
    const input = document(project);
    const before = structuredClone(input);
    deepFreeze(input);
    expectIssue(schema, input, [...meshPath, 'vertices', 0, 'influences']);
    expect(input).toEqual(before);
  });

  it.each([
    '../texture.png', '/texture.png', 'C:/texture.png', 'assets\\texture.png',
    'https://example.test/texture.png', 'assets/./texture.png', 'assets//texture.png',
    'assets/NUL.png', 'assets/texture.png.', 'assets/bad\0.png',
    'assets/COM¹.png', 'assets/COM².png', 'assets/COM³.png',
    'assets/LPT¹.png', 'assets/LPT².png', 'assets/LPT³.png', 'assets/lpt³/texture.png',
  ])('rejects unsafe or nonportable asset paths: %s', (assetPath) => {
    const project = createProject();
    project.assets[0]!.path = assetPath;
    expectIssue(schema, document(project), ['assets', 0, 'path']);
  });

  it('rejects a bone reference belonging only to another rig', () => {
    const project = createProject();
    project.rigs.push({
      id: 'other', name: 'Other rig',
      bones: [{ ...structuredClone(rig(project).bones[0]!), id: 'foreign' }],
      attachments: [], drawOrder: [],
    });
    mesh(project).vertices[0]!.influences[0]!.boneId = 'foreign';
    expectIssue(schema, document(project), [...meshPath, 'vertices', 0, 'influences', 0, 'boneId']);
  });

  it('rejects cyclic marker data without throwing from safeParse', () => {
    const project = createProject();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    Object.assign(clip(project).markers[0]!, { data: cyclic });
    expectIssue(schema, document(project), [...clipPath, 'markers', 0, 'data']);
  });

  it('rejects arrays with custom prototypes that change JSON serialization', () => {
    class CustomArray extends Array<string> {
      toJSON() { return 'replaced'; }
    }
    const replacedPrototype = Object.setPrototypeOf(['payload'], {
      toJSON() { return 'replaced'; },
    }) as unknown;
    for (const data of [new CustomArray('payload'), replacedPrototype]) {
      expect(JSON.stringify(data)).toBe('"replaced"');
      const project = createProject();
      Object.assign(clip(project).markers[0]!, { data });
      expectIssue(schema, document(project), [...clipPath, 'markers', 0, 'data']);
    }
  });

  it.each([Infinity, undefined, 1n, new Date(0)])('rejects values that cannot roundtrip inside marker JSON: %s', (value) => {
    const project = createProject();
    Object.assign(clip(project).markers[0]!, { data: { nested: value } });
    expectIssue(schema, document(project), [...clipPath, 'markers', 0, 'data']);
  });

  it('accepts signed setup scales, unordered bone storage and animated zero scales', () => {
    const project = createProject();
    rig(project).bones[0]!.setup.scaleX = -1;
    rig(project).bones.reverse();
    boneTrack(project).channel = 'scaleY';
    boneTrack(project).keys[0]!.value = 0;
    expect(schema.safeParse(document(project)).success).toBe(true);
  });

  it('accepts four influences and nonnegative zero weights without normalization', () => {
    const project = createProject();
    mesh(project).vertices[0]!.influences = [
      { boneId: 'root', weight: 0 }, { boneId: 'upper', weight: 0.25 },
      { boneId: 'lower', weight: 0.25 }, { boneId: 'hand', weight: 0.5 },
    ];
    const input = document(project);
    expect(schema.parse(input)).toEqual(input);
  });

  it('accepts weight rounding within the documented tolerance without changing it', () => {
    const project = createProject();
    mesh(project).vertices[0]!.influences[0]!.weight = 1 - 5e-7;
    const input = document(project);
    expect(schema.parse(input)).toEqual(input);
  });

  it('allows marker ties and clip endpoint times', () => {
    const project = createProject();
    clip(project).markers = [
      { id: 'start', name: 'Start', time: 0 },
      { id: 'also-start', name: 'Also start', time: 0 },
      { id: 'end', name: 'End', time: 1 },
    ];
    expect(schema.safeParse(document(project)).success).toBe(true);
  });

  it('scopes bone and attachment IDs to their rig and marker IDs to their clip', () => {
    const project = createProject();
    project.rigs.push({ ...structuredClone(rig(project)), id: 'second-rig' });
    project.clips.push({ ...structuredClone(clip(project)), id: 'second-clip', rigId: 'second-rig' });
    expect(schema.safeParse(document(project)).success).toBe(true);
  });
});

describe('document versions and public helpers', () => {
  it('validates each format version and rejects the other format', () => {
    const project = createProject();
    const runtime = asRuntime(project);
    expectIssue(ProjectDocumentSchema, { ...project, schemaVersion: 2 }, ['schemaVersion']);
    expectIssue(RuntimeDocumentSchema, { ...runtime, schemaVersion: 2 }, ['schemaVersion']);
    expectIssue(ProjectDocumentSchema, runtime, ['format']);
    expectIssue(RuntimeDocumentSchema, project, ['format']);
    expect(parseProjectDocument(project)).toEqual(project);
    expect(parseRuntimeDocument(runtime)).toEqual(runtime);
  });

  it.each([
    { input: null }, { input: undefined }, { input: [] }, { input: {} }, { input: 'not a document' },
  ])('safe parsing rejects malformed roots without throwing: $input', ({ input }) => {
    expect(safeParseProjectDocument(input).success).toBe(false);
    expect(safeParseRuntimeDocument(input).success).toBe(false);
    expect(() => parseProjectDocument(input)).toThrow();
    expect(() => parseRuntimeDocument(input)).toThrow();
  });

  it('keeps safe helper errors usable by property path', () => {
    const project = { ...createProject(), schemaVersion: -1 };
    const result = safeParseProjectDocument(project);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Unsupported project version passed.');
    expect(result.error.issues.some((issue) => issue.path[0] === 'schemaVersion')).toBe(true);
    const runtime = safeParseRuntimeDocument({ ...asRuntime(createProject()), schemaVersion: -1 });
    expect(runtime.success).toBe(false);
    if (runtime.success) throw new Error('Unsupported runtime version passed.');
    expect(runtime.error.issues.some((issue) => issue.path[0] === 'schemaVersion')).toBe(true);
  });

  it.each(['id', 'name', 'canvas', 'editor'])('rejects authoring-only runtime field %s', (field) => {
    const project = createProject();
    const input = { ...asRuntime(project), [field]: project[field as keyof ProjectDocument] };
    const result = RuntimeDocumentSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Authoring metadata entered a runtime document.');
    expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unrecognized_keys', path: [] }),
    ]));
  });

  it('rejects unknown keys in both root and nested objects', () => {
    const project = createProject();
    Object.assign(rig(project).bones[0]!.setup, { editorColor: '#fff' });
    expectIssue(ProjectDocumentSchema, project, ['rigs', 0, 'bones', 0, 'setup']);
    expectIssue(RuntimeDocumentSchema, asRuntime(project), ['rigs', 0, 'bones', 0, 'setup']);
    expectIssue(ProjectDocumentSchema, { ...createProject(), unknown: true }, []);
  });

  it('rejects editor selections referencing a missing rig', () => {
    const project = createProject();
    project.editor = { activeRigId: 'missing' };
    expectIssue(ProjectDocumentSchema, project, ['editor', 'activeRigId']);
  });

  it('allows an empty new project and an explicitly cleared editor selection', () => {
    const project = createProject();
    project.assets = [];
    project.rigs = [];
    project.clips = [];
    project.editor = { activeRigId: null };
    expect(parseProjectDocument(project)).toEqual(project);
    expect(parseRuntimeDocument(asRuntime(project))).toEqual(asRuntime(project));
    delete project.editor;
    expect(safeParseProjectDocument(project).success).toBe(true);
  });

  it('does not trim stable IDs or require unique display names', () => {
    const project = createProject();
    project.assets[0]!.id = ' texture ';
    for (const attachment of rig(project).attachments) attachment.assetId = ' texture ';
    for (const bone of rig(project).bones) bone.name = 'Same label';
    expect(parseProjectDocument(project)).toEqual(project);
  });
});
