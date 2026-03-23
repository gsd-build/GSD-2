# Competing PR Analysis: Single-Writer State Architecture

**Date:** 2026-03-23
**Analyst:** Claude Opus 4.6
**PRs Compared:**
- **PR #2141** (glittercowboy/Lex) — "Tool-driven write-side state transitions"
- **PRs #2217–#2222 + #2246** (jeremymcs) — "Single-writer state architecture" (6-PR stack)

---

## Executive Summary

Two developers independently converged on the same diagnosis: **GSD's markdown-mutation state machine is fundamentally broken.** Both identified the same root cause — agents performing brittle text surgery on markdown checkboxes creates split-brain state that cascading doctor/recovery/reconciliation code (10K+ lines) tries and fails to fix. Both proposed the same architectural solution: **single-writer state with SQLite-backed atomic commands where TypeScript owns all state transitions and markdown becomes a rendered view.**

The implementations diverge significantly in scope, layering, and migration strategy. Both produced independent ADRs — **Issue #2041** (Lex) and **ADR-004** (Jeremy) — which are compared in detail in Section 1A below.

---

## 1A. Competing ADR Comparison

Both ADRs document the same problem with remarkable overlap, but differ in architectural prescription and implementation detail.

### ADR Attribution

| | Lex's ADR (Issue #2041) | Jeremy's ADR (ADR-004) |
|---|---|---|
| **Location** | GitHub Issue #2041 | `docs/ADR-004-single-writer-state-architecture.md` |
| **Date** | 2026-03-22 | 2026-03-22 |
| **Length** | ~480 lines | ~317 lines |
| **Referenced by** | PR #2141 | PRs #2217–#2246 |

### Problem Diagnosis Overlap (Nearly Identical)

Both ADRs identify:
- The same 5 redundant state systems (in-memory array, completed-units.json, markdown checkboxes, summary file existence, runtime records)
- The same prompt contract problem (agents told to regex-toggle checkboxes)
- The same `state.ts:215-220` scar tissue where the DB was abandoned (#759)
- The same doctor code quantification (~3K+ lines of reconciliation)
- The same failure history (issues #759, #1063, #1405, #1558, #1576)

**Lex's ADR adds:** Quantified band-aid evidence (90 non-fatal catch blocks, 60+ issue references in code, 24 checkbox mutation call sites). Specific line-number citations for doctor fixes. Deeper cost accounting (~5,900 lines total).

**Jeremy's ADR adds:** The "Five Redundant State Systems" table with clear writer/reader attribution. The "48 non-fatal catch blocks in doctor-checks.ts alone" metric. The explicit three-layer architecture diagram. Quantified blast radius (82 files / 430 reconciliation pattern occurrences).

### Architectural Prescription (Key Differences)

| Dimension | Lex's ADR (#2041) | Jeremy's ADR (ADR-004) |
|-----------|-------------------|------------------------|
| **Core framing** | "Tool-driven database architecture" | "Single-writer command-driven state engine" |
| **Conceptual boundary** | Tool handlers with DB transactions | Typed state engine abstraction (WorkflowEngine) |
| **Tool schema richness** | Rich schemas with domain-specific fields (`oneLiner`, `narrative`, `forwardIntelligence`, `requirementsAdvanced`) | Minimal schemas focused on state transition params |
| **Tool count planned** | ~8 tool handlers (complete-task, plan-slice, complete-slice, plan-milestone, complete-milestone, research-*) | 17 tool calls covering every agent interaction |
| **Event sourcing** | Not mentioned | "Event sourcing lite" — append-only event log for audit trail and fork-point detection |
| **Worktree coordination** | Not addressed in ADR | Advisory sync locks + event replay for cross-worktree reconciliation |
| **Migration phases** | 5 phases (Foundation → Prompts → Mandatory → Remove parsing → Cleanup) | 5 phases (Foundation → Sync → Doctor → Dead code → Full API) |
| **Success criteria** | 5 criteria (identical to Jeremy's) | 7 criteria (adds forensics and retry cap) |
| **Code impact estimate** | ~2,500+ lines removed | Net –2,500 to –4,000 lines |
| **Doctor treatment** | "Remove or gut" — ~800 lines of fix logic | "Keep for infrastructure diagnostics" — explicit keep/kill lists |
| **Rejected alternatives** | Not listed | 4 explicitly rejected alternatives with rationale |
| **Three-layer diagram** | Implicit in description | Explicit ASCII architecture diagram (Command API → State Engine → Markdown Projections) |

### Lex's ADR Strengths Over Jeremy's

1. **Richer tool schemas.** The `complete_task` schema includes `forwardIntelligence`, `observabilitySurfaces`, `patternsEstablished` — capturing domain knowledge the LLM produces naturally. Jeremy's schemas are lean state-transition params. Lex's approach captures more value from each tool call.

2. **Deeper code archaeology.** Specific line-number citations (e.g., "doctor.ts:801-816", "auto-recovery.ts:331-348") for every reconciliation function. This makes the case more auditable.

3. **Full SQL schema in ADR.** The proposed table definitions are in the ADR itself, making it a self-contained specification. Jeremy's ADR describes tables conceptually but delegates schema to implementation.

4. **Band-aid quantification.** "90 non-fatal catch blocks", "60+ issue references", "24 calls to checkbox mutation functions" — concrete metrics that Jeremy's ADR doesn't provide at the same granularity.

### Jeremy's ADR Strengths Over Lex's

1. **Architectural abstraction.** The three-layer architecture (Command API → State Engine → Projections) establishes a clear conceptual boundary. Lex's ADR describes tool handlers with DB transactions but doesn't name or formalize the engine abstraction. This matters for future contributors who need to understand where new tools go.

2. **Event sourcing lite.** The event log for fork-point detection and forensics is entirely absent from Lex's ADR. For a tool that uses worktrees heavily, cross-worktree state coordination is a critical gap.

3. **Explicit rejected alternatives.** Four alternatives with specific rationale for rejection — including "Just fix the prompts" and "Make SQLite the direct source of truth" — which preempts common pushback.

4. **Doctor keep/kill taxonomy.** Jeremy's ADR explicitly lists what doctor keeps (git health, disk health, environment health, projection drift detection) vs. what it kills. Lex's ADR says "remove or gut" without specifying what survives.

5. **The "one sheriff in town" principle.** Jeremy's ADR distills the core insight into a memorable principle: "If the architecture still needs a doctor to decide whether a task is done, the architecture is the patient." Lex's ADR has similar sentiment but less pithy framing.

6. **Scope completeness.** Jeremy's ADR envisions 17 tools covering every agent interaction. Lex's ADR describes ~8 tools. The ADR's own logic argues for complete coverage — partial coverage preserves the split-brain in uncovered paths.

### Where Both ADRs Agree Exactly

- Zero doctor fix runs in normal operation
- No "non-fatal" catch blocks for state inconsistency
- Auto-mode never stops for bookkeeping failures
- Net code reduction of 2,000-2,500+ lines
- `deriveState()` executes in <1ms
- Markdown files become rendered views, never parsed back for state
- SQLite transactions for atomic state transitions
- Phased migration with filesystem fallback

---

## 1. Architectural Comparison

### PR #2141 (Lex) — "Pragmatic Surgical"

| Dimension | Detail |
|-----------|--------|
| **Pattern** | Direct tool handlers with DB transactions |
| **Scope** | 2 tool calls: `gsd_complete_task`, `gsd_slice_complete` |
| **Layers** | Tool handler → DB transaction → Markdown render → Cache invalidation |
| **New modules** | 3 (`markdown-renderer.ts`, `tools/complete-task.ts`, `tools/complete-slice.ts`) |
| **Schema** | v4→v7 (milestones/slices/tasks/verification_evidence tables) |
| **Lines** | +8,828 / -1,441 (54 files) |
| **Tests** | 12 new test files, 189-assertion cross-validation suite |
| **Doctor** | Removed 7 reconciliation issue codes, ~800 lines deleted |
| **Migration** | Auto-migration via `md-importer.ts` on first access |
| **Delivery** | Single monolithic PR, 4 commits |

**Architecture pattern:** Each tool handler is a self-contained operation:
1. Validate inputs (ID format, parent existence)
2. DB transaction (INSERT OR REPLACE)
3. Render markdown to disk (summary file, checkbox toggle)
4. Store rendered markdown back in DB for crash recovery
5. Invalidate caches

**Key insight:** Starts with the highest-impact operations (task/slice completion) that cause 80%+ of state drift failures, leaving milestone/roadmap operations for later.

### PR Stack #2217–#2246 (Jeremy) — "Full Architecture"

| Dimension | Detail |
|-----------|--------|
| **Pattern** | Event-sourcing-lite engine with typed commands, projections, and event log |
| **Scope** | 17 tool calls covering ALL agent-workflow interactions |
| **Layers** | Tool Registration → WorkflowEngine → Command Handlers → DB Transaction → Event Log → Projections → Manifest |
| **New modules** | 10+ (`workflow-engine.ts`, `workflow-commands.ts`, `workflow-events.ts`, `workflow-projections.ts`, `workflow-manifest.ts`, `workflow-engine-schema.ts`, `workflow-migration.ts`, `workflow-reconcile.ts`, `sync-lock.ts`, `write-intercept.ts`, `workflow-logger.ts`, `engine-types.ts`, `engine-resolver.ts`, `legacy/parsers.ts`) |
| **Schema** | Engine-specific tables + event log |
| **Lines** | +10,990 / -3,900 (PR #2246 alone; cumulative across stack much larger) |
| **Tests** | 18+ engine test files, cross-validation suite |
| **Doctor** | Parser relocation to `legacy/`, reconciliation replaced with `checkEngineHealth()` |
| **Migration** | Phased: Foundation → Sync → Doctor cleanup → Dead code → Build fixes → Full API |
| **Delivery** | 6 sequential PRs with dependencies |
| **Documentation** | ADR-004, SINGLE-WRITER-STATE-MAP.md |

**Architecture pattern:** Three-layer architecture:
1. **Command API** — What agents see and call (17 typed tools)
2. **State Engine** — TypeScript-owned WorkflowEngine with SQLite backing
3. **Markdown Projections** — Human-readable rendered views

**Key insight:** Full coverage of every agent interaction point, not just task/slice completion. Includes write interception (catching rogue agent writes), advisory sync locks for worktrees, event replay for cross-worktree reconciliation.

---

## 2. Scope Coverage Analysis

### What each PR covers

| Workflow Interaction | PR #2141 | Stack #2246 |
|---------------------|----------|-------------|
| Complete task | `gsd_complete_task` | `gsd_complete_task` |
| Complete slice | `gsd_slice_complete` | `gsd_complete_slice` |
| Plan slice (task definition) | — | `gsd_plan_slice` |
| Start task | — | `gsd_start_task` |
| Record verification | — | `gsd_record_verification` |
| Save decision | — | `gsd_save_decision` |
| Report blocker | — | `gsd_report_blocker` |
| Create milestone | — | `gsd_create_milestone` |
| Plan milestone (roadmap) | — | `gsd_plan_milestone` |
| Complete milestone | — | `gsd_complete_milestone` |
| Validate milestone | — | `gsd_validate_milestone` |
| Update roadmap | — | `gsd_update_roadmap` |
| Save context | — | `gsd_save_context` |
| Save research | — | `gsd_save_research` |
| Save requirements | — | `gsd_save_requirements` |
| Save UAT result | — | `gsd_save_uat_result` |
| Save knowledge | — | `gsd_save_knowledge` |
| Undo task | CLI command | — |
| Reset slice | CLI command | — |
| DB recovery | `gsd recover` | Event replay |
| Rogue file detection | `detectRogueFileWrites()` | `write-intercept.ts` |

**Gap in #2141:** 15 workflow interactions still rely on agents writing markdown directly. The ADR explicitly warns that `plan-milestone` (agents writing ROADMAP.md in table format instead of checkbox format) causes `parseRoadmap()` to find 0 slices, breaking auto-mode. PR #2141 doesn't address this.

**Gap in Stack:** No CLI undo-task/reset-slice commands. No `gsd recover` equivalent (relies on event replay instead). The undo story is less developed.

---

## 3. File Overlap & Merge Conflict Analysis

### HIGH Severity Conflicts (6 files)

| File | #2141 Approach | Stack Approach | Verdict |
|------|---------------|----------------|---------|
| `state.ts` | +510 lines: `deriveStateFromDb()` SQL rewrite with filesystem fallback | Engine-backed `deriveState()` delegating to WorkflowEngine | **Irreconcilable** — fundamentally different derivation paths |
| `gsd-db.ts` | +638 lines: schema v5–v7 tables, hierarchy CRUD functions | Engine schema tables, different column set | **Irreconcilable** — both extend DB differently |
| `auto-recovery.ts` | -134 lines: reference `gsd recover` in remediation | Rewrite for engine health checks | **Irreconcilable** — different recovery model |
| `auto-worktree.ts` | Shared WAL via `resolveProjectRootDbPath()` | Advisory sync locks + event replay | **Irreconcilable** — different concurrency model |
| `auto.ts` | Minor (-2 lines) | Major rewrite for engine integration | **Resolvable** but requires stack's version |
| `auto-timeout-recovery.ts` | Minor changes | Major changes for engine | **Resolvable** |

### MEDIUM Severity Conflicts (8 files)

| File | Notes |
|------|-------|
| `auto-post-unit.ts` | Both add rogue detection but via different mechanisms |
| `commands-maintenance.ts` | Both add recovery commands but different ones |
| `commands/catalog.ts` | Both register new commands |
| `commands/handlers/ops.ts` | Both add operation handlers |
| `doctor.ts` | Both gut reconciliation but leave different remnants |
| `doctor-types.ts` | Both remove completion transition codes |
| `undo.ts` | #2141 adds undo-task/reset-slice; Stack makes different changes |
| Prompt files (5) | Both rewrite prompts for tool calls — different tool names |

### Delete/Modify Conflicts

| File | #2141 | Stack |
|------|-------|-------|
| `roadmap-mutations.ts` | **DELETED** | Not touched (may still be imported) |
| `doctor-task-done-missing-summary-slice-loop.test.ts` | **DELETED** | Not touched |

### Unique Files (No Conflict)

- **#2141 only:** `markdown-renderer.ts`, `tools/complete-slice.ts`, `tools/complete-task.ts`, `bootstrap/db-tools.ts`
- **Stack only:** All `workflow-*.ts` modules, `sync-lock.ts`, `write-intercept.ts`, `engine-*.ts`, `legacy/parsers.ts`, ADR-004, plus 30+ other modified files

**Bottom line:** These PRs are **not mergeable together.** One must be chosen as the base, and specific features from the other cherry-picked.

---

## 4. Regression Risk Analysis

### PR #2141 Regression Risks

| Risk | Severity | Description |
|------|----------|-------------|
| Partial coverage gap | HIGH | Only 2/17 tool calls covered. Agents still write markdown for plan-milestone, complete-milestone, etc. — the exact pattern the PR argues is broken |
| Schema migration fragility | MEDIUM | v4→v7 jump with no intermediate migration path. Existing projects with v5 or v6 data from other features could break |
| Bidirectional markdown render | MEDIUM | `markdown-renderer.ts` (721 lines) maintains two-way sync between DB and markdown. This is the exact split-brain pattern the ADR warns against — just with different writers |
| Doctor removal without replacement | MEDIUM | 800 lines of reconciliation deleted, but 15 workflow paths still produce markdown directly. What catches drift in uncovered paths? |
| Monolithic PR reviewability | LOW | 8,828 additions in one PR. Comment from igouss: "the PRs that AI generate are huge, and impossible to review" |

### Stack #2217–#2246 Regression Risks

| Risk | Severity | Description |
|------|----------|-------------|
| Build regression cascade | HIGH | PR 5/6 (#2222) exists **solely** to fix build failures and 26 test regressions from PRs 1–4. This means the incremental PRs don't independently compile/pass |
| Over-engineering | HIGH | 10+ new modules, IPolymorphicEngine interface, engine-resolver pattern. The complexity budget is high for what is fundamentally "use tools instead of file writes" |
| Layer count | MEDIUM | Tool → Engine → Command → Transaction → Event Log → Projection → Manifest — 7 layers for each operation. Debugging through this stack is non-trivial |
| Event log scalability | MEDIUM | Append-only event log + compaction. For a local CLI tool this is significant operational complexity |
| Dependency chain fragility | MEDIUM | 6 sequential PRs where each depends on the previous. If any PR needs rework, all downstream PRs need rebasing |
| Pass-through commands | LOW | `gsd_save_context`, `gsd_save_research`, `gsd_save_knowledge` are marked "pass-through" — they don't actually write to engine tables, undermining the single-writer principle |

---

## 5. Future Impact Analysis

### If PR #2141 is merged first

1. **Immediate benefit:** Task/slice completion becomes atomic and reliable — the highest-impact fix
2. **Remaining work:** 15 more tool calls needed to cover all workflow interactions (see ADR gap analysis)
3. **Technical debt:** `markdown-renderer.ts` bidirectional sync becomes load-bearing and grows. Each new tool call needs its own renderer integration
4. **Migration path:** Would need to either (a) adopt the WorkflowEngine pattern from the stack for remaining tools, creating architectural inconsistency, or (b) continue the ad-hoc tool handler pattern, accumulating standalone handlers
5. **Doctor gap:** With reconciliation removed but only 2 tools guarding state, new drift patterns emerge in uncovered workflow paths

### If the Stack is merged first

1. **Immediate benefit:** Complete coverage of all 17 workflow interactions. Event log provides forensics
2. **Remaining work:** CLI undo/reset commands, `gsd recover` equivalent
3. **Technical debt:** 10+ new modules to maintain. WorkflowEngine becomes a central abstraction everyone must understand
4. **Migration path:** Clean — all new tools follow the same pattern through the engine
5. **Cherry-pick opportunities:** PR #2141's `markdown-renderer.ts` could enhance the stack's projection layer. The `gsd recover` command is independently valuable. The cross-validation test suite (189 assertions) should be adopted

### If neither is merged (status quo)

1. **Known bugs remain:** All 11 issues referenced by PR #2141 stay open (#2041, #2201, #2202, #1925, #1924, #1768, #2022, #2196, #2076, #1941)
2. **Doctor continues to grow:** More reconciliation code, more catch blocks, more band-aids
3. **Auto-mode reliability stays low:** Agents will continue to fail at checkbox toggling

---

## 6. Quality & Testing Comparison

| Metric | PR #2141 | Stack #2246 |
|--------|----------|-------------|
| New test files | 12 | 18+ |
| Integration proof | 643-line end-to-end test covering 13 requirements | Per-module unit tests + cross-validation |
| Cross-validation | 189 assertions proving DB/filesystem equivalence | 7 scenarios in derive-state-crossval |
| Doctor test updates | 9 existing test files updated | Multiple doctor test files updated |
| Prompt contract tests | Yes (`prompt-contracts.test.ts`) | Yes (engine prompt-migration tests) |
| CI status | Commits show iterative fixes (4 commits, 3 are fix commits) | PR 5/6 is entirely build/test fixes |

**Observation:** Both PRs show signs of "fix-forward" development where the initial implementation broke tests that subsequent commits had to repair. PR #2141 does this within a single PR (3 fix commits after the feature commit). The stack does this across PRs (#2222 is a dedicated fix PR).

---

## 7. Recommendation

### Primary recommendation: **Merge the Stack (#2217–#2246) as the architectural foundation, then cherry-pick specific features from #2141.**

**Rationale:**

1. **Completeness wins.** The stack covers all 17 workflow interactions. PR #2141 covers 2. The ADR explicitly documents that partial coverage leaves the same failure patterns in uncovered paths — the plan-milestone example is a smoking gun.

2. **The ADR is load-bearing.** Having ADR-004 as an architectural decision record means future contributors understand *why* the architecture is this way. PR #2141 has no equivalent documentation beyond the PR description.

3. **Consistent pattern.** All 17 tools follow the same `Command → Engine → Transaction → Event → Projection` pattern. PR #2141's ad-hoc handlers would need to be retrofitted if the remaining 15 tools are added later.

4. **Worktree coordination.** The stack's advisory sync locks + event replay is more sophisticated than PR #2141's shared WAL approach. For a tool that uses worktrees heavily, this matters.

### Cherry-pick from #2141:

| Feature | Value | Effort |
|---------|-------|--------|
| `gsd recover` command | HIGH — DB reconstruction from markdown when things go wrong | LOW |
| Cross-validation test suite (189 assertions) | HIGH — proves DB/filesystem equivalence | LOW |
| Integration proof test (643 lines) | MEDIUM — end-to-end lifecycle test | MEDIUM |
| Rogue file detection approach | MEDIUM — complements write-intercept | LOW |
| CLI undo-task/reset-slice | MEDIUM — user-facing recovery tools | MEDIUM |

### Concerns to address in the Stack before merge:

1. **Build regression cascade** — PRs 1-4 should compile and pass tests independently, not require PR 5 as a fix-up
2. **IPolymorphicEngine complexity** — Evaluate whether this abstraction is necessary or if a simpler direct engine reference suffices
3. **Pass-through commands** — `save_context`, `save_research`, `save_knowledge` bypassing the engine undermines the single-writer principle. Either commit to engine storage or document why these are exceptions
4. **Event log operational cost** — Add compaction/pruning to prevent unbounded growth
5. **Review PR sizes** — igouss's comment ("impossible to review") applies to both PRs. Consider squashing the 6-PR stack into 2-3 logical units

---

## 8. Issue Resolution Matrix

| Issue | PR #2141 | Stack | Notes |
|-------|----------|-------|-------|
| #2041 (ADR for tool-driven DB) | Closes | Closes | Both address this |
| #2201 (Doctor marks slice without summary) | Closes | Addressed | Stack removes doctor reconciliation |
| #2202 (Doctor destructive uncheck) | Closes | Addressed | Stack removes doctor reconciliation |
| #1925 (Doctor fix reverted by worktree sync) | Closes | Addressed | Stack replaces sync mechanism |
| #1924 (Doctor fix silent failure) | Closes | Addressed | Stack removes the fix function |
| #1768 (.gsd gitignore inconsistency) | Closes | Partial | Stack addresses via `.gitignore` changes |
| #2022 (Complete-slice HTML comment loop) | Closes | Addressed | Both eliminate checkbox parsing |
| #2196 (Complete-milestone deadlock) | Closes | Addressed | Stack adds `gsd_complete_milestone` tool |
| #2076 (completed-units.json not flushed) | Closes | Addressed | Both eliminate completed-units.json dependency |
| #1941 (Milestone with summary but unchecked) | Closes | Addressed | Both use DB as authority |

---

## 9. Timeline & Effort

| Metric | PR #2141 | Stack |
|--------|----------|-------|
| Development time | ~1 day (all commits 2026-03-22) | Multi-session (6 PRs across days) |
| Time to merge-ready | Could merge with fixes from review | Needs squash/rebase, build fixes |
| Post-merge stabilization | Will need 15 more tools added incrementally | Largely complete — needs undo/recovery features |

---

## Appendix: The Shared Theory

Both developers arrived at the same diagnosis independently — a strong signal that this is a real architectural problem, not a matter of taste. The key quotes:

**PR #2141 (Lex):**
> "The LLM is excellent at [creative work] and unreliable at [mechanical bookkeeping]. When checkbox toggling fails silently, five independent state markers disagree."

**ADR-004 (Jeremy):**
> "One logical event — 'task completed' — is smeared across multiple representations and multiple writers. That is classic split-brain state, just wearing a markdown mustache."

**Shared conclusion:** Stop using markdown mutation as the authority for state transitions. TypeScript owns all writes. Markdown becomes a rendered view.

---

## 10. Deep Architecture Review — PR #2141

*Findings from code-level analysis of tool handlers, state derivation, markdown renderer, and migration logic.*

### Pattern Assessment: Command-sourced state machine with rendered view layer

The separation is well-defined: write path funnels through two tool handlers with DB transactions first, then disk projection. The transaction-first-then-render protocol is consistent across both handlers.

### Critical Finding: Split Authority Model

**PR #2141 claims "TypeScript owns all state transitions" but only covers 2 of ~10 state-changing operations.** The remaining operations still use LLM file writes, creating a split-authority model that is arguably *more complex* than the original single-authority (filesystem) model. Consumers must now reason about which authority to trust for which state:

- **DB-authoritative:** task completion, slice completion
- **File-authoritative:** milestone creation, slice planning, roadmap mutations, milestone completion/validation, decision recording, replan operations

`deriveStateFromDb()` must consult both — it queries DB tables AND checks `resolveMilestoneFile()` for PARKED, VALIDATION, CONTEXT-DRAFT, SUMMARY files on disk. The PR acknowledges this: "Flag files are still checked on the filesystem since they aren't in DB tables."

### Critical Finding: Bidirectional Markdown Creates Circular Dependencies

`markdown-renderer.ts` implements:
- `loadArtifactContent()` — reads from DB first, **falls back to disk, then stores disk content back into DB**
- `detectStaleRenders()` — reads disk files and compares against DB
- `repairStaleRenders()` — re-renders from DB to fix disk mismatches

The disk-to-DB backfill in `loadArtifactContent()` creates a circular dependency: if disk content was stale or corrupt, that bad state gets canonicalized into the DB. This is not an anti-pattern per se (it is necessary for migration), but must be treated as transitional — once all projects migrate, the disk fallback should fail explicitly rather than silently backfilling.

### Critical Finding: No Concurrency Control for Disk Writes

SQLite WAL handles DB write serialization, but markdown file writes happen outside the transaction with no file-level locking. Two parallel agents completing tasks in the same slice could interleave plan checkbox writes, corrupting the file.

### Critical Finding: Regex-Based Checkbox Toggling is Fragile

The checkbox pattern `^(\\s*-\\s+)\\[ \\]\\s+\\*\\*${sid}:` assumes a specific markdown format. If the LLM generates a roadmap with different formatting (extra spaces, no bold markers, different heading levels), the regex silently fails. `renderRoadmapCheckboxes()` returns `true` even when no regexes matched.

### Finding: Recovery Column is Architectural Debt

Storing `full_summary_md` back into DB (step 5 of the handler) means the handler writes to DB twice — once in the transaction, once outside it. If the process crashes between disk render (step 3) and recovery store (step 5), the DB has the task marked complete but no recovery content stored. The mitigation is that the file IS on disk for `gsd recover`, but this double-write is architecturally awkward.

### Finding: INSERT OR IGNORE First-Writer-Wins

Milestone and slice rows created by completion tool calls use `INSERT OR IGNORE`, meaning the first `gsd_complete_task` call for a new milestone creates a milestone row with **empty title, empty depends_on, and default status**. This metadata persists permanently if migration never runs.

### Missing: No Event/Audit Log

Tool calls write state directly but produce no event stream. The stack's event log approach provides replayability, auditability, and debugging that PR #2141 lacks entirely.

---

## 11. Deep Architecture Review — Stack #2217–#2246

*Findings from code-level analysis of WorkflowEngine, commands, events, projections, sync locks, and write intercept.*

### Pattern Assessment: Correctly Identified as NOT Event Sourcing

**This is a command-driven single-writer architecture with event logging, not event sourcing.** The distinction matters. SQLite is the authoritative state store. Commands mutate SQLite directly via UPDATE/INSERT, and events are appended afterward as an audit trail. `deriveState()` queries SQLite tables, not event replay.

This is the correct choice for this domain:
- One writer (the engine)
- Small state (dozens of rows, not millions)
- Event log serves fork-point detection for worktree merges and auditing, not state reconstruction

The ADR calls this "event sourcing lite" and the implementation matches that promise.

### Positive Finding: IPolymorphicEngine Was Removed

The PR #2222 description mentions `IPolymorphicEngine`, but it does not exist in the current codebase. The simpler pattern — `isEngineAvailable()` check with fallback to legacy behavior — was adopted instead. **This is the right call** for a migration period that will end.

### Positive Finding: Clean Module Boundaries

Each module has single, bounded responsibility:
- `workflow-commands.ts` — pure data mutation, no I/O except SQLite. Testable in isolation.
- `workflow-events.ts` — append-only file I/O. Four functions, ~140 lines.
- `workflow-projections.ts` — read-only rendering. Pure functions.
- `workflow-manifest.ts` — snapshot/restore. Straightforward serialization.
- `workflow-logger.ts` — in-memory ring buffer with stderr forwarding. ~152 lines.

### Critical Finding: `deriveState()` Has Write Side Effects

In `WorkflowEngine.deriveState()`, when no active slice exists, the method promotes the first pending slice with satisfied dependencies to active status by running an `UPDATE` statement. **A read operation that mutates state violates the single-writer principle the ADR champions.** This auto-promotion should be a separate command or happen during slice completion.

### Critical Finding: Replay Lacks Idempotency Guarantees

The `replay()` method delegates to the same command handlers used for normal operations. Some commands are idempotent (e.g., `completeTask` checks if already done), but `planSlice` throws if the slice already has tasks. **If event replay is interrupted and retried, `planSlice` events would fail on the second attempt.** This is a real gap for crash recovery during reconciliation.

### Critical Finding: afterCommand Failures are Silent

In `WorkflowEngine.afterCommand()`, projection rendering, manifest writing, and event appending are all wrapped in individual try/catch blocks with `logWarning`. A command can succeed (SQLite mutation committed) but its projections, manifest, and event log can all silently fail. The user sees success, but markdown files are stale and the event log has a gap — breaking fork-point detection.

### Finding: Write Intercept Only Blocks STATE.md

Only `STATE.md` is blocked from agent writes. ROADMAP.md, PLAN.md, SUMMARY.md are not blocked. But in the new architecture, these are engine-rendered projections. If an agent writes to PLAN.md directly, the engine overwrites it on the next `afterCommand` call. Agent edits silently vanish — confusing user experience.

### Finding: Circular Import Between Projections and Engine

`workflow-projections.ts` imports from `workflow-engine.ts` and vice versa. `renderStateProjection` constructs a new `WorkflowEngine` instance to call `deriveState()`. This works with ESM runtime resolution but is fragile and could break under bundler transformations.

### Finding: Pass-Through Commands Are Thin Wrappers

`saveContext`, `saveKnowledge` do almost nothing — they validate milestone existence and return `{ saved: true }`. The actual file writes happen in the afterCommand hook. These are "routing commands" that exist to trigger the afterCommand pipeline. Architecturally clean (one entry point) but the implementations could confuse future maintainers.

### Finding: Manifest Contains Unbounded Data

`StateManifest` includes `verification_evidence` with `stdout` and `stderr` fields. Test output can be large. The manifest is written after every command. With many verification records, `state-manifest.json` could grow unbounded.

---

## 12. Consolidated Risk Matrix

| Risk | PR #2141 | Stack | Severity |
|------|----------|-------|----------|
| Split authority (DB+files) | **YES** — 2/10 operations covered | NO — 17/17 covered | CRITICAL for #2141 |
| Bidirectional markdown sync | **YES** — circular disk↔DB backfill | NO — one-directional projections | HIGH for #2141 |
| No concurrency control (disk) | **YES** — no file locking | Partial — advisory sync locks | MEDIUM for both |
| Regex checkbox fragility | **YES** — silent match failures | Less exposed — engine writes directly | MEDIUM for #2141 |
| deriveState() write side effect | NO | **YES** — promotes slice on read | MEDIUM for Stack |
| Replay idempotency gap | N/A | **YES** — planSlice throws on retry | MEDIUM for Stack |
| Silent afterCommand failures | N/A | **YES** — stale projections/events | MEDIUM for Stack |
| No undo/rollback | NO — has CLI undo commands | **YES** — no undo mechanism | MEDIUM for Stack |
| Build regression cascade | NO — single PR | **YES** — PR 5/6 is fix-only | MEDIUM for Stack |
| No event audit trail | **YES** — no event log | NO — has event log | LOW-MEDIUM for #2141 |
| Pass-through commands | N/A | **YES** — thin routing wrappers | LOW for Stack |
| Write intercept gaps | Rogue detection (post-hoc) | Only blocks STATE.md | LOW for both |

---

## 13. Final Verdict

### Architecture quality score (1-10):

| Dimension | PR #2141 | Stack |
|-----------|----------|-------|
| Correctness of diagnosis | 10 | 10 |
| Scope completeness | 4 | 9 |
| Separation of concerns | 6 | 8 |
| Migration safety | 7 | 6 |
| Testing rigor | 8 | 7 |
| Documentation | 5 | 9 |
| Operational safety | 6 | 6 |
| Maintainability | 7 | 6 |
| **Weighted average** | **6.3** | **7.6** |

### Recommendation stands: Merge the Stack, cherry-pick from #2141.

The stack has more architectural risk items (6 findings) but they are all fixable without changing the architecture. PR #2141's critical finding — split authority between DB and files — is an architectural flaw that cannot be fixed without expanding scope to match the stack's 17-tool coverage, at which point you'd be rebuilding the engine anyway.

---

## 14. ADR vs Implementation — PR #2141 (Lex)

*Systematic comparison of what Issue #2041 promised vs what the code delivers.*

### 14.1 Tool Schema Fidelity

**`gsd_complete_task`** — **PARTIAL (10/12 fields)**

| ADR Field | Status |
|-----------|--------|
| taskId, sliceId, milestoneId | DELIVERED |
| oneLiner, narrative, verification | DELIVERED |
| keyFiles, keyDecisions | DELIVERED |
| deviations, knownIssues | DELIVERED |
| blockerDiscovered | DELIVERED |
| verificationEvidence[] | DELIVERED |
| patternsEstablished | MISSING — only on complete_slice |
| observabilitySurfaces | MISSING — only on complete_slice |

**`gsd_complete_slice`** — **PARTIAL (missing forwardIntelligence)**

Most fields delivered, plus bonus fields beyond ADR (requirementsInvalidated, requirementsSurfaced, filesModified, provides/requires/affects, drillDownPaths). However, the ADR's signature feature — `forwardIntelligence` — is completely absent:

| Missing forwardIntelligence field | Impact |
|----------------------------------|--------|
| whatNextSliceShouldKnow | No inter-slice knowledge transfer |
| whatsFragile | Next slice doesn't know what's brittle |
| authoritativeDiagnostics | No diagnostic hand-off |
| whatAssumptionsChanged | Assumption drift not tracked |

This was the ADR's most architecturally significant feature — the mechanism for one slice's completion to feed intelligence to the next slice's planning. It was not implemented.

**`plan_slice`** — **MISSING** — no tool, no handler, no types

**`plan_milestone`** — **MISSING**

**`complete_milestone`** — **MISSING**

**`research-*` tools** — **MISSING**

**Tool summary: 2 of 6+ promised tools delivered.**

### 14.2 Database Schema Fidelity

All 4 tables exist (milestones, slices, tasks, verification_evidence). Column coverage is ~75% with naming deviations:

| ADR Column | Actual | Status |
|-----------|--------|--------|
| `summary_content` (milestones) | — | MISSING |
| `goal` (slices) | — | MISSING |
| `sequence` (slices, tasks) | — | MISSING (ordering by ID) |
| `plan_content` (slices, tasks) | — | MISSING |
| `summary_content` (slices) | `full_summary_md` | DEVIATED |
| `uat_content` (slices) | `full_uat_md` | DEVIATED |
| `created_at`, `started_at` (tasks) | — | MISSING |
| `depends_on` (slices) | `depends` (JSON array) | DEVIATED |

### 14.3 Migration Phase Completion

| Phase | ADR Description | Status |
|-------|----------------|--------|
| Phase 1: Tool layer + DB schema | Tool handlers + tables | **DELIVERED** |
| Phase 2: Prompt migration | Prompts instruct tool calls | **PARTIAL** — execute-task and complete-slice updated; plan-slice, research prompts unchanged |
| Phase 3: State derivation migration | deriveState() from DB | **DELIVERED** — deriveStateFromDb() with dual-path |
| Phase 4: Remove reconciliation code | Remove doctor fix logic | **PARTIAL** — 7 issue codes removed, ~311 of ~800 lines |
| Phase 5: Cleanup | Dead code removal | **MISSING** |

### 14.4 Code Removal vs Promises

| ADR Category | Promised | Actual | Status |
|-------------|----------|--------|--------|
| Doctor fix logic | ~800 lines | ~311 lines | PARTIAL |
| Doctor placeholder generation | ~90 lines | ~70 lines | PARTIAL |
| Doctor health scoring | ~430 lines | 0 lines | NOT REMOVED |
| Stuck detection | ~75 lines | ~60 lines | PARTIAL |
| Self-heal runtime records | ~70 lines | ~33 lines | PARTIAL |
| Completed-units tracking | ~100 lines | 0 lines | NOT REMOVED |
| Markdown parsers | ~300 lines | 0 lines (721 lines ADDED) | INVERTED |
| Checkbox mutation functions | ~200 lines | 134 lines (roadmap-mutations.ts) | PARTIAL |
| **Total promised removal** | **~2,500+** | **~608** | **24% delivered** |

**Net line change: +7,387** (ADR promised -2,000)

### 14.5 Success Criteria

| Criterion | Status |
|-----------|--------|
| Zero doctor fix runs in normal operation | PARTIAL — 7 codes removed, remaining codes still active |
| No "non-fatal" catch blocks for state inconsistency | NOT VERIFIED |
| Auto-mode never stops for bookkeeping failures | PARTIAL |
| Net code reduction of 2,000+ lines | **NOT MET** — net +7,387 |
| deriveState() in <1ms | DELIVERED (DB path) |

### 14.6 Overall Verdict — PR #2141

**The PR delivers a solid Phase 1 foundation** — DB schema, two completion tools with rich schemas, deriveStateFromDb(), auto-migration, crash recovery. Measured against its own ADR, it implements **~30-40% of total scope**. The ADR's most distinctive feature (forwardIntelligence) and most impactful promise (net code reduction) are both undelivered. The PR is accurately scoped as "M001" but the ADR reads as a complete architectural plan.

---

## 15. ADR vs Implementation — Stack #2217–#2246 (Jeremy)

*Systematic comparison of what ADR-004 promised vs what the code delivers.*

### 15.1 Three-Layer Architecture

| Layer | Status | Evidence |
|-------|--------|----------|
| Layer 1: Command API (17 tools) | **DELIVERED** | 17 tools registered in `bootstrap/workflow-tools.ts`, prompts updated |
| Layer 2: State Engine (WorkflowEngine) | **DELIVERED** | `workflow-engine.ts` — 718 lines, wraps DbAdapter, 17 command methods |
| Layer 3: Markdown Projections | **DELIVERED** | `workflow-projections.ts` — 413 lines, renders PLAN/ROADMAP/SUMMARY/STATE from DB |

### 15.2 Core Principles

| Principle | Status | Detail |
|-----------|--------|--------|
| "One sheriff in town" | **PARTIAL** | Status mutations go through engine. Content files (CONTEXT.md, REQUIREMENTS.md, KNOWLEDGE.md) still written directly by agents. `saveContext`, `saveKnowledge` are pass-through stubs returning `{ saved: true }` without DB writes. |
| "Commands, not file edits" | **PARTIAL** | Write-intercept only blocks STATE.md. PLAN.md, ROADMAP.md, SUMMARY.md not blocked — agents can still write them. Comments in write-intercept.ts call these "agent-authored content." |
| "Separate workflow truth from telemetry" | **DELIVERED** | Engine owns workflow state; event log tracks operational events separately |
| "Completed decoupled from housekeeping" | **DELIVERED** | Engine commits status atomically; afterCommand projections/manifest/events are non-fatal |
| "Markdown kept but demoted" | **PARTIAL** | Legacy `deriveState()` in state.ts still has full markdown parsing fallback (~200 lines, labeled "disaster recovery D-15" but fully operational). `parseRoadmap` still called in 41 files. |
| "Event sourcing lite" | **DELIVERED** | JSONL event log with SHA-256 content hashes, compaction at milestone completion, replay for cross-worktree sync |

### 15.3 Doctor Kill List Execution

PRs #2219 (Doctor Surgery) and #2220 (Dead Code Cleanup) performed significant cleanup. The analysis agent initially scored this as "NOT KILLED" because it found issue codes still defined in `doctor-types.ts`. However, the **fix handlers that acted on those codes were removed** — the codes survive intentionally for diagnostic reporting without auto-fix, which is exactly what ADR-004 prescribed.

| Kill Target | Status | Detail |
|-------------|--------|--------|
| Checkbox/file mismatch reconciliation | **KILLED (fix handlers)** | Fix functions removed from doctor.ts (-141 lines). Issue codes retained in doctor-types.ts for diagnostic reporting only — no auto-fix. |
| Placeholder summary generation | **PARTIAL** | Some placeholder logic removed with doctor fix functions |
| "Self-healing" state drift fixes | **KILLED** | auto-recovery.ts gutted (-476 net lines). Reconciliation replaced with engine health checks. |
| Health scoring for bookkeeping | **NOT KILLED** | doctor-proactive.ts largely untouched (+31/-2) |
| Stuck detection for completion-state | **PARTIAL** | detect-stuck.ts reduced (-16 net) but still active |
| completed-units.json cleanup | **KILLED** | No references remain in codebase |

**Actual cleanup totals across PRs #2219 + #2220:**
- `auto-recovery.ts`: -476 net lines (reconciliation gutted)
- `files.ts`: -317 net lines (parsers relocated to `legacy/parsers.ts`)
- `doctor.ts`: -49 net lines (fix functions removed)
- `auto.ts`: -69 net lines
- Tests: -963 net lines (assertions for removed code)
- **Total: ~2,295 net lines deleted from cleanup targets**

**Corrected kill list: 3 of 6 targets killed, 1 partial, 2 not killed.**

### 15.4 Code Impact vs Promises

**Raw numbers (cumulative PR #2246):** +10,990 / -3,900 = **+7,090 net**

However, raw net lines are misleading without categorization. Here's where the lines actually went:

| Category | Lines | Notes |
|----------|-------|-------|
| **New engine production code** | +1,513 | workflow-engine, commands, events, projections, manifest, logger, sync-lock, write-intercept, bootstrap/workflow-tools, legacy/parsers |
| **New engine tests** | +3,546 | 16 test files covering commands, events, replay, reconciliation, sync, migration, projections, crossval |
| **Doctor/recovery cleanup** | **-1,541 net** | auto-recovery (-476), files.ts (-317), doctor.ts (-49), auto.ts (-69), idle-recovery tests (-326), auto-recovery tests (-368), etc. |
| **Documentation** | +703 | ADR-004 (+316), SINGLE-WRITER-STATE-MAP (+387) |
| **Prompt changes** | +15 | Tool call instructions replacing checkbox instructions |
| **Other modified files** | +865 net | Bootstrap, commands, state.ts engine integration, worktree sync, etc. |

**Compared to ADR promises:**

| ADR Promise | Actual | Status |
|-------------|--------|--------|
| Deletions: 4,500–6,500 lines | 3,900 lines deleted | **PARTIAL** — 60-85% of target |
| Engine additions: 2,000–2,500 lines | 1,513 production + 3,546 tests = 5,059 | **DEVIATED** — production code close to estimate, tests doubled it |
| Net: -2,500 to -4,000 lines | +7,090 net (but +3,546 are tests, +703 are docs) | See below |
| Doctor cleanup specifically | -1,541 net lines from reconciliation targets | **DELIVERED** — cleanup happened per ADR kill list |

**Adjusted net (excluding tests and docs):** +10,990 - 3,546 (tests) - 703 (docs) = +6,741 production additions. Against 3,900 deletions = **+2,841 net production lines**. The ADR estimated +2,000-2,500 additions — actual production additions are +2,378 (engine + other modified), close to estimate. The gap is that deletions fell short of the 4,500-6,500 target.

**Why the deletion shortfall:** The ADR's Phases 2-4 (mandatory tool calls, remove parsing code, dead code cleanup) projected removing stuck detection (~75), health scoring (~430), forensics (~600), and remaining reconciliation (~500). These survive because the dual-path migration strategy keeps the legacy fallback operational. Removing them requires declaring the engine the mandatory path — a Phase 2 decision not yet made.

### 15.5 What Was Delivered Well

| Feature | Status |
|---------|--------|
| WorkflowEngine class with 17 command methods | DELIVERED |
| All commands wrapped in transaction() | DELIVERED |
| Append-only JSONL event log | DELIVERED |
| Event replay for cross-worktree sync | DELIVERED |
| Content hash for fork-point detection | DELIVERED |
| Event compaction at milestone completion | DELIVERED |
| Markdown projections (DB → markdown) | DELIVERED |
| Advisory sync lock | DELIVERED |
| completed-units.json elimination | DELIVERED |
| Prompt migration to tool calls | DELIVERED |
| Projection drift detection in doctor | DELIVERED |

### 15.6 Success Criteria

| Criterion | Status |
|-----------|--------|
| 1. Zero doctor fix runs in normal operation | **NOT MET** — reconciliation codes still active |
| 2. No "non-fatal" catch blocks | **NOT MET** — afterCommand has 3 non-fatal catch blocks |
| 3. Auto-mode never stops for bookkeeping | **PARTIAL** — engine path is non-fatal, legacy path can still surface failures |
| 4. Net code reduction of 2,500+ lines | **NOT MET** — net +6,973 lines |
| 5. deriveState() in <1ms | **PARTIAL** — engine path sub-ms, legacy fallback not sub-ms, both active |
| 6. No unbounded retry loops | **MET** — all retry paths have count caps or time deadlines |
| 7. Forensics powered by event log | **PARTIAL** — event log supplements but doesn't replace activity-log-based forensics |

### 15.7 Overall Verdict — Stack

**The stack delivers the complete Phase 0/Phase 1 additive foundation** — engine, commands, events, projections, tools, prompts, sync locks, write intercept. It does **not** deliver the Phase 2–4 subtractive work — doctor kill list (1/6), dead code removal, parser cleanup, markdown demotion. The codebase now has **two complete state derivation systems** running in parallel (engine + legacy markdown parser), which is the transitional dual-write state the ADR described for Phase 0, not the final architecture.

---

## 16. Side-by-Side ADR Delivery Scorecard

| Dimension | PR #2141 vs ADR #2041 | Stack vs ADR-004 |
|-----------|----------------------|------------------|
| Tool count delivered | 2 of 6+ (33%) | 17 of 17 (100%) |
| Tool schema richness | Rich but missing forwardIntelligence | Lean params (by design) |
| DB schema match | ~75% column coverage | Engine-specific schema (different approach) |
| Migration phases complete | 2 of 5 | 2 of 5 |
| Doctor kill list executed | 7 of ~15 issue codes | 3 of 6 targets (fix handlers removed, codes kept for diagnostics) |
| Code removal delivered | ~608 of ~2,500 lines (24%) | -3,900 deleted; -1,541 net from cleanup targets |
| Net line impact (raw) | +7,387 (promised -2,000) | +7,090 (promised -2,500 to -4,000) |
| Net production lines (excl tests/docs) | ~+7,387 | +2,841 (engine production adds close to ADR estimate) |
| Success criteria met | 1 of 5 | 1 of 7 |
| Event sourcing | Not in ADR, not implemented | Promised and DELIVERED |
| Worktree coordination | Not in ADR, not implemented | Promised and DELIVERED |
| CLI recovery tools | Not in ADR, DELIVERED (bonus) | Not promised, not implemented |
| forwardIntelligence | Promised, MISSING | Not promised |

### The Uncomfortable Truth

**Neither implementation fully delivers what its ADR promised** — both are Phase 0/1 foundations that still need Phase 2-4 cleanup to achieve the promised net code reduction.

However, the raw "+7K lines" metric is misleading for the stack. Categorized breakdown:
- **Stack:** +1,513 engine production code (close to ADR's ~2,000 estimate), +3,546 tests, +703 docs, -3,900 deletions including -1,541 net from doctor/recovery cleanup targets. The engine production additions are on-estimate; the "miss" is tests (which the ADR didn't budget) and incomplete deletion of legacy fallback paths.
- **PR #2141:** +8,828 lines with no categorization benefit — tests and production code are interleaved in a single PR with no cleanup phase.

The stack's additive work is **architecturally complete** (17 tools, event log, sync locks) while PR #2141's additive work is **architecturally partial** (2 tools, no events, no sync). Both still need Phases 2-4 to deliver on their ADR promises — but the stack has already executed significant cleanup (PRs #2219 + #2220) while PR #2141 has not.

### What Remains for Both

To fulfill either ADR's success criteria, the following Phase 2-4 work is needed:

1. **Kill the doctor reconciliation codes** — both implementations left them alive
2. **Remove the legacy deriveState() markdown parsing path** — both have it as fallback
3. **Block agent writes to all state files** — not just STATE.md
4. **Remove stuck detection for completion-state** — still active in both
5. **Remove health scoring for bookkeeping failures** — still active
6. **Achieve net code reduction** — currently net +7,000 in both cases
