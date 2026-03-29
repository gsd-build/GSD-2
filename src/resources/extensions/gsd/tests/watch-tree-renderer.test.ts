// GSD Watch — Unit tests for tree renderer: layout, badges, width-aware truncation
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@gsd/pi-tui";
import { renderTreeLines } from "../watch/tree-renderer.js";
import type { VisibleNode } from "../watch/tree-renderer.js";
import type { MilestoneNode, PhaseNode, PlanNode } from "../watch/types.js";

// ─── Fixture Data ─────────────────────────────────────────────────────────────

const FIXTURE_MILESTONE: MilestoneNode = {
  label: "GSD Watch",
  status: "active",
  phases: [
    {
      number: 2,
      dirName: "02-foundation",
      label: "2. Foundation",
      status: "done",
      badges: [true, true, false, true, true, true, true],
      plans: [
        { id: "02-01", label: "Plan 01", status: "done", hasSummary: true },
        { id: "02-02", label: "Plan 02", status: "done", hasSummary: true },
        { id: "02-03", label: "Plan 03", status: "done", hasSummary: true },
      ],
    },
    {
      number: 3,
      dirName: "03-core-renderer",
      label: "3. Core Renderer",
      status: "active",
      badges: [true, true, false, false, false, false, false],
      plans: [
        { id: "03-01", label: "Plan 01", status: "active", hasSummary: false },
      ],
    },
  ],
};

const EMPTY_MILESTONE: MilestoneNode = {
  label: "Empty Project",
  status: "pending",
  phases: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("renderTreeLines — box-drawing characters", () => {
  test("Test 1: output contains box-drawing ├── for non-last phase", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    const hasMiddleBox = lines.some((l) => l.includes("├──"));
    assert.ok(hasMiddleBox, `Expected '├──' in output, got:\n${lines.join("\n")}`);
  });

  test("Test 2: output contains box-drawing └── for last phase", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    const hasLastBox = lines.some((l) => l.includes("└──"));
    assert.ok(hasLastBox, `Expected '└──' in output, got:\n${lines.join("\n")}`);
  });

  test("Test 3: last phase uses └── prefix, non-last uses ├──", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    // Find phase lines (they start with ├── or └── directly, not with │)
    const phaseLines = lines.filter((l) => l.startsWith("├──") || l.startsWith("└──"));
    assert.ok(phaseLines.length >= 2, `Expected at least 2 phase lines, got: ${phaseLines.length}`);
    // Last phase line must use └──
    assert.ok(
      phaseLines[phaseLines.length - 1].startsWith("└──"),
      `Expected last phase line to start with '└──', got: ${phaseLines[phaseLines.length - 1]}`
    );
    // Non-last phase lines must use ├──
    for (let i = 0; i < phaseLines.length - 1; i++) {
      assert.ok(
        phaseLines[i].startsWith("├──"),
        `Expected non-last phase line to start with '├──', got: ${phaseLines[i]}`
      );
    }
  });
});

describe("renderTreeLines — status icons", () => {
  test("Test 4: done phase shows ✓ icon", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    const hasDone = lines.some((l) => l.includes("✓"));
    assert.ok(hasDone, `Expected '✓' icon in output, got:\n${lines.join("\n")}`);
  });

  test("Test 5: active node shows ◆ icon", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    const hasActive = lines.some((l) => l.includes("◆"));
    assert.ok(hasActive, `Expected '◆' icon in output, got:\n${lines.join("\n")}`);
  });

  test("Test 6: pending milestone shows ○ icon", () => {
    const { lines } = renderTreeLines(EMPTY_MILESTONE, 80);
    const hasPending = lines.some((l) => l.includes("○"));
    assert.ok(hasPending, `Expected '○' icon in output, got:\n${lines.join("\n")}`);
  });

  test("Test 7: milestone header includes label and status icon", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    assert.ok(lines.length > 0, "Expected at least one line");
    const header = lines[0];
    assert.ok(
      header.includes("GSD Watch"),
      `Expected milestone label in header, got: ${header}`
    );
    assert.ok(
      header.includes("◆"),
      `Expected active icon '◆' in milestone header, got: ${header}`
    );
  });
});

describe("renderTreeLines — badge formatting", () => {
  test("Test 8: badge string for [true,true,false,true,false,false,false] renders as ●●○●○○○", () => {
    // Create a milestone with a single phase with that exact badge pattern
    const milestone: MilestoneNode = {
      label: "Test",
      status: "active",
      phases: [
        {
          number: 1,
          dirName: "01-test",
          label: "1. Test",
          status: "active",
          badges: [true, true, false, true, false, false, false],
          plans: [],
        },
      ],
    };
    const { lines } = renderTreeLines(milestone, 80);
    const phaseLine = lines.find((l) => l.includes("1. Test"));
    assert.ok(phaseLine, "Expected phase line to exist");
    assert.ok(
      phaseLine!.includes("●●○●○○○"),
      `Expected badge string '●●○●○○○' in phase line, got: ${phaseLine}`
    );
  });

  test("Test 9: phase line at width=80 includes badge circles", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    // Phase with done badges should show filled circles
    const foundationLine = lines.find((l) => l.includes("2. Foundation"));
    assert.ok(foundationLine, "Expected Foundation phase line");
    const hasBadge = foundationLine!.includes("●") || foundationLine!.includes("○");
    assert.ok(hasBadge, `Expected badge circles in wide (80) phase line, got: ${foundationLine}`);
  });
});

describe("renderTreeLines — width-aware layout", () => {
  test("Test 10: phase line at width=30 still shows phase name without overflow", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 30);
    for (const line of lines) {
      const w = visibleWidth(line);
      assert.ok(
        w <= 30,
        `Line exceeds width 30 (got ${w}): ${line}`
      );
    }
    // Phase name should still appear
    const hasFoundation = lines.some((l) => l.includes("Foundation") || l.includes("Found"));
    assert.ok(hasFoundation, `Expected phase name in 30-wide output, got:\n${lines.join("\n")}`);
  });

  test("Test 11: phase line at width=20 drops badges, shows truncated name", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 20);
    for (const line of lines) {
      const w = visibleWidth(line);
      assert.ok(
        w <= 20,
        `Line exceeds width 20 (got ${w}): ${line}`
      );
    }
  });

  test("Test 12: no line in output exceeds the specified width", () => {
    const widths = [20, 30, 40, 60, 80, 120];
    for (const width of widths) {
      const { lines } = renderTreeLines(FIXTURE_MILESTONE, width);
      for (const line of lines) {
        const w = visibleWidth(line);
        assert.ok(
          w <= width,
          `Line exceeds width ${width} (got ${w}): ${line}`
        );
      }
    }
  });
});

describe("renderTreeLines — plan indentation", () => {
  test("Test 13: plan lines are indented deeper than phase lines", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    // Phase lines start with ├── or └── (4 chars)
    // Plan lines start with │   ├── or │   └── or     ├── etc (8+ chars)
    const phaseLines = lines.filter((l) => l.startsWith("├──") || l.startsWith("└──"));
    const planLines = lines.filter((l) => l.startsWith("│   ") || l.startsWith("    "));
    assert.ok(planLines.length > 0, "Expected at least one plan line");
    assert.ok(phaseLines.length > 0, "Expected at least one phase line");
    // Plan prefix should be longer than phase prefix
    const phasePrefix = phaseLines[0].match(/^([├└]──\s)/)?.[1] ?? "";
    const planPrefix = planLines[0].match(/^(\s*[│ ]\s*[├└]──\s)/)?.[1] ?? "";
    assert.ok(
      planPrefix.length > phasePrefix.length,
      `Expected plan prefix (${JSON.stringify(planPrefix)}) to be longer than phase prefix (${JSON.stringify(phasePrefix)})`
    );
  });

  test("Test 14: last plan under last phase uses '    └── ' prefix (spaces, not │)", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    // 03-core-renderer is the last phase and has one plan
    // That plan should start with "    └── " (4 spaces + └──)
    const corePlanLine = lines.find((l) => l.startsWith("    └──") && l.includes("Plan 01"));
    assert.ok(
      corePlanLine,
      `Expected last plan under last phase to use '    └──' prefix, lines:\n${lines.join("\n")}`
    );
  });

  test("Test 15: last plan under non-last phase uses '│   └── ' prefix", () => {
    const { lines } = renderTreeLines(FIXTURE_MILESTONE, 80);
    // 02-foundation is a non-last phase; its last plan (Plan 03) should use │   └──
    const foundationLastPlan = lines.find((l) => l.startsWith("│   └──") && l.includes("Plan 03"));
    assert.ok(
      foundationLastPlan,
      `Expected last plan under non-last phase to use '│   └──' prefix, lines:\n${lines.join("\n")}`
    );
  });
});

describe("renderTreeLines — edge cases", () => {
  test("Test 16: empty phases array produces only the milestone header line", () => {
    const { lines } = renderTreeLines(EMPTY_MILESTONE, 80);
    assert.equal(
      lines.length,
      1,
      `Expected exactly 1 line for empty phases, got ${lines.length}: ${lines.join("\n")}`
    );
    assert.ok(
      lines[0].includes("Empty Project"),
      `Expected milestone label in header, got: ${lines[0]}`
    );
  });
});

// ─── New Tests: VisibleNode and collapse ──────────────────────────────────────

describe("renderTreeLines — VisibleNode and collapse", () => {
  test("Test 17: renderTreeLines returns object with lines and nodes arrays of equal length", () => {
    const result = renderTreeLines(FIXTURE_MILESTONE, 80);
    assert.ok(result !== null && typeof result === "object", "Expected object return value");
    assert.ok(Array.isArray(result.lines), "Expected lines to be an array");
    assert.ok(Array.isArray(result.nodes), "Expected nodes to be an array");
    assert.equal(
      result.lines.length,
      result.nodes.length,
      `Expected lines.length (${result.lines.length}) === nodes.length (${result.nodes.length})`
    );
  });

  test("Test 18: first node entry has kind === 'milestone'", () => {
    const { nodes } = renderTreeLines(FIXTURE_MILESTONE, 80);
    assert.ok(nodes.length > 0, "Expected at least one node");
    assert.equal(nodes[0].kind, "milestone", `Expected first node kind to be 'milestone', got '${nodes[0].kind}'`);
  });

  test("Test 19: phase node entries have kind === 'phase' and dirName matching PhaseNode.dirName", () => {
    const { nodes } = renderTreeLines(FIXTURE_MILESTONE, 80);
    const phaseNodes = nodes.filter((n) => n.kind === "phase");
    assert.ok(phaseNodes.length >= 2, `Expected at least 2 phase nodes, got ${phaseNodes.length}`);
    const dirNames = phaseNodes.map((n) => n.dirName);
    assert.ok(dirNames.includes("02-foundation"), `Expected '02-foundation' in phase dirNames: ${JSON.stringify(dirNames)}`);
    assert.ok(dirNames.includes("03-core-renderer"), `Expected '03-core-renderer' in phase dirNames: ${JSON.stringify(dirNames)}`);
  });

  test("Test 20: plan node entries have kind === 'plan' and planId matching PlanNode.id", () => {
    const { nodes } = renderTreeLines(FIXTURE_MILESTONE, 80);
    const planNodes = nodes.filter((n) => n.kind === "plan");
    assert.ok(planNodes.length >= 4, `Expected at least 4 plan nodes, got ${planNodes.length}`);
    const planIds = planNodes.map((n) => n.planId);
    assert.ok(planIds.includes("02-01"), `Expected '02-01' in plan planIds: ${JSON.stringify(planIds)}`);
    assert.ok(planIds.includes("02-02"), `Expected '02-02' in plan planIds: ${JSON.stringify(planIds)}`);
    assert.ok(planIds.includes("02-03"), `Expected '02-03' in plan planIds: ${JSON.stringify(planIds)}`);
    assert.ok(planIds.includes("03-01"), `Expected '03-01' in plan planIds: ${JSON.stringify(planIds)}`);
  });

  test("Test 21: when collapsedPhases contains a phase dirName, that phase's plan lines are omitted from output and nodes array", () => {
    const collapsedPhases = new Set(["02-foundation"]);
    const { lines, nodes } = renderTreeLines(FIXTURE_MILESTONE, 80, collapsedPhases);
    // 02-foundation has 3 plans — they should be gone
    const planNodesFor02 = nodes.filter((n) => n.kind === "plan" && (n.planId === "02-01" || n.planId === "02-02" || n.planId === "02-03"));
    assert.equal(planNodesFor02.length, 0, `Expected 0 plan nodes for 02-foundation when collapsed, got ${planNodesFor02.length}`);
    // Lines also should not contain the plan text
    const hasFoundationPlanLines = lines.some((l) => l.includes("Plan 01") || l.includes("Plan 02") || l.includes("Plan 03"));
    // Note: 03-core-renderer also has a Plan 01, so we need to check node counts instead
    const planNodes02 = nodes.filter((n) => n.planId === "02-01" || n.planId === "02-02" || n.planId === "02-03");
    assert.equal(planNodes02.length, 0, `Expected no plan nodes for collapsed phase 02-foundation`);
  });

  test("Test 22: collapsed phase line contains ' ▸' after badge string (or after name if badges dropped)", () => {
    const collapsedPhases = new Set(["02-foundation"]);
    const { lines, nodes } = renderTreeLines(FIXTURE_MILESTONE, 80, collapsedPhases);
    const phaseLineIdx = nodes.findIndex((n) => n.kind === "phase" && n.dirName === "02-foundation");
    assert.ok(phaseLineIdx >= 0, "Expected to find phase node for 02-foundation");
    const phaseLine = lines[phaseLineIdx];
    assert.ok(
      phaseLine.includes(" ▸"),
      `Expected collapsed phase line to contain ' ▸', got: ${phaseLine}`
    );
  });

  test("Test 23: expanded phase line does NOT contain ' ▸'", () => {
    // Default: no collapsedPhases — all phases expanded
    const { lines, nodes } = renderTreeLines(FIXTURE_MILESTONE, 80);
    const phaseLineIdx = nodes.findIndex((n) => n.kind === "phase" && n.dirName === "02-foundation");
    assert.ok(phaseLineIdx >= 0, "Expected to find phase node for 02-foundation");
    const phaseLine = lines[phaseLineIdx];
    assert.ok(
      !phaseLine.includes(" ▸"),
      `Expected expanded phase line to NOT contain ' ▸', got: ${phaseLine}`
    );
  });

  test("Test 24: with 2 phases (3 plans each), collapsing one reduces lines.length by that phase's plan count", () => {
    const twoPhaseFixture: MilestoneNode = {
      label: "Two Phase Test",
      status: "active",
      phases: [
        {
          number: 1,
          dirName: "01-alpha",
          label: "1. Alpha",
          status: "active",
          badges: [true, false, false, false, false, false, false],
          plans: [
            { id: "01-01", label: "Plan 01", status: "done", hasSummary: true },
            { id: "01-02", label: "Plan 02", status: "done", hasSummary: true },
            { id: "01-03", label: "Plan 03", status: "done", hasSummary: true },
          ],
        },
        {
          number: 2,
          dirName: "02-beta",
          label: "2. Beta",
          status: "pending",
          badges: [false, false, false, false, false, false, false],
          plans: [
            { id: "02-01", label: "Plan 01", status: "pending", hasSummary: false },
            { id: "02-02", label: "Plan 02", status: "pending", hasSummary: false },
            { id: "02-03", label: "Plan 03", status: "pending", hasSummary: false },
          ],
        },
      ],
    };

    const { lines: linesExpanded } = renderTreeLines(twoPhaseFixture, 80);
    const collapsedPhases = new Set(["01-alpha"]);
    const { lines: linesCollapsed } = renderTreeLines(twoPhaseFixture, 80, collapsedPhases);

    // Collapsing 01-alpha (3 plans) should reduce by 3
    assert.equal(
      linesCollapsed.length,
      linesExpanded.length - 3,
      `Expected ${linesExpanded.length - 3} lines when phase with 3 plans collapsed, got ${linesCollapsed.length}`
    );
  });

  test("Test 25: empty collapsedPhases set (default) produces identical lines to pre-change behavior (backward compat)", () => {
    // Call with empty Set explicitly — should match call with no collapsedPhases arg
    const { lines: withEmpty } = renderTreeLines(FIXTURE_MILESTONE, 80, new Set());
    const { lines: withDefault } = renderTreeLines(FIXTURE_MILESTONE, 80);
    assert.deepEqual(withEmpty, withDefault, "Expected empty Set to produce same output as default (no arg)");
  });

  test("Test 26: collapsed phase at narrow width (20) still appends ▸ even when badges are dropped", () => {
    const collapsedPhases = new Set(["02-foundation"]);
    const { lines, nodes } = renderTreeLines(FIXTURE_MILESTONE, 20, collapsedPhases);
    const phaseLineIdx = nodes.findIndex((n) => n.kind === "phase" && n.dirName === "02-foundation");
    assert.ok(phaseLineIdx >= 0, "Expected to find phase node for 02-foundation at narrow width");
    const phaseLine = lines[phaseLineIdx];
    // At width=20, badges are dropped but ▸ must still appear
    assert.ok(
      phaseLine.includes(" ▸"),
      `Expected collapsed phase line to contain ' ▸' even at narrow width, got: ${phaseLine}`
    );
    // And the line must not exceed width
    const w = visibleWidth(phaseLine);
    assert.ok(w <= 20, `Expected line width <= 20, got ${w}: ${phaseLine}`);
  });
});
