# Development workflow

## Sources of truth

| Information | Authoritative location |
| --- | --- |
| Task status, owner, dependencies, evidence, next action | [SPINE-REA Linear project](https://linear.app/spine-rea/project/slot-animation-studio-07e39e20dfb5) |
| Product scope and acceptance gates | [Product plan](PRODUCT_PLAN.md) |
| Package boundaries and dated technical decisions | [Architecture](ARCHITECTURE.md) |
| Agent operating rules | [AGENTS.md](../AGENTS.md) |
| Working commands and setup | [README.md](../README.md) |
| Implementation history and checks | [GitHub repository](https://github.com/marshymcfloat/slot-animation-studio) |

Do not mirror issue states into a Markdown backlog, status page, or handoff log. Update durable docs only when scope, architecture, setup, or process changes.

## Start or resume a task

1. Read the repository instructions and current Linear issue. Inspect the branch and working tree; preserve unrelated edits.
2. Read the latest issue progress/evidence and referenced commit or PR. Prefer verified code when old notes disagree, and correct the notes.
3. Continue the assigned In Progress issue, or select the highest-priority Todo issue whose blockers are Done. Keep one primary issue in progress per agent; do not move a blocked task forward silently.
4. Confirm outcome, acceptance criteria, dependencies, and intended verification before editing. Fill missing implementation decisions in the issue or architecture document.
   For performance-sensitive work, follow [PERFORMANCE.md](PERFORMANCE.md): define the
   workload/device/targets and capture an existing-path baseline before optimizing.
5. Create an issue branch such as `SPI-7-formats-fixtures`. The initial harness is bootstrapped on `main`; later changes use linked pull requests.

Use the Spine-rea team states: **Backlog -> Todo -> In Progress -> In Review -> Done**. A blocked issue keeps its current state and records its dependency/blocker and required next action. Use Canceled or Duplicate only when appropriate. Confirm that the integration exposes the `spine-rea` workspace before making updates.

Tracking moved from Serviceflow on 2026-11-02. Historical `SER-71` through `SER-78` references in commits correspond, in order, to `SPI-5` through `SPI-12`. Use the SPI issues for ongoing work; their migration sections preserve original dates and state history.

## Issue template

Copy these headings into a Linear issue description:

```markdown
## Outcome
Concrete behavior or deliverable.

## Scope
Included work and important boundaries.

## Acceptance criteria
- [ ] Observable completion criterion.

## Dependencies
Issue links and the specific interface or result needed; otherwise None.

## Verification evidence
Exact commands and results; commit/PR links; relevant visual evidence.
State clearly when a check was not run or failed.
Performance impact: affected path, workload/device/targets and before/after evidence
or first baseline for a new path; otherwise explain why runtime profiling is inapplicable.

## Progress and next action
Completed work, remaining work, blocker if any, and one exact next action.
```

Keep tasks small enough to verify independently. Start with the v0.2 symbol path: import → select/transform → keyframe → save/reopen → export/play. Extend the same nodes/timeline to SVG and basic rigs. Mesh authoring is P2; the retained SPI-9 proof must not block independent symbol work or be marked Done without its remaining evidence. Later milestones receive detailed issues when approached; milestone progress comes from Linear.

## Scope changes and compatibility

- The accepted product v0.2 scope supersedes the previous mesh-first release gates.
- Preserve completed work, issue history, PRs, fixtures and verification evidence.
  Record reprioritization explicitly; missing acceptance evidence stays open.
- Keep one current action issue. Park deferred incomplete work in Backlog with a
  dated reason and resumption action; remove dependencies that no longer apply.
- Agree on unified scene/property contracts before dependent editing or compiler
  work. New product labels do not change schema versions; migration/legacy adapters
  need explicit versions and regression fixtures.
- Basic undo, save/reopen and recovery checks belong in each usable vertical slice.
  Later hardening expands this evidence; it does not postpone basic data safety.
- Expand later milestone issues when approached. Linear is the sole task backlog.

## Parallel agents

- The coordinating agent assigns the issue/subtask, outcome, owned files or subsystem, dependencies, and required evidence.
- Give shared schemas and interfaces one owner. Agree on contracts before parallel dependent implementation.
- Use separate branches/worktrees for concurrent edits. Do not share a mutable working tree.
- Contributors commit their owned changes and report the commit, checks, and limitations. The coordinator reviews and integrates compatible commits, then runs the relevant combined checks.
- Do not mark the parent issue Done because a delegated subtask finished. Verify the integrated acceptance criteria.

## Review and completion

1. Review the final diff for unrelated changes, secrets, generated files, stale instructions, and architecture violations.
2. Run checks appropriate to the changed behavior and record actual results. Use the [pull request template](../.github/pull_request_template.md).
   Include applicable profiling for performance-sensitive changes. Resolve unexplained
   or out-of-budget regressions/stutters/leaks; document measured correctness/security
   tradeoffs within agreed budgets. Missing evidence remains an open criterion.
3. Open/link the PR and put the issue In Review when implementation is ready. Independent review is preferred when available; solo review must still inspect the diff and evidence.
4. Merge only after applicable checks and acceptance criteria pass. Record the final commit/PR and any material limitation, then move the issue to Done.

| Change | Minimum evidence once the subsystem exists |
| --- | --- |
| Harness/docs | Default harness check; strict environment check when setup changes; GitHub documentation workflow |
| Schema/fixtures | Version/semantic validation, invalid-input coverage, JSON round trips, and asset provenance/integrity |
| Core/compiler/mesh | Focused deterministic tests and bone/vertex export parity once compilation exists |
| Editor UI | Running desktop workflow, including relevant keyboard/selection/edit behavior |
| Document editing | Undo/redo behavior for the operation |
| Persistence/assets | Save/reopen, missing-asset behavior, or interrupted-save recovery as relevant |
| Packaging | Installed offline Windows smoke test with environment recorded |
| Performance-sensitive change | PERFORMANCE.md routine: workload/device/targets, frame/stall metrics for rendered paths, relevant CPU/startup/I/O/allocation/lifecycle measurements, comparable evidence and correctness checks |

Working commands are in the README. Checks cover type/unit tests, portable Windows packaging, Electron/Edge fixture transport and geometry, and shared bone/vertex equivalence for project/runtime inputs. Compiler/export parity, authored document commands and persistence require their own checks as those subsystems arrive. Local profiling records actual phase/frame/resource evidence separately from functional smoke tests.

## Stop or hand off

Before ending a work session, update the issue's acceptance checkboxes, verification evidence, and progress section with:

- Completed behavior and its commit/PR; identify uncommitted work if present.
- Actual check results and any unrun checks or failures.
- Remaining acceptance criteria and blockers.
- The exact next action needed to continue.

Leave incomplete issues open. If Linear is temporarily unavailable, report the pending update in the chat, preserve work in Git, and reconcile the issue when access returns; do not create a second tracker.

Normal issue descriptions provide continuity even when optional Linear agent-notes tools are unavailable. Optional local skills are never a substitute for repository instructions or recorded evidence.
