// GSD Extension — Engine deriveState() validation across fixture scenarios
// Proves engine.deriveState() produces correct GSDState for 7 representative scenarios.
// Adapted from PR #2141's cross-validation approach for the single-writer engine.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openDatabase, closeDatabase } from "../gsd-db.ts";
import { WorkflowEngine, resetEngine } from "../workflow-engine.ts";
import { migrateFromMarkdown } from "../workflow-migration.ts";
import type { GSDState } from "../types.ts";

// ─── Fixture helpers ──────────────────────────────────────────────────────

function createFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-crossval-"));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function writeFile(base: string, relativePath: string, content: string): void {
  const full = join(base, ".gsd", relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Test scenarios
// ═══════════════════════════════════════════════════════════════════════════

describe("deriveState engine validation", () => {
  let base: string;

  beforeEach(() => {
    resetEngine();
    base = createFixtureBase();
  });

  afterEach(() => {
    resetEngine();
    closeDatabase();
    cleanup(base);
  });

  // ─── Scenario A: Pre-planning — milestone with CONTEXT but no roadmap
  it("A: pre-planning — milestone with CONTEXT, no roadmap", () => {
    writeFile(base, "milestones/M001/M001-CONTEXT.md", "# M001: New Project\n\nWe are exploring scope.");

    openDatabase(":memory:");
    migrateFromMarkdown(base);
    const engine = new WorkflowEngine(base);
    const engineState = engine.deriveState();

    // Engine finds active milestone M001 but no slices → planning
    assert.strictEqual(engineState.phase, "planning");
    assert.strictEqual(engineState.activeMilestone?.id ?? null, "M001");
  });

  // ─── Scenario B: Executing — 2 slices, first complete, second active
  it("B: executing — S01 complete, S02 active with tasks", () => {
    const roadmap = `# M001: Test Project

**Vision:** Test executing state.

## Slices

- [x] **S01: Foundation** \`risk:low\` \`depends:[]\`
  > After this: Foundation laid.

- [ ] **S02: Core Logic** \`risk:medium\` \`depends:[S01]\`
  > After this: Core working.
`;
    const planS02 = `---
estimated_steps: 2
estimated_files: 1
skills_used: []
---

# S02: Core Logic

**Goal:** Build core logic.
**Demo:** Tests pass.

## Tasks

- [x] **T01: Setup** \`est:15m\`
  Setup task.

- [ ] **T02: Implement** \`est:30m\`
  Implementation task.
`;
    writeFile(base, "milestones/M001/M001-ROADMAP.md", roadmap);
    writeFile(base, "milestones/M001/slices/S01/S01-SUMMARY.md",
      "---\nid: S01\nparent: M001\n---\n\n# S01: Foundation\n\nDone.");
    writeFile(base, "milestones/M001/slices/S01/S01-PLAN.md",
      "# S01: Foundation\n\n**Goal:** Lay foundation.\n**Demo:** Done.\n\n## Tasks\n\n- [x] **T01: Init** `est:10m`\n  Init.\n");
    writeFile(base, "milestones/M001/slices/S02/S02-PLAN.md", planS02);
    writeFile(base, "milestones/M001/slices/S02/tasks/.gitkeep", "");
    writeFile(base, "milestones/M001/slices/S02/tasks/T01-PLAN.md", "# T01 Plan");
    writeFile(base, "milestones/M001/slices/S02/tasks/T01-SUMMARY.md",
      "---\nid: T01\n---\n\n# T01\n\nDone.");
    writeFile(base, "milestones/M001/slices/S02/tasks/T02-PLAN.md", "# T02 Plan");

    openDatabase(":memory:");
    migrateFromMarkdown(base);
    const engine = new WorkflowEngine(base);
    const engineState = engine.deriveState();

    assert.strictEqual(engineState.phase, "executing");
    assert.strictEqual(engineState.activeSlice?.id, "S02");
    assert.strictEqual(engineState.activeTask?.id, "T02");
    assert.strictEqual(engineState.progress?.slices?.done, 1);
    assert.strictEqual(engineState.progress?.slices?.total, 2);
  });

  // ─── Scenario C: Summarizing — all tasks done, no slice summary
  it("C: summarizing — all tasks done, slice not yet complete", () => {
    const roadmap = `# M001: Summarize Test

**Vision:** Test summarizing state.

## Slices

- [ ] **S01: Only Slice** \`risk:low\` \`depends:[]\`
  > After this: Done.
`;
    const plan = `---
estimated_steps: 2
estimated_files: 1
skills_used: []
---

# S01: Only Slice

**Goal:** Do everything.
**Demo:** All done.

## Tasks

- [x] **T01: First** \`est:10m\`
  First task.

- [x] **T02: Second** \`est:10m\`
  Second task.
`;
    writeFile(base, "milestones/M001/M001-ROADMAP.md", roadmap);
    writeFile(base, "milestones/M001/slices/S01/S01-PLAN.md", plan);
    writeFile(base, "milestones/M001/slices/S01/tasks/.gitkeep", "");
    writeFile(base, "milestones/M001/slices/S01/tasks/T01-PLAN.md", "# T01 Plan");
    writeFile(base, "milestones/M001/slices/S01/tasks/T02-PLAN.md", "# T02 Plan");
    writeFile(base, "milestones/M001/slices/S01/tasks/T01-SUMMARY.md",
      "---\nid: T01\nparent: S01\nmilestone: M001\n---\n# T01 Summary\nDone.");
    writeFile(base, "milestones/M001/slices/S01/tasks/T02-SUMMARY.md",
      "---\nid: T02\nparent: S01\nmilestone: M001\n---\n# T02 Summary\nDone.");

    openDatabase(":memory:");
    migrateFromMarkdown(base);
    const engine = new WorkflowEngine(base);
    const engineState = engine.deriveState();

    // Engine: all tasks done, no active task → planning (needs slice completion)
    assert.strictEqual(engineState.phase, "planning");
    assert.strictEqual(engineState.activeSlice?.id, "S01");
    assert.strictEqual(engineState.activeTask, null);
  });

  // ─── Scenario D: Multi-milestone — M001 complete, M002 active
  it("D: multi-milestone — M001 complete, M002 active", () => {
    const m1Roadmap = `# M001: First Milestone

**Vision:** Already done.

## Slices

- [x] **S01: Done Slice** \`risk:low\` \`depends:[]\`
  > After this: Done.
`;
    const m2Roadmap = `# M002: Second Milestone

**Vision:** Currently active.

## Slices

- [ ] **S01: Active Slice** \`risk:low\` \`depends:[]\`
  > After this: Active work done.
`;
    const m2Plan = `---
estimated_steps: 1
estimated_files: 1
skills_used: []
---

# S01: Active Slice

**Goal:** Do the work.
**Demo:** It works.

## Tasks

- [ ] **T01: Work** \`est:30m\`
  Do the work.
`;
    writeFile(base, "milestones/M001/M001-ROADMAP.md", m1Roadmap);
    writeFile(base, "milestones/M001/M001-VALIDATION.md",
      "---\nverdict: pass\nremediation_round: 0\n---\n\n# Validation\nPassed.");
    writeFile(base, "milestones/M001/SUMMARY.md", "# M001 Summary\n\nFirst milestone complete.");
    writeFile(base, "milestones/M002/M002-ROADMAP.md", m2Roadmap);
    writeFile(base, "milestones/M002/slices/S01/S01-PLAN.md", m2Plan);
    writeFile(base, "milestones/M002/slices/S01/tasks/.gitkeep", "");
    writeFile(base, "milestones/M002/slices/S01/tasks/T01-PLAN.md", "# T01 Plan");

    openDatabase(":memory:");
    migrateFromMarkdown(base);
    const engine = new WorkflowEngine(base);
    const engineState = engine.deriveState();

    assert.strictEqual(engineState.activeMilestone?.id, "M002");
    assert.strictEqual(engineState.registry.length, 2);

    const m1 = engineState.registry.find(e => e.id === "M001");
    const m2 = engineState.registry.find(e => e.id === "M002");
    assert.strictEqual(m1?.status, "done");
    assert.strictEqual(m2?.status, "active");
  });

  // ─── Scenario E: Blocked — all slices have unmet deps (circular)
  it("E: blocked — circular slice deps", () => {
    const roadmap = `# M001: Blocked Test

**Vision:** Test blocked state.

## Slices

- [ ] **S01: First** \`risk:low\` \`depends:[S02]\`
  > After this: First done.

- [ ] **S02: Second** \`risk:low\` \`depends:[S01]\`
  > After this: Second done.
`;
    writeFile(base, "milestones/M001/M001-ROADMAP.md", roadmap);

    openDatabase(":memory:");
    migrateFromMarkdown(base);
    const engine = new WorkflowEngine(base);
    const engineState = engine.deriveState();

    // Engine: circular deps mean no slice is active → planning
    assert.strictEqual(engineState.phase, "planning");
  });

  // ─── Scenario F: Parked milestone — M001 parked, M002 pre-planning
  it("F: parked — M001 parked, M002 active", () => {
    const roadmap = `# M001: Parked Milestone

**Vision:** Parked.

## Slices

- [ ] **S01: Some Slice** \`risk:low\` \`depends:[]\`
  > After this: Done.
`;
    writeFile(base, "milestones/M001/M001-ROADMAP.md", roadmap);
    writeFile(base, "milestones/M001/M001-PARKED.md", "Parked for now.");
    writeFile(base, "milestones/M002/M002-CONTEXT.md", "# M002: Active Milestone\n\nReady to go.");

    openDatabase(":memory:");
    migrateFromMarkdown(base);
    const engine = new WorkflowEngine(base);
    const engineState = engine.deriveState();

    assert.strictEqual(engineState.activeMilestone?.id, "M002");
    assert.ok(
      engineState.registry.some(e => e.id === "M001" && e.status === "parked"),
    );
  });

  // ─── Scenario G: Auto-migration round-trip with requirements
  it("G: auto-migration round-trip — 3 slices, 3 tasks, requirements", () => {
    const roadmap = `# M001: Migration Test

**Vision:** Test migration fidelity.

## Slices

- [x] **S01: Done Setup** \`risk:low\` \`depends:[]\`
  > After this: Setup done.

- [ ] **S02: Active Work** \`risk:medium\` \`depends:[S01]\`
  > After this: Work done.

- [ ] **S03: Future Work** \`risk:high\` \`depends:[S02]\`
  > After this: All done.
`;
    const planS02 = `---
estimated_steps: 3
estimated_files: 2
skills_used: []
---

# S02: Active Work

**Goal:** Do the work.
**Demo:** Tests pass.

## Tasks

- [x] **T01: First** \`est:10m\`
  First task.

- [ ] **T02: Second** \`est:20m\`
  Second task.

- [ ] **T03: Third** \`est:15m\`
  Third task.
`;
    writeFile(base, "milestones/M001/M001-ROADMAP.md", roadmap);
    writeFile(base, "milestones/M001/slices/S01/S01-SUMMARY.md",
      "---\nid: S01\nparent: M001\n---\n\n# S01: Done Setup\n\nDone.");
    writeFile(base, "milestones/M001/slices/S01/S01-PLAN.md",
      "# S01: Done Setup\n\n**Goal:** Setup.\n**Demo:** Done.\n\n## Tasks\n\n- [x] **T01: Init** `est:10m`\n  Init.\n");
    writeFile(base, "milestones/M001/slices/S02/S02-PLAN.md", planS02);
    writeFile(base, "milestones/M001/slices/S02/tasks/.gitkeep", "");
    writeFile(base, "milestones/M001/slices/S02/tasks/T01-PLAN.md", "# T01 Plan");
    writeFile(base, "milestones/M001/slices/S02/tasks/T01-SUMMARY.md",
      "---\nid: T01\n---\n\n# T01\n\nDone.");
    writeFile(base, "milestones/M001/slices/S02/tasks/T02-PLAN.md", "# T02 Plan");
    writeFile(base, "milestones/M001/slices/S02/tasks/T03-PLAN.md", "# T03 Plan");

    openDatabase(":memory:");
    migrateFromMarkdown(base);
    const engine = new WorkflowEngine(base);
    const engineState = engine.deriveState();

    assert.strictEqual(engineState.phase, "executing");
    assert.strictEqual(engineState.activeSlice?.id, "S02");
    assert.strictEqual(engineState.activeTask?.id, "T02");
    assert.strictEqual(engineState.progress?.slices?.done, 1);
    assert.strictEqual(engineState.progress?.slices?.total, 3);
    assert.strictEqual(engineState.progress?.tasks?.done, 1);
    assert.strictEqual(engineState.progress?.tasks?.total, 3);
  });
});
