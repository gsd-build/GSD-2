/**
 * parallel-research-dispatch.test.ts — behaviour tests for the
 * "planning (multiple slices need research) → parallel-research-slices"
 * dispatch rule and its prompt builder.
 *
 * These tests invoke the real functions (resolveDispatch,
 * buildParallelResearchSlicesPrompt) against on-disk fixtures. They do
 * not read source files and string-match identifiers.
 *
 * See #4784 for why the previous source-grep version of this file was
 * replaced.
 */

// Point GSD_HOME at a throwaway directory *before* the prompt-loader
// module is imported so templates resolve from the in-tree prompts/
// directory instead of a developer's ~/.gsd/ copy (which may be a stale
// cached version from a prior install — see #4784 fallout). Set via
// globalThis assignment + dynamic import so the value is live at the
// top-level of the loader module.
process.env.GSD_HOME = process.env.GSD_HOME_TEST_OVERRIDE
  ?? `/tmp/gsd-test-home-${process.pid}-${Date.now()}`;

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { resolveDispatch } = await import("../auto-dispatch.ts");
const { buildParallelResearchSlicesPrompt } = await import("../auto-prompts.ts");

type DispatchState = Parameters<typeof resolveDispatch>[0]["state"];

function writeRoadmap(
  base: string,
  mid: string,
  slices: Array<{ id: string; title: string; done?: boolean; depends?: string[] }>,
): void {
  const milestoneDir = join(base, ".gsd", "milestones", mid);
  mkdirSync(milestoneDir, { recursive: true });
  const lines = [
    `# ${mid}: Parallel Research Milestone`,
    "",
    "**Vision:** Research-ready slices.",
    "",
    "**Success Criteria:**",
    "- Research all slices",
    "",
    "## Slices",
    "",
  ];
  for (const s of slices) {
    const box = s.done ? "x" : " ";
    const deps = s.depends ? `depends:[${s.depends.join(",")}]` : "depends:[]";
    lines.push(`- [${box}] **${s.id}: ${s.title}** \`risk:low\` \`${deps}\``);
  }
  lines.push("", "## Boundary Map", "");
  writeFileSync(
    join(milestoneDir, `${mid}-ROADMAP.md`),
    lines.join("\n"),
    "utf-8",
  );
}

function baseState(activeSliceId = "S01", activeSliceTitle = "Alpha"): DispatchState {
  return {
    phase: "planning",
    activeMilestone: { id: "M001", title: "Parallel Research Milestone", status: "active" },
    activeSlice: { id: activeSliceId, title: activeSliceTitle },
    activeTask: null,
    registry: [],
    blockers: [],
  } as unknown as DispatchState;
}

describe("parallel-research-slices dispatch rule", () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "parallel-research-"));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("dispatches parallel research when 2+ slices need research", async () => {
    writeRoadmap(base, "M001", [
      { id: "S01", title: "Alpha" },
      { id: "S02", title: "Beta" },
    ]);

    const action = await resolveDispatch({
      basePath: base,
      mid: "M001",
      midTitle: "Parallel Research Milestone",
      state: baseState(),
      prefs: undefined,
    });

    assert.equal(action.action, "dispatch");
    if (action.action === "dispatch") {
      assert.equal(action.unitType, "research-slice");
      assert.equal(action.unitId, "M001/parallel-research");
    }
  });

  test("does not dispatch parallel research with only one ready slice", async () => {
    writeRoadmap(base, "M001", [{ id: "S01", title: "Alpha" }]);

    const action = await resolveDispatch({
      basePath: base,
      mid: "M001",
      midTitle: "Parallel Research Milestone",
      state: baseState(),
      prefs: undefined,
    });

    if (action.action === "dispatch") {
      assert.notEqual(action.unitId, "M001/parallel-research");
    }
  });

  test("does not dispatch parallel research when skip_research is set", async () => {
    writeRoadmap(base, "M001", [
      { id: "S01", title: "Alpha" },
      { id: "S02", title: "Beta" },
    ]);

    const action = await resolveDispatch({
      basePath: base,
      mid: "M001",
      midTitle: "Parallel Research Milestone",
      state: baseState(),
      prefs: { phases: { skip_research: true } } as never,
    });

    if (action.action === "dispatch") {
      assert.notEqual(action.unitId, "M001/parallel-research");
    }
  });

  test("does not dispatch parallel research when skip_slice_research is set", async () => {
    writeRoadmap(base, "M001", [
      { id: "S01", title: "Alpha" },
      { id: "S02", title: "Beta" },
    ]);

    const action = await resolveDispatch({
      basePath: base,
      mid: "M001",
      midTitle: "Parallel Research Milestone",
      state: baseState(),
      prefs: { phases: { skip_slice_research: true } } as never,
    });

    if (action.action === "dispatch") {
      assert.notEqual(action.unitId, "M001/parallel-research");
    }
  });

  test("does not dispatch when a PARALLEL-BLOCKER placeholder exists (#4414)", async () => {
    writeRoadmap(base, "M001", [
      { id: "S01", title: "Alpha" },
      { id: "S02", title: "Beta" },
    ]);
    const milestoneDir = join(base, ".gsd", "milestones", "M001");
    writeFileSync(
      join(milestoneDir, "M001-PARALLEL-BLOCKER.md"),
      "# Parallel research escalated\nPrevious dispatch failed; need per-slice fallback.\n",
      "utf-8",
    );

    const action = await resolveDispatch({
      basePath: base,
      mid: "M001",
      midTitle: "Parallel Research Milestone",
      state: baseState(),
      prefs: undefined,
    });

    if (action.action === "dispatch") {
      assert.notEqual(action.unitId, "M001/parallel-research");
    }
  });

  test("excludes slices that already have a RESEARCH file (falls back to <2)", async () => {
    writeRoadmap(base, "M001", [
      { id: "S01", title: "Alpha" },
      { id: "S02", title: "Beta" },
    ]);
    // S01 already has research → only S02 remains → <2 ready → no parallel dispatch
    const s01Dir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    mkdirSync(s01Dir, { recursive: true });
    writeFileSync(
      join(s01Dir, "S01-RESEARCH.md"),
      "# Research\n",
      "utf-8",
    );

    const action = await resolveDispatch({
      basePath: base,
      mid: "M001",
      midTitle: "Parallel Research Milestone",
      state: baseState(),
      prefs: undefined,
    });

    if (action.action === "dispatch") {
      assert.notEqual(action.unitId, "M001/parallel-research");
    }
  });
});

describe("buildParallelResearchSlicesPrompt", () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "parallel-research-prompt-"));
    mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("renders slice count and every slice title into the prompt", async () => {
    const prompt = await buildParallelResearchSlicesPrompt(
      "M001",
      "Parallel Research Milestone",
      [
        { id: "S01", title: "Alpha slice title" },
        { id: "S02", title: "Beta slice title" },
        { id: "S03", title: "Gamma slice title" },
      ],
      base,
    );

    assert.match(prompt, /3/, "prompt should include slice count 3");
    assert.match(prompt, /Alpha slice title/);
    assert.match(prompt, /Beta slice title/);
    assert.match(prompt, /Gamma slice title/);
  });

  test("#4068: prompt caps subagent retries at one and instructs writing a BLOCKER on second failure", async () => {
    // Regression for infinite-retry loop (#4068 / #4355 / #4570). A correct
    // fix must both cap retries AND instruct the agent to escalate to a
    // BLOCKER note on the second failure.
    const prompt = await buildParallelResearchSlicesPrompt(
      "M001",
      "Parallel Research Milestone",
      [
        { id: "S01", title: "Alpha" },
        { id: "S02", title: "Beta" },
      ],
      base,
    );

    // Cap: the rendered prompt must bound retries. The exact phrasing
    // can drift; the semantic requirement is "retry at most once".
    assert.match(
      prompt,
      /\bonce\b|one retry|retry.{0,30}once/i,
      "rendered prompt should cap retries to one",
    );

    // Escalation: on second failure the agent must write a BLOCKER
    // rather than loop.
    assert.match(
      prompt,
      /blocker/i,
      "rendered prompt should instruct writing a BLOCKER on repeated failure",
    );

    // Anti-pattern: the unbounded "re-run it individually" instruction
    // that caused the original infinite loop must not appear on its own.
    // (It is allowed when paired with a retry bound — e.g.
    // "retry it **once** individually" — so match the unbounded form
    // explicitly.)
    assert.doesNotMatch(
      prompt,
      /re-run it individually(?!.*\bonce\b)/i,
      "rendered prompt must not contain the unbounded re-run instruction",
    );
  });
});
