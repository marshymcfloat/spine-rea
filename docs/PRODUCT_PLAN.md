# Slot Animation Studio — Product & Engineering Plan

**Status:** Accepted direction v0.2 (2026-11-03)

**Owner:** Daniel Canoy

**Created:** 2026-11-02

**Updated:** 2026-11-03

**First target:** Windows 10/11 x64 (evaluate Windows on ARM later)

**Later target:** macOS (Apple silicon first, Intel support to evaluate)

**Initial customer:** The Ninth Rite production team

**Long-term possibility:** Commercial desktop software for slot-game developers

This is the authoritative scope, adopted from Daniel's updated plan on 2026-11-03.
The user explicitly moved mesh authoring and weight-paint/numeric editing to P2.
Keep existing schemas, bone playback, CPU skinning and tests. The preserved mesh
proof is [SPI-9 / draft PR #5](https://github.com/marshymcfloat/slot-animation-studio/pull/5);
its unfinished performance acceptance remains open in Linear. Reprioritization is
not evidence that those checks passed.

The merged foundation provides the desktop/reference canvas, version 1 schemas,
priest fixtures and pure bone/clip playback. Unified authored nodes, general
property tracks, import/edit/save/export workflows and smart import below are
planned. Read [architecture](ARCHITECTURE.md), [current formats](FORMATS.md),
[playback](PLAYBACK.md), [preserved geometry contract](MESHES.md),
[performance engineering](PERFORMANCE.md) and [workflow](WORKFLOW.md).
[SPINE-REA Linear](https://linear.app/spine-rea/project/slot-animation-studio-07e39e20dfb5)
holds task status and evidence.

> Working product title: **Slot Animation Studio**. The final name and branding are intentionally undecided.

## READ THIS FIRST — v0.2 change notice for active development

**This is an evolution of v0.1, not a rewrite order.** If implementation has already started, preserve existing working code and tests. Do not restart the repository or discard an Electron/PixiJS proof of concept. The previously defined Windows-first, offline-first, event-driven slot runtime remains the plan.

**What changed:**

1. The product is now a **unified slot motion editor**, not primarily a skeletal-rig editor. A Figma-like direct-manipulation canvas and property-keyframe timeline become the foundation; bones are one optional editing system.
2. Editable **raster images, SVG/vector paths, text, rigged characters, effect emitters, cameras, and groups** share one document/scene graph, timeline, and rendering/export pipeline.
3. **Smart Asset Import** has two distinct workflows: (a) *Vectorize* a logo/sigil/flat symbol into editable SVG-like paths, and (b) *Separate Layers* from detailed raster mascot art using masks and optional AI assistance. These are **not** the same technical problem.
4. The first thin vertical slice is **import a symbol -> select/drag -> auto-keyframe -> preview -> export**. The second is **import layered priest -> rig -> animate -> export**. Both must use the same clip and playback model.
5. AI segmentation, automatic vectorization, and video-to-vector import are staged behind functional editing primitives. No heavy AI model, cloud account, or network requirement is a prerequisite for v1.
6. Electron remains the **provisional Windows shell**, with a narrow Electron-versus-Tauri benchmark only if worthwhile; shell choice must not be coupled to the animation or project model.
7. The delivery stages have been **reordered and estimates adjusted upward** to reflect the additional canvas and import scope.

### Migration map: keep vs revise

| If you already built... | Keep it? | What changes now |
| --- | --- | --- |
| Electron app shell, menus, local project storage | **Keep** | No shell rewrite required; enforce desktop APIs behind a bridge |
| React panels, canvas, viewport, selection/transform tools | **Keep** | Generalize selection from sprite-only/bone-only to all scene nodes |
| PixiJS stage, texture loading, render loop | **Keep** | Add render adapters for vectors, groups, masks, bone attachments |
| Bone hierarchy or priest animation clips | **Keep** | Represent rig controls as a specialized node/constraint layer under the common timeline |
| Timeline, easing, clip and playback logic | **Keep and extend** | Keyframe **any supported property**, not only bone transforms |
| JSON project format | **Migrate with a versioned schema** | Add node types, asset provenance, tracks and masks without silently breaking old files |
| Game events, slot preview, export runtime | **Keep** | Sequences can trigger vector, raster, rig, FX and audio tracks together |
| Manual PNG layer workflow | **Keep** | Add optional vector tracing and smart layer assistance around it |

**Immediate implementation rule:** Add a small adapter/migration layer rather than mass-renaming existing files or changing every public runtime API. Keep old sample projects loadable, or ship an explicit version 1 -> next-format converter with tests. Product release labels and integer schema versions remain separate.

## 1. Product decision

Build a **downloadable, offline-first desktop editor** for authoring **direct-manipulation 2D motion, skeletal characters, vector/raster assets, effects, and event-driven sequences** used in casino **slot** games. Think of an approachable motion canvas plus rigging and slot-specific sequencing—not three disconnected clones of Figma, Spine and After Effects. This is an asset authoring and animation orchestration tool, **not** a slot mathematics engine, RNG service, wagering backend, or gambling platform.

**Why this product exists:** Slot creators need to move a symbol with a few keyframes, rig a mascot when necessary, prepare AI-generated art, make audiovisual effects, and choreograph a bonus sequence. General-purpose tools can provide fragments, but the developer still has to build the event pipeline, previews, exports, and runtime integration. Our differentiator is **one canvas, one timeline, and one slot-aware playback/export workflow**.

**Product principles**

1. Ship The Ninth Rite faster; public commercialization is secondary.
2. Build a usable subset of **Figma-like motion editing + Spine-style rigs + sequence composition**, not full copies of any product.
3. Native-feeling desktop app, local projects, no mandatory login or cloud dependence.
4. WYSIWYG preview must match the shipped PixiJS runtime closely.
5. Animation responds to **resolved game events**; it never determines or modifies outcomes.
6. Reuse rigs, clips, templates, and effects across many slot games.
7. Preserve original source project files; use a separate compact export format for games.
8. Respect third-party IP: create original animations and source, use appropriately licensed dependencies, and avoid copying proprietary code or assets.
9. Use direct manipulation/keyframing by default; add a rig only where it helps.
10. Keep raster and vector artwork first-class. **Vectorization does not imply semantic body-part separation**.
11. Keep imports non-destructive: original source files, masks, groups and editable authoring data remain accessible.

## 2. Who it is for

- **V0–V1:** Daniel creating The Ninth Rite, starting with its priest and entity sequences.
- **Future internal use:** Different slots sharing character templates, symbol animations, FX, and responsive layouts.
- **Possible future commercial use:** Solo indie studios and small teams making 2D slot games; team collaboration and licensing can wait.

## 3. Core workflow

1. **Create project:** Select a slot aspect ratio, reel grid, canvas, safe zones, and export target.
2. **Import art:** Paste/import PNG/JPG/SVG, existing layered PNGs, symbols, backgrounds and sounds. Keep the original and derived artwork separate.
3. **Prepare artwork as needed:** Keep raster artwork; manually mask layers; trace flat graphics into vectors; optionally use smart segmentation to propose editable raster layers.
4. **Design on canvas:** Select, move, resize, rotate, group, draw simple shapes, set anchors and arrange layers like a familiar design tool.
5. **Animate directly:** Turn on auto-keyframe, move the playhead, manipulate a property or object, and edit easing curves/motion paths.
6. **Rig when useful:** Give mascots bones/attachments/mesh deformation; use the **same** timeline and clip format as unrigged objects.
7. **Compose slot effects and sequences:** Symbols, reels, particles, camera, audio and event markers in reusable sequences.
8. **Preview:** Trigger fixed events against a mock 6×5 grid; check desktop/mobile layout and fast/skippable playback.
9. **Export:** Produce optimized atlas/vector representations and versioned JSON plus a lightweight PixiJS/TypeScript playback package.

## 4. Feature inventory and priorities

### P0: Must exist for the first usable release

| Area | Features | Acceptance criterion |
| --- | --- | --- |
| Desktop shell | Windows installer, app menus, open/save, file dialogs, recent projects | Install, create, save, close, and reopen offline |
| Projects | Folder-based project, asset references, schema version, autosave drafts | No corruption after a normal crash/restart |
| **Unified scene canvas** | Zoom, pan, rulers/guides, node layers, select/multi-select, drag, rotate, resize, pivots, groups | Manipulate raster images and simple graphics without bones |
| **Art import** | Paste and drag/drop PNG/JPG/SVG, transparent images, source preservation, layer sorting | Import both a flattened symbol and existing layered priest |
| **Direct keyframing** | Auto-keyframe, transforms, opacity, tint, keyframe inspector, motion path where applicable | Move a symbol at 0s/0.5s/1s and preview without rigging |
| Simple vector shapes | Rectangle, ellipse, line/path import and editable fill/stroke/transform | Import or draw a sigil and animate it |
| Basic masking | Manually select/crop/mask raster sections, retain underlying source | Extract and refine one movable part from a flattened image |
| Bone rig | Hierarchical bones, parent/child transforms, attach sprites, rename/reorder | Rig priest arm and animate it using same timeline |
| **Shared timeline** | Clips and property tracks for shapes, sprites, groups and bones; loops, scrub/play | One timeline handles priest + sigil + symbol |
| Curves | Linear, step/hold, eased curves, basic editable easing | Avoid robotic movement |
| Playback | At least idle, one-shot, loop, speed, pause, stop, crossfade | Switching clips is stable |
| Editing UX | Undo/redo, copy/paste keyframes, save/reopen | 50+ undo operations remain reliable |
| Export | Versioned runtime JSON, source/project files, and suitable runtime graphic assets | Pixi demo reproduces editor playback for raster, vector and rig |
| Testing | A small sample project and automated export/runtime tests | Repeatable CI checks pass |

### P1: Slot-centric capabilities (first real internal tool)

| Feature | What it does | Example in The Ninth Rite |
| --- | --- | --- |
| **Slot project wizard** | Grid presets (5×3, 6×5, custom), responsive canvas, safe zones | The Ninth Rite 6×5 layout |
| **Symbol state editor** | Define reusable `idle`, `appear`, `land`, `anticipate`, `win`, `destroy` clips | Blood symbols react to a cluster win |
| **Reel and cascade preview** | Simulate symbol movement and easing from supplied mock results | Falling symbols after a winning cluster |
| **Character state library** | Previews and transitions for idle, pray, praise, intervene | Priest transitions from prayer to worship |
| **Bonus sequence editor** | Multitrack timeline for character, symbols, overlays, camera, and sound | Entity intervention during Greater Rite |
| **FX composer** | Preset particles, masks, glows, flashes, screen shake | Blood charge and altar activation |
| **Audio cues** | Add and synchronize music/SFX with event markers | Gong starts on multiplier increase |
| **Event markers** | Named markers with data payloads and stable IDs | `ALTAR_MULTIPLIER_CHANGED` starts animation |
| **Skippable/fast playback** | Define critical vs optional motion and end-state resolution | Skip celebration but land in correct state |
| **Responsive preview** | Widescreen/mobile presets and anchor guides | Keep game grid prominent on mobile |
| **Texture atlas export** | Pack and compress sprites into atlases | Reduce draw calls/network overhead |
| **Performance view** | FPS, draw calls, atlas dimensions, estimated texture memory | Identify expensive mobile effects |
| **Quick Vectorize** | Convert a flat PNG/JPG symbol or sigil into separate editable paths with a quality/complexity preview | User can select/group paths and keep original PNG |
| **Smart Layer Prep (manual first)** | Click/select candidate parts, edit/refine masks, name and group raster layers | Extract priest head and arm and rig without destructive edits |
| **AI-assisted segmentation experiment** | Optionally propose masks from click/box prompts; user confirms and corrects | Test on real Higgsfield priest; **not** a v1 shipping dependency |

### P2: Quality differentiators

- Mesh authoring: editable grids/topology, bind/rebind tools, painted and numeric bone weights, plus advanced vertex deformation. Existing CPU weighted-mesh evaluation, fixtures and tests are preserved; mesh authoring is not a first-release gate.
- Inverse kinematics for linked arms and hands.
- Skin and attachment swapping; expression variants.
- Full curves/graph editor, animation layering, blending masks and advanced motion paths.
- Rich vector path editing and morphing **only after** reliable basic transforms/SVG imports.
- Lightweight procedural motion for breathing and secondary movement.
- Particle preset editor, reusable shaders, effect presets and templates.
- Camera tracks, parallax, depth grouping, masks, and color grading.
- Runtime snapshot and visual-diff testing for editor/export parity.
- Asset linting for transparent edges, missing references, oversized textures, and naming.
- Batch export, CLI export, and command-line QA for later CI integration.
- Semi-automatic layer grouping/naming, joint-hole reconstruction and auto-rigging (optional assisted workflows).
- Experimental AI-video-to-motion/vector-frame conversion; evaluate fidelity and runtime size before inclusion.

### P3: Future public/commercial product

- Project templates and marketplace/importable preset packs.
- Plugin extension API and documented export/runtime SDK.
- Optional update checker, crash reporting, and consent-based analytics.
- License management, trial/demo mode, payment flow, customer support.
- Team collaboration, version history, asset sharing, and cloud sync **only if demand exists**.
- White-label exporters or integration packages for more game engines.

## 5. Scope boundaries

**Build:** Raster/vector content preparation, direct manipulation, skeletal rigging, animation playback, event choreography, and tools for previewing slot outcomes.

**Do not build in v1:** Real-money wagering, RNG, RTP/volatility calculations, paytables, gambling account management, authentication, payments, remote casino integration, a full Figma-like vector illustration suite, comprehensive video editing or high-quality automatic video-to-vector conversion.

The Ninth Rite's mathematical result must come from its separate audited game/math logic. The animation editor consumes already-decided outcomes, never rerolls or infers payouts.

**Smart import limitations:** Image tracing creates color/path regions, **not automatically an arm, face, or clothing layer**. AI segmentation proposes pixel masks, not reconstructed hidden anatomy, and may require manual repair. Preserve original high-detail Higgsfield raster art when vector tracing reduces fidelity.

## 6. Proposed app architecture

```text
Electron main process             Windows filesystem / windows / dialogs
  ├─ Preload bridge              Restricted, validated IPC boundary
  └─ Renderer (React + TS)
       ├─ Application shell      Panels, inspector, asset tree, commands
       ├─ Editor state           Undo/redo, selection, shared scene graph
       ├─ Design canvas          PixiJS direct manipulation, shapes, masks
       ├─ Import workspace       Raster/source, vector trace, mask prep
       ├─ Rig workspace          Bone hierarchy, attachments, poses
       ├─ Animation workspace    Universal property tracks, keys, curves
       ├─ Compose workspace      FX, camera, sound and reusable sequences
       ├─ Slot tools             Reel mock, FX, event sequence, responsive preview
       └─ Project services       Import, validate, autosave, export

Packages shared with exported games:
  ├─ @studio/schema              Versioned nodes, assets, tracks and Zod validation
  ├─ @studio/scene-core          Group/node hierarchy, transforms, property values
  ├─ @studio/animation-core      Property keyframes, skeletons, interpolation, mixing
  ├─ @studio/compiler            Editor graph -> optimized runtime JSON/atlases
  ├─ @studio/runtime-pixi        PixiJS render adapter; NO Electron/React dependencies
  ├─ @studio/slot-events         Typed event contracts, sequences, deterministic playback
  └─ @studio/test-fixtures       Sample rigs, events, reproducible tests

Editor-only or optional integration packages:
  ├─ @studio/image-prep          Nondestructive raster masks and regions
  ├─ @studio/vectorize           Pluggable PNG/JPG -> vector path conversion
  └─ @studio/segmentation        Optional local AI mask proposals, isolated service
```

### Shared scene graph and timeline contract

A project contains **nodes** (e.g. `group`, `raster`, `vectorPath`, `text`, `bone`, `mesh`, `particleEmitter`, `camera`) and **property tracks** (e.g. position, rotation, scale, alpha, tint, path shape, bone pose, emitter intensity). A node may have a parent, attachments, a mask, visibility/draw order and source-asset references.

The same timeline engine evaluates all keyed properties; a skeleton adds parenting/constraints, not an unrelated animation format. The compiler separates **editable authoring data** from **optimized runtime data**. Generated vectors can stay as editable paths in the project while complex shapes may be baked to atlases for mobile rendering after profiling.

**Shell decision:** Electron is the provisional Windows v1 shell because the renderer and tooling fit our TypeScript/PixiJS stack. Tauri 2 is a benchmark candidate for package size/memory; it should be tested with the **same** PixiJS scene before committing to a switch. **Do not migrate an already working Electron application just because Tauri exists.** Shell adapters must be replaceable without changing the animation core or project format.

**Security defaults:** Context isolation and renderer sandboxing enabled; Node integration disabled in renderer; IPC channels explicitly allowlisted; validate imported project/assets and filesystem paths; no arbitrary scripts/plugins in v1.

**Data storage:** Use a human-readable `.slotstudio` project directory (or zip-based exchange package later) with a manifest, versioned JSON scene nodes/tracks/rigs, **source images and derived vector/mask layers**, audio, autosave/backup files. Use relative asset paths and stable identifiers. Product v0.2 is a scope label, not a JSON format version. Implemented project/runtime schemas remain integer version 1 until a separately reviewed contract introduces explicit next versions and a tested version 1 migration or legacy adapter; existing fixtures remain loadable. See [FORMATS.md](FORMATS.md). Do not rely on cloud infrastructure for basic work.

**Runtime export:** Produce a manifest, `.json` animation/rig/sequence data, compiled shape geometry or packed `.png`/`.webp` atlases where appropriate, and a documented TypeScript API. Preserve source paths separately; exported games shouldn't require the editor or its AI features. Keep exports independent of original authoring application.

## 7. Example event contract

```ts
type SlotVisualEvent =
  | { type: 'ROUND_STARTED'; roundId: string }
  | { type: 'CASCADE_RESOLVED'; cascadeIndex: number; removedCellIds: string[] }
  | { type: 'MULTIPLIER_CHANGED'; value: number }
  | { type: 'BONUS_STARTED'; mode: 'lesser' | 'blood' | 'greater' | 'god' }
  | { type: 'ENTITY_INTERVENTION'; effectId: string }
  | { type: 'BIG_WIN'; displayAmount: number }
  | { type: 'ROUND_COMPLETED' };

animationPlayer.dispatch({ type: 'ENTITY_INTERVENTION', effectId: 'altar-sigil' });
// The animation player CHOOSES presentation, not the gambling outcome.
```

Sequence definitions should include interruptibility, priority, end-state behavior, and event/clip mappings. In fast mode, optional motion shortens but required visual state still resolves correctly.

## 8. The Ninth Rite: Pilot acceptance test

### Required assets

- One **flat symbol image** (PNG) and one **sigil graphic** (SVG or PNG) for direct-manipulation/keyframing proof.
- One **flattened Higgsfield priest image** as the Smart Layer Prep input, **plus** a pre-separated reference version as a fallback for rigging progress.
- Priest layers prepared as head, torso, upper/lower arms, hands, robe and accessories, with painted-over hidden joints as needed.
- Optional eyes/mouth or facial-expression replacements.
- Symbol and altar test PNGs, mock sigil/VFX textures, test sound effects.

**Important art limitation:** A single flattened Higgsfield image is not automatically a rig-ready character. The editor can eventually propose image masks and selectable layers, but we still need to reconstruct hidden pixels when limbs reveal occluded regions. Color-vectorizing the full priest is **not** a substitute for semantic layer separation. Human review and editing remain required.

### First thin vertical slice: no bones required

1. Import or paste a slot symbol image and place it on the shared scene canvas.
2. Select it and use transform handles; enable auto-keyframe.
3. At `0.0s` set default state, at `0.5s` move/scale, at `1.0s` return to rest.
4. Edit easing; preview; undo/redo; save/reopen; export to the PixiJS runtime.
5. Repeat with a vector sigil; confirm paths/shape groups can be selected and animated.
6. Confirm the runtime reproduces the same motion at fixed timestamps without Electron.

**Gate:** This test proves shared scene nodes, property tracks and rendering/export before spending weeks on bones or AI.

### Five must-pass animation clips

1. `priest_idle`: subtle breathing and candle-lit stillness, looped.
2. `priest_pray`: head and hands move into prayer position, loopable hold.
3. `priest_kneel`: kneels and returns to ready state without clipping.
4. `priest_praise`: one-shot large-win reaction with audio marker.
5. `priest_entity`: entity intervention reaction with synchronized altar cue.

### Second vertical slice: priest rig, then combined event sequence

Open editor -> import layered priest (manually prepared if smart segmentation is unfinished) -> rig -> animate five clips -> add vector sigil animation on **same scene/timeline** -> preview `BONUS_STARTED` + `ENTITY_INTERVENTION` -> export -> load same export in a standalone PixiJS demo -> verify visual/event parity at 60 FPS target on development PC and a lower-spec Windows test machine.

### Smart Asset Import evaluation

Test at least three real assets: (a) flat symbol/logo, (b) detailed slot symbol, (c) textured, partially occluded Higgsfield priest. Record trace quality, number of vector paths, export size, editable grouping, segmentation mask quality, and manual cleanup time. **Do not market a one-click perfect rig**; automatic grouping, occlusion reconstruction and rigging require separate research.

The performance target is aspirational and must be measured with actual devices. Add realistic texture budgets, mobile GPU checks, and reduced-motion support before shipping casino frontend integrations.

## 9. Windows release experience

**First internal build:** Signed only if practical; private Windows installer and portable/debug build. Support offline activation-free use, local projects, and recoverable autosaves. Expect unsigned installers to potentially trigger security warnings; signing becomes important before a public release.

**Distribution:** Electron Forge can produce Windows installers; Squirrel.Windows produces a `Setup.exe`. For public release, plan Windows code signing, update verification, reproducible builds, crash recovery, and release notes.

**Future macOS:** Reuse the TypeScript packages and editor UI, then add macOS filesystem/shortcut conventions, `.dmg` packaging, signing/notarization, Apple silicon testing, and color/graphics parity checks. Do not defer cross-platform path logic and asset formats until then.

## 10. Delivery roadmap (estimates, not commitments)

| Phase | Target | Rough solo-developer effort | Definition of done |
| --- | --- | --- | --- |
| 0. Technical spike | Prove shell + Pixi **shared scene/track** + basic direct animation + export | 1–2 weeks | Symbol keyframes play in exported demo; Windows installer builds |
| 1. Unified motion MVP | Figma-like canvas, vector/raster nodes, property timeline, basic masks, **basic bones**, save/load | 5–8 weeks | Symbol/sigil and priest clips can be built through one timeline |
| 2. Slot & asset workflow | 6×5 preview, reel/cascades, events, sequence/audio; vector trace and manual layer prep; experimental AI masks | 5–8 weeks | Fixed event log plays bonus, smart-import pilots are evaluated |
| 3. Production hardening | Undo/redo robustness, recovery, profiling, atlas/QA, tests | 4–8 weeks | Repeatable reliable build; lower-spec PC performance checked |
| 4. Advanced animation (P2) | Mesh authoring/weight painting and deformation, IK, secondary motion, advanced vector/mask editing and optional AI aids | 4–12+ weeks | Fluid robe motion; advanced authoring is optional and reliable |
| 5. macOS release | Packaging, platform integration, parity testing | 2–4+ weeks | Same project opens/exports on supported Macs |

These longer estimates reflect the larger v0.2 scope. They are not a commitment to implement every listed feature. Do not build every P2 feature before the first slot. Stop and use the tool for production as soon as Phase 2 works well enough.

## 11. Quality and acceptance gates

- Every project change is undoable, serializable, recoverable, and schema-valid.
- Preview and exported player compute equivalent transforms at specific test timestamps.
- Select/move/resize, auto-keyframe and manual keyframe edits must be accurate and not overwrite unrelated tracks.
- Source raster art must survive vector tracing, masking and layer extraction without destructive modification.
- Existing version 1 project/runtime fixtures must remain loadable through a deterministic migration or documented legacy adapter when the unified contract is introduced. Product labels v0.1/v0.2 are separate from integer schema versions.
- Cross-type nested scenes (priest bones + vector sigil + symbol + audio) must scrub/play/export without divergent state.
- Rig parenting, blending, looping, interruption, and seeking have deterministic tests.
- Broken/missing textures do not corrupt the project or crash the editor.
- Rapid event sequences, skip, reduced motion, and pause/resume end in valid states.
- Document texture memory and atlas budgets; render quality controls for lower-end devices.
- Never modify round math, wager balances, bonus selection, or payouts in this application.
- Do not import untrusted code or inspect private third-party apps without authorization.

## 12. Project and market decisions to defer

- Final name, logo, pricing/licensing, business entity, distribution website.
- Native PSD parsing, production-grade AI layer separation, model download/compute strategy and hidden-pixel reconstruction.
- Figma Motion imports, full vector pen/boolean tool suite, AI video-to-vector conversions, fully automatic rigging.
- Commercial plugin SDK, cloud storage, shared project library, collaboration.
- Support for non-Pixi engine runtimes.
- Whether to fork an open-source editor or implement from first principles; evaluate quality, licenses, maintenance, runtime design and long-term ownership first.

## 13. Immediate next actions

1. **Take stock of the existing implementation.** List completed files/features and working tests; identify where project schema, scene graph, timeline, and renderer are already coupled. **Keep working code.**
2. Add a **common scene node contract** for raster/group/vector/rig nodes and a **general property track** contract; retain the current version 1 project/runtime fixtures and test their compatibility through the new adapter.
3. Build the thin **symbol direct-animation proof** (import -> select -> transform -> auto-keyframe -> scrub -> export) within the existing Electron/PixiJS app; don't restart just to compare shells.
4. Extend the same canvas for **SVG/sigil** plus a simple mask tool, and evaluate **VTracer** for nondestructive vector tracing.
5. Continue the priest rig vertical slice with manually layered art; trial **SAM 2** on the flattened image separately before integrating optional segmentation into the product.
6. Test **Rigby2D**, **Bones**, **IceBones**, **Anim8** and **Rive** as UX/architecture references; distinguish reusable open-source code from proprietary reference behavior and honor licenses.
7. Implement/verify the independent PixiJS playback runtime and fixed event sequence. Use a single timeline for all asset types.
8. Evaluate Electron versus Tauri on a **small identical benchmark only if needed**, then keep the shell decision stable for production work.

## 14. Reference sources

- Electron: https://www.electronjs.org/docs/latest/
- Electron Forge Windows installer: https://www.electronforge.io/config/makers/squirrel.windows
- PixiJS Scene Graph: https://pixijs.com/8.x/guides/basics/scene-graph/
- PixiJS Mesh: https://pixijs.com/8.x/guides/components/scene-objects/mesh
- Tauri WebView comparison: https://v2.tauri.app/reference/webview-versions/
- REA: https://github.com/morluto/rea
- Rigby2D: https://github.com/jaisurya-dev-art/rigby2d
- Bones: https://github.com/foundermafstat/bones
- IceBones: https://github.com/jwp72/icebones
- Spine licensing and prices: https://esotericsoftware.com/spine-purchase
- Anim8: https://www.tryanim8.com/
- Rive product and capabilities: https://rive.app/
- Figma Motion timeline: https://help.figma.com/hc/en-us/articles/41405906446999-Use-the-Figma-Motion-timeline
- PixiJS Graphics/SVG: https://pixijs.com/8.x/guides/components/scene-objects/graphics
- PixiJS Performance: https://pixijs.com/8.x/guides/concepts/performance-tips
- VTracer: https://github.com/visioncortex/vtracer
- Segment Anything 2: https://github.com/facebookresearch/sam2
