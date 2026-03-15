# S04: Token Measurement + State Derivation from DB — Research

**Date:** 2026-03-15
**Status:** Ready for planning

## Summary

S04 owns four requirements: R010 (token measurement), R011 (state derivation from DB), R016 (≥30% token savings), and R019 (no regression in output quality). The codebase already has a mature metrics system (`metrics.ts`) with `snapshotUnitMetrics()` that tracks runtime token usage, cost, and tool calls per dispatch unit — but it measures *actual LLM usage*, not *prompt size*. R010 needs prompt-level measurement: how many characters/tokens go into each prompt, and how much the DB-scoped path saves vs the full-markdown path.

For state derivation (R011), `deriveState()` in `state.ts` is a ~300-line function that scans the `.gsd/` directory tree, reads every milestone/slice/task file via `loadFile` (or native batch parse), and parses roadmaps/plans/summaries to determine the current phase, active milestone/slice/task, progress counters, and requirement counts. The DB's `artifacts` table stores these same files as full_content blobs keyed by path — so a DB-backed derivation replaces directory scanning and file I/O with indexed queries, but still needs the same parsers (`parseRoadmap`, `parsePlan`, `parseSummary`, etc.) since the artifacts table doesn't decompose roadmap/plan structure into relational columns.

The ≥30% savings target (R016) is achievable because the current project has 23.6KB of REQUIREMENTS.md and 3.8KB of DECISIONS.md — 27.4KB loaded in full for every prompt builder. DB-scoped queries filter decisions by milestone and requirements by slice, so a planning unit for M001/S04 would inject only the ~4 decisions tagged to M001 and the ~4 requirements owned by S04 — roughly 70-80% smaller than the full files. For research/plan-milestone units the savings are smaller (milestone-scoped but not slice-scoped), and for execute-task the savings depend on what context that builder injects (it doesn't use inlineGsdRootFile directly).

## Recommendation

Split S04 into three tasks:

**T01 — Prompt-level token measurement.** Add a `promptCharCount` field to `UnitMetrics`. Before dispatch (after `finalPrompt` is assembled at line ~2107), measure `finalPrompt.length`. Also compute the "baseline" by calling `inlineGsdRootFile` for the same artifacts and measuring that total. Store both values and the savings percentage. Add a `promptSavings` section to the metrics ledger. This gives R010 concrete per-unit data and validates R016.

**T02 — deriveState() from DB.** Create `deriveStateFromDb()` in `state.ts` that queries the artifacts table for roadmaps, plans, summaries, and REQUIREMENTS.md content, then feeds them through the same parser chain. Falls back to the current file-based `_deriveStateImpl()` when DB is unavailable. Wire `deriveState()` to prefer the DB path. The key win: replaces directory scanning + O(N) file reads with a handful of indexed SELECT queries. Must produce identical `GSDState` output.

**T03 — Fixture-based savings validation.** Create a test that populates a DB with fixture data resembling a mature project (20+ decisions, 20+ requirements across 3 milestones), builds prompts via the DB path and the markdown path, and asserts ≥30% character savings on research-milestone and plan-milestone prompt types. This retires R016 and R019 with verifiable proof.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Token estimation from char count | `~4 chars/token` heuristic | No tokenizer library in the project. Character count is sufficient for relative comparison (before vs after). The 4:1 ratio is well-established for Claude models. |
| Metrics storage and aggregation | `metrics.ts` — `UnitMetrics`, `MetricsLedger`, aggregation helpers | Already has disk persistence, phase classification, cost tracking, formatting. Extend rather than create a new system. |
| State derivation parsers | `files.ts` — `parseRoadmap()`, `parsePlan()`, `parseSummary()`, `parseRequirementCounts()`, `parseContextDependsOn()` | DB stores full_content blobs; same parsers work. No new parsing needed. |
| Milestone discovery | `guided-flow.ts` — `findMilestoneIds()`, `milestoneIdSort()` | Currently scans directories. For DB path, query `SELECT DISTINCT milestone_id FROM artifacts` instead, but sort with same `milestoneIdSort()`. |
| DB adapter abstraction | `gsd-db.ts` — `isDbAvailable()`, `_getAdapter()`, `prepare().all()` | Thin adapter already normalizes node:sqlite and better-sqlite3. Use directly. |

## Existing Code and Patterns

- `src/resources/extensions/gsd/metrics.ts` — Full metrics system with `UnitMetrics` type, `snapshotUnitMetrics()` for per-unit capture, `MetricsLedger` for persistence, and aggregation helpers. Extend `UnitMetrics` with prompt size fields.
- `src/resources/extensions/gsd/state.ts` — `deriveState()` with 100ms TTL memoization, `invalidateStateCache()`, `_deriveStateImpl()` core logic. The `fileContentCache` pattern (batch load then parse) maps directly to "query artifacts then parse".
- `src/resources/extensions/gsd/auto.ts` — `inlineDecisionsFromDb()`, `inlineRequirementsFromDb()`, `inlineProjectFromDb()` (lines ~2463-2520) follow the DB-first-then-fallback pattern. The prompt is built via `build*Prompt()` functions and stored in `let prompt: string` (line 1664), then potentially wrapped in `finalPrompt` (line 2107) before dispatch at line 2328.
- `src/resources/extensions/gsd/context-store.ts` — `queryDecisions()`, `queryRequirements()`, `queryArtifact()`, `queryProject()` with format functions. These are the existing DB query functions.
- `src/resources/extensions/gsd/gsd-db.ts` — `isDbAvailable()`, `openDatabase()`, `_getAdapter()`. The artifacts table has `path, artifact_type, milestone_id, slice_id, task_id, full_content`.
- `src/resources/extensions/gsd/tests/prompt-db.test.ts` — 52 assertions for DB-aware prompt building. Follow this pattern for savings validation tests.
- `src/resources/extensions/gsd/tests/derive-state.test.ts` — 660 lines of derive-state tests using temp directories with fixture files. The DB-backed derivation tests should produce identical GSDState output.

## Constraints

- **No new dependencies**: No tokenizer library. Character count (÷4 for token estimate) is sufficient for relative savings measurement.
- **Identical GSDState output**: `deriveStateFromDb()` must produce the exact same `GSDState` as the file-based implementation for the same underlying data. Tests must assert field-by-field equality.
- **Graceful fallback**: When DB is unavailable, `deriveState()` must fall back to file-based derivation without crash (D003).
- **Dynamic imports**: Context-store and gsd-db queries in state.ts should use static imports since state.ts already imports from files.ts and paths.ts — the DB modules are lightweight. But if state.ts should avoid a hard dependency on gsd-db, use the same `isDbAvailable()` static import + dynamic import pattern from auto.ts.
- **Cache invalidation**: The 100ms TTL cache in `deriveState()` must work identically for both DB and file paths. `invalidateStateCache()` clears both.
- **Artifacts table granularity**: The artifacts table stores full file content but doesn't decompose roadmap/plan structure. `deriveState` still needs parsers — the win is I/O elimination, not parse elimination.
- **`findMilestoneIds()` dependency**: `deriveState` currently relies on directory scanning to find milestone IDs. The DB path can query `SELECT DISTINCT milestone_id FROM artifacts WHERE milestone_id IS NOT NULL` but must handle the case where some milestones exist on disk but haven't been imported yet (e.g., newly created milestones before next import). Safest approach: use directory scanning as canonical source, DB for content.

## Common Pitfalls

- **Measuring the wrong thing**: R010 asks for "before vs after" comparison. Don't measure *runtime* token usage (already tracked by snapshotUnitMetrics). Measure *prompt size* — the string length of the prompt injected into the session. The "before" is what the full-markdown path would produce; the "after" is what the DB-scoped path produces.
- **deriveState ↔ directory structure coupling**: `deriveState` uses `resolveMilestoneFile()`, `resolveSliceFile()`, `resolveTaskFile()` which resolve paths from the `.gsd/` directory tree. A pure DB-backed derivation can't use these — it needs to reconstruct paths from the DB's `milestone_id`/`slice_id`/`task_id` columns. However, some checks (like "does this file exist?") are existence checks that the DB can answer with `queryArtifact(path) !== null`.
- **Missing milestone in DB**: If auto-mode creates a new milestone directory between DB imports, `deriveState` from DB would miss it. The re-import in `handleAgentEnd` mitigates this, but there's a window during a dispatch cycle where the DB is stale. Solution: keep directory scanning for milestone ID discovery, use DB only for content loading.
- **Test isolation**: `deriveState` tests use temp directories. DB-backed tests need both a temp directory (for directory scanning) AND a populated DB. Use `:memory:` databases with test fixtures.
- **RequirementCounts from DB**: The DB requirements table has a `status` field. Computing `RequirementCounts` from DB is a simple `GROUP BY status` query — much faster than parsing REQUIREMENTS.md. But the status values in the DB must exactly match the section names that `parseRequirementCounts` expects (`active`, `validated`, `deferred`, `out-of-scope`). Verify the DB stores lowercase status values.

## Open Risks

- **Baseline measurement overhead**: Computing the "markdown would have produced" baseline for R010 means calling `inlineGsdRootFile` for each artifact even when using DB. This doubles I/O at measurement time. Mitigation: measure baseline once per session start, not on every dispatch. Or accept that measurement is slightly slower (it's diagnostic, not on the hot path).
- **Parser fidelity gap**: If `parseRoadmap(content_from_db)` produces different results than `parseRoadmap(content_from_disk)`, the DB-backed `deriveState` will diverge. The S02 importer stores content as-is, so this should be identical — but frontmatter re-serialization in the native batch parser (state.ts lines 135-165) shows this is a real concern. DB stores original content, not re-serialized.
- **Milestone discovery reliability**: Falling back to directory scanning for milestone IDs means `deriveState` is never fully "from DB." This is pragmatic but means R011 ("reads from DB tables instead of scanning the .gsd/ file tree") is only partially satisfied. Acceptable if the content-loading path uses DB — the directory scan is a lightweight `readdirSync` that's O(milestone_count), not O(total_files).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| SQLite | martinholovsky/claude-skills-generator@sqlite database expert | available (554 installs) — generic SQLite skill, not specifically useful for this work |
| node:sqlite | none found | — |
| better-sqlite3 | none found | — |

No skills are worth installing for this slice — the work is GSD-internal extension of existing patterns.

## Sources

- `metrics.ts` — existing metrics system with UnitMetrics, snapshotUnitMetrics, aggregation (source: codebase)
- `state.ts` — deriveState implementation, ~300 lines, memoized with 100ms TTL (source: codebase)
- `context-store.ts` — DB query functions for decisions, requirements, artifacts (source: codebase)
- `auto.ts` — prompt builders, dispatch loop, metrics integration points (source: codebase)
- S03 Summary — forward intelligence on DB-aware helpers, fragile dynamic imports, injection matrix (source: `.gsd/milestones/M001/slices/S03/S03-SUMMARY.md`)
