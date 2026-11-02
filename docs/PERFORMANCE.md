# Performance engineering

Policy date: 2026-11-03. Applies to application work affecting playback, rendering,
interaction, assets, IPC, startup, dependencies or resource lifetime. Read with
[architecture](ARCHITECTURE.md) and [playback semantics](PLAYBACK.md).

Choose a simple implementation with bounded work, then profile the real workload.
Optimize the measured bottleneck and keep a comparable before/after result. New
features establish their first baseline. Precomputing stable indices/bind data at
document revisions is an ordinary algorithm choice. Additional workers, optional
caches, GPU paths or memoization need measured benefit and an ownership/invalidation plan.

Targets below are provisional project targets. The reference canvas, unit tests
and browser VM check do not establish measured animation FPS or production capacity.
The current core deliberately allocates independent pose/player snapshots. Geometry
uses explicit caller-owned reusable buffers through [MESHES.md](MESHES.md), with
private staging for atomic writes. Preserve these ownership facts when describing performance.

## Development and review routine

1. Identify the affected path and expected workload in the Linear issue before editing.
   Read the relevant code and current upstream documentation for the pinned versions.
2. Reuse existing package boundaries and shared math. Prefer clear, scoped changes;
   assess dependency size, initialization cost and maintenance before adding a library.
3. Define the fixture, device and acceptance targets. For an existing path, record a
   baseline before optimizing; for a new path, capture its initial result and hot spots.
4. Implement and test correctness at the boundary. Profile before adding a second
   implementation, worker or cache. Change one relevant variable at a time.
5. Compare the same workload/build/settings, inspect allocations and resource lifetime,
   and rerun parity, interaction, undo/recovery or packaging checks where affected.
6. Link results and traces in the issue/PR. Resolve unexplained stutters/leaks and
   out-of-budget regressions before Done. A measured correctness/security tradeoff
   within agreed budgets needs its rationale recorded in the issue and architecture.
   If evidence or target hardware is unavailable,
   keep that performance acceptance criterion open and record the exact next action.

Documentation-only changes explain why runtime measurements are inapplicable.
Do not add fictional benchmark commands or a separate Markdown performance journal.

## Electron process boundaries

- Keep main-process callbacks short; use asynchronous I/O on application event loops.
  Synchronous IPC, filesystem calls and large serialization must stay out of interactive paths.
- Move sustained CPU work to cancellable, bounded jobs when profiling justifies it.
  Measure transfer/copy/startup overhead before choosing a Web Worker, worker thread
  or utility process. An `async` function alone does not offload CPU work.
- Exchange coarse operations through narrow validated IPC. Keep animation data local
  to the renderer/runtime; avoid per-frame IPC. Bound queues, payloads and concurrency;
  discard stale job results using document revisions, without losing authored commands.
- Defer optional startup services and bundle local assets. Check cold/warm startup,
  dependency load cost and packaged output when changing initialization or dependencies.
- Preserve sandboxing, context isolation, restrictive CSP, sender/payload validation
  and renderer Node isolation. Keep hardware acceleration enabled unless a diagnosed
  compatibility issue requires a documented alternative. Upgrade dependencies explicitly
  with build/smoke verification; do not weaken security to improve a benchmark.

These rules follow [Electron performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance)
and [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## Shared evaluation and frame scheduling

- Build/validate an evaluator when document data changes, not every frame. Cache
  hierarchy/index/bind information at the owning revision; invalidate it explicitly.
- Use one host-controlled update/render scheduling path per viewport. Keep React
  rendering, IPC, JSON serialization, asset decoding, topology construction and logging
  outside animation-critical work. Display timeline/status readouts at an appropriate
  UI cadence rather than committing the whole editor tree every frame.
- Render static or paused views when invalidated. Avoid duplicate Pixi tickers and
  requestAnimationFrame loops. Define hidden/minimized and resume behavior explicitly;
  the standalone host owns its clock. Never discard elapsed time or marker crossings
  to disguise a slow frame. Ticker deltas may be clamped/scaled; pass the seconds and
  speed semantics required by [PLAYBACK.md](PLAYBACK.md), applying speed once.
- Keep hot-path work proportional to affected bones, tracks, vertices and influences.
  Prefer precomputed indices and bounded searches over repeated whole-document scans.
  Reuse private skinning/adapter typed arrays and update changed buffers when introduced.
- Profile allocations and garbage collection. `sample`, `blend`, `getClip`, `getPose`
  and returned events currently promise independent data; do not pool or mutate public
  snapshots behind callers' backs. A reusable-output API needs an explicit shared
  contract and parity/isolation tests before adoption.

Scheduling must respect the [Pixi ticker's delta and FPS behavior](https://pixijs.com/8.x/guides/components/ticker).
React memoization should address measured rendering cost and preserve dependency
correctness; follow [React's memo guidance](https://react.dev/reference/react/memo).

## Pixi resources and editor UI

- Retain scene objects, textures and geometry across frames. Update positions and
  changed buffer data; avoid rebuilding meshes, text or graphics on every tick.
- Keep UVs/indices/weights static during playback. Evaluate skinning once in the shared
  core, then upload/consume its results. The Pixi adapter must not duplicate animation math.
- Profile draw calls, texture memory, filters, masks and interaction traversal. Reduce
  unnecessary work while preserving authored draw order and transparent overlaps.
  Culling, caching and batching changes must earn their cost on the actual workload.
- Record viewport size, DPR, renderer resolution and visual quality. Resolution caps
  and quality reductions are explicit tradeoffs; never silently lower them for comparisons.
  Atlas optimization remains in its approved later gate.
- Keep UI state/subscriptions local. Coalesce redundant view updates while preserving
  authored command/undo semantics. Virtualize large lists when their size/cost warrants it.

Rendering choices should use [Pixi's performance guidance](https://pixijs.com/8.x/guides/concepts/performance-tips)
with measurements from this editor's scene.

## Ownership and cleanup

Every listener, observer, ticker callback, worker, pending load, canvas, mesh, texture
and GPU buffer needs an owner and a disposal rule. Handle partial/late asynchronous
initialization, project switches, component unmount, HMR, window closure and failures.
Do not destroy shared textures while other users still own them. Preserve the demo's
BFCache restore behavior; a persisted `pagehide` is not final disposal.

Exercise repeated open/play/close or mount/unmount cycles for lifecycle changes.
Compare retained objects/resources after settling; investigate repeatable growth.
Record cache ownership/limits rather than treating all retained memory as a leak.

## Targets and measurement

These are engineering targets, not measured results or guarantees for unspecified hardware.
Define the supported workload and lower-spec Windows device before a release claim.

| Area | Initial project target / required signal |
| --- | --- |
| Active animation | Target stable 60 FPS at 60 Hz; the full frame has about 16.67 ms. At other refresh targets use `1000 / Hz`. Record slow/missed frames and stalls as well as averages. |
| CPU evaluation + skinning | Provisional p95 planning budget of 4 ms within the 60 Hz frame, leaving room for rendering and input. Validate/revise it using recorded devices/workloads; it is not an existing benchmark result. |
| Input feedback | Provisional p95 goal of 100 ms for ordinary selection/transport actions. Continuous pan/drag/paint must be checked during playback; initial acknowledgement and full completion are separate timings. |
| Long tasks | Investigate application-attributable tasks of 50 ms or more during steady playback/interaction; identify their source and resolve repeatable stalls. |
| Idle/paused | Avoid continuous application-owned rendering when nothing changes. Record idle CPU/resource use; do not claim zero CPU or report idle demand rendering as an FPS result. |
| Lifetime | No unexplained retained-resource growth across repeated lifecycle cycles; establish the normal cache plateau and workload-specific memory budget. |

Select measurements for the affected path: frames apply to rendered workloads;
CPU-only work, startup, I/O and lifecycle changes use their relevant duration,
throughput, allocation or resource measurements. State why other metrics are inapplicable.

For a useful capture:

- Use a packaged release or a release-equivalent local diagnostic build; measure the
  standalone browser separately. Record commit, Windows/CPU/GPU/RAM, drivers, power mode,
  Electron/Chromium/Pixi versions, display refresh, viewport, DPR and renderer resolution.
- Use the priest fixture for playback/crossfades/markers and interactions available at
  the current stage. Add a reproducible bounded stress fixture with recorded rig, bone,
  track/key, vertex, influence, attachment, texture-size and draw-call counts. The
  current nine-vertex robe alone cannot establish production capacity.
- For steady rendered playback/interaction, warm up, capture at least 30 seconds and
  repeat three times with comparable focus/load/settings. For CPU/I/O jobs measure
  defined operations over repeated runs; for lifecycle work record repeated cycle counts.
  Measure cold/warm startup separately, from process launch to first usable canvas.
  Preserve runs; report variability and tooling overhead rather than selecting the best.
- Report frame-interval p50/p95/p99, worst interval, over-budget counts and trace-confirmed
  missed/dropped frames. A timing interval or average FPS alone does not identify GPU
  work, explain a stall or prove a dropped frame. Correlate with the trace's frame track.
- Separate evaluator/mixing, skinning, render submission, React commits, I/O and IPC
  timings. JavaScript render submission time is not GPU completion time. Inspect GC,
  long tasks, idle/active CPU, JS heap, Electron process memory and texture/GPU estimates.
  Label estimates and individual-process values; main-process memory is not total app memory.

Use [Chrome DevTools' Performance reference](https://developer.chrome.com/docs/devtools/performance/reference)
for frame traces, long tasks and memory analysis. Set repeatable fixture/device-specific
regression limits from these baselines before evaluating a change. Record target/workload
revisions and their rationale in the architecture; never relax them merely to pass a
regression. Avoid tight hardware-independent timing assertions
on shared CI runners. Correctness tests, screenshots and smoke tests remain required,
but do not substitute for frame-time or allocation measurements.

## Evidence in Linear / pull requests

Record the affected path, fixture/counts, device/build/settings, commands or capture
steps, warm-up/runs, before/after metrics, trace links, bottleneck/fix and remaining limits.
Record lifecycle and correctness/parity evidence alongside speed changes. A new path
records its first baseline and target comparison. Mark missing measurements explicitly;
never describe code as optimized, leak-free or 60 FPS based only on compilation or a smoke test.
