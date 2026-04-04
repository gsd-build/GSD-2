// GSD Extension — Dispatch Rules Walkthrough Tests
// Exercises resolveDispatch and DISPATCH_RULES for phase routing, guards,
// failure modes, and preference interactions.

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveDispatch, getDispatchRuleNames } from "../auto-dispatch.ts";
import { invalidateAllCaches } from "../cache.ts";
import type { DispatchContext } from "../auto-dispatch.ts";
import type { GSDState } from "../types.ts";
import type { GSDPreferences } from "../preferences.ts";

// ─── Fixture Helpers ──────────────────────────────────────────────────────────

/** Create a temporary project root with the minimum .gsd directory layout. */
function createBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-dispatch-test-"));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

/** Create the M001 directory and return its path. */
function createMilestoneDir(base: string, mid = "M001"): string {
  const dir = join(base, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a milestone-level file (e.g. CONTEXT, RESEARCH, PLAN, VALIDATION). */
function writeMilestoneFile(base: string, mid: string, suffix: string, content: string): void {
  const dir = join(base, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-${suffix}.md`), content);
}

/** Create a slice directory and return its path. */
function createSliceDir(base: string, mid: string, sid: string): string {
  const dir = join(base, ".gsd", "milestones", mid, "slices", sid);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a slice-level file (e.g. PLAN, RESEARCH, SUMMARY). */
function writeSliceFile(base: string, mid: string, sid: string, suffix: string, content: string): void {
  const dir = join(base, ".gsd", "milestones", mid, "slices", sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-${suffix}.md`), content);
}

/** Write a task PLAN file under slice/tasks/. */
function writeTaskPlanFile(base: string, mid: string, sid: string, tid: string): void {
  const tasksDir = join(base, ".gsd", "milestones", mid, "slices", sid, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, `${tid}-PLAN.md`), `# ${tid} Plan\n\nTask plan content.`);
}

// ─── State & Prefs Builders ───────────────────────────────────────────────────

/** Build a minimal GSDState for a given phase. */
function makeState(phase: GSDState["phase"], overrides: Partial<GSDState> = {}): GSDState {
  return {
    phase,
    activeMilestone: { id: "M001", title: "Test Milestone" },
    activeSlice: { id: "S01", title: "Test Slice" },
    activeTask: { id: "T01", title: "Test Task" },
    recentDecisions: [],
    blockers: [],
    nextAction: "run /gsd auto",
    registry: [{ id: "M001", title: "Test Milestone", status: "active" }],
    requirements: { total: 0, active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0 } as GSDState["requirements"],
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 0, total: 1 },
      tasks: { done: 0, total: 1 },
    },
    ...overrides,
  };
}

/** Build a minimal GSDPreferences object with all dispatch-relevant fields off. */
function makePrefs(overrides: Partial<GSDPreferences> = {}): GSDPreferences {
  return {
    phases: {
      skip_research: false,
      skip_slice_research: false,
      skip_milestone_validation: false,
      skip_reassess: true,
      reassess_after_slice: false,
    },
    uat_dispatch: false,
    gate_evaluation: { enabled: false },
    reactive_execution: { enabled: false, max_parallel: 1, isolation_mode: "same-tree" },
    ...overrides,
  } as GSDPreferences;
}

/** Build a DispatchContext. */
function makeCtx(base: string, state: GSDState, prefs?: GSDPreferences): DispatchContext {
  return {
    basePath: base,
    mid: state.activeMilestone?.id ?? "M001",
    midTitle: state.activeMilestone?.title ?? "Test Milestone",
    state,
    prefs: prefs ?? makePrefs(),
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("dispatch-rules-walkthrough", () => {

  afterEach(() => {
    invalidateAllCaches();
  });

  // ─── Rule registry: names are in order ──────────────────────────────────────

  test("getDispatchRuleNames returns non-empty ordered list", () => {
    const names = getDispatchRuleNames();
    assert.ok(names.length > 0, "should expose at least one dispatch rule");
    assert.ok(names.includes("needs-discussion → discuss-milestone"), "should include needs-discussion rule");
    assert.ok(names.includes("complete → stop"), "should include complete rule");
    const completeIdx = names.indexOf("complete → stop");
    const needsDiscIdx = names.indexOf("needs-discussion → discuss-milestone");
    assert.ok(needsDiscIdx < completeIdx, "needs-discussion rule should appear before complete rule");
  });

  // ─── Phase routing: needs-discussion ────────────────────────────────────────

  test("phase=needs-discussion dispatches discuss-milestone", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createMilestoneDir(base, "M001");
    const ctx = makeCtx(base, makeState("needs-discussion"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "discuss-milestone");
    assert.strictEqual((result as { unitId: string }).unitId, "M001");
  });

  // ─── Phase routing: pre-planning without CONTEXT ────────────────────────────

  test("phase=pre-planning with no CONTEXT file dispatches discuss-milestone", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createMilestoneDir(base, "M001");
    // No CONTEXT file written — path resolver returns null
    const ctx = makeCtx(base, makeState("pre-planning"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "discuss-milestone");
  });

  // ─── Phase routing: pre-planning with CONTEXT but no RESEARCH ────────────────

  test("phase=pre-planning with CONTEXT but no RESEARCH dispatches research-milestone", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    writeMilestoneFile(base, "M001", "CONTEXT", "# Context\nFull context for M001.");
    // No RESEARCH file
    const prefs = makePrefs({ phases: { skip_research: false, skip_slice_research: false, skip_milestone_validation: false, skip_reassess: true } });
    const ctx = makeCtx(base, makeState("pre-planning"), prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "research-milestone");
    assert.strictEqual((result as { unitId: string }).unitId, "M001");
  });

  // ─── Phase routing: pre-planning with CONTEXT + RESEARCH ─────────────────────

  test("phase=pre-planning with CONTEXT and RESEARCH dispatches plan-milestone", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    writeMilestoneFile(base, "M001", "CONTEXT", "# Context\nFull context.");
    writeMilestoneFile(base, "M001", "RESEARCH", "# Research\nResearch findings.");
    const ctx = makeCtx(base, makeState("pre-planning"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "plan-milestone");
  });

  // ─── Phase routing: pre-planning, skip_research=true ─────────────────────────

  test("phase=pre-planning with skip_research=true skips research and dispatches plan-milestone", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    writeMilestoneFile(base, "M001", "CONTEXT", "# Context\nFull context.");
    // No RESEARCH file — but skip_research is true, so it should not dispatch research-milestone
    const prefs = makePrefs({ phases: { skip_research: true, skip_slice_research: false, skip_milestone_validation: false, skip_reassess: true } });
    const ctx = makeCtx(base, makeState("pre-planning"), prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual(
      (result as { unitType: string }).unitType,
      "plan-milestone",
      "skip_research=true must bypass research-milestone and go straight to plan-milestone",
    );
  });

  // ─── Phase routing: planning with no slice RESEARCH (non-S01) ────────────────

  test("phase=planning with no slice RESEARCH on S02 dispatches research-slice", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createSliceDir(base, "M001", "S02");
    // No RESEARCH file under S02 — and no milestone RESEARCH either
    const state = makeState("planning", {
      activeSlice: { id: "S02", title: "Second Slice" },
    });
    const prefs = makePrefs({ phases: { skip_research: false, skip_slice_research: false, skip_milestone_validation: false, skip_reassess: true } });
    const ctx = makeCtx(base, state, prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "research-slice");
    assert.strictEqual((result as { unitId: string }).unitId, "M001/S02");
  });

  // ─── Phase routing: planning → plan-slice (RESEARCH present) ─────────────────

  test("phase=planning with slice RESEARCH dispatches plan-slice", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    writeSliceFile(base, "M001", "S01", "RESEARCH", "# Research\nSlice research done.");
    const ctx = makeCtx(base, makeState("planning"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "plan-slice");
    assert.strictEqual((result as { unitId: string }).unitId, "M001/S01");
  });

  // ─── Phase routing: planning, skip_slice_research=true ───────────────────────

  test("phase=planning with skip_slice_research=true skips research and dispatches plan-slice", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createSliceDir(base, "M001", "S02");
    // No RESEARCH file but skip_slice_research is true
    const state = makeState("planning", {
      activeSlice: { id: "S02", title: "Second Slice" },
    });
    const prefs = makePrefs({ phases: { skip_research: false, skip_slice_research: true, skip_milestone_validation: false, skip_reassess: true } });
    const ctx = makeCtx(base, state, prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual(
      (result as { unitType: string }).unitType,
      "plan-slice",
      "skip_slice_research=true must bypass research-slice",
    );
  });

  // ─── Phase routing: evaluating-gates (gate disabled → skip) ──────────────────

  test("phase=evaluating-gates with gate_evaluation.enabled=false returns skip", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createSliceDir(base, "M001", "S01");
    const prefs = makePrefs({ gate_evaluation: { enabled: false } });
    const ctx = makeCtx(base, makeState("evaluating-gates"), prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "skip", "disabled gate evaluation must return skip action");
  });

  // ─── Phase routing: evaluating-gates (gate enabled, no pending → skip) ───────

  test("phase=evaluating-gates with gate_evaluation.enabled=true and no pending gates returns skip", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createSliceDir(base, "M001", "S01");
    // No DB → getPendingGates returns [] → skip
    const prefs = makePrefs({ gate_evaluation: { enabled: true } });
    const ctx = makeCtx(base, makeState("evaluating-gates"), prefs);
    const result = await resolveDispatch(ctx);

    // No DB available, so getPendingGates returns [] — rule returns skip
    assert.strictEqual(result.action, "skip", "no pending gates with no DB must return skip");
  });

  // ─── Phase routing: replanning-slice ─────────────────────────────────────────

  test("phase=replanning-slice dispatches replan-slice", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createSliceDir(base, "M001", "S01");
    const ctx = makeCtx(base, makeState("replanning-slice"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "replan-slice");
    assert.strictEqual((result as { unitId: string }).unitId, "M001/S01");
  });

  // ─── Phase routing: executing → execute-task ─────────────────────────────────

  test("phase=executing with task PLAN file dispatches execute-task", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    writeTaskPlanFile(base, "M001", "S01", "T01");
    const ctx = makeCtx(base, makeState("executing"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "execute-task");
    assert.strictEqual((result as { unitId: string }).unitId, "M001/S01/T01");
  });

  // ─── Phase routing: executing with missing task PLAN → plan-slice recovery ───

  test("phase=executing with missing task PLAN file dispatches plan-slice recovery", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    // Slice dir exists but no tasks/ directory — no T01-PLAN.md
    createSliceDir(base, "M001", "S01");
    // reactive_execution disabled ensures we hit the recovery rule
    const prefs = makePrefs({ reactive_execution: { enabled: false, max_parallel: 1, isolation_mode: "same-tree" } });
    const ctx = makeCtx(base, makeState("executing"), prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual(
      (result as { unitType: string }).unitType,
      "plan-slice",
      "missing task PLAN must trigger plan-slice recovery dispatch",
    );
    assert.strictEqual((result as { unitId: string }).unitId, "M001/S01");
  });

  // ─── Phase routing: summarizing ───────────────────────────────────────────────

  test("phase=summarizing dispatches complete-slice", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createSliceDir(base, "M001", "S01");
    const ctx = makeCtx(base, makeState("summarizing"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "complete-slice");
    assert.strictEqual((result as { unitId: string }).unitId, "M001/S01");
  });

  // ─── Phase routing: validating-milestone ─────────────────────────────────────

  test("phase=validating-milestone dispatches validate-milestone when no DB and prefs allow", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createMilestoneDir(base, "M001");
    // No DB → findMissingSummaries returns [] (safe to proceed)
    const prefs = makePrefs({ phases: { skip_research: false, skip_slice_research: false, skip_milestone_validation: false, skip_reassess: true } });
    const ctx = makeCtx(base, makeState("validating-milestone"), prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "validate-milestone");
    assert.strictEqual((result as { unitId: string }).unitId, "M001");
  });

  // ─── Phase routing: validating-milestone with skip_milestone_validation ───────

  test("phase=validating-milestone with skip_milestone_validation=true returns skip", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createMilestoneDir(base, "M001");
    const prefs = makePrefs({ phases: { skip_research: false, skip_slice_research: false, skip_milestone_validation: true, skip_reassess: true } });
    const ctx = makeCtx(base, makeState("validating-milestone"), prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "skip", "skip_milestone_validation must return skip action");
  });

  // ─── Phase routing: completing-milestone ─────────────────────────────────────

  test("phase=completing-milestone with pass VALIDATION dispatches complete-milestone", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    // Write a VALIDATION file with pass verdict
    writeMilestoneFile(base, "M001", "VALIDATION", [
      "---",
      "verdict: pass",
      "remediation_round: 0",
      "---",
      "",
      "# Milestone Validation",
      "",
      "All checks passed.",
    ].join("\n"));
    // No DB → findMissingSummaries returns []
    // hasImplementationArtifacts fail-opens to true outside git repo
    const ctx = makeCtx(base, makeState("completing-milestone"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual((result as { unitType: string }).unitType, "complete-milestone");
    assert.strictEqual((result as { unitId: string }).unitId, "M001");
  });

  // ─── Guard: completing-milestone with needs-remediation verdict → stop ────────

  test("phase=completing-milestone with needs-remediation VALIDATION verdict stops with warning", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    writeMilestoneFile(base, "M001", "VALIDATION", [
      "---",
      "verdict: needs-remediation",
      "remediation_round: 1",
      "---",
      "",
      "# Milestone Validation",
      "",
      "Issues found that require remediation.",
    ].join("\n"));
    const ctx = makeCtx(base, makeState("completing-milestone"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "stop");
    assert.strictEqual((result as { level: string }).level, "warning");
    assert.ok(
      (result as { reason: string }).reason.includes("needs-remediation"),
      "stop reason must mention needs-remediation verdict",
    );
  });

  // ─── Phase routing: complete → stop ──────────────────────────────────────────

  test("phase=complete returns stop with info level", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    const ctx = makeCtx(base, makeState("complete"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "stop");
    assert.strictEqual((result as { level: string }).level, "info");
    assert.ok(
      (result as { reason: string }).reason.toLowerCase().includes("complete"),
      "stop reason should mention completion",
    );
  });

  // ─── Failure mode: phase=blocked → stop ──────────────────────────────────────

  test("phase=blocked returns stop action", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    const ctx = makeCtx(base, makeState("blocked"));
    const result = await resolveDispatch(ctx);

    // blocked is an unhandled phase — falls through to the no-match stop
    assert.strictEqual(result.action, "stop");
  });

  // ─── Failure mode: unhandled phase → stop ────────────────────────────────────

  test("unhandled phase returns stop with unhandled message", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    // "paused" is a valid Phase type but has no dispatch rule
    const ctx = makeCtx(base, makeState("paused"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "stop");
    assert.ok(
      (result as { reason: string }).reason.includes("paused"),
      "stop reason must name the unhandled phase",
    );
    assert.strictEqual(
      (result as { matchedRule?: string }).matchedRule,
      "<no-match>",
      "unhandled phase must set matchedRule to <no-match>",
    );
  });

  // ─── Guard: executing with no activeSlice → stop ─────────────────────────────

  test("phase=executing with no activeSlice returns stop with error", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    const state = makeState("executing", { activeSlice: null });
    const ctx = makeCtx(base, state);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "stop");
    assert.strictEqual((result as { level: string }).level, "error");
    assert.ok(
      (result as { reason: string }).reason.includes("M001"),
      "error must name the milestone",
    );
  });

  // ─── Guard: summarizing with no activeSlice → stop ────────────────────────────

  test("phase=summarizing with no activeSlice returns stop with error", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    const state = makeState("summarizing", { activeSlice: null });
    const ctx = makeCtx(base, state);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "stop");
    assert.strictEqual((result as { level: string }).level, "error");
  });

  // ─── Matched rule name is propagated ─────────────────────────────────────────

  test("resolveDispatch sets matchedRule on the returned action", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    createMilestoneDir(base, "M001");
    const ctx = makeCtx(base, makeState("needs-discussion"));
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.ok(
      typeof (result as { matchedRule?: string }).matchedRule === "string",
      "dispatch result must include matchedRule string",
    );
    assert.ok(
      (result as { matchedRule?: string }).matchedRule!.length > 0,
      "matchedRule must be non-empty",
    );
  });

  // ─── Planning with S01 and milestone RESEARCH → plan-slice (S01 skip) ─────────

  test("phase=planning with milestone RESEARCH and active slice=S01 dispatches plan-slice directly", async () => {
    const base = createBase();
    afterEach(() => cleanup(base));

    // Milestone RESEARCH exists AND active slice is S01 — rule skips slice research for S01
    writeMilestoneFile(base, "M001", "RESEARCH", "# Milestone Research\nScope coverage.");
    createSliceDir(base, "M001", "S01");
    // No S01 RESEARCH file — but the rule skips it for S01 when milestone RESEARCH exists
    const prefs = makePrefs({ phases: { skip_research: false, skip_slice_research: false, skip_milestone_validation: false, skip_reassess: true } });
    const state = makeState("planning", { activeSlice: { id: "S01", title: "First Slice" } });
    const ctx = makeCtx(base, state, prefs);
    const result = await resolveDispatch(ctx);

    assert.strictEqual(result.action, "dispatch");
    assert.strictEqual(
      (result as { unitType: string }).unitType,
      "plan-slice",
      "S01 with milestone RESEARCH must skip slice research and dispatch plan-slice",
    );
  });

});
