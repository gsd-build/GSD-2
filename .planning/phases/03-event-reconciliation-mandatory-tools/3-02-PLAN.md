---
phase: 03-event-reconciliation-mandatory-tools
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/resources/extensions/gsd/write-intercept.ts
  - src/resources/extensions/gsd/engine/write-intercept.test.ts
  - src/resources/extensions/gsd/prompts/complete-milestone.md
  - src/resources/extensions/gsd/engine/prompt-migration.test.ts
autonomous: true
requirements: [PMG-04, PMG-05]

must_haves:
  truths:
    - "Agent writes to .gsd/ authoritative state files are blocked with an error directing them to use engine tools"
    - "complete-milestone.md instructs agents to use engine tools for REQUIREMENTS.md updates instead of direct file writes"
    - "All remaining prompts have been audited for residual state-file-write instructions"
  artifacts:
    - path: "src/resources/extensions/gsd/write-intercept.ts"
      provides: "isBlockedStateFile() check and blocked-write error message"
      exports: ["isBlockedStateFile", "BLOCKED_WRITE_ERROR"]
    - path: "src/resources/extensions/gsd/engine/write-intercept.test.ts"
      provides: "Unit tests for write intercept path matching"
      min_lines: 40
  key_links:
    - from: "src/resources/extensions/gsd/write-intercept.ts"
      to: "Agent tool execution path"
      via: "isBlockedStateFile() called before file write tools execute"
      pattern: "isBlockedStateFile"
    - from: "src/resources/extensions/gsd/prompts/complete-milestone.md"
      to: "Engine tools"
      via: "Prompt text references gsd_save_decision or engine tool calls"
      pattern: "gsd_"
---

<objective>
Build a write intercept module that blocks agent writes to .gsd/ authoritative state files with an error directing them to use engine tools. Complete prompt migration for complete-milestone.md and audit all remaining prompts for residual state-file-write instructions.

Purpose: Prevent rogue agent file edits that bypass the engine (PMG-05) and complete the prompt migration to tool-call instructions (PMG-04).
Output: write-intercept.ts module, updated prompts, content-assertion tests.
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

From src/resources/extensions/gsd/prompts/complete-milestone.md (lines 24-28 — migration target):
```
7. Update `.gsd/REQUIREMENTS.md` if any requirement status transitions were validated in step 5.
8. Update `.gsd/PROJECT.md` to reflect milestone completion and current project state.
```
Step 7 is the target: REQUIREMENTS.md is authoritative state (engine has requirements table).
Step 8: PROJECT.md is non-authoritative content — file write remains.

From src/resources/extensions/gsd/engine/prompt-migration.test.ts (existing test file):
Tests use content-assertion pattern: read prompt file, assert on string contents.

Prompt files to audit (all in src/resources/extensions/gsd/prompts/):
complete-milestone.md, replan-slice.md, validate-milestone.md, research-slice.md,
guided-complete-slice.md, guided-discuss-milestone.md, guided-discuss-slice.md,
guided-execute-task.md, guided-plan-milestone.md, guided-plan-slice.md,
guided-research-slice.md, guided-resume-task.md, worktree-merge.md,
plan-milestone.md, reassess-roadmap.md, research-milestone.md, review-migration.md
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write intercept module — path matching for blocked state files</name>
  <files>src/resources/extensions/gsd/write-intercept.ts, src/resources/extensions/gsd/engine/write-intercept.test.ts</files>
  <read_first>
    src/resources/extensions/gsd/engine/event-log.test.ts (test pattern reference)
    src/resources/extensions/gsd/atomic-write.ts (for import pattern reference)
  </read_first>
  <behavior>
    - Test 1: isBlockedStateFile("/project/.gsd/STATE.md") returns true
    - Test 2: isBlockedStateFile("/project/.gsd/REQUIREMENTS.md") returns true
    - Test 3: isBlockedStateFile("/project/.gsd/PROJECT.md") returns true
    - Test 4: isBlockedStateFile("/project/.gsd/milestones/M001/S01-PLAN.md") returns true (PLAN.md pattern)
    - Test 5: isBlockedStateFile("/project/.gsd/milestones/M001/ROADMAP.md") returns true
    - Test 6: isBlockedStateFile("/project/.gsd/milestones/M001/S01-SUMMARY.md") returns false (summaries are content, not state)
    - Test 7: isBlockedStateFile("/project/.gsd/KNOWLEDGE.md") returns false (content file, not state)
    - Test 8: isBlockedStateFile("/project/.gsd/CONTEXT.md") returns false (content file)
    - Test 9: isBlockedStateFile("/project/src/app.ts") returns false (not in .gsd/)
    - Test 10: isBlockedStateFile with resolved symlink path (e.g., /home/user/.gsd/projects/abc123/STATE.md) returns true — handles Pitfall #6
    - Test 11: BLOCKED_WRITE_ERROR contains "gsd_complete_task" and "gsd_complete_slice" and "gsd_save_decision"
  </behavior>
  <action>
RED phase:
Create `src/resources/extensions/gsd/engine/write-intercept.test.ts` with 11 test cases. Pattern:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBlockedStateFile, BLOCKED_WRITE_ERROR } from "../write-intercept.ts";
```
Tests MUST fail (module doesn't exist yet).

GREEN phase:
Create `src/resources/extensions/gsd/write-intercept.ts` with file header:
```
// GSD Extension — Write Intercept for Agent State File Blocks
// Detects agent attempts to write authoritative state files and returns
// an error directing the agent to use the engine tool API instead.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
```

Implementation:
- `import { realpathSync } from "node:fs";`
- Define blocked file patterns as an array of regexes:
  ```typescript
  const BLOCKED_PATTERNS: RegExp[] = [
    /[/\\]\.gsd[/\\]STATE\.md$/,
    /[/\\]\.gsd[/\\]REQUIREMENTS\.md$/,
    /[/\\]\.gsd[/\\]PROJECT\.md$/,
    /[/\\]\.gsd[/\\].*PLAN\.md$/,
    /[/\\]\.gsd[/\\].*ROADMAP\.md$/,
    // Also match resolved symlink paths under ~/.gsd/projects/
    /[/\\]\.gsd[/\\]projects[/\\][^/\\]+[/\\]STATE\.md$/,
    /[/\\]\.gsd[/\\]projects[/\\][^/\\]+[/\\]REQUIREMENTS\.md$/,
    /[/\\]\.gsd[/\\]projects[/\\][^/\\]+[/\\]PROJECT\.md$/,
    /[/\\]\.gsd[/\\]projects[/\\][^/\\]+[/\\].*PLAN\.md$/,
    /[/\\]\.gsd[/\\]projects[/\\][^/\\]+[/\\].*ROADMAP\.md$/,
  ];
  ```
- `export function isBlockedStateFile(filePath: string): boolean` — test filePath against all patterns. Also try `realpathSync(filePath)` in a try/catch (file may not exist yet) and test the resolved path too.
- `export const BLOCKED_WRITE_ERROR` — string constant:
  ```
  Error: Direct writes to .gsd/ state files are blocked. Use engine tool calls instead:
  - To complete a task: call gsd_complete_task(milestone_id, slice_id, task_id, summary)
  - To complete a slice: call gsd_complete_slice(milestone_id, slice_id, summary, uat_result)
  - To save a decision: call gsd_save_decision(scope, decision, choice, rationale)
  - To start a task: call gsd_start_task(milestone_id, slice_id, task_id)
  - To record verification: call gsd_record_verification(milestone_id, slice_id, task_id, evidence)
  - To report a blocker: call gsd_report_blocker(milestone_id, slice_id, task_id, description)
  ```

Run tests — all 11 must pass.
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/write-intercept.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/write-intercept.ts contains `export function isBlockedStateFile(`
    - src/resources/extensions/gsd/write-intercept.ts contains `export const BLOCKED_WRITE_ERROR`
    - src/resources/extensions/gsd/write-intercept.ts contains `realpathSync`
    - src/resources/extensions/gsd/write-intercept.ts contains `STATE.md`
    - src/resources/extensions/gsd/write-intercept.ts contains `REQUIREMENTS.md`
    - src/resources/extensions/gsd/write-intercept.ts contains `PLAN.md`
    - src/resources/extensions/gsd/write-intercept.ts contains `gsd_complete_task`
    - src/resources/extensions/gsd/write-intercept.ts contains `Copyright (c) 2026 Jeremy McSpadden`
    - src/resources/extensions/gsd/engine/write-intercept.test.ts exits 0
  </acceptance_criteria>
  <done>Write intercept module blocks agent writes to STATE.md, REQUIREMENTS.md, PROJECT.md, *PLAN.md, *ROADMAP.md in .gsd/ directories (including symlink-resolved paths). BLOCKED_WRITE_ERROR directs agents to engine tools. All 11 tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate complete-milestone.md + audit all remaining prompts</name>
  <files>src/resources/extensions/gsd/prompts/complete-milestone.md, src/resources/extensions/gsd/engine/prompt-migration.test.ts</files>
  <read_first>
    src/resources/extensions/gsd/prompts/complete-milestone.md
    src/resources/extensions/gsd/engine/prompt-migration.test.ts
    src/resources/extensions/gsd/prompts/replan-slice.md
    src/resources/extensions/gsd/prompts/validate-milestone.md
    src/resources/extensions/gsd/prompts/research-slice.md
    src/resources/extensions/gsd/prompts/worktree-merge.md
    src/resources/extensions/gsd/prompts/guided-execute-task.md
    src/resources/extensions/gsd/prompts/guided-complete-slice.md
    src/resources/extensions/gsd/prompts/plan-milestone.md
    src/resources/extensions/gsd/prompts/reassess-roadmap.md
  </read_first>
  <action>
**complete-milestone.md migration (D-09):**

Replace step 7 (currently: "Update `.gsd/REQUIREMENTS.md` if any requirement status transitions were validated in step 5.") with:
```
7. For each requirement status transition validated in step 5, call `gsd_save_decision` with scope="requirement", decision="{requirement-id}", choice="{new-status}", rationale="{evidence from validation}". Do NOT write `.gsd/REQUIREMENTS.md` directly — the engine renders it from the database.
```

Step 8 (Update `.gsd/PROJECT.md`) remains as-is — PROJECT.md is non-authoritative content per the research analysis. However, add a note:
```
8. Update `.gsd/PROJECT.md` to reflect milestone completion and current project state. (PROJECT.md is a content file — direct writes are acceptable here.)
```

**Prompt audit (D-10):**

Read every prompt file listed in read_first. For each, check for:
- Any reference to editing `.gsd/REQUIREMENTS.md` directly → replace with tool call
- Any reference to editing `.gsd/STATE.md` directly → replace with tool call
- Any reference to editing checkboxes in PLAN.md or ROADMAP.md → replace with tool call
- Any reference to writing `.gsd/PROJECT.md` → leave as-is (content file)

Known safe files (write non-authoritative content only — no changes needed):
- replan-slice.md — writes plan files (content)
- validate-milestone.md — writes validation path (content)
- research-slice.md — writes research output (content)
- guided prompts — should mirror their non-guided counterparts

If any guided prompt references checkbox edits or direct state file writes, update to match the tool-call pattern from their non-guided counterpart.

**Update prompt-migration.test.ts:**

Add new describe block for complete-milestone.md with these assertions:
- complete-milestone.md contains `gsd_save_decision` (tool call for requirement updates)
- complete-milestone.md does NOT contain `Update \`.gsd/REQUIREMENTS.md\`` without "Do NOT" qualifier
- complete-milestone.md still contains `PROJECT.md` (content file write preserved)

Add audit assertions:
- For each prompt file: assert it does NOT contain the string `Edit the checkbox` or `toggle the checkbox` or `mark the checkbox`
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/prompt-migration.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/prompts/complete-milestone.md contains `gsd_save_decision`
    - src/resources/extensions/gsd/prompts/complete-milestone.md contains `Do NOT write`
    - src/resources/extensions/gsd/engine/prompt-migration.test.ts contains `complete-milestone`
    - src/resources/extensions/gsd/engine/prompt-migration.test.ts exits 0
  </acceptance_criteria>
  <done>complete-milestone.md uses gsd_save_decision for requirement status transitions. All prompts audited — no residual checkbox-edit or direct state-file-write instructions remain. Content-assertion tests pass.</done>
</task>

</tasks>

<verification>
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/write-intercept.test.ts` — all write intercept tests pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/prompt-migration.test.ts` — all prompt tests pass including new assertions
- `grep -r "gsd_save_decision" src/resources/extensions/gsd/prompts/complete-milestone.md` — returns match
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/*.test.ts` — all engine tests pass
</verification>

<success_criteria>
Write intercept blocks agent writes to authoritative state files. complete-milestone.md migrated to engine tools. All prompts audited for residual state-file-write instructions. All tests pass.
</success_criteria>

<output>
After completion, create `.planning/phases/03-event-reconciliation-mandatory-tools/3-02-SUMMARY.md`
</output>
