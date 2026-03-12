/**
 * State deriver tests — GSD 2 schema.
 *
 * Phase 12 rewrite: buildFullState() now reads .gsd/ flat schema (GSD2State).
 * v1 .planning/ schema tests removed; GSD 2 fixture tests replace them.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFullState } from "../src/server/state-deriver";

let tempDir: string;

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "state-deriver-test-"));
  return dir;
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

// -- GSD 2 fixture samples --

const GSD2_STATE_MD = `---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Native Desktop
status: in_progress
active_milestone: M001
active_slice: S01
active_task: T01
auto_mode: false
cost: 0.00
tokens: 0
last_updated: "2026-03-12T10:00:00Z"
last_activity: "2026-03-12 — completed S01-T01"
---

# Project State

Some body content here.
`;

const GSD2_STATE_MD_MULTI_BLOCK = `---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Native Desktop
status: in_progress
last_updated: "2026-03-01T00:00:00Z"
---

## Some content between blocks

---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Native Desktop
status: in_progress
active_milestone: M002
active_slice: S03
active_task: T02
auto_mode: true
cost: 1.50
tokens: 5000
last_updated: "2026-03-12T10:00:00Z"
---

# Updated state below
`;

const GSD2_ROADMAP_MD = `# M001 — Native Desktop Roadmap

## Slices

- [ ] S01: File watcher wiring
- [x] S02: WebSocket server
`;

const GSD2_PLAN_MD = `---
slice: S01
name: File watcher wiring
---

# S01 Plan Content
`;

const GSD2_SUMMARY_MD = `---
task: T01
name: Initial setup
---

# T01 Summary Content
`;

const GSD2_PREFERENCES_MD = `---
research_model: claude-sonnet-4-6
planning_model: claude-sonnet-4-6
execution_model: claude-sonnet-4-6
completion_model: claude-sonnet-4-6
budget_ceiling: 50
skill_discovery: auto
---

# Preferences
`;

const GSD2_DECISIONS_MD = `# Decisions

## ADR-001: Use Bun

Decision: Use Bun as runtime.
`;

const GSD2_PROJECT_MD = `# My GSD 2 Project

This project uses GSD 2.
`;

const GSD2_CONTEXT_MD = `# M001 Context

User decisions for milestone M001.
`;

/**
 * Creates a .gsd/ directory layout inside a parent tmpDir.
 * Returns the path to the .gsd/ directory.
 */
function createGsd2Fixture(parentDir: string): string {
  const gsdDir = join(parentDir, ".gsd");
  mkdirSync(gsdDir, { recursive: true });

  writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD);
  writeFileSync(join(gsdDir, "M001-ROADMAP.md"), GSD2_ROADMAP_MD);
  writeFileSync(join(gsdDir, "S01-PLAN.md"), GSD2_PLAN_MD);
  writeFileSync(join(gsdDir, "T01-SUMMARY.md"), GSD2_SUMMARY_MD);
  writeFileSync(join(gsdDir, "preferences.md"), GSD2_PREFERENCES_MD);
  writeFileSync(join(gsdDir, "DECISIONS.md"), GSD2_DECISIONS_MD);
  writeFileSync(join(gsdDir, "PROJECT.md"), GSD2_PROJECT_MD);
  writeFileSync(join(gsdDir, "M001-CONTEXT.md"), GSD2_CONTEXT_MD);

  return gsdDir;
}

describe("buildFullState — GSD 2 fixtures", () => {
  test("parses STATE.md frontmatter into GSD2ProjectState with active pointers", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);
    const state = await buildFullState(gsdDir);

    expect(state.projectState).toBeDefined();
    expect(state.projectState.active_milestone).toBe("M001");
    expect(state.projectState.active_slice).toBe("S01");
    expect(state.projectState.active_task).toBe("T01");
    expect(state.projectState.status).toBe("in_progress");
    expect(state.projectState.milestone).toBe("v2.0");
    expect(state.projectState.milestone_name).toBe("Native Desktop");
  });

  test("derives roadmap from dynamic M{NNN}-ROADMAP.md path", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);
    const state = await buildFullState(gsdDir);

    expect(state.roadmap).not.toBeNull();
    expect(state.roadmap!.raw).toContain("M001");
    expect(state.roadmap!.raw).toContain("Slices");
  });

  test("derives activePlan from dynamic S{NN}-PLAN.md path", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);
    const state = await buildFullState(gsdDir);

    expect(state.activePlan).not.toBeNull();
    expect(state.activePlan!.raw).toContain("S01");
  });

  test("derives activeTask from dynamic T{NN}-SUMMARY.md path", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);
    const state = await buildFullState(gsdDir);

    expect(state.activeTask).not.toBeNull();
    expect(state.activeTask!.raw).toContain("T01");
  });

  test("parses preferences.md with gray-matter (NOT JSON.parse)", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);
    const state = await buildFullState(gsdDir);

    expect(state.preferences).not.toBeNull();
    expect(state.preferences!.budget_ceiling).toBe(50);
    expect(state.preferences!.skill_discovery).toBe("auto");
    expect(state.preferences!.research_model).toBe("claude-sonnet-4-6");
  });

  test("includes raw decisions content", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);
    const state = await buildFullState(gsdDir);

    expect(state.decisions).not.toBeNull();
    expect(state.decisions).toContain("ADR-001");
  });

  test("includes raw project content", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);
    const state = await buildFullState(gsdDir);

    expect(state.project).not.toBeNull();
    expect(state.project).toContain("GSD 2");
  });

  test("includes raw milestoneContext content", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);
    const state = await buildFullState(gsdDir);

    expect(state.milestoneContext).not.toBeNull();
    expect(state.milestoneContext).toContain("M001 Context");
  });

  test("handles missing files gracefully — returns nulls, does not throw", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    // Empty .gsd/ directory — no files

    const state = await buildFullState(gsdDir);

    expect(state).toBeDefined();
    expect(state.roadmap).toBeNull();
    expect(state.activePlan).toBeNull();
    expect(state.activeTask).toBeNull();
    expect(state.decisions).toBeNull();
    expect(state.preferences).toBeNull();
    expect(state.project).toBeNull();
    expect(state.milestoneContext).toBeNull();
    expect(state.projectState).toBeDefined();
  });

  test("uses last frontmatter block when STATE.md has multiple --- blocks", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD_MULTI_BLOCK);

    const state = await buildFullState(gsdDir);

    // Should use the LAST block which has active_milestone: M002
    expect(state.projectState.active_milestone).toBe("M002");
    expect(state.projectState.active_slice).toBe("S03");
    expect(state.projectState.active_task).toBe("T02");
    expect(state.projectState.auto_mode).toBe(true);
    expect(state.projectState.cost).toBe(1.5);
  });

  test("dynamic ID resolution — reads files based on STATE.md active pointers", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    // STATE.md pointing to M002, S03, T02
    const stateContent = `---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Native Desktop
status: in_progress
active_milestone: M002
active_slice: S03
active_task: T02
auto_mode: false
cost: 0
tokens: 0
last_updated: "2026-03-12T10:00:00Z"
---
`;
    writeFileSync(join(gsdDir, "STATE.md"), stateContent);
    writeFileSync(join(gsdDir, "M002-ROADMAP.md"), "# M002 Roadmap");
    writeFileSync(join(gsdDir, "S03-PLAN.md"), "# S03 Plan");
    writeFileSync(join(gsdDir, "T02-SUMMARY.md"), "# T02 Summary");

    const state = await buildFullState(gsdDir);

    expect(state.projectState.active_milestone).toBe("M002");
    expect(state.roadmap).not.toBeNull();
    expect(state.roadmap!.raw).toContain("M002 Roadmap");
    expect(state.activePlan).not.toBeNull();
    expect(state.activePlan!.raw).toContain("S03 Plan");
    expect(state.activeTask).not.toBeNull();
    expect(state.activeTask!.raw).toContain("T02 Summary");
    // decisions.md not written — null
    expect(state.decisions).toBeNull();
  });

  test("produces identical output when called twice with same files (idempotent)", async () => {
    tempDir = makeTempDir();
    const gsdDir = createGsd2Fixture(tempDir);

    const state1 = await buildFullState(gsdDir);
    const state2 = await buildFullState(gsdDir);

    expect(JSON.stringify(state1)).toBe(JSON.stringify(state2));
  });
});

describe("buildFullState — needsMigration detection", () => {
  test("returns needsMigration: true when .planning/ exists but .gsd/ does not", async () => {
    tempDir = makeTempDir();
    // Create .planning/ but NOT .gsd/
    mkdirSync(join(tempDir, ".planning"), { recursive: true });
    const gsdDir = join(tempDir, ".gsd");
    // Don't create gsdDir

    const state = await buildFullState(gsdDir);
    expect(state.needsMigration).toBe(true);
  });

  test("returns needsMigration: false when .gsd/ exists (regardless of .planning/)", async () => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, ".planning"), { recursive: true });
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    const state = await buildFullState(gsdDir);
    expect(state.needsMigration).toBe(false);
  });

  test("returns needsMigration: false when neither .planning/ nor .gsd/ exists", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    // Don't create either directory

    const state = await buildFullState(gsdDir);
    expect(state.needsMigration).toBe(false);
  });
});
