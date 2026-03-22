---
phase: 03-event-reconciliation-mandatory-tools
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - src/resources/extensions/gsd/workflow-reconcile.ts
  - src/resources/extensions/gsd/engine/reconcile.test.ts
  - src/resources/extensions/gsd/auto-worktree-sync.ts
  - src/resources/extensions/gsd/auto-worktree.ts
  - src/resources/extensions/gsd/worktree-command.ts
autonomous: true
requirements: [SYNC-04, SYNC-05]

must_haves:
  truths:
    - "Non-conflicting diverged events from two worktrees are auto-merged by replaying both sides in timestamp order"
    - "Conflicting events (same entity touched by both sides) produce a CONFLICTS.md file and block the merge entirely"
    - "Zero events apply when any conflict is detected (atomic all-or-nothing)"
    - "After successful merge, event log contains the merged event set and manifest is updated"
  artifacts:
    - path: "src/resources/extensions/gsd/workflow-reconcile.ts"
      provides: "reconcileWorktreeLogs(), detectConflicts(), extractEntityKey(), writeConflictsFile()"
      exports: ["reconcileWorktreeLogs", "ReconcileResult", "ConflictEntry"]
    - path: "src/resources/extensions/gsd/engine/reconcile.test.ts"
      provides: "Unit tests for event-based reconciliation"
      min_lines: 100
  key_links:
    - from: "src/resources/extensions/gsd/auto-worktree-sync.ts"
      to: "src/resources/extensions/gsd/workflow-reconcile.ts"
      via: "import reconcileWorktreeLogs, call after snapshot/restore in syncStateToProjectRoot"
      pattern: "reconcileWorktreeLogs"
    - from: "src/resources/extensions/gsd/workflow-reconcile.ts"
      to: "src/resources/extensions/gsd/workflow-events.ts"
      via: "import readEvents, findForkPoint"
      pattern: "findForkPoint.*readEvents"
---

<objective>
Replace the INSERT OR REPLACE worktree merge with event-log-based reconciliation. Build `workflow-reconcile.ts` that reads both event logs, detects fork point, identifies entity-level conflicts, and either auto-merges non-conflicting events or writes CONFLICTS.md and blocks. Wire into auto-worktree-sync.ts as the merge step.

Purpose: Eliminate silent data loss from INSERT OR REPLACE merges (SYNC-04) and surface conflicting entity modifications for human review (SYNC-05).
Output: workflow-reconcile.ts module, reconcile.test.ts, updated sync call sites.
</objective>

<execution_context>
@/Users/jeremymcspadden/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jeremymcspadden/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-event-reconciliation-mandatory-tools/3-CONTEXT.md
@.planning/phases/03-event-reconciliation-mandatory-tools/3-RESEARCH.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/resources/extensions/gsd/workflow-events.ts:
```typescript
export interface WorkflowEvent {
  cmd: string;           // e.g. "complete_task"
  params: Record<string, unknown>;
  ts: string;            // ISO 8601
  hash: string;          // content hash (hex, 16 chars)
  actor: "agent" | "system";
}

export function appendEvent(basePath: string, event: Omit<WorkflowEvent, "hash">): void;
export function readEvents(logPath: string): WorkflowEvent[];
export function findForkPoint(logA: WorkflowEvent[], logB: WorkflowEvent[]): number;
```

From src/resources/extensions/gsd/workflow-engine.ts:
```typescript
export class WorkflowEngine {
  replay(event: WorkflowEvent): void;
  replayAll(events: WorkflowEvent[]): void;
}
export function getEngine(basePath: string): WorkflowEngine;
export function isEngineAvailable(basePath: string): boolean;
```

From src/resources/extensions/gsd/workflow-manifest.ts:
```typescript
export function writeManifest(basePath: string, db: DbAdapter): void;
```

From src/resources/extensions/gsd/atomic-write.ts:
```typescript
export function atomicWriteSync(filePath: string, content: string): void;
```

From src/resources/extensions/gsd/gsd-db.ts (replacement target):
```typescript
export function reconcileWorktreeDb(mainDbPath: string, worktreeDbPath: string): {
  decisions: number; requirements: number; artifacts: number; conflicts: string[];
};
```

Call sites for reconcileWorktreeDb:
- auto-worktree.ts line 976: reconcileWorktreeDb(mainDbPath, worktreeDbPath)
- worktree-command.ts line 671-672: dynamic import + call
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD reconciliation module — tests first, then implementation</name>
  <files>src/resources/extensions/gsd/workflow-reconcile.ts, src/resources/extensions/gsd/engine/reconcile.test.ts</files>
  <read_first>
    src/resources/extensions/gsd/workflow-events.ts
    src/resources/extensions/gsd/workflow-engine.ts
    src/resources/extensions/gsd/workflow-manifest.ts
    src/resources/extensions/gsd/atomic-write.ts
    src/resources/extensions/gsd/engine/event-log.test.ts
    src/resources/extensions/gsd/gsd-db.ts (lines 784-922 for the function being replaced)
  </read_first>
  <behavior>
    - Test 1: Two worktrees with identical event logs (no divergence) — returns { autoMerged: 0, conflicts: [] }
    - Test 2: Main has 1 extra event touching task T01, worktree has 0 extra events — returns { autoMerged: 1, conflicts: [] }, T01 state updated in DB
    - Test 3: Main touches task T01, worktree touches task T02 (different entities) — returns { autoMerged: 2, conflicts: [] }, both tasks updated
    - Test 4: Main completes task T01, worktree also completes task T01 (CONFLICT) — returns { autoMerged: 0, conflicts: [{ entityType: "task", entityId: T01 }] }, CONFLICTS.md written, DB unchanged
    - Test 5: Mixed — 3 non-conflicting events + 1 conflicting entity — returns autoMerged: 0 (all-or-nothing per D-04), CONFLICTS.md written
    - Test 6: extractEntityKey maps complete_task/start_task/report_blocker/record_verification to task entity, complete_slice to slice entity, save_decision to decision entity
    - Test 7: After successful merge, event log contains merged events in timestamp order and writeManifest is called
    - Test 8: Empty worktree event log (worktree had no diverged activity) — returns { autoMerged: N, conflicts: [] } where N = main's diverged events
  </behavior>
  <action>
RED phase:
Create `src/resources/extensions/gsd/engine/reconcile.test.ts` with 8 test cases. Follow the established test pattern from `engine/event-log.test.ts`:
- `import { describe, it, beforeEach, afterEach } from "node:test"`
- `import assert from "node:assert/strict"`
- `mkdtempSync(join(tmpdir(), "gsd-reconcile-test-"))` for temp dirs
- Create two temp directories (main + worktree), each with `.gsd/event-log.jsonl`
- Use `openDatabase(":memory:")` for the DB, then `initSchema()` and `migrateSchema()` to get v5 tables
- Seed shared base events in both logs, then add diverged events to each side
- Import `reconcileWorktreeLogs` from `../workflow-reconcile.ts`
- For conflict tests: verify CONFLICTS.md exists at `join(mainDir, ".gsd", "CONFLICTS.md")` and contains the entity info
- For all-or-nothing test (Test 5): verify DB state is unchanged after failed merge by checking task status before and after
- Run tests: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/reconcile.test.ts`
- Tests MUST fail (module doesn't exist yet)

GREEN phase:
Create `src/resources/extensions/gsd/workflow-reconcile.ts` with file header:
```
// GSD Extension — Event-Log Reconciliation
// Replaces INSERT OR REPLACE worktree merge with event-based reconciliation.
// Uses findForkPoint() to detect divergence, replays non-conflicting events,
// writes CONFLICTS.md and blocks merge on entity-level conflicts.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
```

Exports:
- `interface ConflictEntry { entityType: string; entityId: string; mainSideEvents: WorkflowEvent[]; worktreeSideEvents: WorkflowEvent[]; }`
- `interface ReconcileResult { autoMerged: number; conflicts: ConflictEntry[]; }`
- `function extractEntityKey(event: WorkflowEvent): { type: string; id: string } | null` — maps cmd to entity type/id per the table in RESEARCH.md:
  - complete_task / start_task / report_blocker / record_verification → { type: "task", id: params.taskId }
  - complete_slice → { type: "slice", id: params.sliceId }
  - plan_slice → { type: "slice_plan", id: params.sliceId }
  - save_decision → { type: "decision", id: `${params.scope}:${params.decision}` }
  - default → null
- `function detectConflicts(mainDiverged: WorkflowEvent[], wtDiverged: WorkflowEvent[]): ConflictEntry[]` — groups events by entity key, returns entries where both sides touch same entity
- `function writeConflictsFile(basePath: string, conflicts: ConflictEntry[], worktreePath: string): void` — writes `.gsd/CONFLICTS.md` using atomicWriteSync with format:
  ```
  # Merge Conflicts — {ISO date}

  Conflicts detected merging worktree `{worktreePath}` into `{basePath}`.
  Run `gsd resolve-conflict` to resolve each conflict.

  ## Conflict N: {entityType} {entityId}

  **Main side events:**
  - {cmd} at {ts} (hash: {hash})
    params: {JSON.stringify(params)}

  **Worktree side events:**
  - {cmd} at {ts} (hash: {hash})
    params: {JSON.stringify(params)}

  **Resolve with:** `gsd resolve-conflict --entity {entityType}:{entityId} --pick [main|worktree]`
  ```
- `function reconcileWorktreeLogs(mainBasePath: string, worktreeBasePath: string): ReconcileResult` — algorithm:
  1. Read event logs: `readEvents(join(mainBasePath, ".gsd", "event-log.jsonl"))` and same for worktree
  2. `findForkPoint(mainEvents, wtEvents)` to get last common index
  3. Slice diverged sets: `mainEvents.slice(forkPoint + 1)`, `wtEvents.slice(forkPoint + 1)`
  4. If both diverged sets empty → return `{ autoMerged: 0, conflicts: [] }`
  5. `detectConflicts(mainDiverged, wtDiverged)` — if conflicts found, call `writeConflictsFile`, write to stderr, return early with conflicts
  6. If clean: get engine via `getEngine(mainBasePath)`, merge events = `[...mainDiverged, ...wtDiverged].sort((a, b) => a.ts.localeCompare(b.ts))`, call `engine.replayAll(merged)`
  7. CRITICAL (Pitfall #2): After replayAll, explicitly write merged event log. The merged log = `mainEvents.slice(0, forkPoint + 1).concat(merged)`. Write to mainBasePath's event-log.jsonl using atomicWriteSync.
  8. Call `writeManifest(mainBasePath, engine["db"])` — access db via the engine's internal property (cast as needed)
  9. Return `{ autoMerged: merged.length, conflicts: [] }`

Run tests again — all 8 must pass.
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/reconcile.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/workflow-reconcile.ts exists and contains `export function reconcileWorktreeLogs(`
    - src/resources/extensions/gsd/workflow-reconcile.ts contains `export function extractEntityKey(`
    - src/resources/extensions/gsd/workflow-reconcile.ts contains `export function detectConflicts(`
    - src/resources/extensions/gsd/workflow-reconcile.ts contains `export interface ReconcileResult`
    - src/resources/extensions/gsd/workflow-reconcile.ts contains `export interface ConflictEntry`
    - src/resources/extensions/gsd/workflow-reconcile.ts contains `CONFLICTS.md`
    - src/resources/extensions/gsd/workflow-reconcile.ts contains `findForkPoint`
    - src/resources/extensions/gsd/workflow-reconcile.ts contains `writeManifest`
    - src/resources/extensions/gsd/engine/reconcile.test.ts exits 0 with all tests passing
    - src/resources/extensions/gsd/workflow-reconcile.ts contains `Copyright (c) 2026 Jeremy McSpadden`
  </acceptance_criteria>
  <done>All 8 reconciliation tests pass. Module exports ReconcileResult, ConflictEntry, reconcileWorktreeLogs, detectConflicts, extractEntityKey. Non-conflicting events auto-merge; conflicting events write CONFLICTS.md and block.</done>
</task>

<task type="auto">
  <name>Task 2: Wire reconciliation into sync call sites, replace reconcileWorktreeDb</name>
  <files>src/resources/extensions/gsd/auto-worktree-sync.ts, src/resources/extensions/gsd/auto-worktree.ts, src/resources/extensions/gsd/worktree-command.ts</files>
  <read_first>
    src/resources/extensions/gsd/auto-worktree-sync.ts
    src/resources/extensions/gsd/auto-worktree.ts (around line 970-985)
    src/resources/extensions/gsd/worktree-command.ts (around line 665-680)
    src/resources/extensions/gsd/workflow-reconcile.ts (just created in Task 1)
  </read_first>
  <action>
**auto-worktree-sync.ts — add reconciliation step to syncStateToProjectRoot:**

After the existing snapshot/restore logic in `syncStateToProjectRoot()`, add an event reconciliation step. The function already does: acquire lock → write manifest → render projections → release lock. Add reconciliation after the manifest write:

1. Add import at top: `import { reconcileWorktreeLogs } from "./workflow-reconcile.js";`
2. Inside the engine path (where `existsSync(prManifest)` is true), after the writeManifest + renderAllProjections calls, add:
```typescript
// Event-based reconciliation (Phase 3 — SYNC-04)
// Replays diverged events from worktree into project root.
// If conflicts detected, merge is blocked and CONFLICTS.md is written.
const reconcileResult = reconcileWorktreeLogs(projectRoot, worktreePath);
if (reconcileResult.conflicts.length > 0) {
  process.stderr.write(`[gsd] sync blocked: ${reconcileResult.conflicts.length} conflict(s) — see .gsd/CONFLICTS.md\n`);
  return; // Do not proceed with sync — conflicts must be resolved first
}
```

**auto-worktree.ts — replace reconcileWorktreeDb call at line ~976:**

1. Remove `reconcileWorktreeDb` from the import on line 24
2. Add dynamic import of reconcileWorktreeLogs at the call site (same pattern as worktree-command.ts uses for dynamic imports):
```typescript
// Replace: reconcileWorktreeDb(mainDbPath, worktreeDbPath);
// With:
try {
  const { reconcileWorktreeLogs } = await import("./workflow-reconcile.js");
  const result = reconcileWorktreeLogs(mainBasePath, worktreeBasePath);
  if (result.conflicts.length > 0) {
    process.stderr.write(`[gsd] merge blocked: ${result.conflicts.length} conflict(s)\n`);
  }
} catch {
  // Fall through — reconciliation module not available (pre-engine project)
}
```
Note: The function takes base paths (directory containing .gsd/), NOT db file paths. Derive base paths from the existing mainDbPath/worktreeDbPath by removing the trailing `/gsd.db` or `.gsd/gsd.db` component.

**worktree-command.ts — replace reconcileWorktreeDb call at line ~671-672:**

Replace:
```typescript
const { reconcileWorktreeDb } = await import("./gsd-db.js");
reconcileWorktreeDb(mainDbPath, wtDbPath);
```
With:
```typescript
const { reconcileWorktreeLogs } = await import("./workflow-reconcile.js");
const result = reconcileWorktreeLogs(mainBasePath, wtBasePath);
if (result.conflicts.length > 0) {
  process.stderr.write(`[gsd] merge blocked: ${result.conflicts.length} conflict(s)\n`);
}
```
Same note about converting db paths to base paths.
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/*.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - auto-worktree-sync.ts contains `import { reconcileWorktreeLogs } from "./workflow-reconcile.js"`
    - auto-worktree-sync.ts contains `reconcileWorktreeLogs(`
    - auto-worktree.ts does NOT contain `reconcileWorktreeDb` in any import statement
    - worktree-command.ts contains `workflow-reconcile.js` (dynamic import)
    - worktree-command.ts does NOT contain `reconcileWorktreeDb`
    - All engine tests still pass (no regressions)
  </acceptance_criteria>
  <done>All three call sites use reconcileWorktreeLogs instead of reconcileWorktreeDb. Event-based reconciliation is wired into the sync and merge flows. All existing engine tests pass.</done>
</task>

</tasks>

<verification>
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/reconcile.test.ts` — all 8 reconciliation tests pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/*.test.ts` — all engine tests pass (no regressions)
- `grep -r "reconcileWorktreeDb" src/resources/extensions/gsd/auto-worktree-sync.ts src/resources/extensions/gsd/auto-worktree.ts src/resources/extensions/gsd/worktree-command.ts` — returns zero matches (old function no longer called from sync paths)
- `grep "reconcileWorktreeLogs" src/resources/extensions/gsd/auto-worktree-sync.ts` — returns a match
</verification>

<success_criteria>
Event-based reconciliation replaces INSERT OR REPLACE merge. Non-conflicting events auto-merge. Conflicting entities produce CONFLICTS.md and block merge atomically. All engine tests pass.
</success_criteria>

<output>
After completion, create `.planning/phases/03-event-reconciliation-mandatory-tools/3-01-SUMMARY.md`
</output>
