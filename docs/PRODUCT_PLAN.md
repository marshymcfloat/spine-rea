# Slot Animation Studio: product plan

Accepted direction: 2026-11-02. First customer: The Ninth Rite production team.

This document defines the accepted product scope. The repository currently contains
the development harness and desktop/canvas foundation; the authoring and playback
features below remain planned.
Implementation decisions belong in [ARCHITECTURE.md](ARCHITECTURE.md).
Execution follows [WORKFLOW.md](WORKFLOW.md), with task status in
[Linear](https://linear.app/serviceflow/project/slot-animation-studio-baaf385fd9f6).

## Product outcome

Build an original, offline-first Windows 10/11 x64 desktop editor for authoring
2D characters and visual sequences used in slot games. Start with a usable priest
animation workflow for The Ninth Rite; consider commercialization after production use.

- Use Electron, React, TypeScript and PixiJS, with an independent game runtime.
- Keep projects local, editable and recoverable, without an account or cloud service.
- Share animation evaluation between editor preview and exported playback.
- Consume resolved game events in later slot tools; never determine game outcomes.
- Use original artwork and appropriately licensed dependencies and reference material.

## First usable release: v0.1

The release must let an animator create the five priest clips without hand-editing
JSON, save and reopen the work, and play its export in a standalone PixiJS demo.
Meshes are required in this release, rather than an advanced-animation follow-up.

| Area | Required behavior |
| --- | --- |
| Desktop | Offline installer and development build; native open/save dialogs, menus and recent projects. |
| Projects | Folder-based `.slotstudio` projects, stable IDs, relative asset paths and explicit format versions. |
| Recovery | Atomic saves, autosave drafts, backups and a recoverable last valid project after interruption. |
| Canvas | Zoom, pan, guides, layer ordering, selection, multi-select, pivots and transform handles. |
| Art | Transparent PNG import and drag/drop; copy source images into the project. |
| Bones | Editable hierarchy, parent/child transforms, attachment binding and setup pose. |
| Meshes | Subdivided rectangular texture grids, editable bind vertices and fixed triangle topology during playback. |
| Weights | Initial bone binding, weight painting, weight visualization and numeric edits for selected vertices. |
| Weight rules | At most four non-negative influences per vertex, normalized to sum to one. |
| Setup | Separate Setup and Animate modes; explicit, undoable rebind for bind-pose changes. |
| Timeline | Clips; position, rotation, scale and opacity keys; loops, scrubbing, playback and copy/paste. |
| Curves | Linear, hold and editable basic easing. |
| Player | One-shot/loop playback, pause/resume, stop, speed control and crossfades. |
| Clip markers | Named markers and runtime callbacks; scrubbing is silent. Multitrack audio/event orchestration follows later. |
| Editing | Undo/redo for authored project changes, including mesh and weight edits; coalesce one paint stroke into one action. |
| Export | Versioned runtime JSON, manifest and original PNG textures; exported files do not depend on the editor. |
| Validation | Deterministic fixtures and automated authoring/export/runtime parity checks. |

Mesh motion in v0.1 comes from weighted bones. Direct vertex-animation tracks,
free-form contour meshing, IK and physics are deferred. Weight painting is in scope.
Use CPU skinning initially and keep draw order independent of the bone hierarchy.

### Priest acceptance clips

| Clip | Acceptance |
| --- | --- |
| `priest_idle` | Looped breathing with a visibly deforming robe or sleeve. |
| `priest_pray` | Head and hands reach prayer position; the hold can loop. |
| `priest_kneel` | Placeholder rig lowers and returns to ready without broken transforms or mesh binding. |
| `priest_praise` | A readable one-shot large-win reaction and stable return/transition. |
| `priest_entity` | A distinct one-shot intervention reaction and stable return/transition. |

Start with original layered placeholder art, including a weighted robe and sleeve.
The placeholders establish tool behavior; they do not establish final animation quality.

The Ninth Rite's existing priest deformation is reference behavior, not a lossless
import path into skeletal animation. Rebuild it as a rig and authored clips. A convincing
final kneel needs suitable separated art, joint coverage and reconstructed hidden pixels;
deforming a flattened image cannot supply those pixels.

## Gated delivery

Complete each gate before increasing scope. Independent work may run in parallel
after its shared interfaces are agreed and recorded.

| Gate | Deliverable | Required evidence |
| --- | --- | --- |
| 1. Weighted-mesh proof | Windows shell, small parent/child rig, weighted grid mesh, initial project/export formats and standalone Pixi player. | The same fixture produces equivalent bones and skinned vertices before and after export; Windows packaging builds. |
| 2. Usable authoring | PNG import, canvas, bones, mesh setup, weight painting, inspector, timeline, curves and command history. | Create and adjust a weighted clip through the UI; save/reopen it; undo/redo restores the authored data. |
| 3. Priest v0.1 | Five placeholder clips, crossfades, reliable recovery and original-PNG export. | All five clips are authored without JSON edits and match the standalone demo; packaged offline workflow passes. |
| 4. Slot workflow | 6×5 mock grid, symbol states/cascades, resolved-event adapter, sequences, named markers and audio cues. | A fixed mock event log drives a bonus sequence in editor and exported runtime, including fast/skip behavior. |
| 5. Production readiness | Atlas export, asset checks, responsive preview, performance budgets and real priest-art integration. | Production fixture survives recovery tests and runs within measured budgets on agreed Windows devices. |

Use the editor for production as soon as the relevant gates pass. Do not make
unrelated advanced animation or commercial features prerequisites for The Ninth Rite.
Reestimate each gate after the preceding demonstration; calendar estimates are not commitments.

### Slot integration after v0.1

- Accept typed, already-resolved events and visual payloads from the game adapter.
- Map events to character, symbol, overlay and audio sequences, with explicit priorities and end states.
- Make fast playback and skipping settle required visual state deterministically.
- Keep event translation outside game mathematics; do not edit wagers, RNG, payouts or bonus selection.
- Adapt to The Ninth Rite's actual integration contract when inspected; the draft event examples are not an existing API.

## Verification and release gates

These are required checks to implement, not claims that tests already exist or pass.

- Validate source and runtime schemas; reject invalid references and unsupported versions clearly.
- Cover hierarchy transforms, bind identity, mixed weights, looping, seeking, interpolation and crossfades.
- Compare evaluated bone matrices and every skinned vertex at fixed timestamps across export.
- Exercise mesh painting, numeric weights, topology/setup edits and rebind through undo/redo.
- Perform at least 50 authored undo operations and verify the final redo state against saved data.
- Verify save/reopen, interrupted writes, autosave recovery and missing/corrupt images without losing valid work.
- Exercise the running Electron app and the separate Pixi demo; compilation alone does not establish behavior.
- Test Windows installation and offline create → import → rig → animate → save → reopen → export → play.
- Measure the representative priest workload, texture use and frame times on the development PC and a lower-spec Windows machine.
- Treat 60 FPS as a measured target; record devices and workload before claiming performance.
- For slot gates, test rapid events, pause/resume, reduced motion, fast mode and skip/end-state resolution.

## Deferred scope

- Animated vertex offsets, IK, secondary-motion physics, advanced animation layers and masks.
- Automatic segmentation, PSD import, contour auto-meshing and AI-assisted rigging.
- Cloud storage, collaboration, plugins, accounts, licensing, payments and a marketplace.
- macOS, other game-engine adapters and public release/update infrastructure.
- Any slot mathematics engine, wagering backend or casino account integration.

Texture atlases are a later production gate; v0.1 exports original PNGs. The runtime
and project boundaries must permit later atlas packing without changing animation math.
The working product name is provisional. The current code repository is
[slot-animation-studio](https://github.com/marshymcfloat/slot-animation-studio).
