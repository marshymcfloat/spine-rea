# Slot Animation Studio

An offline-first Windows editor for layered 2D rigs, weighted meshes, and slot-game presentation, initially for The Ninth Rite.

This repository implements an Electron/React workspace with a PixiJS reference canvas, working view controls, a restricted read-only desktop bridge, and a standalone browser demo. It also provides validated data contracts, original priest fixtures, and a shared bone/clip evaluator with host-controlled playback. Mesh evaluation/rendering, authored editing, persistence, and export compilation remain planned; the applications still display reference guides.

## Start here

- [Agent instructions](AGENTS.md)
- [Product plan and acceptance gates](docs/PRODUCT_PLAN.md)
- [Architecture and technical decisions](docs/ARCHITECTURE.md)
- [Implemented data formats](docs/FORMATS.md)
- [Shared evaluation and playback API](docs/PLAYBACK.md)
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

`pnpm dev` opens the desktop application with a local development server. Close the window and stop the command when finished. Use the workspace controls to zoom, fit the reference artboard, and toggle the grid. These are view controls; authored project editing is not implemented yet.

| Command | Behavior |
| --- | --- |
| `pnpm dev:demo` | Serve the independent browser canvas demo at `http://127.0.0.1:5174` |
| `pnpm typecheck` | Check application, package, config, and test TypeScript |
| `pnpm test` | Run focused unit tests |
| `pnpm build` | Build the browser demo and package a portable Windows x64 Electron application |
| `pnpm test:desktop` | Run the packaged-application smoke test after `pnpm build` |
| `pnpm check:harness` | Validate the repository documentation and setup |
| `pnpm --filter @studio/test-fixtures check:assets` | Verify original PNG layers and provenance against their deterministic source |
| `pnpm --filter @studio/test-fixtures check:documents` | Verify the committed project/runtime JSON samples against their fixture source |

The portable application is `apps/desktop/out/slot-animation-studio-win32-x64/slot-animation-studio.exe`. The browser build is under `apps/runtime-demo/dist`. Both are generated outputs and excluded from Git. This stage produces a portable application; installer distribution is tracked separately.

The [application workflow](.github/workflows/application.yml) installs the frozen lockfile, type-checks, runs unit tests, builds both applications, and smoke-tests the packaged Electron app on Windows. The smoke test uses Electron's own executable without downloading Playwright browsers and saves evidence under `test-results/`.

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

The first release includes a placeholder priest, bones, editable textured mesh grids, bone-weight painting, five clips, undo/recovery, and shared PixiJS runtime export. Direct vertex animation, IK, and slot-sequence orchestration follow later. See the product plan for authoritative scope and gates.
