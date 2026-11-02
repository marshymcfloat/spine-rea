# Slot Animation Studio: architecture

Direction updated: 2026-11-03. Product authority: [PRODUCT_PLAN.md](PRODUCT_PLAN.md).
Working practices: [WORKFLOW.md](WORKFLOW.md).

The repository implements the desktop foundation: `apps/desktop`,
`apps/runtime-demo`, and reference viewport helpers in `@studio/runtime-pixi`.
It also implements strict project/runtime validation in `@studio/schema` and original
priest data/art in `@studio/test-fixtures`; see [FORMATS.md](FORMATS.md).
Shared bone/clip evaluation and host-controlled playback are implemented in
`@studio/animation-core`; see [PLAYBACK.md](PLAYBACK.md). These merged foundations
still display reference guides. CPU weighted geometry and priest previews are preserved
in unmerged [SPI-9 draft PR #5](https://github.com/marshymcfloat/slot-animation-studio/pull/5)
at `0395db1`, with tests and performance evidence; they are not capabilities of `main`.
The common scene model, direct editing, persistence and export remain planned.
Record consequential changes here; keep task status
and execution evidence in [Linear](https://linear.app/spine-rea/project/slot-animation-studio-07e39e20dfb5).

## Package responsibilities

Use a TypeScript workspace with thin applications and independently testable packages.
Create packages when their first implementation task needs them, not as empty scaffolds.

| Application/package | Status | Responsibility | Boundary |
| --- | --- | --- | --- |
| `apps/desktop` | Fixture preview | Electron/preload, React workspace, priest transport/view controls; authored editing follows. | Local I/O belongs behind validated preload operations; bridge currently reads app info only. |
| `apps/runtime-demo` | Fixture preview | Independent browser priest playback; exported animation loading follows. | Runtime packages only; no editor internals or Electron. |
| `@studio/schema` | Implemented | Strict versioned authoring/runtime types and validation. | Zod/data only; no React, Electron, Pixi or filesystem access. |
| `@studio/scene-core` | Planned | Common node/group hierarchy, scene transforms and evaluated property values. | Pure schema/data/math; no renderer, DOM, I/O or desktop dependencies. |
| `@studio/animation-core` | Bones/playback implemented; geometry in unmerged SPI-9 proof | Preserve bone sampling, mixing, playback/markers and CPU skinning; extend through the agreed common property-track contract. | Pure schema/data/math; no renderer, DOM, I/O or wall clock. |
| `@studio/compiler` | Planned | Authoring-to-runtime conversion and asset requirements. | No editor/UI dependency; desktop services write files. |
| `@studio/runtime-pixi` | Foundation; priest rendering in unmerged SPI-9 proof | Reference guides/view fitting; planned common raster/vector/group/mask/rig render adapters consume evaluated scene data. | No React, Electron or authoring commands; no duplicate animation math. |
| `@studio/slot-events` | Planned | Resolved-event mapping and deterministic sequences. | Presentation only; no outcome/wagering logic. |
| `@studio/test-fixtures` | Implemented | Original PNG layers, validated priest documents, cloned constructors and deterministic regeneration. | Technical test inputs/provenance, without a compiler or evaluator. |

Desktop services own dialogs, asset import, atomic writes, backups and export output.
Keep those services separate from React components and pure packages.
The editor's authored model is serializable data; Pixi objects are derived view state.

Editor-only image preparation, vector tracing and optional segmentation packages are
planned when their first task needs them. Source/mask preparation must not enter the
game runtime. AI models, accounts and network access are not prerequisites for editing.

## Shared scene and timeline direction

The v0.2 foundation is a common scene canvas and property timeline. Prove symbol
import, selection/transforms, auto-keyframing, scrubbing, undo, save/reopen and standalone
export first; extend it to a vector sigil and then the priest rig workflow. Keep the
existing Electron/Pixi foundation and tested bone/player APIs. Add small adapters and
explicit compatibility handling rather than renaming or replacing working subsystems.

The next contract must define stable scene nodes for raster, group, vector and rig
content, parent relationships, supported properties, masks and asset references.
Text, emitters, cameras and advanced properties follow their product gates; they are
not implemented node types today. General property tracks and rig controls share clip
time, easing, mixing and playback semantics. A rig remains a specialized evaluator
under the common scene model, not a second unrelated timeline.

Scene parenting and bone parenting have distinct purposes. Preserve the flat authored
attachment draw order inside a rig; do not derive overlap from either hierarchy.
Apply a rig node's scene transform once after skeleton-space geometry evaluation.
The contract must define cross-type composition/order explicitly before implementation.

Read [FORMATS.md](FORMATS.md) before defining that contract. Product v0.2 does not
change either current integer schema version. Freeze ownership/interfaces and a tested
version 1 migration or legacy adapter before parallel dependent implementation.
Keep public pose/player snapshots independent; reuse geometry only through an explicit
output-ownership API. Selection, viewport and playhead state remain transient; authored
node/property/mask edits go through undoable document commands.

### Nondestructive import

Planned PNG/JPG/SVG import preserves project-owned originals and records the relationship
to derived paths, masks and extracted raster layers. Manual crops/masks retain underlying
pixels. Vector tracing produces editable graphic regions; segmentation proposes raster
masks. Neither supplies semantic rig parts or hidden anatomy automatically.

Keep file access behind validated desktop services and validate decoded content and
relative references. SVG support needs a defined safe subset without executable code
or uncontrolled external resources. Runtime exports contain only required prepared
graphics, never editor preparation services or AI dependencies. Evaluate tracing and
optional segmentation separately after manual editing works; profile their bounded,
cancellable work before choosing workers or caches.

## Performance architecture

Follow [PERFORMANCE.md](PERFORMANCE.md) for implementation choices, provisional budgets,
workload/device definitions, profiling and review evidence. Frame stability, input
responsiveness, startup and resource lifetime are design requirements.

- Keep Electron event loops responsive and IPC coarse; sustained background jobs need
  cancellation, bounded queues and revision-aware results.
- Keep a single host-controlled frame path. React handles editor UI state; the shared
  evaluator and Pixi adapter handle animation without per-frame UI commits or IPC.
- Build validated data/index caches at document revisions, with explicit invalidation.
  Reuse explicit geometry outputs/private staging while preserving public snapshots.
- Give rendering resources and asynchronous work explicit owners and cleanup paths,
  including cached-page restoration and project changes.
- Select workers, batching, culling, caching or GPU evaluation from measured bottlenecks.
  Preserve draw order, parity, recovery and security; verify performance changes in
  the packaged application and the applicable standalone host.

The current evaluator/controller returns independent allocated snapshots. No zero-allocation,
production mesh-capacity or sustained-FPS claim follows from its functional tests.

## Data and rendering flow

The following is the planned common authoring/playback flow. The merged evaluator
currently produces bone matrices and attachment opacity. General scene evaluation,
compilation and project filesystem services are not implemented; SPI-9 geometry is
preserved separately as described above.

```text
PNG/JPG/SVG → validated import → original sources + derived paths/masks
UI action → undoable command → validated scene/track/rig project
                                      ├→ compiler → runtime scene/assets
                                      │                  ├→ editor preview
                                      │                  └→ standalone export
                                      └→ project save/recovery

runtime scene + clip/time → shared scene/animation evaluation
                         → properties + transforms + rig geometry
                         → runtime-pixi → Pixi canvas
```

The preview may refresh compiled data incrementally, but it must not maintain an
independent interpolation or skinning implementation. Overlay tools render editor
selection, bones and weights without entering the exported render data.

### Project and export contract

The implemented JSON structures and validation/version policy are in [FORMATS.md](FORMATS.md).
Folder persistence, migration services and export packaging below remain planned.

- Authoring projects are human-readable `.slotstudio` directories with a manifest, JSON data and copied source assets.
- Use stable identifiers and project-relative asset paths; names are editable labels, not identity.
- Keep project and runtime schema versions explicit and independent of application release versions.
- The project retains editable nodes/tracks/rig setup, source images/SVG, derived paths/masks and provenance; the compiler strips editor-only state.
- The initial symbol proof exports a manifest, versioned runtime data and required graphics with relative references. Raster, vector and rig playback share the pipeline as their gates arrive.
- Define the supported SVG/path export subset explicitly. Complex vectors may later be baked to textures after fidelity and performance measurements; do not require atlas optimization for the first proof.
- Validate before import/save/export; future schema migrations must preserve the original project until a new save succeeds.
- Autosave drafts and backups are separate from the last successful explicit save; recovery never overwrites that save silently.
- Later atlas packing remaps UVs and asset references, without changing bind vertices or sampled bone transforms.

Initial project/runtime JSON version 1 is implemented with a weighted fixture.
No migration, foreign project import or `.skel` compatibility is implemented.
Retain those fixtures and validators. The next schema contract must specify an explicit
new integer version and deterministic conversion, or a documented legacy adapter,
with validation/parity tests; do not relabel version 1 as product v0.2 or silently add fields.

## Skeleton and weighted meshes

Basic bones remain part of the shared motion MVP. Mesh creation, topology/bind editing,
painted/numeric weights and rebind UI are P2 authoring work. Retain existing version 1
mesh data and the SPI-9 CPU proof/tests; this reprioritization does not complete its
open foreground-performance acceptance or require discarding its implementation.
The following constraints apply when that preserved geometry is used or extended.

Use 2D affine transforms, pixels, positive X right, positive Y down and radians
internally. Store all timeline values in seconds. The UI may display degrees or frames.
The character's scene transform is separate from its skeleton-space evaluation.

- Bones have stable IDs, one optional parent and local setup transforms; reject hierarchy cycles.
- Evaluate bone world matrices in parent-before-child order using full affine composition.
- Keep render attachments in an ordered flat list, separate from the bone hierarchy.
- An attachment references its texture and rigid binding or weighted mesh; opacity is render data.
- Meshes contain bind vertices, source-image UVs, triangle indices and per-vertex bone influences.
- For P2 authoring, begin with editable subdivided rectangular grids over transparent PNGs, without contour generation.
- Keep at most four non-negative influences per vertex, normalized to sum to one.
- Painting and numeric edits share weight normalization; commit each stroke as one undoable command.

### Bind-space evaluation

Let `p` be a bind vertex in skeleton coordinates, `Bᵢ` a bone's setup world matrix,
`Wᵢ(t)` its current world matrix and `wᵢ` the corresponding vertex weight:

```text
p(t) = Σᵢ wᵢ × Wᵢ(t) × inverse(Bᵢ) × p
```

Bake an attachment's setup placement into its skeleton-space bind vertices once.
Compute/cache inverse bind matrices from the setup pose; reject singular bind transforms.
Apply the character's scene transform once after skinning. Do not parent a skinned
mesh under a bone and accidentally apply that bone's transform again.

Setup edits and rebind are explicit, undoable operations that update affected bind
data atomically. They must not silently reinterpret animated poses as setup poses.
Runtime playback keeps topology, UVs and weights fixed; only bones and render channels animate.
Direct per-vertex animation requires its own later contract; it is not provided by CPU bone skinning.

CPU skinning belongs in `animation-core`. The unmerged SPI-9 proof uses caller-owned
reusable geometry outputs and private staging for atomic writes; it does not pool public
pose snapshots. Preserve that ownership and numerical/parity evidence when integrating.
Pixi consumes evaluated positions, UVs and indices through retained geometry. Keep React
out of frame-by-frame evaluation. Profile before considering a separate GPU path.

## Playback and public runtime concept

The following is the target rendered-player API concept. The implemented pure controller
is `createPlaybackController(evaluator)`; its API and timing rules are in [PLAYBACK.md](PLAYBACK.md).

```ts
const player = await createAnimationPlayer({ container, manifestUrl });
player.play('priest_idle', { loop: true, crossfadeSeconds: 0.2 });
player.update(deltaSeconds);
player.seek(timeSeconds);
player.pause();
player.resume();
player.stop();
player.dispose();
```

The host supplies elapsed seconds; one ticker owns updates. Playback supports speed,
loops, one-shots and crossfades. Seeking samples the requested pose without advancing
an independent clock or emitting playback markers. Named clip markers expose callbacks
while forward playback crosses them; sequence/audio orchestration follows later.
Keep the implemented controller contract intact. Define the generalized scene/player
adapter and loading API explicitly with the symbol proof rather than implying this
rendered-player concept already exists.
Rendering must use the same evaluated data whether called by the editor or game.

Later event adapters translate already-resolved game events into visual commands.
Sequences define priority, interruption and final visual state. Skip/fast playback
resolves required state deterministically; it never creates or modifies game results.
Define the adapter against inspected game contracts before shipping that integration.

### Desktop boundary

Electron main owns filesystem access; preload exposes a small allowlist of validated
operations. Enable context isolation and renderer sandboxing; disable renderer Node
integration. Validate IPC payloads and project-relative paths in the privileged service.
Projects cannot execute code or load plugins. Offline operation is the default.

### Required architectural evidence

- Fixed timestamps yield matching raster/vector/rig properties and transforms before/after compilation; include every skinned vertex when geometry is involved.
- Version 1 fixtures survive explicit migration/legacy loading without losing IDs, clip/marker semantics, draw order or bind data.
- Symbol transforms and auto-keyframing preserve unrelated tracks through undo/redo and save/reopen; vector/sigil playback uses the same timeline/runtime path.
- Source raster/SVG files survive masking, tracing and extraction; derived assets retain their provenance.
- Bind pose reproduces source geometry; single/multiple influences and nested/mirrored transforms behave consistently.
- Preview and standalone runtime cover loops, reverse scrubbing and crossfades with the same fixtures.
- Serialization, undo/redo and crash recovery preserve authored data and stable references; add rebind evidence with P2 mesh tools.
- Invalid weights, indices, assets and schema versions produce actionable validation errors.
- Electron smoke checks exercise real import/save/reopen/export; geometry tests alone do not validate interaction.

## Decision log

Initial decisions were accepted on 2026-11-02; subsequent entries record their date and rationale.
The v0.2 decision below supersedes the earlier mesh-first release priority while
preserving its implemented formats, math and tests.

| Decision | Rationale | Deferred alternative |
| --- | --- | --- |
| Electron/React/TypeScript editor foundation | Own the product model and keep a consistent desktop/browser toolchain. | Shell replacement only after a worthwhile identical-scene benchmark; no rewrite required. |
| PixiJS preview and game adapter | Keep rendering close to The Ninth Rite's intended runtime. | Other engine adapters. |
| Historical: meshes and weight painting in v0.1; superseded 2026-11-03 | Original rig-first priority. v0.2 proves direct symbol motion first and moves mesh authoring to P2. | Preserved CPU proof; advanced mesh tools follow later. |
| Shared CPU skinning first | One deterministic evaluator makes correctness and parity testable. | GPU skinning after measured need. |
| Flat attachment draw order | Visual overlap must not depend on bone ancestry. | Advanced depth/compositing systems. |
| Explicit setup/rebind and seconds timing | Avoid ambiguous bind changes and frame-rate-dependent data. | Implicit rebinding and frame-index-only timelines. |
| Preserve placeholder art and simple initial graphic exports | Prove shared authoring/playback before art and atlas optimization; v0.2 adds raster/vector symbol proof first. | Lossless import of existing priest deformation; automatic art preparation. |
| Resolved-event presentation only | Preserve the game's separate ownership of results and mathematics. | Outcome generation and wagering features are excluded. |

### Foundation implementation: 2026-11-02

- Pin pnpm 10.19.0 and the dependency lockfile on Node 24. Electron Forge 8 and Vite 8 build the desktop shell; React 19 and PixiJS 8 render its workspace. The [Forge Vite integration](https://www.electronforge.io/config/plugins/vite) is labeled experimental, so upgrades are explicit changes with packaging/smoke verification.
- Forge emits CommonJS `main.cjs` and `preload.cjs`. Production assets use the restricted `app://studio` protocol and a Content Security Policy. The sandboxed preload exposes only `getAppInfo()`; filesystem operations wait for their owning tasks.
- Bundle renderer libraries into the application output. They are desktop development dependencies; no React/Pixi Node runtime dependencies are needed by the packaged main/preload processes.
- Use pnpm's hoisted linker for Forge compatibility and resolve real paths/deduplicate Pixi in the renderer. This keeps the shared guides and host on one Pixi instance, including its strict-CSP polyfill.
- Initialize Pixi in each host, use the shared guides module in desktop and browser, and render on view changes rather than running an idle animation ticker. The reference artboard does not establish a project/export schema.
- Run type/unit checks and packaged Electron smoke tests in Windows CI. Installer creation remains a separate task.

### Data contract implementation: 2026-11-02

- Use separate literal project/runtime format identifiers and version constants. Both start at version 1; unsupported versions and unknown fields fail validation. No automatic migrations are provided.
- Validate data with Zod in `@studio/schema`, without renderer/UI/filesystem dependencies. Expose throwing and safe-parse entry points with field-path errors; preserve supplied IDs/names and array order.
- Store complete local setup transforms and absolute local clip channels; use seconds and unwrapped radians. Setup scales are nonzero; animated scales may reach zero. Keep region pivots in image pixels and mesh vertices in rig bind space.
- Reject broken references, bone cycles, invalid triangles, duplicate/unnormalized weights and malformed tracks/markers. Validation does not silently repair input. PNG existence/content checks are fixture evidence, not schema I/O.
- Keep attachment draw order explicit and independent of hierarchy. Store mesh influences rather than inverse-bind matrices; the future evaluator derives those matrices from setup transforms.
- Provide original nine-layer geometric priest art, source/output hashes and byte-reproducible Node generators. The validated 12-bone/weighted-robe documents and five technical clip inputs are independently cloned for callers; they do not establish evaluation, compiler output or visual parity.

### Shared bone playback implementation: 2026-11-02

- Validate/snapshot the selected rig and clips once. Resolve hierarchy iteratively, retain source array order in pose outputs, and keep draw order independent. Pure sampling returns local transforms, full affine world matrices and attachment opacity.
- Compose translation × rotation × scale; preserve nested nonuniform/mirrored transforms. Sample outgoing-key linear, hold and cubic Bézier easing with X inversion. Unkeyed channels retain setup; rotation keys and blends remain unwrapped scalars.
- Blend local channels before computing matrices. Normal fades advance both clips; interrupted fades capture a frozen mixed pose. Clip and fade clocks use host elapsed seconds scaled by playback speed; pause/speed zero freeze them.
- Return marker records from updates so hosts dispatch callbacks outside evaluation. Seeking is silent and cancels fades. Preserve unwrapped loop cursors, stable boundary/tie order and pending start markers. Reject unsafe derived arithmetic or more than 10,000 events before changing controller state.
- Own independent snapshots at input/output boundaries. Renderer-free tests compare authoring/runtime fixture bones and opacity after JSON serialization. These checks do not establish compiler, skinned-vertex or visual parity; mesh evaluation follows separately.

### Performance development policy: 2026-11-03

Keep concise mandatory rules in AGENTS.md and the measurement/implementation routine
in PERFORMANCE.md. Require measured workload/device evidence for affected runtime paths;
use provisional targets until representative hardware baselines exist. Preserve safe
public snapshots and shared evaluation, and optimize measured costs rather than adding
speculative parallelism or weakening security. FPS and capacity claims remain unverified
until captured on the applicable rendered workload.

### Unified motion direction supersedes mesh-first delivery: 2026-11-03

- Adopt the approved v0.2 product direction: one scene canvas, property timeline and
  rendering/export pipeline. The symbol/sigil proof precedes the layered priest/basic
  bone workflow; mesh authoring and painted/numeric weights move to P2. This changes
  delivery priority, not the validity of existing CPU geometry or fixture tests.
- Preserve the merged Electron/Pixi/schema/bone/player foundation and unmerged SPI-9
  proof. Keep its open performance criterion and evidence in Linear/PR #5; do not
  treat reprioritization as a merge or a completed measurement. Electron remains the
  provisional Windows shell, with its bridge replaceable independently of data/math.
- Establish common scene/property and asset-provenance contracts before implementation.
  Product labels remain independent of format integers; preserve version 1 through a
  tested migration or legacy adapter. Keep pure shared evaluation, snapshot isolation,
  flat rig draw order and current security/performance rules.
- Manual nondestructive PNG/JPG/SVG editing and masks precede optional vector tracing
  and AI mask experiments. Exported games do not require those preparation services.

### Preserved SPI-9 geometry and fixture-preview proof: 2026-11-03

This describes the implementation retained in draft PR #5, not a completed
performance gate or P2 authoring UI.

- Keep the version 1 data format unchanged. Compile inverse setup matrices and
  bone-local weighted points at revision time. Write shared rig-space region quads
  and weighted vertices into explicit consumer-owned Float32 buffers; stage/check
  all positions before committing. Reject singular/unrepresentable inverse binds
  and Float32 overflow; retain mirrored/nested transforms and animated zero scale.
- Freeze geometry identity, UVs, topology and draw order for that revision. Rebuild
  after authored setup/topology/order changes. Existing pose/player APIs continue
  returning independent snapshots; geometry reuse is an explicit separate contract.
- Retain Pixi meshes in flat authored order and upload positions/opacity. Hosts
  load original fixture textures and own disposal; no Pixi-side skinning or bone
  parenting is allowed for evaluated rig-space geometry.
- Share one preview host clock/lifecycle between React and the standalone demo.
  Pause advancement while hidden and start a fresh timestamp on visibility return;
  deliberate inactive time is excluded rather than clamping an active-frame delta.
  Preserve persisted-page restoration and clean partial asynchronous initialization.
- Profile the original 12-bone priest and a bounded 65×65 four-influence robe. The
  denser fixture is diagnostic data, not a new authored production capability.
  Keep traces/results in Linear/PR evidence; lower-spec hardware remains a release gate.
