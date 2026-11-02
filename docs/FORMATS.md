# Project and runtime formats

Implemented: 2026-11-02. The authoritative validators and exported TypeScript types
are in [`@studio/schema`](../packages/schema/src/index.ts). These contracts describe
data; the evaluator, compiler, project filesystem service and animated player remain planned.

## Documents and API

| Document | `format` | `schemaVersion` | Required fields |
| --- | --- | --- | --- |
| `ProjectDocument` | `slotstudio-project` | `1` | `id`, `name`, `canvas`, `assets`, `rigs`, `clips` |
| `RuntimeDocument` | `slotstudio-runtime` | `1` | `assets`, `rigs`, `clips` |

Both discriminators and versions are required. Project and runtime versions have
separate exported constants and evolve independently of the application version.
The project additionally permits `editor: { activeRigId: string | null }`; when
non-null, the ID must reference one of its rigs. Canvas width/height are positive finite numbers.
Runtime documents reject authoring fields such as `id`, `name`, `canvas` and `editor`.
The asset, rig and clip arrays may be empty.

`ProjectDocumentSchema` and `RuntimeDocumentSchema` expose the Zod validators.
`parseProjectDocument(input)` / `parseRuntimeDocument(input)` return validated data
or throw a Zod error. Their `safeParseProjectDocument` / `safeParseRuntimeDocument`
counterparts return a success/error result. Errors contain field paths and messages.
Inputs are already-parsed values; these functions do not read files or decode JSON text.

All defined object shapes reject unknown fields. Required fields have no implicit
defaults. Parsing does not trim identifiers, reorder arrays, normalize weights or repair invalid data.
IDs and names must contain non-whitespace characters; their original strings are preserved.

### Identity and references

- Asset, rig and clip IDs are unique within their respective document collections.
- Bone and attachment IDs are unique within their rig; marker IDs are unique within their clip.
- Names are labels and need not be unique. IDs do not derive from names or array indices.
- Bone parents, region bindings and mesh influences reference bones in the same rig.
- Attachments reference document assets. Clips reference a document rig and target its bones/attachments.
- A clip may contain only one track for each combination of target kind, target ID and channel.
- Parent cycles and missing references are rejected. Bone arrays need not be stored in hierarchy order.

## Assets, rigs and coordinates

An asset contains `id`, `path`, positive integer `width`/`height`, and
`mimeType: 'image/png'`. Paths are raw filesystem-relative strings with forward
slashes, not encoded URLs. Validation rejects absolute paths, empty/dot/traversal
segments, backslashes, control characters, Windows-invalid characters/device names
and trailing dots/spaces. A future resolver must preserve the raw path semantics.
The validator does not open assets or verify PNG bytes/dimensions; fixture tests do that separately.

A rig contains `id`, `name`, at least one bone, `attachments` and `drawOrder`.
Attachments may be empty. Draw order must list every attachment ID exactly once;
it is independent of bone ancestry and attachment array order.

Coordinates use pixels with positive X right and positive Y down. Rotations use
radians; scale is dimensionless. Every transform supplies all five fields:
`{ x, y, rotation, scaleX, scaleY }`. Setup/attachment scales must be finite and nonzero;
negative scales are supported by the data contract. Matrices and inverse binds are not stored.

| Record | Stored fields and meaning |
| --- | --- |
| Bone | `id`, `name`, `parentId` (ID or `null`), `setup` local to its parent. |
| Region attachment | `type: 'region'`, `id`, `name`, `assetId`, `boneId`, `pivot`, `transform`, `opacity`. Pivot is in source-image pixels; transform is local to the bound bone. |
| Mesh attachment | `type: 'mesh'`, `id`, `name`, `assetId`, `opacity`, `vertices`, `triangles`. Bind vertices are in rig space, rather than a single bone's local space. |
| Mesh vertex | `{ x, y, u, v, influences }`, with normalized source-image UVs in `[0, 1]`. |
| Influence | `{ boneId, weight }`, with weight in `[0, 1]`. |

A mesh has at least three vertices. Each vertex has one to four unique bone
influences, summing to one within absolute tolerance `0.000001`. Zero weights are
allowed, but duplicate bone influences are rejected. Validation does not renormalize.
Triangles are a flat integer-index array, with at least one complete group of three.
Each group references distinct in-range vertices with finite, nonzero bind area.
Opacity values are in `[0, 1]`.

The intended future CPU skinning formula and package boundaries are in
[ARCHITECTURE.md](ARCHITECTURE.md). Passing these checks does not establish mesh evaluation or rendering.

## Clips, curves and markers

A clip contains `id`, `name`, `rigId`, positive finite `duration`, boolean `loop`,
`tracks` and `markers`. Both arrays may be empty. All times are seconds.

| Track | Target | Supported channels |
| --- | --- | --- |
| `kind: 'bone'` | `boneId` | `x`, `y`, `rotation`, `scaleX`, `scaleY` |
| `kind: 'attachment'` | `attachmentId` | `opacity` |

Tracks contain at least one key: `{ time, value, easing }`. Key times are strictly
increasing within `[0, duration]`; values are finite. Bone values are absolute local
channel overrides, not offsets from setup. Rotation keys are unwrapped radians.
Animated scale may reach zero, while setup scale may not. Animated opacity stays in `[0, 1]`.

Each key requires one easing descriptor:

- `{ type: 'linear' }`
- `{ type: 'hold' }`
- `{ type: 'bezier', x1, y1, x2, y2 }`, with every control value in `[0, 1]`.

These descriptors are stored and validated; curve sampling is not implemented yet.
A marker contains `id`, `name`, `time` and optional `data`. Marker times are
nondecreasing within `[0, duration]`; ties are allowed and stored order is preserved.
Concrete payloads are JSON values: finite numbers, strings, booleans, null, dense
plain arrays and plain/null-prototype objects. Cycles, functions, symbols, non-finite
numbers, custom prototypes and hidden/extra array metadata are rejected.
Marker storage does not implement callbacks, scrubbing or audio/event orchestration.

## Version policy and fixture evidence

Only the exact format/version pairs above are supported. Wrong formats and older,
newer or malformed versions are rejected; there is no automatic migration today.
Future changes must explicitly update the relevant contract, tests and documentation.
The planned project service must preserve source files when introducing a migration.
No `.slotstudio` folder layout, export manifest, atlas format or foreign-editor compatibility is implemented by this package.

[`@studio/test-fixtures`](../packages/test-fixtures/README.md) supplies schema-validated,
independent clones through `createPriestProjectFixture()` and `createPriestRuntimeFixture()`.
Its authoring canvas is `320 × 480`, distinct from the workspace's `1920 × 1080` reference guide.
The fixture root setup is `(160, 180)`; the weighted robe bind grid spans X `100–220`
and Y `244–404`. Its nine vertices form eight triangles and blend three robe bones
with at most two influences per vertex. Region pivots use the cropped PNG dimensions.

The fixture has 12 bones, eight region attachments, one mesh and nine original PNG
layers. Explicit draw order places a rear arm and robe behind the torso and the front
arm above it. Five short named clip inputs cover loop/one-shot data, all easing kinds,
opacity tracks and marker payloads. They are technical samples, not finished animations
or proof of playback/export parity; the current applications still show reference guides.

Tests cover invalid contracts/references/geometry/weights, fixture parsing, JSON
roundtrips, nested clone independence, PNG metadata/transparency, source/output hashes
and byte-for-byte regeneration. Use the fixture verification commands in the
[README](../README.md); task evidence belongs in [Linear](https://linear.app/spine-rea/project/slot-animation-studio-07e39e20dfb5).
