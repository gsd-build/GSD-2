/**
 * Regression test for #1850: doctor task_done_missing_summary fix leaves
 * slice [x] done in roadmap, causing an infinite doctor loop.
 *
 * Scenario: A slice is [x] done in the roadmap, has S01-SUMMARY.md (so
 * slice_checked_missing_summary never fires), but tasks are [x] done with
 * no T##-SUMMARY.md files. Doctor unchecks the tasks but must also uncheck
 * the slice so the state machine re-enters the executing phase.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runGSDDoctor } from "../doctor.js";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

async function main(): Promise<void> {
  // ─── Setup: slice [x] done with S01-SUMMARY.md, tasks [x] but NO task summaries ───
  console.log("\n=== #1850: task_done_missing_summary fix must also uncheck slice ===");
  {
    const base = mkdtempSync(join(tmpdir(), "gsd-doctor-1850-"));
    const gsd = join(base, ".gsd");
    const mDir = join(gsd, "milestones", "M001");
    const sDir = join(mDir, "slices", "S01");
    const tDir = join(sDir, "tasks");
    mkdirSync(tDir, { recursive: true });

    // Roadmap: slice is [x] done
    writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone

## Slices
- [x] **S01: Guided Slice** \`risk:low\` \`depends:[]\`
  > After this: guided flow works
`);

    // Plan: tasks are [x] done
    writeFileSync(join(sDir, "S01-PLAN.md"), `# S01: Guided Slice

**Goal:** Test guided flow
**Demo:** Works

## Tasks
- [x] **T01: First task** \`est:10m\`
  Do the first thing.
- [x] **T02: Second task** \`est:10m\`
  Do the second thing.
- [x] **T03: Third task** \`est:10m\`
  Do the third thing.
`);

    // Slice summary EXISTS (so slice_checked_missing_summary guard does NOT fire)
    writeFileSync(join(sDir, "S01-SUMMARY.md"), `---
id: S01
parent: M001
---
# S01: Guided Slice
Done via guided flow.
`);

    // Slice UAT exists
    writeFileSync(join(sDir, "S01-UAT.md"), `# S01 UAT
Verified.
`);

    // NO task summaries on disk — this is the trigger condition

    // ── First pass: diagnose ──
    const diagReport = await runGSDDoctor(base, { fix: false });
    const taskDoneMissing = diagReport.issues.filter(i => i.code === "task_done_missing_summary");
    assertEq(taskDoneMissing.length, 3, "detects 3 tasks with task_done_missing_summary");

    // ── Second pass: fix ──
    const fixReport = await runGSDDoctor(base, { fix: true });

    // Tasks should be unchecked in plan
    const plan = readFileSync(join(sDir, "S01-PLAN.md"), "utf-8");
    assertTrue(plan.includes("- [ ] **T01:"), "T01 is unchecked in plan after fix");
    assertTrue(plan.includes("- [ ] **T02:"), "T02 is unchecked in plan after fix");
    assertTrue(plan.includes("- [ ] **T03:"), "T03 is unchecked in plan after fix");

    // CRITICAL: Slice must also be unchecked in roadmap to prevent infinite loop
    const roadmap = readFileSync(join(mDir, "M001-ROADMAP.md"), "utf-8");
    assertTrue(
      roadmap.includes("- [ ] **S01:"),
      "slice is unchecked in roadmap after task_done_missing_summary fix (prevents infinite loop)"
    );
    assertTrue(
      !roadmap.includes("- [x] **S01:"),
      "slice is NOT still [x] done in roadmap"
    );

    // ── Third pass: re-run doctor should NOT re-detect task_done_missing_summary ──
    const rerunReport = await runGSDDoctor(base, { fix: false });
    const rerunTaskDone = rerunReport.issues.filter(i => i.code === "task_done_missing_summary");
    assertEq(rerunTaskDone.length, 0, "no task_done_missing_summary on re-run (no infinite loop)");

    rmSync(base, { recursive: true, force: true });
  }

  // ─── Partial fix: only some tasks missing summaries ───
  console.log("\n=== #1850: partial — some tasks have summaries, some do not ===");
  {
    const base = mkdtempSync(join(tmpdir(), "gsd-doctor-1850-partial-"));
    const gsd = join(base, ".gsd");
    const mDir = join(gsd, "milestones", "M001");
    const sDir = join(mDir, "slices", "S01");
    const tDir = join(sDir, "tasks");
    mkdirSync(tDir, { recursive: true });

    writeFileSync(join(mDir, "M001-ROADMAP.md"), `# M001: Test Milestone

## Slices
- [x] **S01: Partial Slice** \`risk:low\` \`depends:[]\`
  > After this: partial
`);

    writeFileSync(join(sDir, "S01-PLAN.md"), `# S01: Partial Slice

**Goal:** Test partial
**Demo:** Works

## Tasks
- [x] **T01: Has summary** \`est:10m\`
  This task has a summary.
- [x] **T02: Missing summary** \`est:10m\`
  This task does not.
`);

    // T01 has a summary, T02 does not
    writeFileSync(join(tDir, "T01-SUMMARY.md"), `---
id: T01
parent: S01
milestone: M001
---
# T01: Has summary
**Done**
## What Happened
Done.
`);

    writeFileSync(join(sDir, "S01-SUMMARY.md"), `---
id: S01
parent: M001
---
# S01: Partial
`);

    writeFileSync(join(sDir, "S01-UAT.md"), `# S01 UAT
Done.
`);

    const fixReport = await runGSDDoctor(base, { fix: true });

    // T02 should be unchecked, T01 should stay checked
    const plan = readFileSync(join(sDir, "S01-PLAN.md"), "utf-8");
    assertTrue(plan.includes("- [x] **T01:"), "T01 stays checked (has summary)");
    assertTrue(plan.includes("- [ ] **T02:"), "T02 is unchecked (missing summary)");

    // Slice must be unchecked because not all tasks are done anymore
    const roadmap = readFileSync(join(mDir, "M001-ROADMAP.md"), "utf-8");
    assertTrue(
      roadmap.includes("- [ ] **S01:"),
      "slice is unchecked when any task is unchecked by task_done_missing_summary"
    );

    rmSync(base, { recursive: true, force: true });
  }

  report();
}

main();
