# GSD Command Reference & How-To Guide

A complete reference for all `/gsd:*` Claude Code skills used in the GSD development workflow.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Starting a Project](#starting-a-project)
3. [The Core Development Loop](#the-core-development-loop)
4. [Navigation & Automation](#navigation--automation)
5. [Phase Management](#phase-management)
6. [Milestone Management](#milestone-management)
7. [Notes, Todos & Capture](#notes-todos--capture)
8. [Research & Analysis](#research--analysis)
9. [Quality & Validation](#quality--validation)
10. [Work Sessions](#work-sessions)
11. [Debugging & Health](#debugging--health)
12. [Configuration](#configuration)
13. [Utilities](#utilities)
14. [Common Workflows](#common-workflows)

---

## Core Concepts

GSD organizes work into a three-level hierarchy stored in `.planning/`:

```
Milestone  →  a shippable version (group of phases)
  Phase    →  one focused unit of capability (e.g., "Phase 4 — Auth")
    Plan   →  a PLAN.md file executed by one subagent
```

**Key files:**

| File | Purpose |
|------|---------|
| `.planning/PROJECT.md` | What the project is — vision, tech stack, constraints |
| `.planning/ROADMAP.md` | All phases with status (pending/complete) |
| `.planning/REQUIREMENTS.md` | Active requirements for current milestone |
| `.planning/STATE.md` | Quick-glance progress tracker |
| `.planning/{N}-CONTEXT.md` | Decisions made during discuss-phase for phase N |
| `.planning/{N}-PLAN.md` | Execution plan for phase N |
| `.planning/{N}-SUMMARY.md` | What was built in phase N |
| `.planning/{N}-UAT.md` | User acceptance test results for phase N |

**The standard phase loop:**
```
discuss-phase → plan-phase → execute-phase → verify-work → ship
```

---

## Starting a Project

### `/gsd:new-project`

Initialize a brand-new project from scratch.

**Usage:**
```
/gsd:new-project
/gsd:new-project --auto
```

**What it does:**
1. Asks questions to capture your project vision, tech stack, and constraints
2. Optionally runs domain research
3. Creates `REQUIREMENTS.md` — a scoped requirement contract
4. Creates `ROADMAP.md` — the full phase breakdown
5. Creates `PROJECT.md`, `STATE.md`, and `config.json`

**Flags:**
- `--auto` — Skip interactive questions; infer answers from a document you pass via `@file` reference. Runs research → requirements → roadmap without further prompts.

**After this command:** Run `/gsd:plan-phase 1` to start execution.

---

### `/gsd:new-milestone`

Start the next milestone on an existing project.

**Usage:**
```
/gsd:new-milestone
/gsd:new-milestone "v1.1 Notifications"
```

**What it does:**
- Brownfield equivalent of `new-project`
- Gathers "what's next" for the project
- Updates `PROJECT.md` with new milestone goals
- Runs fresh requirements → roadmap cycle (continues phase numbering from where you left off)
- Optionally does research for new features

**After this command:** Run `/gsd:plan-phase [N]` to start execution.

---

## The Core Development Loop

### `/gsd:discuss-phase`

Gather implementation decisions before planning. **Always run this before `plan-phase`** — it creates the `CONTEXT.md` that downstream agents depend on.

**Usage:**
```
/gsd:discuss-phase 4
/gsd:discuss-phase 4 --auto
```

**What it does:**
1. Loads prior context (PROJECT.md, prior CONTEXT.md files) to avoid re-asking decided questions
2. Scouts the codebase for reusable patterns and integration points
3. Identifies 3–4 "gray areas" specific to this phase
4. Lets you choose which areas to discuss
5. Deep-dives each selected area (4 questions minimum per area)
6. Writes `{N}-CONTEXT.md` with locked decisions

**Flags:**
- `--auto` — Claude picks recommended defaults for all gray areas. No interaction needed. Good for phases with little ambiguity.

**Output:** `{N}-CONTEXT.md` — decisions clear enough that the planner and executor don't need to ask again.

> **Rule:** Never skip discuss-phase. Planners produce much better output when CONTEXT.md exists.

---

### `/gsd:plan-phase`

Create the execution plan (`PLAN.md`) for a phase.

**Usage:**
```
/gsd:plan-phase 4
/gsd:plan-phase             # auto-detects next unplanned phase
/gsd:plan-phase 4 --auto
/gsd:plan-phase 4 --skip-research
/gsd:plan-phase 4 --prd requirements.md
```

**What it does:**
1. Reads `CONTEXT.md` (from discuss-phase) and codebase state
2. Optionally runs a research agent to investigate libraries, patterns, and pitfalls
3. Spawns `gsd-planner` to create `PLAN.md` files
4. Runs `gsd-plan-checker` to verify the plan will achieve the phase goal
5. Iterates until the plan passes verification

**Flags:**

| Flag | Effect |
|------|--------|
| `--auto` | Non-interactive — Claude picks all defaults |
| `--research` | Force re-research even if `RESEARCH.md` already exists |
| `--skip-research` | Skip research, go straight to planning |
| `--gaps` | Gap closure mode — reads `VERIFICATION.md` and creates fix plans |
| `--skip-verify` | Skip the plan-checker verification loop |
| `--prd <file>` | Use a PRD/acceptance criteria doc instead of CONTEXT.md. Parses requirements automatically, skips discuss-phase. |

**After this command:** Run `/gsd:execute-phase [N]`.

---

### `/gsd:execute-phase`

Execute all plans in a phase using parallel subagents.

**Usage:**
```
/gsd:execute-phase 4
/gsd:execute-phase 4 --gaps-only
/gsd:execute-phase 4 --interactive
```

**What it does:**
1. Discovers all PLAN.md files in the phase
2. Analyzes dependencies between plans
3. Groups plans into execution waves (dependent plans run after their dependencies)
4. Spawns subagents for each wave (3–5 in parallel at a time)
5. Each subagent has a fresh 200k context window
6. Collects results and updates STATE.md

**Flags:**

| Flag | Effect |
|------|--------|
| `--gaps-only` | Execute only gap-closure plans (created by verify-work). Use after verification finds issues. |
| `--interactive` | Execute plans sequentially inline (no subagents) with user checkpoints between each. Best for small phases, bug fixes, or when you want pair-programming style control. |

**After this command:** Run `/gsd:verify-work [N]`.

---

### `/gsd:verify-work`

Validate built features through conversational UAT.

**Usage:**
```
/gsd:verify-work 4
/gsd:verify-work        # prompts for phase or resumes active session
```

**What it does:**
1. Presents one test at a time from the phase's acceptance criteria
2. You respond in plain text — pass, fail, or notes
3. When issues are found: automatically diagnoses, creates gap-closure plans
4. Tracks all results in `{N}-UAT.md`
5. If gaps found: routes you to `execute-phase --gaps-only` for fixes

**Output:** `{N}-UAT.md` with all test results. Fix plans ready if needed.

**After this command:**
- All tests pass → `/gsd:ship [N]`
- Issues found → `/gsd:execute-phase [N] --gaps-only` then re-run verify-work

---

### `/gsd:ship`

Create a PR and prepare for merge after verification passes.

**Usage:**
```
/gsd:ship 4
/gsd:ship v1.0
/gsd:ship         # infers from current state
```

**What it does:**
1. Pushes the current branch
2. Creates a PR with an auto-generated description (summary from SUMMARY.md)
3. Optionally runs a code review agent
4. Tracks the merge

Closes the full `plan → execute → verify → ship` loop.

---

## Navigation & Automation

### `/gsd:next`

Auto-detect and invoke the next logical workflow step. No arguments needed.

**Usage:**
```
/gsd:next
```

**What it does:** Reads `STATE.md`, `ROADMAP.md`, and phase directories to figure out exactly where you are and runs the right command. Ideal for multi-project workflows where you don't want to track which step comes next.

**Example routing:**
- No `.planning/` → suggests `new-project`
- ROADMAP.md exists, no CONTEXT.md for next phase → runs `discuss-phase`
- CONTEXT.md exists, no PLAN.md → runs `plan-phase`
- PLAN.md exists, no SUMMARY.md → runs `execute-phase`
- SUMMARY.md exists, no UAT.md → runs `verify-work`

---

### `/gsd:autonomous`

Run all remaining phases autonomously without manual step-by-step invocation.

**Usage:**
```
/gsd:autonomous
/gsd:autonomous --from 4
```

**What it does:**
- For each remaining phase: `discuss-phase` → `plan-phase` → `execute-phase`
- Pauses only for user decisions (gray area acceptance, blockers, validation)
- After all phases complete: `audit-milestone` → `complete-milestone` → `cleanup`

**Flags:**
- `--from N` — Start from phase N instead of the first incomplete phase

> Use this when you've reviewed the roadmap and trust Claude to proceed with minimal interruption.

---

### `/gsd:progress`

Check current project progress and route to the next action.

**Usage:**
```
/gsd:progress
```

Shows phase completion status, what's done, what's next, and automatically offers to execute or plan.

---

### `/gsd:quick`

Execute a small, ad-hoc task with GSD guarantees (atomic commits, state tracking) but without full milestone ceremony.

**Usage:**
```
/gsd:quick Fix the broken auth redirect
/gsd:quick Add a loading spinner to the dashboard --discuss
/gsd:quick Refactor the database module --full
/gsd:quick Investigate caching options --research
```

**What it does:**
- Spawns `gsd-planner` (quick mode) + `gsd-executor`
- Quick tasks live in `.planning/quick/` (separate from planned phases)
- Updates `STATE.md` "Quick Tasks Completed" table

**Flags:**

| Flag | Effect |
|------|--------|
| *(none)* | Default: skip research, discussion, plan-checker, verifier |
| `--discuss` | Lightweight discussion phase before planning (surfaces ambiguity) |
| `--full` | Enables plan-checking (max 2 iterations) + post-execution verification |
| `--research` | Spawns a focused research agent before planning |

Flags are composable: `--discuss --research --full` gives everything.

> Use `quick` for bug fixes, one-off improvements, or anything that doesn't belong in the main roadmap.

---

## Phase Management

### `/gsd:add-phase`

Add a new phase to the end of the current milestone's roadmap.

**Usage:**
```
/gsd:add-phase "Add dark mode support"
```

Calculates the next sequential phase number, creates the directory, and updates ROADMAP.md.

---

### `/gsd:insert-phase`

Insert an urgent phase between two existing phases without renumbering everything.

**Usage:**
```
/gsd:insert-phase 4 "Critical security fix"
```

Creates a decimal phase (e.g., `4.1`) inserted after phase 4. Useful for urgent work that can't wait for the next milestone.

---

### `/gsd:remove-phase`

Remove a future phase from the roadmap and renumber subsequent phases.

**Usage:**
```
/gsd:remove-phase 7
```

Only works on phases that haven't been executed yet. Phases with existing PLAN.md or SUMMARY.md are protected.

---

### `/gsd:list-phase-assumptions`

Surface Claude's implicit assumptions about a phase's approach before you commit to planning.

**Usage:**
```
/gsd:list-phase-assumptions 4
/gsd:list-phase-assumptions     # uses next unplanned phase
```

Useful for catching misaligned expectations before the planner runs.

---

### `/gsd:research-phase`

Run phase research as a standalone step (without proceeding to planning).

**Usage:**
```
/gsd:research-phase 4
```

Produces `{N}-RESEARCH.md`. Usually you'd use `plan-phase` directly (which includes research), but this is useful when you want to review research before planning starts.

---

### `/gsd:plan-milestone-gaps`

After `audit-milestone` finds gaps, create fix phases to close them.

**Usage:**
```
/gsd:plan-milestone-gaps
```

Reads the milestone audit report, identifies unmet requirements, and creates new phases for each gap. Run before `complete-milestone` when the audit found issues.

---

## Milestone Management

### `/gsd:audit-milestone`

Audit milestone completion against original intent before archiving.

**Usage:**
```
/gsd:audit-milestone
/gsd:audit-milestone v1.0
```

**What it checks:**
- All requirements have been addressed
- Cross-phase integration points work
- E2E user flows complete end-to-end
- Produces `v{version}-MILESTONE-AUDIT.md` with `passed` or `gaps_found` status

> Run this before `complete-milestone`. If audit status is `gaps_found`, run `plan-milestone-gaps` first.

---

### `/gsd:complete-milestone`

Archive the completed milestone and prepare for the next version.

**Usage:**
```
/gsd:complete-milestone 1.0
```

**What it does:**
1. Checks audit status (warns if audit not run or has gaps)
2. Verifies all phases have SUMMARY.md
3. Gathers stats (phase count, file changes, LOC, timeline)
4. Archives milestone to `.planning/milestones/v{version}-ROADMAP.md`
5. Archives requirements to `.planning/milestones/v{version}-REQUIREMENTS.md`
6. Updates `PROJECT.md` with "Current State" and "Next Milestone Goals"
7. Creates a git commit + tag (`v{version}`)

**Typical pre-flight:**
```
/gsd:audit-milestone v1.0       # check for gaps
/gsd:plan-milestone-gaps        # (if gaps found)
/gsd:execute-phase [gap phase]  # (if gaps found)
/gsd:complete-milestone 1.0     # archive and tag
```

---

### `/gsd:cleanup`

Archive accumulated phase directories from completed milestones.

**Usage:**
```
/gsd:cleanup
```

Moves old phase artifacts to an archive location, keeping `.planning/` lean for the active milestone.

---

## Notes, Todos & Capture

### `/gsd:note`

Zero-friction idea capture during active work.

**Usage:**
```
/gsd:note "Consider caching the auth tokens"
/gsd:note list
/gsd:note list --global
/gsd:note promote 2
/gsd:note promote 2 --global
```

- **`<text>`** — Append a note to the project's notes file
- **`list`** — Show all current notes
- **`list --global`** — Show notes across all projects
- **`promote N`** — Elevate note N to a tracked todo
- **`promote N --global`** — Promote to a global (cross-project) todo

---

### `/gsd:add-todo`

Capture a task or idea as a tracked todo item from the current conversation context.

**Usage:**
```
/gsd:add-todo
/gsd:add-todo "Investigate Redis for session storage"
```

If no description is provided, Claude infers the task from conversation context.

---

### `/gsd:check-todos`

List pending todos and interactively select one to work on.

**Usage:**
```
/gsd:check-todos
/gsd:check-todos auth
```

- Without args: shows all pending todos
- With an area filter: narrows to matching todos (e.g., `auth`, `frontend`)

---

## Research & Analysis

### `/gsd:map-codebase`

Run parallel mapper agents to produce structured codebase analysis documents.

**Usage:**
```
/gsd:map-codebase
/gsd:map-codebase auth
/gsd:map-codebase api
```

Produces documents in `.planning/codebase/` covering architecture, tech stack, quality signals, and concerns. Useful before starting a new milestone on a large codebase.

---

### `/gsd:stats`

Display project statistics — phases, plans, requirements, git metrics, and timeline.

**Usage:**
```
/gsd:stats
```

Shows phase completion rates, total LOC changed, commit count, and estimated timeline.

---

## Quality & Validation

### `/gsd:validate-phase`

Retroactively audit a completed phase and fill any Nyquist validation gaps.

**Usage:**
```
/gsd:validate-phase 4
/gsd:validate-phase        # uses most recently completed phase
```

Checks that the phase actually delivered what was planned. Creates fix plans for anything missing. Use when you skipped `verify-work` or want a second-opinion audit.

---

### `/gsd:add-tests`

Generate unit and E2E tests for a completed phase.

**Usage:**
```
/gsd:add-tests 4
/gsd:add-tests 4 focus on edge cases in the pricing module
```

**What it does:**
1. Reads `SUMMARY.md`, `CONTEXT.md`, and `VERIFICATION.md` for phase N
2. Analyzes implementation files
3. Classifies files into TDD (unit tests), E2E (browser tests), or Skip
4. Presents a test plan for your approval
5. Generates tests following RED-GREEN conventions

**Output:** Test files committed with message `test(phase-{N}): add unit and E2E tests`.

---

### `/gsd:ui-phase`

Generate a UI design contract (`UI-SPEC.md`) before implementing frontend phases.

**Usage:**
```
/gsd:ui-phase 4
```

Produces a `UI-SPEC.md` design document covering layout, component structure, interactions, and visual hierarchy. Use this before `plan-phase` on phases that have significant UI work.

---

### `/gsd:ui-review`

Retroactive 6-pillar visual audit of implemented frontend code.

**Usage:**
```
/gsd:ui-review 4
/gsd:ui-review        # uses most recently completed phase
```

Audits implemented UI across 6 dimensions: layout, typography, color, spacing, interaction, and accessibility. Produces a scored `UI-REVIEW.md`.

---

## Work Sessions

### `/gsd:pause-work`

Create a context handoff document when pausing work mid-phase.

**Usage:**
```
/gsd:pause-work
```

Captures current state, in-progress decisions, blockers, and next steps into a handoff file. Pair with `resume-work` when returning.

---

### `/gsd:resume-work`

Resume work from a previous session with full context restoration.

**Usage:**
```
/gsd:resume-work
```

Reads the handoff document created by `pause-work`, restores mental model, and routes to the right next step.

---

### `/gsd:session-report`

Generate a session report with token usage estimates, work summary, and outcomes.

**Usage:**
```
/gsd:session-report
```

Useful at the end of a long coding session to capture what was accomplished and how much was spent.

---

## Debugging & Health

### `/gsd:debug`

Systematic debugging with persistent state across context resets.

**Usage:**
```
/gsd:debug
/gsd:debug Auth tokens are being dropped after logout
```

**What it does:**
1. Checks for active debug sessions (resumes if found)
2. Gathers symptoms from you
3. Spawns a `gsd-debugger` subagent with a fresh 200k context for investigation
4. Uses the scientific method: hypothesis → evidence → confirm/falsify
5. Handles checkpoints and spawns continuation agents if investigation overflows context

Keeps the main conversation lean while investigation runs in isolation.

---

### `/gsd:health`

Diagnose the `.planning/` directory for structural issues.

**Usage:**
```
/gsd:health
/gsd:health --repair
```

Checks for:
- Missing or malformed state files
- Orphaned phase directories
- Inconsistent ROADMAP.md vs directory state
- Broken cross-references

`--repair` attempts to auto-fix detected issues.

---

## Configuration

### `/gsd:settings`

Configure GSD workflow toggles and model profile interactively.

**Usage:**
```
/gsd:settings
```

Opens an interactive settings menu for toggling workflow options (auto-research, plan verification, etc.) and setting the default model profile.

---

### `/gsd:set-profile`

Switch the model profile used by GSD agents.

**Usage:**
```
/gsd:set-profile quality
/gsd:set-profile balanced
/gsd:set-profile budget
/gsd:set-profile inherit
```

| Profile | Effect |
|---------|--------|
| `quality` | Uses highest-capability models. Best output, highest cost. |
| `balanced` | Mix of capable and fast models. Default for most work. |
| `budget` | Uses faster, cheaper models. Good for simple tasks. |
| `inherit` | Use whatever model is active in the current session. |

---

### `/gsd:update`

Update GSD to the latest version with changelog display.

**Usage:**
```
/gsd:update
```

Checks for a newer version and installs it. Shows changelog for the new version.

---

### `/gsd:reapply-patches`

Reapply local modifications after a GSD update.

**Usage:**
```
/gsd:reapply-patches
```

If you've made local customizations to GSD workflow files that get overwritten during updates, this restores your patches from the backup directory.

---

## Utilities

### `/gsd:do`

Route freeform text to the right GSD command automatically.

**Usage:**
```
/gsd:do I want to start planning phase 4
/gsd:do We need to fix the auth bug
/gsd:do Ship the current work
```

Analyzes your intent and invokes the appropriate GSD command. Good when you're not sure which command to use.

---

### `/gsd:help`

Show all available GSD commands with descriptions.

**Usage:**
```
/gsd:help
```

---

### `/gsd:profile-user`

Generate a developer behavioral profile from session history.

**Usage:**
```
/gsd:profile-user
/gsd:profile-user --questionnaire
/gsd:profile-user --refresh
```

Analyzes how you work and produces profile artifacts that help Claude tailor its behavior to your preferences.

---

### `/gsd:join-discord`

Get a link to join the GSD Discord community.

**Usage:**
```
/gsd:join-discord
```

---

## Common Workflows

### Starting a greenfield project

```
/gsd:new-project
/gsd:discuss-phase 1
/gsd:plan-phase 1
/gsd:execute-phase 1
/gsd:verify-work 1
/gsd:ship 1
```

### Repeating the loop for each phase

```
/gsd:next          # auto-routes to the right step
```

Or manually:

```
/gsd:discuss-phase N
/gsd:plan-phase N
/gsd:execute-phase N
/gsd:verify-work N
/gsd:ship N
```

### Fully autonomous execution

```
/gsd:autonomous           # run all remaining phases hands-off
```

### Starting a new milestone on existing project

```
/gsd:audit-milestone v1.0
/gsd:complete-milestone 1.0
/gsd:new-milestone "v1.1 Performance"
/gsd:discuss-phase N
/gsd:plan-phase N
...
```

### Handling a quick bug fix

```
/gsd:quick Fix the broken pagination on the users table
```

### Handling a quick task with quality gates

```
/gsd:quick Refactor the auth module --discuss --full
```

### Pausing and resuming across sessions

```
/gsd:pause-work         # before ending session
# ... new session later ...
/gsd:resume-work        # restores context
/gsd:next               # continues where you left off
```

### Verifying and shipping after finding gaps

```
/gsd:verify-work 4
# (gaps found)
/gsd:execute-phase 4 --gaps-only
/gsd:verify-work 4
# (all pass)
/gsd:ship 4
```

### Running UI-first for a frontend phase

```
/gsd:discuss-phase 4
/gsd:ui-phase 4            # design contract first
/gsd:plan-phase 4
/gsd:execute-phase 4
/gsd:ui-review 4           # visual audit after implementation
/gsd:verify-work 4
/gsd:ship 4
```
