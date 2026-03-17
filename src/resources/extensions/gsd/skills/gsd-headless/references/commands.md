# GSD Commands Reference

All commands can be run via `gsd headless [command]`.

## Workflow Commands

| Command | Description |
|---------|-------------|
| `auto` | Autonomous mode — loop until milestone complete (default) |
| `next` | Step mode — execute one unit, then exit |
| `stop` | Stop auto-mode gracefully |
| `pause` | Pause auto-mode (preserves state, resumable) |
| `new-milestone` | Create milestone from specification (requires `--context`) |
| `dispatch <phase>` | Force-dispatch: research, plan, execute, complete, reassess, uat, replan |

## Status & Monitoring

| Command | Description |
|---------|-------------|
| `status` | Progress dashboard (active unit, phase, blockers) |
| `visualize` | Workflow visualizer (deps, metrics, timeline) |
| `history` | Execution history (supports --cost, --phase, --model, limit) |

## Unit Control

| Command | Description |
|---------|-------------|
| `skip` | Prevent a unit from auto-mode dispatch |
| `undo` | Revert last completed unit (--force flag) |
| `steer <desc>` | Hard-steer plan documents during execution |
| `queue` | Queue and reorder future milestones |
| `capture` | Fire-and-forget thought capture |
| `triage` | Manually trigger triage of pending captures |

## Configuration & Health

| Command | Description |
|---------|-------------|
| `prefs` | Manage preferences (global/project/status/wizard/setup) |
| `config` | Set API keys for external tools |
| `doctor` | Runtime health checks with auto-fix |
| `hooks` | Show configured post-unit and pre-dispatch hooks |
| `knowledge <rule\|pattern\|lesson>` | Add persistent project knowledge |
| `cleanup` | Remove merged branches or snapshots |
| `export` | Export results (--json, --markdown) |
| `migrate` | Migrate v1 .planning directory to .gsd format |

## Phases

GSD workflows progress through these phases:
`pre-planning` → `needs-discussion` → `discussing` → `researching` → `planning` → `executing` → `verifying` → `summarizing` → `advancing` → `validating-milestone` → `completing-milestone` → `complete`

Special phases: `paused`, `blocked`, `replanning-slice`

## Hierarchy

- **Milestone**: Shippable version (4-10 slices, 1-4 weeks)
- **Slice**: One demoable vertical capability (1-7 tasks, 1-3 days)
- **Task**: One context-window-sized unit of work (one session)
