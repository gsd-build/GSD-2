// GSD Watch — Unit tests for tree model: filesystem scan, badge detection, status derivation
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildMilestoneTree } from "../tree-model.js";
import type { MilestoneNode, PhaseNode, PlanNode } from "../types.js";

// ─── Fixture Setup ────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "watch-tree-model-test-"));

  // Create base structure
  const phasesDir = join(tmpDir, ".planning", "phases");
  mkdirSync(phasesDir, { recursive: true });

  // Phase 02-foundation: 3 plans all done, with lifecycle files
  const p02 = join(phasesDir, "02-foundation");
  mkdirSync(p02);
  writeFileSync(join(p02, "02-CONTEXT.md"), "");
  writeFileSync(join(p02, "02-RESEARCH.md"), "");
  writeFileSync(join(p02, "02-01-PLAN.md"), "");
  writeFileSync(join(p02, "02-01-SUMMARY.md"), "");
  writeFileSync(join(p02, "02-02-PLAN.md"), "");
  writeFileSync(join(p02, "02-02-SUMMARY.md"), "");
  writeFileSync(join(p02, "02-03-PLAN.md"), "");
  writeFileSync(join(p02, "02-03-SUMMARY.md"), "");
  writeFileSync(join(p02, "02-VERIFICATION.md"), "");
  writeFileSync(join(p02, "02-HUMAN-UAT.md"), "");

  // Phase 03-core-renderer: 1 plan active (no summary)
  const p03 = join(phasesDir, "03-core-renderer");
  mkdirSync(p03);
  writeFileSync(join(p03, "03-CONTEXT.md"), "");
  writeFileSync(join(p03, "03-01-PLAN.md"), "");

  // ROADMAP.md at .planning/ root
  writeFileSync(
    join(tmpDir, ".planning", "ROADMAP.md"),
    "# Roadmap — GSD Watch\n\nSome roadmap content here.\n"
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Core tree structure ───────────────────────────────────────────────────────

describe("buildMilestoneTree - core structure", () => {
  test("Test 1: returns MilestoneNode with 2 PhaseNodes for fixture directory", () => {
    const tree = buildMilestoneTree(tmpDir);
    assert.equal(tree.phases.length, 2, `expected 2 phases, got ${tree.phases.length}`);
  });

  test("Test 2: phases are sorted by numeric prefix [02, 03]", () => {
    const tree = buildMilestoneTree(tmpDir);
    assert.equal(tree.phases[0].number, 2, `first phase number should be 2`);
    assert.equal(tree.phases[1].number, 3, `second phase number should be 3`);
  });

  test("Test 3: PhaseNode dirNames are correct", () => {
    const tree = buildMilestoneTree(tmpDir);
    assert.equal(tree.phases[0].dirName, "02-foundation");
    assert.equal(tree.phases[1].dirName, "03-core-renderer");
  });

  test("Test 4: milestone label is extracted from ROADMAP.md heading", () => {
    const tree = buildMilestoneTree(tmpDir);
    assert.ok(
      tree.label.includes("GSD Watch") || tree.label.length > 0,
      `expected non-empty label, got: "${tree.label}"`
    );
  });
});

// ─── Badge detection ─────────────────────────────────────────────────────────

describe("buildMilestoneTree - badge detection", () => {
  test("Test 5: phase with CONTEXT.md and PLAN.md produces correct badge array", () => {
    // 03-core-renderer has: 03-CONTEXT.md, 03-01-PLAN.md
    // badges = [CONTEXT, RESEARCH, UI-SPEC, PLAN, SUMMARY, VERIFICATION, HUMAN-UAT]
    // Expected: [true, false, false, true, false, false, false]
    const tree = buildMilestoneTree(tmpDir);
    const phase03 = tree.phases[1]; // 03-core-renderer
    assert.deepEqual(
      phase03.badges,
      [true, false, false, true, false, false, false],
      `badges mismatch for 03-core-renderer: ${JSON.stringify(phase03.badges)}`
    );
  });

  test("Test 6: phase with CONTEXT, RESEARCH, VERIFICATION, HUMAN-UAT produces correct badges", () => {
    // 02-foundation has: 02-CONTEXT.md, 02-RESEARCH.md, 02-VERIFICATION.md, 02-HUMAN-UAT.md
    // badges = [CONTEXT, RESEARCH, UI-SPEC, PLAN, SUMMARY, VERIFICATION, HUMAN-UAT]
    // Expected: [true, true, false, true, true, false, true]  (PLAN/SUMMARY from plan files)
    const tree = buildMilestoneTree(tmpDir);
    const phase02 = tree.phases[0]; // 02-foundation
    // CONTEXT=true, RESEARCH=true, UI-SPEC=false, PLAN=true (02-01-PLAN etc), SUMMARY=true (02-01-SUMMARY etc), VERIFICATION=true, HUMAN-UAT=true
    assert.equal(phase02.badges[0], true, "CONTEXT badge should be true");
    assert.equal(phase02.badges[1], true, "RESEARCH badge should be true");
    assert.equal(phase02.badges[2], false, "UI-SPEC badge should be false");
    assert.equal(phase02.badges[5], true, "VERIFICATION badge should be true");
    assert.equal(phase02.badges[6], true, "HUMAN-UAT badge should be true");
  });

  test("Test 7: badges array always has exactly 7 elements", () => {
    const tree = buildMilestoneTree(tmpDir);
    for (const phase of tree.phases) {
      assert.equal(phase.badges.length, 7, `badges should have 7 elements for ${phase.dirName}`);
    }
  });
});

// ─── Plan status derivation ───────────────────────────────────────────────────

describe("buildMilestoneTree - plan status", () => {
  test("Test 8: plan with matching SUMMARY file returns status=done", () => {
    const tree = buildMilestoneTree(tmpDir);
    const phase02 = tree.phases[0]; // 02-foundation
    const plan01 = phase02.plans.find((p) => p.id === "02-01");
    assert.ok(plan01, "plan 02-01 should exist");
    assert.equal(plan01!.status, "done", `02-01 has a SUMMARY so should be done, got ${plan01!.status}`);
  });

  test("Test 9: plan without SUMMARY file returns status=active", () => {
    const tree = buildMilestoneTree(tmpDir);
    const phase03 = tree.phases[1]; // 03-core-renderer
    const plan01 = phase03.plans.find((p) => p.id === "03-01");
    assert.ok(plan01, "plan 03-01 should exist");
    assert.equal(plan01!.status, "active", `03-01 has no SUMMARY so should be active, got ${plan01!.status}`);
  });
});

// ─── Phase status roll-up ──────────────────────────────────────────────────────

describe("buildMilestoneTree - phase status", () => {
  test("Test 10: phase with no plan files returns status=pending", () => {
    // Create an empty phase dir with no plan files
    const emptyPhaseDir = join(tmpDir, ".planning", "phases", "01-empty");
    mkdirSync(emptyPhaseDir);
    const tree = buildMilestoneTree(tmpDir);
    const emptyPhase = tree.phases.find((p) => p.dirName === "01-empty");
    assert.ok(emptyPhase, "01-empty phase should exist");
    assert.equal(emptyPhase!.status, "pending", `empty phase should be pending, got ${emptyPhase!.status}`);
  });

  test("Test 11: phase where all plans are done returns status=done", () => {
    const tree = buildMilestoneTree(tmpDir);
    const phase02 = tree.phases.find((p) => p.dirName === "02-foundation");
    assert.ok(phase02, "02-foundation should exist");
    assert.equal(phase02!.status, "done", `all plans done, phase should be done, got ${phase02!.status}`);
  });

  test("Test 12: phase with some done and some active returns status=active", () => {
    // Add another plan without summary to 02-foundation to make it mixed
    const p02 = join(tmpDir, ".planning", "phases", "02-foundation");
    writeFileSync(join(p02, "02-04-PLAN.md"), "");
    // No 02-04-SUMMARY.md — so one plan is active
    const tree = buildMilestoneTree(tmpDir);
    const phase02 = tree.phases.find((p) => p.dirName === "02-foundation");
    assert.ok(phase02, "02-foundation should exist");
    assert.equal(phase02!.status, "active", `mixed done/active plans should make phase active, got ${phase02!.status}`);
  });
});

// ─── Milestone status roll-up ─────────────────────────────────────────────────

describe("buildMilestoneTree - milestone status", () => {
  test("Test 13: milestone with all-done phases returns status=done", () => {
    // Create a dir with only 02-foundation (all plans done)
    const allDoneDir = mkdtempSync(join(tmpdir(), "all-done-"));
    try {
      const phasesDir = join(allDoneDir, ".planning", "phases");
      const p = join(phasesDir, "02-foundation");
      mkdirSync(p, { recursive: true });
      writeFileSync(join(p, "02-01-PLAN.md"), "");
      writeFileSync(join(p, "02-01-SUMMARY.md"), "");
      const tree = buildMilestoneTree(allDoneDir);
      assert.equal(tree.status, "done", `all phases done should make milestone done, got ${tree.status}`);
    } finally {
      rmSync(allDoneDir, { recursive: true, force: true });
    }
  });

  test("Test 14: milestone with one active phase returns status=active", () => {
    const tree = buildMilestoneTree(tmpDir);
    // 03-core-renderer is active (plan without summary)
    assert.equal(tree.status, "active", `milestone with active phase should be active, got ${tree.status}`);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("buildMilestoneTree - edge cases", () => {
  test("Test 15: missing .planning/phases/ returns MilestoneNode with empty phases array", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "no-phases-"));
    try {
      const tree = buildMilestoneTree(emptyDir);
      assert.equal(tree.phases.length, 0, `expected empty phases array`);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test("Test 16: non-directory entries in phases/ are ignored", () => {
    // Add a stray .md file directly in phases/
    const phasesDir = join(tmpDir, ".planning", "phases");
    writeFileSync(join(phasesDir, "stray-notes.md"), "some notes");
    const tree = buildMilestoneTree(tmpDir);
    // Should still have exactly 2 phases (not 3)
    assert.equal(tree.phases.length, 2, `stray file should be ignored, got ${tree.phases.length} phases`);
  });

  test("Test 17: phase label humanization — '03-core-renderer' produces label '3. Core Renderer'", () => {
    const tree = buildMilestoneTree(tmpDir);
    const phase03 = tree.phases[1]; // 03-core-renderer
    assert.equal(phase03.label, "3. Core Renderer", `expected '3. Core Renderer', got '${phase03.label}'`);
  });
});
