import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFullState, parseRoadmap, parseRequirements } from "../src/server/state-deriver";

let tempDir: string;

function makeTempPlanningDir(): string {
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

const SAMPLE_STATE_MD = `---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: "Working on Phase 2"
last_updated: "2026-03-10T00:11:01.262Z"
last_activity: "2026-03-10 -- Completed 01-02-PLAN.md"
progress:
  total_phases: 10
  completed_phases: 1
  total_plans: 5
  completed_plans: 2
  percent: 40
---

# Project State

Some body content here.
`;

const SAMPLE_ROADMAP_MD = `# Roadmap

## Phases

- [x] **Phase 1: Monorepo Bootstrap** - Workspace structure and Bun server
- [ ] **Phase 2: File-to-State Pipeline** - File watcher and state derivation
- [ ] **Phase 3: Panel Shell** - Five-panel layout with design system
`;

const SAMPLE_CONFIG_JSON = {
  model_profile: "balanced",
  commit_docs: false,
  search_gitignored: false,
  branching_strategy: "none",
  phase_branch_template: "gsd/phase-{phase}-{slug}",
  milestone_branch_template: "gsd/{milestone}-{slug}",
  workflow: {
    research: true,
    plan_check: true,
    verifier: true,
    nyquist_validation: true,
    _auto_chain_active: false,
  },
  parallelization: true,
  brave_search: false,
  mode: "yolo",
  granularity: "fine",
};

const SAMPLE_REQUIREMENTS_MD = `# Requirements

## Server Infrastructure

- [x] **SERV-01**: Bun server starts with single command
- [ ] **SERV-02**: File watcher monitors .planning/ recursively
- [ ] **SERV-03**: State derivation engine parses files
`;

const SAMPLE_PLAN_MD = `---
phase: 02-file-to-state-pipeline
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/types.ts
  - src/server/watcher.ts
autonomous: true
requirements: [SERV-02, SERV-03]
---

# Plan content here
`;

function setupFullPlanningDir(): string {
  tempDir = makeTempPlanningDir();

  // Write STATE.md
  writeFileSync(join(tempDir, "STATE.md"), SAMPLE_STATE_MD);

  // Write ROADMAP.md
  writeFileSync(join(tempDir, "ROADMAP.md"), SAMPLE_ROADMAP_MD);

  // Write config.json
  writeFileSync(join(tempDir, "config.json"), JSON.stringify(SAMPLE_CONFIG_JSON));

  // Write REQUIREMENTS.md
  writeFileSync(join(tempDir, "REQUIREMENTS.md"), SAMPLE_REQUIREMENTS_MD);

  // Write a PLAN.md file in phases directory
  const phaseDir = join(tempDir, "phases", "02-file-to-state-pipeline");
  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(join(phaseDir, "02-01-PLAN.md"), SAMPLE_PLAN_MD);

  return tempDir;
}

describe("buildFullState", () => {
  test("parses STATE.md frontmatter into ProjectState with correct fields", async () => {
    const dir = setupFullPlanningDir();
    const state = await buildFullState(dir);

    expect(state.state.milestone).toBe("v1.0");
    expect(state.state.status).toBe("in_progress");
    expect(state.state.progress.total_phases).toBe(10);
    expect(state.state.progress.completed_phases).toBe(1);
    expect(state.state.progress.percent).toBe(40);
  });

  test("parses ROADMAP.md checkbox list into RoadmapPhase array", async () => {
    const dir = setupFullPlanningDir();
    const state = await buildFullState(dir);

    expect(state.roadmap.phases).toHaveLength(3);
    expect(state.roadmap.phases[0].completed).toBe(true);
    expect(state.roadmap.phases[0].number).toBe(1);
    expect(state.roadmap.phases[0].name).toBe("Monorepo Bootstrap");
    expect(state.roadmap.phases[0].description).toBe("Workspace structure and Bun server");

    expect(state.roadmap.phases[1].completed).toBe(false);
    expect(state.roadmap.phases[1].number).toBe(2);
    expect(state.roadmap.phases[1].name).toBe("File-to-State Pipeline");
  });

  test("parses config.json into ConfigState", async () => {
    const dir = setupFullPlanningDir();
    const state = await buildFullState(dir);

    expect(state.config.model_profile).toBe("balanced");
    expect(state.config.mode).toBe("yolo");
    expect(state.config.workflow.research).toBe(true);
  });

  test("parses PLAN.md files with YAML frontmatter into PlanState grouped by phase", async () => {
    const dir = setupFullPlanningDir();
    const state = await buildFullState(dir);

    expect(state.phases.length).toBeGreaterThan(0);

    // Find the phase with our plan
    const phase2 = state.phases.find((p) => p.number === 2);
    expect(phase2).toBeDefined();
    expect(phase2!.plans.length).toBe(1);
    expect(phase2!.plans[0].plan).toBe(1);
    expect(phase2!.plans[0].wave).toBe(1);
    expect(phase2!.plans[0].autonomous).toBe(true);
    expect(phase2!.plans[0].requirements).toContain("SERV-02");
  });

  test("parses REQUIREMENTS.md checkbox list into RequirementState array", async () => {
    const dir = setupFullPlanningDir();
    const state = await buildFullState(dir);

    expect(state.requirements.length).toBe(3);
    expect(state.requirements[0].id).toBe("SERV-01");
    expect(state.requirements[0].completed).toBe(true);
    expect(state.requirements[1].id).toBe("SERV-02");
    expect(state.requirements[1].completed).toBe(false);
  });

  test("handles missing files gracefully (returns defaults, does not throw)", async () => {
    tempDir = makeTempPlanningDir();
    // Empty directory -- no files at all

    const state = await buildFullState(tempDir);

    expect(state).toBeDefined();
    expect(state.roadmap.phases).toEqual([]);
    expect(state.phases).toEqual([]);
    expect(state.requirements).toEqual([]);
    expect(state.state).toBeDefined();
    expect(state.config).toBeDefined();
  });

  test("SC-5: malformed config.json returns DEFAULT_CONFIG_STATE rather than passing corrupt data", async () => {
    tempDir = makeTempPlanningDir();
    // Write a config.json with completely wrong field types
    writeFileSync(
      join(tempDir, "config.json"),
      JSON.stringify({
        model_profile: 42,          // should be string
        commit_docs: "yes",         // should be boolean
        workflow: "broken",         // should be object
        parallelization: null,      // should be boolean
      })
    );

    const state = await buildFullState(tempDir);

    // validateConfigState should fall back to DEFAULT_CONFIG_STATE values for bad fields
    expect(state.config.model_profile).toBe("balanced");
    expect(state.config.commit_docs).toBe(false);
    expect(state.config.workflow.research).toBe(true);
    expect(state.config.parallelization).toBe(false);
  });

  test("SC-5: partially valid config.json merges valid fields with defaults for invalid ones", async () => {
    tempDir = makeTempPlanningDir();
    // Write a config.json with some valid and some invalid fields
    writeFileSync(
      join(tempDir, "config.json"),
      JSON.stringify({
        model_profile: "fast",      // valid
        commit_docs: true,          // valid
        mode: 99,                   // invalid (should be string)
        search_gitignored: "yes",   // invalid (should be boolean)
      })
    );

    const state = await buildFullState(tempDir);

    expect(state.config.model_profile).toBe("fast");       // valid field preserved
    expect(state.config.commit_docs).toBe(true);           // valid field preserved
    expect(state.config.mode).toBe("balanced");            // invalid falls back to default
    expect(state.config.search_gitignored).toBe(false);    // invalid falls back to default
  });

  test("produces identical output when called twice with same files (SERV-09)", async () => {
    const dir = setupFullPlanningDir();

    const state1 = await buildFullState(dir);
    const state2 = await buildFullState(dir);

    expect(JSON.stringify(state1)).toBe(JSON.stringify(state2));
  });
});

describe("parseRoadmap", () => {
  test("parses checkbox list with completed and uncompleted phases", () => {
    const result = parseRoadmap(SAMPLE_ROADMAP_MD);

    expect(result.phases).toHaveLength(3);
    expect(result.phases[0]).toEqual({
      completed: true,
      number: 1,
      name: "Monorepo Bootstrap",
      description: "Workspace structure and Bun server",
    });
    expect(result.phases[2]).toEqual({
      completed: false,
      number: 3,
      name: "Panel Shell",
      description: "Five-panel layout with design system",
    });
  });

  test("returns empty phases for content without phase checkboxes", () => {
    const result = parseRoadmap("# Just a heading\n\nNo phases here.");
    expect(result.phases).toEqual([]);
  });
});

describe("parseRequirements", () => {
  test("parses checkbox list into RequirementState array", () => {
    const result = parseRequirements(SAMPLE_REQUIREMENTS_MD);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: "SERV-01",
      description: "Bun server starts with single command",
      completed: true,
    });
    expect(result[1]).toEqual({
      id: "SERV-02",
      description: "File watcher monitors .planning/ recursively",
      completed: false,
    });
  });

  test("returns empty array for content without requirement checkboxes", () => {
    const result = parseRequirements("# Nothing here");
    expect(result).toEqual([]);
  });
});
