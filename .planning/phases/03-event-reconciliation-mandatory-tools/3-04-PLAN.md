---
phase: 03-event-reconciliation-mandatory-tools
plan: 04
type: tdd
wave: 2
depends_on: [3-01]
files_modified:
  - src/resources/extensions/gsd/workflow-events.ts
  - src/resources/extensions/gsd/engine/compaction.test.ts
autonomous: true
requirements: [EVT-03]

must_haves:
  truths:
    - "compactMilestoneEvents() moves milestone-specific events from active log to an archived file"
    - "Active event-log.jsonl retains only events from other milestones after compaction"
    - "Archived log file is named event-log-{milestoneId}.jsonl.archived and kept on disk"
    - "Compaction is safe to call when no events match the milestone (returns 0 archived)"
  artifacts:
    - path: "src/resources/extensions/gsd/workflow-events.ts"
      provides: "compactMilestoneEvents() function"
      exports: ["compactMilestoneEvents"]
    - path: "src/resources/extensions/gsd/engine/compaction.test.ts"
      provides: "Unit tests for event log compaction"
      min_lines: 50
  key_links:
    - from: "src/resources/extensions/gsd/workflow-events.ts"
      to: "Milestone completion flow"
      via: "compactMilestoneEvents called when milestone status='done'"
      pattern: "compactMilestoneEvents"
---

<objective>
Add event log compaction to workflow-events.ts. When a milestone is completed, its events are archived to a separate file and removed from the active event log, keeping fork-point detection fast.

Purpose: Keep the active event log bounded as milestones complete (EVT-03). Archived logs are preserved on disk for forensics.
Output: compactMilestoneEvents() added to workflow-events.ts, compaction.test.ts.
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
<!-- Key types and contracts the executor needs. -->

From src/resources/extensions/gsd/workflow-events.ts:
```typescript
export interface WorkflowEvent {
  cmd: string;
  params: Record<string, unknown>;
  ts: string;
  hash: string;
  actor: "agent" | "system";
}

export function appendEvent(basePath: string, event: Omit<WorkflowEvent, "hash">): void;
export function readEvents(logPath: string): WorkflowEvent[];
export function findForkPoint(logA: WorkflowEvent[], logB: WorkflowEvent[]): number;
```

From src/resources/extensions/gsd/atomic-write.ts:
```typescript
export function atomicWriteSync(filePath: string, content: string): void;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD event log compaction — tests first, then implementation</name>
  <files>src/resources/extensions/gsd/workflow-events.ts, src/resources/extensions/gsd/engine/compaction.test.ts</files>
  <read_first>
    src/resources/extensions/gsd/workflow-events.ts (full file — adding compactMilestoneEvents here)
    src/resources/extensions/gsd/atomic-write.ts (atomicWriteSync for crash-safe writes)
    src/resources/extensions/gsd/engine/event-log.test.ts (test patterns)
  </read_first>
  <behavior>
    - Test 1: compactMilestoneEvents moves M001 events to event-log-M001.jsonl.archived — archive file contains only M001 events
    - Test 2: Active event-log.jsonl retains only non-M001 events after compaction
    - Test 3: Returns { archived: N } where N = number of M001 events moved
    - Test 4: When no events match milestoneId, returns { archived: 0 } and neither file is modified
    - Test 5: Multiple milestones in log — compacting M001 leaves M002 events intact
    - Test 6: Empty event log — returns { archived: 0 }, no archive file created
    - Test 7: All events belong to M001 — archive gets all events, active log becomes empty string
  </behavior>
  <action>
RED phase:
Create `src/resources/extensions/gsd/engine/compaction.test.ts` with 7 test cases. Setup:
- Create temp dir with `.gsd/` directory
- Write `event-log.jsonl` with sample events from multiple milestones:
  ```typescript
  const events = [
    { cmd: "complete_task", params: { milestoneId: "M001", sliceId: "S01", taskId: "T01" }, ts: "2026-03-22T10:00:00Z", hash: "abc1234567890123", actor: "agent" },
    { cmd: "complete_task", params: { milestoneId: "M002", sliceId: "S01", taskId: "T01" }, ts: "2026-03-22T11:00:00Z", hash: "def1234567890123", actor: "agent" },
    { cmd: "complete_slice", params: { milestoneId: "M001", sliceId: "S01" }, ts: "2026-03-22T12:00:00Z", hash: "ghi1234567890123", actor: "agent" },
  ];
  ```
- Write each as JSON line to event-log.jsonl
- Import `compactMilestoneEvents` from `../workflow-events.ts`
- After compaction, read both files and verify contents
- Tests MUST fail (function doesn't exist yet)

GREEN phase:
Add `compactMilestoneEvents()` to the BOTTOM of `src/resources/extensions/gsd/workflow-events.ts` (after existing exports):

```typescript
// ─── compactMilestoneEvents ─────────────────────────────────────────────

/**
 * Archive a milestone's events from the active log to a separate file.
 * Active log retains only events from other milestones.
 * Archived file is kept on disk for forensics (D-17).
 */
export function compactMilestoneEvents(
  basePath: string,
  milestoneId: string,
): { archived: number } {
  const logPath = join(basePath, ".gsd", "event-log.jsonl");
  const archivePath = join(basePath, ".gsd", `event-log-${milestoneId}.jsonl.archived`);

  const allEvents = readEvents(logPath);
  const toArchive = allEvents.filter(
    (e) => (e.params as { milestoneId?: string }).milestoneId === milestoneId,
  );
  const remaining = allEvents.filter(
    (e) => (e.params as { milestoneId?: string }).milestoneId !== milestoneId,
  );

  if (toArchive.length === 0) {
    return { archived: 0 };
  }

  // Import atomicWriteSync dynamically to avoid circular dependency risk
  // (or import at top of file if no circular dep exists — check first)
  const { atomicWriteSync } = require("./atomic-write.js");

  // Write archived events
  atomicWriteSync(
    archivePath,
    toArchive.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );

  // Truncate active log to remaining events
  atomicWriteSync(
    logPath,
    remaining.length > 0
      ? remaining.map((e) => JSON.stringify(e)).join("\n") + "\n"
      : "",
  );

  return { archived: toArchive.length };
}
```

IMPORTANT: Check if `atomicWriteSync` can be imported at the top of workflow-events.ts (static import) without circular dependency. If so, use static import. If not, use dynamic `import()` or `require()`. The existing file uses only `node:` imports, so adding `atomicWriteSync` from `./atomic-write.js` should be safe as a static import at the top.

Run tests — all 7 must pass.
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/compaction.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/workflow-events.ts contains `export function compactMilestoneEvents(`
    - src/resources/extensions/gsd/workflow-events.ts contains `event-log-${milestoneId}.jsonl.archived` or equivalent template literal
    - src/resources/extensions/gsd/workflow-events.ts contains `atomicWriteSync(`
    - src/resources/extensions/gsd/engine/compaction.test.ts exits 0 with all tests passing
    - grep for `compactMilestoneEvents` in workflow-events.ts returns at least 2 lines (export + function body)
  </acceptance_criteria>
  <done>compactMilestoneEvents() archives milestone events to .jsonl.archived file, truncates active log to remaining events. Safe for empty logs and no-match milestones. All 7 tests pass.</done>
</task>

</tasks>

<verification>
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/compaction.test.ts` — all 7 compaction tests pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/*.test.ts` — all engine tests pass (no regressions)
- `grep "compactMilestoneEvents" src/resources/extensions/gsd/workflow-events.ts` — returns match
</verification>

<success_criteria>
Event log compaction archives milestone events on completion, keeping active log bounded. Archived logs preserved on disk. All tests pass.
</success_criteria>

<output>
After completion, create `.planning/phases/03-event-reconciliation-mandatory-tools/3-04-SUMMARY.md`
</output>
