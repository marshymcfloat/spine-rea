# Project and runtime formats

Implemented: 2026-11-02. The authoritative validators and exported TypeScript types
are in [`@studio/schema`](../packages/schema/src/index.ts). These contracts describe
data. Shared bone/clip evaluation and host-clock playback are described in
[PLAYBACK.md](PLAYBACK.md). The merged foundation has no mesh renderer, compiler,
project filesystem service or generalized scene player. CPU mesh geometry and fixture
previews are preserved in unmerged [SPI-9 PR #5](https://github.com/marshymcfloat/slot-animation-studio/pull/5),
without changing these version 1 contracts.

The v0.2 product direction in [PRODUCT_PLAN.md](PRODUCT_PLAN.md) calls for common scene
nodes/property tracks and raster/vector/mask assets. Those contracts are planned;
the tables below describe only the currently implemented strict version 1 formats.
Product v0.2 is not a `schemaVersion` value.

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

The CPU skinning formula and package boundaries are in
[ARCHITECTURE.md](ARCHITECTURE.md). Passing these checks does not establish mesh evaluation or rendering.
Moving mesh authoring/weight tools to P2 does not remove mesh records from version 1
or weaken their validation. Bind/topology/weight editing remains a later UI capability.

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

These descriptors are sampled by the shared evaluator according to [PLAYBACK.md](PLAYBACK.md).
A marker contains `id`, `name`, `time` and optional `data`. Marker times are
nondecreasing within `[0, duration]`; ties are allowed and stored order is preserved.
Concrete payloads are JSON values: finite numbers, strings, booleans, null, dense
plain arrays and plain/null-prototype objects. Cycles, functions, symbols, non-finite
numbers, custom prototypes and hidden/extra array metadata are rejected.
The shared controller returns marker crossings to its host; seeking is silent.
Marker storage itself does not invoke callbacks or implement audio/event orchestration.

## Version policy and fixture evidence

Only the exact format/version pairs above are supported. Wrong formats and older,
newer or malformed versions are rejected; there is no automatic migration today.
Future changes must explicitly update the relevant contract, tests and documentation.
The planned project service must preserve source files when introducing a migration.
No `.slotstudio` folder layout, export manifest, atlas format or foreign-editor compatibility is implemented by this package.

### Planned v0.2 scene contract and compatibility

Product release labels and project/runtime format integers are separate. Both existing
formats remain at integer `1`; do not change fixtures to `0.2`, accept new unknown fields
or silently reinterpret existing rig tracks. A future incompatible contract must name
its next integer version explicitly for each affected format before implementation.

The next contract must define common raster/group/vector/rig nodes, hierarchy/order,
asset provenance, supported properties and general property tracks. Define masks,
source versus derived graphics and runtime export representations with that contract.
These are design requirements, not additional fields or APIs accepted by today's validators.
Text, emitters, cameras and advanced vector/mesh properties follow later scope gates.

Keep the existing bone/player APIs and independent snapshot semantics. Adapt version 1
rigs/tracks into the common scene model through a documented legacy adapter or an
explicit deterministic migration; do not create an unrelated rig timeline. A rig's
flat attachment order and rig-space bind geometry remain distinct from scene parenting.

Compatibility tests must retain the original version 1 project/runtime fixtures and
prove stable IDs/references, asset paths, setup/bind data, weights, draw order, easing,
clip timing and markers. Compare evaluated poses/geometry where applicable before and
after conversion, including serialization and independent ownership. Reject unsupported
versions and invalid input with field-path errors; conversion must not silently repair
weights, discard unknown data or overwrite originals. No converter is implemented yet.

Current assets accept PNG only. Planned PNG/JPG/SVG import must preserve originals and
separate derived paths, masks and extracted raster layers with explicit source references.
The schema and privileged importer must agree on the supported SVG subset and safe
relative asset resolution; a new MIME string alone does not establish import/render support.
Tracing flat artwork and proposing semantic-part masks are separate preparation operations.

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
or proof of compiler/export parity; the applications render these technical fixtures.

Tests cover invalid contracts/references/geometry/weights, fixture parsing, JSON
roundtrips, nested clone independence, PNG metadata/transparency, source/output hashes
and byte-for-byte regeneration. Use the fixture verification commands in the
[README](../README.md); task evidence belongs in [Linear](https://linear.app/spine-rea/project/slot-animation-studio-07e39e20dfb5).
