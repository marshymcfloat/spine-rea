# Slot Animation Studio

An offline-first Windows editor for layered 2D rigs, weighted meshes, and slot-game presentation, initially for The Ninth Rite.

This repository contains the development harness and approved design. The editor, runtime packages, and application build/test commands will be added through the tracked implementation tasks.

## Start here

- [Agent instructions](AGENTS.md)
- [Product plan and acceptance gates](docs/PRODUCT_PLAN.md)
- [Architecture and technical decisions](docs/ARCHITECTURE.md)
- [Work, review, and handoff process](docs/WORKFLOW.md)
- [Linear project](https://linear.app/serviceflow/project/slot-animation-studio-baaf385fd9f6)
- [Private GitHub repository](https://github.com/marshymcfloat/slot-animation-studio)

Linear is authoritative for task status. Start from its active issues and dependency-ready Todo issues. The [harness issue](https://linear.app/serviceflow/issue/SER-71/establish-and-verify-the-development-harness) records setup evidence; [workspace and desktop shell](https://linear.app/serviceflow/issue/SER-72/scaffold-the-package-workspace-and-desktop-shell) is the first application implementation task.

## Prerequisites

| Tool | Baseline | Use |
| --- | --- | --- |
| PowerShell | 7+ | Run local harness checks |
| Git | 2+ | Version control and worktrees |
| Node.js | 24.x | Planned application development baseline |
| pnpm | 10.x | Planned workspace package manager |
| GitHub CLI | Optional | Repository and review operations |

The harness has no npm dependencies. Documentation validation works offline and does not require Node or pnpm. Missing development tools are warnings in the default check and errors in the strict environment check. Optional skill references remain warnings in either mode.

## Run checks

From the repository root:

```powershell
pwsh -NoProfile -File ./scripts/check-harness.ps1
pwsh -NoProfile -File ./scripts/check-harness.ps1 -CheckEnvironment
```

The script resolves its repository from its own location, so it can also be invoked by absolute path from another directory. It validates required files and repository Markdown links and reports local tool diagnostics. It makes no installs or network calls.

The [Windows workflow](.github/workflows/harness.yml) runs the default check on pushes and pull requests and supports manual runs. Application checks will be added when the corresponding tools exist.

## Scope

The first release includes a placeholder priest, bones, editable textured mesh grids, bone-weight painting, five clips, undo/recovery, and shared PixiJS runtime export. Direct vertex animation, IK, and slot-sequence orchestration follow later. See the product plan for authoritative scope and gates.
