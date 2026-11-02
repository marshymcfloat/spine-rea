# Slot Animation Studio: planned architecture

Decision date: 2026-11-02. Product authority: [PRODUCT_PLAN.md](PRODUCT_PLAN.md).
Working practices: [WORKFLOW.md](WORKFLOW.md).

The repository implements the desktop foundation: `apps/desktop`,
`apps/runtime-demo`, and reference viewport helpers in `@studio/runtime-pixi`.
The skeleton/clip evaluator, schemas, compiler, authored editing, persistence, and
animation-player interfaces below remain planned. Record consequential changes
here; keep task status and execution evidence in Linear.

## Package responsibilities

Use a TypeScript workspace with thin applications and independently testable packages.
Create packages when their first implementation task needs them, not as empty scaffolds.

| Application/package | Responsibility | Boundary |
| --- | --- | --- |
| `apps/desktop` | Electron main/preload, React editor, project commands, panels and interaction tools. | Renderer accesses local files only through validated preload operations. |
| `apps/runtime-demo` | Standalone browser consumer of exported files. | Imports runtime packages; no editor internals or Electron. |
| `@studio/schema` | Versioned authoring/runtime types, validation and explicit migrations. | No React, Electron, Pixi or filesystem dependency. |
| `@studio/animation-core` | Local/world transforms, clip sampling, interpolation, mixing, marker crossing and CPU skinning. | Pure data/math; no renderer, DOM, I/O or wall-clock reads. |
| `@studio/compiler` | Validates authoring data and produces runtime data and asset requirements. | No editor/UI dependency; filesystem writes remain a desktop service. |
| `@studio/runtime-pixi` | Reference canvas guides and view fitting now; runtime loading/playback and evaluated geometry rendering later. | No React, Electron or authoring commands. |
| `@studio/slot-events` | Later resolved-event mapping and deterministic sequence playback. | Presentation only; no outcome calculation or wagering logic. |
| `@studio/test-fixtures` | Original small rigs, images, clips and expected results. | Reproducible data shared by parity tests and the demo. |

Desktop services own dialogs, asset import, atomic writes, backups and export output.
Keep those services separate from React components and pure packages.
The editor's authored model is serializable data; Pixi objects are derived view state.

## Data and rendering flow

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

- Authoring projects are human-readable `.slotstudio` directories with a manifest, JSON data and copied source assets.
- Use stable identifiers and project-relative asset paths; names are editable labels, not identity.
- Keep project and runtime schema versions explicit and independent of application release versions.
- The project retains setup data, editing metadata and original PNGs; the compiler strips editor-only state.
- v0.1 exports a manifest, validated runtime JSON and original PNG assets with relative references.
- Validate before import/save/export; future schema migrations must preserve the original project until a new save succeeds.
- Autosave drafts and backups are separate from the last successful explicit save; recovery never overwrites that save silently.
- Later atlas packing remaps UVs and asset references, without changing bind vertices or sampled bone transforms.

Freeze the initial field-level schemas with a minimal weighted fixture at Gate 1.
Do not imply support for foreign project formats or `.skel` compatibility.

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

CPU skinning lives in `animation-core` and reuses output arrays. Pixi consumes
evaluated positions, UVs and indices through its mesh geometry interface. Keep React
out of frame-by-frame evaluation. Profile before considering a separate GPU path.

## Playback and public runtime concept

The following is the target API concept, not a currently available package:

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

All decisions below were accepted on 2026-11-02; revise with dated rationale when needed.

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
