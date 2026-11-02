# Slot Animation Studio

An offline-first Windows motion editor for symbols, raster/vector artwork, character rigs and slot-game presentation, initially for The Ninth Rite.

The merged foundation implements an Electron/React workspace, PixiJS reference canvas, view controls, restricted read-only bridge, standalone browser demo, validated version 1 data contracts, original priest fixtures and shared bone/clip playback. Existing CPU weighted-mesh geometry and fixture previews are preserved in [SPI-9 / draft PR #5](https://github.com/marshymcfloat/slot-animation-studio/pull/5); its performance acceptance remains open in Linear. Unified authored editing, asset import, persistence and export compilation remain planned.

## Start here

- [Agent instructions](AGENTS.md)
- [Product plan and acceptance gates](docs/PRODUCT_PLAN.md)
- [Architecture and technical decisions](docs/ARCHITECTURE.md)
- [Implemented data formats](docs/FORMATS.md)
- [Shared evaluation and playback API](docs/PLAYBACK.md)
- [Preserved geometry ownership contract](docs/MESHES.md)
- [Performance engineering and profiling routine](docs/PERFORMANCE.md)
- [Original priest fixtures and provenance](packages/test-fixtures/README.md)
- [Work, review, and handoff process](docs/WORKFLOW.md)
- [Linear project](https://linear.app/spine-rea/project/slot-animation-studio-07e39e20dfb5)
- [Private GitHub repository](https://github.com/marshymcfloat/slot-animation-studio)

Linear is authoritative for task status. Start from its active issues and dependency-ready Todo issues. Bootstrap evidence is linked from the [harness](https://linear.app/spine-rea/issue/SPI-5), [desktop foundation](https://linear.app/spine-rea/issue/SPI-6), and [data contracts/fixtures](https://linear.app/spine-rea/issue/SPI-7) issues.

## Prerequisites

| Tool | Baseline | Use |
| --- | --- | --- |
| PowerShell | 7+ | Run local harness checks |
| Git | 2+ | Version control and worktrees |
| Node.js | 24.x | Application development baseline |
| pnpm | 10.19.0 | Locked workspace package manager |
| GitHub CLI | Optional | Repository and review operations |

The documentation harness has no npm dependencies. Its validation works offline and does not require Node or pnpm. Missing development tools are warnings in the default harness check and errors in its strict environment check. Optional skill references remain warnings in either mode. Application dependency installation requires network access once; the built application runs offline.

## Develop and build

Run these commands from the repository root on Windows x64:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` opens the desktop application with a local development server. Close the window and stop the command when finished. Use the preview controls to play or scrub the fixture, zoom, fit and toggle the grid. These are transient preview controls; authored project editing is not implemented yet.

| Command | Behavior |
| --- | --- |
| `pnpm dev:demo` | Serve the independent browser fixture preview at `http://127.0.0.1:5174` |
| `pnpm typecheck` | Check application, package, config, and test TypeScript |
| `pnpm test` | Run focused unit tests |
| `pnpm build` | Build the browser demo and package a portable Windows x64 Electron application |
| `pnpm test:desktop` | Run the packaged-application smoke test after `pnpm build` |
| `pnpm test:runtime` | Test the built standalone preview in installed Microsoft Edge after `pnpm build` |
| `pnpm profile:core` | Record repeatable Node CPU diagnostics under `test-results/performance`; not an FPS test |
| `pnpm profile:rendering --host desktop` | Capture three 30-second packaged preview runs, traces and reload resource diagnostics after `pnpm build` |
| `pnpm profile:rendering --host browser --stress 65` | Capture the production browser build with a 4,225-vertex, four-influence robe in installed Edge |
| `pnpm check:harness` | Validate the repository documentation and setup |
| `pnpm --filter @studio/test-fixtures check:assets` | Verify original PNG layers and provenance against their deterministic source |
| `pnpm --filter @studio/test-fixtures check:documents` | Verify the committed project/runtime JSON samples against their fixture source |

The portable application is `apps/desktop/out/slot-animation-studio-win32-x64/slot-animation-studio.exe`. The browser build is under `apps/runtime-demo/dist`. Both are generated outputs and excluded from Git. This stage produces a portable application; installer distribution is tracked separately.

The [application workflow](.github/workflows/application.yml) installs the frozen lockfile, type-checks, runs unit tests, builds both applications, and checks the packaged Electron and standalone Edge previews on Windows. Tests use the packaged executable and installed Edge without downloading another browser, and save evidence under `test-results/`. Install Edge locally for the browser checks. Profiling is an explicit local diagnostic, not a noisy timing gate on shared CI hardware; follow [PERFORMANCE.md](docs/PERFORMANCE.md).

Functional transport checks use controlled host time while rendering real geometry.
They do not measure FPS. The profiler uses native time, validates real foreground
state and preserves failed captures. Browser profiling opens an isolated Edge window;
leave it in front during a capture. Desktop tests, browser tests and performance
records have separate output directories.

## Run checks

From the repository root:

```powershell
pwsh -NoProfile -File ./scripts/check-harness.ps1
pwsh -NoProfile -File ./scripts/check-harness.ps1 -CheckEnvironment
```

The script resolves its repository from its own location, so it can also be invoked by absolute path from another directory. It validates required files and repository Markdown links and reports local tool diagnostics. It makes no installs or network calls.

The [documentation workflow](.github/workflows/harness.yml) runs the default check on pushes and pull requests and supports manual runs.

Schema, fixture and shared playback tests run with `pnpm test`; the fixture check commands above
read and compare outputs without rewriting them. Regeneration commands and authorship
details are in the fixture package README. Its five named clip samples test the data
contract and do not establish completed priest animations or export/vertex parity.

## Scope

The accepted v0.2 direction is one scene canvas and property timeline for raster images, vectors, groups and rigs. First prove symbol import → select/transform → auto-keyframe → preview → save/reopen → standalone export; extend that workflow to SVG/sigils, simple masks and the five priest clips with basic bones.

Mesh authoring, editable topology and painted/numeric weights move to P2. Existing CPU skinning and tests are retained. Vector tracing and optional AI mask proposals follow working manual editing; no model or cloud account is required. See the [product plan](docs/PRODUCT_PLAN.md) for priorities and gates. Product v0.2 does not itself change integer schema versions.
