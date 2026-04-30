// GSD-2 — Deep planning mode dispatch behavior contract.
// Verifies the new deep-mode dispatch rules guard correctly on prefs.planning_depth
// and on artifact presence, and that light mode behavior is unaffected.

import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  DISPATCH_RULES,
  getDeepStageGate,
  hasPendingDeepStage,
  setResearchProjectPromptBuilderForTest,
  type DispatchContext,
} from "../auto-dispatch.ts";
import type { GSDState } from "../types.ts";
import type { GSDPreferences } from "../preferences.ts";

const WORKFLOW_PREFS_RULE_NAME = "deep: pre-planning (no workflow prefs) → workflow-preferences";
const PROJECT_RULE_NAME = "deep: pre-planning (no PROJECT) → discuss-project";
const REQUIREMENTS_RULE_NAME = "deep: pre-planning (no REQUIREMENTS) → discuss-requirements";
const RESEARCH_DECISION_RULE_NAME = "deep: pre-planning (no research decision) → research-decision";
const RESEARCH_PROJECT_RULE_NAME = "deep: pre-planning (research approved, files missing) → research-project";

const VALID_PROJECT_MD = [
  "# Project",
  "",
  "## What This Is",
  "",
  "A test project.",
  "",
  "## Core Value",
  "",
  "Reliable dispatch behavior.",
  "",
  "## Current State",
  "",
  "Tests are exercising deep planning.",
  "",
  "## Architecture / Key Patterns",
  "",
  "Markdown artifacts drive stage gates.",
  "",
  "## Capability Contract",
  "",
  "See `.gsd/REQUIREMENTS.md`.",
  "",
  "## Milestone Sequence",
  "",
  "- [ ] M001: Test — exercise deep planning dispatch",
  "",
].join("\n");

const VALID_REQUIREMENTS_MD = [
  "# Requirements",
  "",
  "## Active",
  "",
  "### R001 — Dispatch valid artifacts",
  "- Class: core-capability",
  "- Status: active",
  "- Description: Valid artifacts allow deep-mode dispatch to advance.",
  "- Why it matters: Stage gates must not stall valid projects.",
  "- Source: test",
  "- Primary owning slice: M001/S01",
  "- Supporting slices: none",
  "- Validation: unmapped",
  "- Notes:",
  "",
  "## Validated",
  "",
  "## Deferred",
  "",
  "## Out of Scope",
  "",
  "## Traceability",
  "",
  "| ID | Class | Status | Primary owner | Supporting | Proof |",
  "|---|---|---|---|---|---|",
  "| R001 | core-capability | active | M001/S01 | none | unmapped |",
  "",
  "## Coverage Summary",
  "",
  "- Active requirements: 1",
  "",
].join("\n");

const TINY_TODO_PROJECT_MD = [
  "# Personal Todo App",
  "",
  "## What This Is",
  "",
  "A personal todo app - static HTML/CSS/JS, no backend, no accounts. Single file, runs in the browser locally or from a file.",
  "",
  "## Core Value",
  "",
  "Fast task capture with minimal friction.",
  "",
  "## Current State",
  "",
  "Greenfield browser-based app. Tasks persist in localStorage.",
  "",
  "## Architecture / Key Patterns",
  "",
  "Pure HTML/CSS/JS, client-only, no build step, no server.",
  "",
  "## Capability Contract",
  "",
  "See `.gsd/REQUIREMENTS.md`.",
  "",
  "## Milestone Sequence",
  "",
  "- [ ] M001: Todo App — build one-page local task capture",
  "",
].join("\n");

const TINY_TODO_REQUIREMENTS_MD = [
  "# Requirements",
  "",
  "## Active",
  "",
  "### R001 — Fast task capture",
  "- Class: primary-user-loop",
  "- Status: active",
  "- Description: User can add a task quickly from the browser.",
  "- Why it matters: This is the core loop.",
  "- Source: user",
  "- Primary owning slice: M001/none yet",
  "- Supporting slices: none",
  "- Validation: Add a task from the page.",
  "- Notes: single file",
  "",
  "### R002 — Task completion with done section",
  "- Class: primary-user-loop",
  "- Status: active",
  "- Description: User can mark a task done and see it in a done section.",
  "- Why it matters: Completion is part of the todo loop.",
  "- Source: user",
  "- Primary owning slice: M001/none yet",
  "- Supporting slices: none",
  "- Validation: Mark a task done from the page.",
  "- Notes: static html",
  "",
  "### R003 — Optional due date on tasks",
  "- Class: core-capability",
  "- Status: active",
  "- Description: User can add an optional due date to a task.",
  "- Why it matters: It adds useful context without priority systems.",
  "- Source: user",
  "- Primary owning slice: M001/none yet",
  "- Supporting slices: none",
  "- Validation: Add a task with a due date.",
  "- Notes: browser-based",
  "",
  "### R004 — Static HTML/CSS/JS, no backend",
  "- Class: constraint",
  "- Status: active",
  "- Description: The app is static HTML/CSS/JS with no backend, no server, and no build step.",
  "- Why it matters: The project must stay tiny and local.",
  "- Source: user",
  "- Primary owning slice: M001/none yet",
  "- Supporting slices: none",
  "- Validation: Open the file directly in a browser.",
  "- Notes: client-only",
  "",
  "### R005 — Tasks persist across page reloads",
  "- Class: continuity",
  "- Status: active",
  "- Description: Tasks persist in localStorage across reloads.",
  "- Why it matters: The app remains useful after the tab closes.",
  "- Source: user",
  "- Primary owning slice: M001/none yet",
  "- Supporting slices: none",
  "- Validation: Reload the page and see saved tasks.",
  "- Notes: localStorage",
  "",
  "## Validated",
  "",
  "## Deferred",
  "",
  "## Out of Scope",
  "",
  "### R006 — No sync or accounts",
  "- Class: anti-feature",
  "- Status: out-of-scope",
  "- Description: The app does not support sync, accounts, or cloud storage.",
  "- Why it matters: Keeps the project local and simple.",
  "- Source: user",
  "- Primary owning slice: none",
  "- Supporting slices: none",
  "- Validation: No account or sync flow exists.",
  "- Notes: no accounts",
  "",
  "## Traceability",
  "",
  "| ID | Class | Status | Primary owner | Supporting | Proof |",
  "|---|---|---|---|---|---|",
  "| R001 | primary-user-loop | active | M001/none yet | none | unmapped |",
  "| R002 | primary-user-loop | active | M001/none yet | none | unmapped |",
  "| R003 | core-capability | active | M001/none yet | none | unmapped |",
  "| R004 | constraint | active | M001/none yet | none | unmapped |",
  "| R005 | continuity | active | M001/none yet | none | unmapped |",
  "| R006 | anti-feature | out-of-scope | none | none | excluded |",
  "",
  "## Coverage Summary",
  "",
  "- Active requirements: 5",
  "",
].join("\n");

function makeIsolatedBase(): string {
  const base = join(tmpdir(), `gsd-deep-planning-${randomUUID()}`);
  mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  return base;
}

function makeIsolatedBaseWithCleanup(t: TestContext): string {
  const base = makeIsolatedBase();
  t.after(() => {
    try {
      rmSync(base, { recursive: true, force: true });
    } catch {}
  });
  return base;
}

function writeValidProject(base: string): void {
  writeFileSync(join(base, ".gsd", "PROJECT.md"), VALID_PROJECT_MD);
}

function writeValidRequirements(base: string): void {
  writeFileSync(join(base, ".gsd", "REQUIREMENTS.md"), VALID_REQUIREMENTS_MD);
}

function writeTinyTodoProject(base: string): void {
  writeFileSync(join(base, ".gsd", "PROJECT.md"), TINY_TODO_PROJECT_MD);
  writeFileSync(join(base, ".gsd", "REQUIREMENTS.md"), TINY_TODO_REQUIREMENTS_MD);
}

function writeCapturedDeepPrefs(base: string): void {
  writeFileSync(
    join(base, ".gsd", "PREFERENCES.md"),
    "---\nplanning_depth: deep\nworkflow_prefs_captured: true\n---\n",
  );
}

function makeCtx(
  basePath: string,
  prefs: GSDPreferences | undefined,
  phase: GSDState["phase"] = "pre-planning",
): DispatchContext {
  const state: GSDState = {
    phase,
    activeMilestone: { id: "M001", title: "Test" },
    activeSlice: null,
    activeTask: null,
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [{ id: "M001", title: "Test", status: "active" }],
  };
  return {
    basePath,
    mid: "M001",
    midTitle: "Test",
    state,
    prefs,
    structuredQuestionsAvailable: "false",
  };
}

function rule(name: string) {
  const r = DISPATCH_RULES.find(x => x.name === name);
  assert.ok(r, `dispatch rule "${name}" must exist`);
  return r!;
}

// ─── workflow-preferences rule ────────────────────────────────────────────

test("Deep mode: workflow-preferences does NOT dispatch in light mode", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const result = await rule(WORKFLOW_PREFS_RULE_NAME).match(makeCtx(base, undefined));
  assert.strictEqual(result, null);
});

test("Deep mode: workflow-preferences captures defaults in-process when PREFERENCES.md missing", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(WORKFLOW_PREFS_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "workflow prefs are written deterministically, not dispatched to an agent");
  const content = readFileSync(join(base, ".gsd", "PREFERENCES.md"), "utf-8");
  assert.match(content, /^workflow_prefs_captured:\s*true\s*$/m);
  assert.match(content, /^commit_policy:\s*per-task\s*$/m);
  assert.ok(existsSync(join(base, ".gsd", "runtime", "research-decision.json")));
});

test("Deep mode: workflow-preferences self-heals PREFERENCES.md when capture marker is missing", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  // Partial PREFERENCES.md (e.g. only planning_depth set) must not falsely
  // suppress the defaults write — the explicit captured marker is required.
  writeFileSync(join(base, ".gsd", "PREFERENCES.md"), "---\nplanning_depth: deep\n---\n");
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(WORKFLOW_PREFS_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null);
  const content = readFileSync(join(base, ".gsd", "PREFERENCES.md"), "utf-8");
  assert.match(content, /^workflow_prefs_captured:\s*true\s*$/m);
  assert.match(content, /^branch_model:\s*single\s*$/m);
});

test("Deep mode: workflow-preferences self-heals malformed frontmatter", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeFileSync(join(base, ".gsd", "PREFERENCES.md"), "---\nthis is not valid yaml: [\n---\n");
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(WORKFLOW_PREFS_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null);
  const content = readFileSync(join(base, ".gsd", "PREFERENCES.md"), "utf-8");
  assert.match(content, /^workflow_prefs_captured:\s*true\s*$/m);
  assert.ok(content.includes("this is not valid yaml"), "malformed original content is preserved as body");
});

test("Deep mode: workflow-preferences does NOT dispatch when PREFERENCES.md has workflow_prefs_captured: true", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeFileSync(
    join(base, ".gsd", "PREFERENCES.md"),
    "---\nplanning_depth: deep\nworkflow_prefs_captured: true\ncommit_policy: per-task\n---\n",
  );
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(WORKFLOW_PREFS_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null);
});

// ─── discuss-project rule ─────────────────────────────────────────────────

test("Deep mode: discuss-project does NOT dispatch when planning_depth is undefined (default light)", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const result = await rule(PROJECT_RULE_NAME).match(makeCtx(base, undefined));
  assert.strictEqual(result, null, "light mode (default) must not fire deep-mode rule");
});

test("Deep mode: discuss-project does NOT dispatch when planning_depth is 'light'", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const prefs = { planning_depth: "light" } as GSDPreferences;
  const result = await rule(PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "explicit light mode must not fire deep-mode rule");
});

test("Deep mode: discuss-project DOES dispatch when planning_depth is 'deep' and PROJECT.md missing", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.ok(result && result.action === "dispatch", "deep mode + missing PROJECT.md must dispatch");
  if (result.action === "dispatch") {
    assert.strictEqual(result.unitType, "discuss-project");
    assert.strictEqual(result.unitId, "PROJECT");
    assert.ok(result.prompt.length > 0, "prompt must be non-empty");
  }
});

test("Deep mode: discuss-project does NOT dispatch when PROJECT.md already exists and is valid", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeValidProject(base);
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "valid PROJECT.md must fall through to next rule");
});

test("Deep mode: discuss-project DOES dispatch when PROJECT.md exists but is invalid", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeFileSync(join(base, ".gsd", "PROJECT.md"), "# Project\n");
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.ok(result && result.action === "dispatch", "invalid PROJECT.md must re-fire discuss-project");
  if (result.action === "dispatch") {
    assert.strictEqual(result.unitType, "discuss-project");
    assert.strictEqual(result.unitId, "PROJECT");
  }
});

test("Deep mode: discuss-project does NOT dispatch in non-pre-planning phases", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(PROJECT_RULE_NAME).match(makeCtx(base, prefs, "executing"));
  assert.strictEqual(result, null, "execution phases must not fire project-level discussion");
});

test("Deep mode: discuss-project DOES dispatch in needs-discussion phase", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(PROJECT_RULE_NAME).match(makeCtx(base, prefs, "needs-discussion"));
  assert.ok(result && result.action === "dispatch", "needs-discussion is a valid entry phase");
});

// ─── discuss-requirements rule ────────────────────────────────────────────

test("Deep mode: discuss-requirements does NOT dispatch in light mode", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const result = await rule(REQUIREMENTS_RULE_NAME).match(makeCtx(base, undefined));
  assert.strictEqual(result, null, "light mode must not fire deep-mode requirements rule");
});

test("Deep mode: discuss-requirements does NOT dispatch when PROJECT.md missing (project rule must run first)", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(REQUIREMENTS_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "PROJECT.md missing — earlier rule handles");
});

test("Deep mode: discuss-requirements DOES dispatch when PROJECT.md exists and REQUIREMENTS.md missing", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeValidProject(base);
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(REQUIREMENTS_RULE_NAME).match(makeCtx(base, prefs));
  assert.ok(result && result.action === "dispatch", "deep mode + PROJECT.md present + REQUIREMENTS.md missing must dispatch");
  if (result.action === "dispatch") {
    assert.strictEqual(result.unitType, "discuss-requirements");
    assert.strictEqual(result.unitId, "REQUIREMENTS");
  }
});

test("Deep mode: discuss-requirements does NOT dispatch when REQUIREMENTS.md already exists and is valid", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeCapturedDeepPrefs(base);
  writeValidProject(base);
  writeValidRequirements(base);
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(REQUIREMENTS_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "valid REQUIREMENTS.md must fall through");
});

test("Deep mode: discuss-requirements DOES dispatch when REQUIREMENTS.md exists but is invalid", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeValidProject(base);
  writeFileSync(join(base, ".gsd", "REQUIREMENTS.md"), "# Requirements\n");
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(REQUIREMENTS_RULE_NAME).match(makeCtx(base, prefs));
  assert.ok(result && result.action === "dispatch", "invalid REQUIREMENTS.md must re-fire discuss-requirements");
  if (result.action === "dispatch") {
    assert.strictEqual(result.unitType, "discuss-requirements");
    assert.strictEqual(result.unitId, "REQUIREMENTS");
  }
});

// ─── research-decision rule ───────────────────────────────────────────────

test("Deep mode: research-decision does NOT dispatch in light mode", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeValidProject(base);
  writeValidRequirements(base);
  const result = await rule(RESEARCH_DECISION_RULE_NAME).match(makeCtx(base, undefined));
  assert.strictEqual(result, null);
});

test("Deep mode: research-decision does NOT dispatch when REQUIREMENTS.md missing", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeValidProject(base);
  // No REQUIREMENTS.md
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_DECISION_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "REQUIREMENTS.md must exist before research decision is asked");
});

test("Deep mode: research-decision does NOT dispatch when marker is missing because default is skip", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeCapturedDeepPrefs(base);
  writeValidProject(base);
  writeValidRequirements(base);
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_DECISION_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null);
  const decision = JSON.parse(readFileSync(join(base, ".gsd", "runtime", "research-decision.json"), "utf-8"));
  assert.equal(decision.decision, "skip");
  assert.equal(decision.source, "workflow-preferences");
  assert.equal(decision.reason, "missing-default-repair");
});

test("Deep mode: research-decision does NOT dispatch when decision marker exists", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeValidProject(base);
  writeValidRequirements(base);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(join(base, ".gsd", "runtime", "research-decision.json"), JSON.stringify({ decision: "skip" }));
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_DECISION_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "decision already recorded — fall through");
});

// ─── research-project rule ────────────────────────────────────────────────

function setupReadyForResearchProject(base: string): void {
  writeCapturedDeepPrefs(base);
  writeValidProject(base);
  writeValidRequirements(base);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "runtime", "research-decision.json"),
    JSON.stringify({ decision: "research", source: "research-decision", decided_at: "2026-04-27T00:00:00Z" }),
  );
}

test("Deep mode: research-project does NOT dispatch in light mode", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  setupReadyForResearchProject(base);
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, undefined));
  assert.strictEqual(result, null);
});

test("Deep mode: research-project does NOT dispatch when decision marker missing", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeValidProject(base);
  writeValidRequirements(base);
  // No decision marker
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null);
});

test("Deep mode: research-project does NOT dispatch when user chose 'skip'", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeValidProject(base);
  writeValidRequirements(base);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(join(base, ".gsd", "runtime", "research-decision.json"), JSON.stringify({ decision: "skip" }));
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "skip decision must short-circuit research-project");
});

test("Deep mode: research-project DOES dispatch when decision is 'research' and research files missing", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  setupReadyForResearchProject(base);
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.ok(result && result.action === "dispatch");
  if (result.action === "dispatch") {
    assert.strictEqual(result.unitType, "research-project");
    assert.strictEqual(result.unitId, "RESEARCH-PROJECT");
  }
  assert.ok(
    existsSync(join(base, ".gsd", "runtime", "research-project-inflight")),
    "dispatch must create the in-flight marker before returning",
  );
});

test("Deep mode: research-project normalizes legacy workflow-defaulted research to skip", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeCapturedDeepPrefs(base);
  writeTinyTodoProject(base);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "runtime", "research-decision.json"),
    JSON.stringify({
      decision: "research",
      decided_at: "2026-04-27T00:00:00Z",
      source: "workflow-preferences",
    }),
  );

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));

  assert.strictEqual(result, null, "tiny project should fall through after rewriting decision to skip");
  assert.equal(
    existsSync(join(base, ".gsd", "runtime", "research-project-inflight")),
    false,
    "fast path must not claim the research-project in-flight marker",
  );

  const decision = JSON.parse(readFileSync(join(base, ".gsd", "runtime", "research-decision.json"), "utf-8"));
  assert.equal(decision.decision, "skip");
  assert.equal(decision.source, "workflow-preferences");
  assert.equal(decision.previous_source, "workflow-preferences");
  assert.equal(decision.reason, "legacy-workflow-research-default");
  assert.equal(getDeepStageGate(prefs, base).status, "complete");
});

test("Deep mode gate ignores stale blockers for legacy workflow-defaulted research", (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeCapturedDeepPrefs(base);
  writeTinyTodoProject(base);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "runtime", "research-decision.json"),
    JSON.stringify({
      decision: "research",
      decided_at: "2026-04-27T00:00:00Z",
      source: "workflow-preferences",
    }),
  );
  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  for (const name of ["STACK", "FEATURES", "ARCHITECTURE", "PITFALLS"]) {
    writeFileSync(join(base, ".gsd", "research", `${name}-BLOCKER.md`), "# blocked\n");
  }

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const gate = getDeepStageGate(prefs, base);

  assert.deepEqual(
    { status: gate.status, stage: gate.stage },
    { status: "complete", stage: null },
    "workflow-defaulted tiny apps should not get trapped by stale research blockers",
  );
  assert.equal(hasPendingDeepStage(prefs, base), false);
  const decision = JSON.parse(readFileSync(join(base, ".gsd", "runtime", "research-decision.json"), "utf-8"));
  assert.equal(decision.decision, "skip");
  assert.equal(decision.source, "workflow-preferences");
  assert.equal(decision.previous_source, "workflow-preferences");
});

test("Deep mode: research-project honors explicit research decisions for tiny static apps", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeCapturedDeepPrefs(base);
  writeTinyTodoProject(base);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "runtime", "research-decision.json"),
    JSON.stringify({ decision: "research", source: "research-decision", decided_at: "2026-04-27T00:00:00Z" }),
  );

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));

  assert.ok(result && result.action === "dispatch", "explicit user-sourced research should still run");
  assert.equal(existsSync(join(base, ".gsd", "runtime", "research-project-inflight")), true);
});

test("Deep mode: research-project does not dispatch non-trivial workflow-defaulted research", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  writeCapturedDeepPrefs(base);
  writeValidProject(base);
  writeValidRequirements(base);
  mkdirSync(join(base, ".gsd", "runtime"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "runtime", "research-decision.json"),
    JSON.stringify({
      decision: "research",
      decided_at: "2026-04-27T00:00:00Z",
      source: "workflow-preferences",
    }),
  );

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));

  assert.equal(result, null);
  assert.equal(existsSync(join(base, ".gsd", "runtime", "research-project-inflight")), false);
  const decision = JSON.parse(readFileSync(join(base, ".gsd", "runtime", "research-decision.json"), "utf-8"));
  assert.equal(decision.decision, "skip");
  assert.equal(decision.reason, "legacy-workflow-research-default");
});

test("Deep mode: research-project clears in-flight marker when prompt assembly fails", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  const restorePromptBuilder = setResearchProjectPromptBuilderForTest(async () => {
    throw new Error("prompt assembly failed");
  });
  t.after(restorePromptBuilder);

  setupReadyForResearchProject(base);
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const markerPath = join(base, ".gsd", "runtime", "research-project-inflight");

  await assert.rejects(
    () => rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs)),
    /prompt assembly failed/,
  );
  assert.strictEqual(existsSync(markerPath), false, "failed prompt assembly must not strand the in-flight marker");
});

test("Deep mode: research-project stops while in-flight marker exists", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  setupReadyForResearchProject(base);
  writeFileSync(join(base, ".gsd", "runtime", "research-project-inflight"), "{}\n");
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.ok(result !== null, "in-flight marker must produce a result");
  assert.strictEqual(result?.action, "stop", "in-flight marker must block dispatch with a stop action");
  assert.strictEqual((result as { action: string; level: string }).level, "info", "in-flight stop must use info level");
  if (result?.action === "stop") {
    assert.match(result.reason, /research-project-inflight/);
  }
});

test("Deep mode: research-project does NOT dispatch when all 4 research files exist", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  setupReadyForResearchProject(base);
  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  for (const name of ["STACK.md", "FEATURES.md", "ARCHITECTURE.md", "PITFALLS.md"]) {
    writeFileSync(join(base, ".gsd", "research", name), "# done\n");
  }
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "all research files present — fall through");
});

test("Deep mode: research-project treats a dimension BLOCKER as terminal", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  setupReadyForResearchProject(base);
  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  for (const name of ["STACK.md", "FEATURES.md", "ARCHITECTURE.md"]) {
    writeFileSync(join(base, ".gsd", "research", name), "# done\n");
  }
  writeFileSync(join(base, ".gsd", "research", "PITFALLS-BLOCKER.md"), "# blocker\n");

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.strictEqual(result, null, "dimension blocker files must satisfy project research");
});

test("Deep mode: research-project stops when every dimension is only a BLOCKER", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  setupReadyForResearchProject(base);
  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  for (const name of ["STACK", "FEATURES", "ARCHITECTURE", "PITFALLS"]) {
    writeFileSync(join(base, ".gsd", "research", `${name}-BLOCKER.md`), "# blocked\n");
  }

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.equal(result?.action, "stop");
  assert.match(result?.action === "stop" ? result.reason : "", /only dimension blocker files/);
});

test("Deep mode: research-project stops on global PROJECT-RESEARCH-BLOCKER", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  setupReadyForResearchProject(base);
  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  writeFileSync(join(base, ".gsd", "research", "PROJECT-RESEARCH-BLOCKER.md"), "# blocked\n");

  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.equal(result?.action, "stop");
  assert.match(result?.action === "stop" ? result.reason : "", /PROJECT-RESEARCH-BLOCKER/);
});

test("Deep mode: research-project DOES dispatch when only 3 of 4 research files exist", async (t) => {
  const base = makeIsolatedBaseWithCleanup(t);

  setupReadyForResearchProject(base);
  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  for (const name of ["STACK.md", "FEATURES.md", "ARCHITECTURE.md"]) {
    writeFileSync(join(base, ".gsd", "research", name), "# done\n");
  }
  // PITFALLS.md missing
  const prefs = { planning_depth: "deep" } as GSDPreferences;
  const result = await rule(RESEARCH_PROJECT_RULE_NAME).match(makeCtx(base, prefs));
  assert.ok(result && result.action === "dispatch", "any missing dimension must trigger re-run");
});

// ─── centralized deep-stage gate ─────────────────────────────────────────

test("Deep mode gate reports the earliest missing section", (t) => {
  const base = makeIsolatedBaseWithCleanup(t);
  const prefs = { planning_depth: "deep" } as GSDPreferences;

  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  for (const name of ["STACK.md", "FEATURES.md", "ARCHITECTURE.md", "PITFALLS.md"]) {
    writeFileSync(join(base, ".gsd", "research", name), "# done\n");
  }

  const gate = getDeepStageGate(prefs, base);
  assert.deepEqual(
    { status: gate.status, stage: gate.stage },
    { status: "pending", stage: "workflow-preferences" },
    "later artifacts must not let the workflow skip the first pending deep section",
  );
  assert.equal(hasPendingDeepStage(prefs, base), true);
});

test("Deep mode gate blocks blocker-only project research", (t) => {
  const base = makeIsolatedBaseWithCleanup(t);
  const prefs = { planning_depth: "deep" } as GSDPreferences;

  writeFileSync(
    join(base, ".gsd", "PREFERENCES.md"),
    "---\nplanning_depth: deep\nworkflow_prefs_captured: true\n---\n",
  );
  setupReadyForResearchProject(base);
  mkdirSync(join(base, ".gsd", "research"), { recursive: true });
  for (const name of ["STACK", "FEATURES", "ARCHITECTURE", "PITFALLS"]) {
    writeFileSync(join(base, ".gsd", "research", `${name}-BLOCKER.md`), "# blocked\n");
  }

  const gate = getDeepStageGate(prefs, base);
  assert.deepEqual(
    { status: gate.status, stage: gate.stage },
    { status: "blocked", stage: "project-research" },
  );
  assert.equal(hasPendingDeepStage(prefs, base), true);
});

test("Deep mode gate passes only after verified project research or explicit skip", (t) => {
  const researchBase = makeIsolatedBaseWithCleanup(t);
  const prefs = { planning_depth: "deep" } as GSDPreferences;

  writeFileSync(
    join(researchBase, ".gsd", "PREFERENCES.md"),
    "---\nplanning_depth: deep\nworkflow_prefs_captured: true\n---\n",
  );
  setupReadyForResearchProject(researchBase);
  mkdirSync(join(researchBase, ".gsd", "research"), { recursive: true });
  for (const name of ["STACK.md", "FEATURES.md", "ARCHITECTURE.md", "PITFALLS.md"]) {
    writeFileSync(join(researchBase, ".gsd", "research", name), "# done\n");
  }
  assert.equal(getDeepStageGate(prefs, researchBase).status, "complete");

  const skipBase = makeIsolatedBaseWithCleanup(t);
  writeFileSync(
    join(skipBase, ".gsd", "PREFERENCES.md"),
    "---\nplanning_depth: deep\nworkflow_prefs_captured: true\n---\n",
  );
  writeValidProject(skipBase);
  writeValidRequirements(skipBase);
  mkdirSync(join(skipBase, ".gsd", "runtime"), { recursive: true });
  writeFileSync(join(skipBase, ".gsd", "runtime", "research-decision.json"), JSON.stringify({ decision: "skip" }));

  assert.equal(getDeepStageGate(prefs, skipBase).status, "complete");
});

// ─── ordering invariant ───────────────────────────────────────────────────

test("Deep mode: deep-mode rules registered in correct order", () => {
  const workflowIdx = DISPATCH_RULES.findIndex(r => r.name === WORKFLOW_PREFS_RULE_NAME);
  const projectIdx = DISPATCH_RULES.findIndex(r => r.name === PROJECT_RULE_NAME);
  const requirementsIdx = DISPATCH_RULES.findIndex(r => r.name === REQUIREMENTS_RULE_NAME);
  const researchDecisionIdx = DISPATCH_RULES.findIndex(r => r.name === RESEARCH_DECISION_RULE_NAME);
  const researchProjectIdx = DISPATCH_RULES.findIndex(r => r.name === RESEARCH_PROJECT_RULE_NAME);
  const milestoneIdx = DISPATCH_RULES.findIndex(r => r.name === "pre-planning (no context) → discuss-milestone");

  assert.ok(workflowIdx >= 0, "workflow-preferences rule must be registered");
  assert.ok(projectIdx >= 0, "project rule must be registered");
  assert.ok(requirementsIdx >= 0, "requirements rule must be registered");
  assert.ok(researchDecisionIdx >= 0, "research-decision rule must be registered");
  assert.ok(researchProjectIdx >= 0, "research-project rule must be registered");
  assert.ok(milestoneIdx >= 0, "milestone rule must be registered");

  // Order: workflow-prefs → discuss-project → discuss-requirements → research-decision → research-project → discuss-milestone
  assert.ok(workflowIdx < projectIdx, "workflow-prefs must fire before discuss-project");
  assert.ok(projectIdx < requirementsIdx, "discuss-project must fire before discuss-requirements");
  assert.ok(requirementsIdx < researchDecisionIdx, "discuss-requirements must fire before research-decision");
  assert.ok(researchDecisionIdx < researchProjectIdx, "research-decision must fire before research-project (gate before action)");
  assert.ok(researchProjectIdx < milestoneIdx, "research-project must fire before discuss-milestone");
});
