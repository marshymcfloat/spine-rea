# Slot Animation Studio: architecture

Decision date: 2026-11-02. Product authority: [PRODUCT_PLAN.md](PRODUCT_PLAN.md).
Working practices: [WORKFLOW.md](WORKFLOW.md).

The repository implements the desktop foundation: `apps/desktop`,
`apps/runtime-demo`, and reference viewport helpers in `@studio/runtime-pixi`.
It also implements strict project/runtime validation in `@studio/schema` and original
priest data/art in `@studio/test-fixtures`; see [FORMATS.md](FORMATS.md).
Shared bone/clip playback and CPU geometry are implemented in `@studio/animation-core`;
see [PLAYBACK.md](PLAYBACK.md) and [MESHES.md](MESHES.md). Both applications render the
original priest technical fixture. The compiler, authored editing, persistence and
exported animation-player loading below remain planned.
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
| `@studio/animation-core` | Implemented | Hierarchy transforms, clip sampling, local mixing, host-clock playback/markers and CPU region/weighted geometry. | Pure schema/data/math; no renderer, DOM, I/O or wall clock. |
| `@studio/compiler` | Planned | Authoring-to-runtime conversion and asset requirements. | No editor/UI dependency; desktop services write files. |
| `@studio/runtime-pixi` | Fixture rendering | Retained geometry adapter, preview clock/lifecycle and reference/view helpers. | No React, Electron or authoring commands; shared math stays in the core. |
| `@studio/slot-events` | Planned | Resolved-event mapping and deterministic sequences. | Presentation only; no outcome/wagering logic. |
| `@studio/test-fixtures` | Implemented | Original PNG layers, validated priest documents, cloned constructors and deterministic regeneration. | Technical test inputs/provenance, without a compiler or evaluator. |

Desktop services own dialogs, asset import, atomic writes, backups and export output.
Keep those services separate from React components and pure packages.
The editor's authored model is serializable data; Pixi objects are derived view state.

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

The following is the target authoring/playback flow. The shared core currently
produces bone matrices, attachment opacity and rig-space geometry. Compilation and
project filesystem services remain planned.

```text
PNG files → desktop import service → project-owned source assets
UI action → undoable command → validated authored project
                                      ├→ compiler → runtime data
                                      │                  ├→ editor preview
                                      │                  └→ exported JSON + PNGs
                                      └→ project save/recovery

runtime data + clip/time → animation-core → pose + skinned geometry
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
- The project retains setup data, editing metadata and original PNGs; the compiler strips editor-only state.
- v0.1 exports a manifest, validated runtime JSON and original PNG assets with relative references.
- Validate before import/save/export; future schema migrations must preserve the original project until a new save succeeds.
- Autosave drafts and backups are separate from the last successful explicit save; recovery never overwrites that save silently.
- Later atlas packing remaps UVs and asset references, without changing bind vertices or sampled bone transforms.

Initial project/runtime JSON version 1 is implemented with a weighted fixture.
No migration, foreign project import or `.skel` compatibility is implemented.

## Skeleton and weighted meshes

Use 2D affine transforms, pixels, positive X right, positive Y down and radians
internally. Store all timeline values in seconds. The UI may display degrees or frames.
The character's scene transform is separate from its skeleton-space evaluation.

- Bones have stable IDs, one optional parent and local setup transforms; reject hierarchy cycles.
- Evaluate bone world matrices in parent-before-child order using full affine composition.
- Keep render attachments in an ordered flat list, separate from the bone hierarchy.
- An attachment references its texture and rigid binding or weighted mesh; opacity is render data.
- Meshes contain bind vertices, source-image UVs, triangle indices and per-vertex bone influences.
- Begin with editable subdivided rectangular grids over transparent PNGs, without contour generation.
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
Direct per-vertex animation is outside v0.1.

CPU skinning belongs in `animation-core`, with explicit caller-owned output buffers
and private staging for atomic writes. Public pose snapshots retain their documented
isolation. Pixi consumes evaluated positions, UVs and indices through retained mesh
geometry. Keep React
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
The exact initial API is frozen with the Gate 1 runtime fixture.
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

- Fixed timestamps yield matching bone matrices and every skinned vertex before/after compilation.
- Bind pose reproduces source geometry; single/multiple influences and nested/mirrored transforms behave consistently.
- Preview and standalone runtime cover loops, reverse scrubbing and crossfades with the same fixtures.
- Serialization, undo/redo, rebind and crash recovery preserve authored data and stable references.
- Invalid weights, indices, assets and schema versions produce actionable validation errors.
- Electron smoke checks exercise real import/save/reopen/export; geometry tests alone do not validate interaction.

## Decision log

Initial decisions were accepted on 2026-11-02; subsequent entries record their date and rationale.

| Decision | Rationale | Deferred alternative |
| --- | --- | --- |
| Original Electron/React/TypeScript editor | Own the product model and keep a consistent desktop/browser toolchain. | Forking an existing editor; replacing Electron with Tauri. |
| PixiJS preview and game adapter | Keep rendering close to The Ninth Rite's intended runtime. | Other engine adapters. |
| Meshes and weight painting in v0.1 | Flexible priest robes/sleeves are part of initial usability. | Direct vertex animation, IK and advanced meshing. |
| Shared CPU skinning first | One deterministic evaluator makes correctness and parity testable. | GPU skinning after measured need. |
| Flat attachment draw order | Visual overlap must not depend on bone ancestry. | Advanced depth/compositing systems. |
| Explicit setup/rebind and seconds timing | Avoid ambiguous bind changes and frame-rate-dependent data. | Implicit rebinding and frame-index-only timelines. |
| Placeholder art and original PNG exports first | Prove the full authoring/playback path before art and atlas optimization. | Lossless import of existing priest deformation; automatic art preparation. |
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

### Shared geometry and fixture preview: 2026-11-03

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
