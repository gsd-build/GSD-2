/**
 * State deriver phase 5 tests — updated for GSD 2 schema.
 *
 * v1 tests for must_haves parsing, task_count, and verification data
 * tested the .planning/phases/ directory traversal which is removed
 * in Phase 12 GSD 2 compatibility pass.
 *
 * GSD 2 state derivation reads a flat .gsd/ directory structure:
 *   STATE.md, M{NNN}-ROADMAP.md, S{NN}-PLAN.md, T{NN}-SUMMARY.md, etc.
 *
 * Must-haves and verification parsing for GSD 2 format is deferred to Phase 14.
 * These tests now verify the GSD2State shape expectations for those fields.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFullState } from "../src/server/state-deriver";

let tempDir: string;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "state-deriver-p5-"));
}

afterEach(() => {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

const GSD2_STATE_MD = `---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Native Desktop
status: in_progress
active_milestone: M001
active_slice: S01
active_task: T01
auto_mode: false
cost: 0
tokens: 0
last_updated: "2026-03-12T10:00:00Z"
---

# State
`;

const GSD2_PLAN_MD = `---
slice: S01
name: File watcher wiring
---

# S01 Plan Content

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Do something</name>
</task>
<task type="auto">
  <name>Task 2: Do another thing</name>
</task>
<task type="auto">
  <name>Task 3: Third task</name>
</task>
</tasks>
`;

describe("GSD2State — activePlan and activeTask (replaces v1 PlanState/PhaseState)", () => {
  test("activePlan contains parsed slice plan data", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD);
    writeFileSync(join(gsdDir, "S01-PLAN.md"), GSD2_PLAN_MD);

    const state = await buildFullState(gsdDir);

    expect(state.activePlan).not.toBeNull();
    // Phase 14: activePlan is now parsed GSD2SlicePlan — no .raw field
    expect(state.activePlan!.sliceId).toBe("S01");
    expect(Array.isArray(state.activePlan!.tasks)).toBe(true);
    expect(Array.isArray(state.activePlan!.mustHaves)).toBe(true);
  });

  test("activePlan is null when S{NN}-PLAN.md is missing", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD);
    // No S01-PLAN.md written

    const state = await buildFullState(gsdDir);
    expect(state.activePlan).toBeNull();
  });

  test("activeTask is null when T{NN}-SUMMARY.md is missing", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD);
    // No T01-SUMMARY.md written

    const state = await buildFullState(gsdDir);
    expect(state.activeTask).toBeNull();
  });

  test("GSD2State has no v1 phases array — v1 schema removed", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD);

    const state = await buildFullState(gsdDir);

    // These v1 fields do not exist on GSD2State
    expect((state as any).phases).toBeUndefined();
    expect((state as any).config).toBeUndefined();
    expect((state as any).requirements).toBeUndefined();
  });
});
