import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildHealthLines,
  detectHealthWidgetProjectState,
  type HealthWidgetData,
} from "../health-widget-core.ts";

function makeTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `gsd-health-widget-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function activeData(overrides: Partial<HealthWidgetData> = {}): HealthWidgetData {
  return {
    projectState: "active",
    budgetCeiling: undefined,
    budgetSpent: 0,
    providerIssue: null,
    environmentErrorCount: 0,
    environmentWarningCount: 0,
    lastRefreshed: Date.now(),
    ...overrides,
  };
}

test("detectHealthWidgetProjectState: no .gsd returns none", () => {
  const dir = makeTempDir("none");
  try {
    assert.equal(detectHealthWidgetProjectState(dir), "none");
  } finally {
    cleanup(dir);
  }
});

test("detectHealthWidgetProjectState: bootstrapped .gsd without milestones returns initialized", () => {
  const dir = makeTempDir("initialized");
  try {
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    assert.equal(detectHealthWidgetProjectState(dir), "initialized");
  } finally {
    cleanup(dir);
  }
});

test("detectHealthWidgetProjectState: milestone without metrics returns active", () => {
  const dir = makeTempDir("active");
  try {
    mkdirSync(join(dir, ".gsd", "milestones", "M001"), { recursive: true });
    assert.equal(detectHealthWidgetProjectState(dir), "active");
  } finally {
    cleanup(dir);
  }
});

test("buildHealthLines: none state shows onboarding copy", () => {
  assert.deepEqual(buildHealthLines(activeData({ projectState: "none" })), [
    "  GSD  No project loaded — run /gsd to start",
  ]);
});

test("buildHealthLines: initialized state shows continue setup copy", () => {
  assert.deepEqual(buildHealthLines(activeData({ projectState: "initialized" })), [
    "  GSD  Project initialized — run /gsd to continue setup",
  ]);
});

test("buildHealthLines: active state leads with execution summary", () => {
  const lines = buildHealthLines(activeData({
    executionStatus: "Progressing well",
    executionTarget: "Plan S01",
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 0, total: 3 },
      tasks: { done: 0, total: 5 },
    },
  }));

  assert.equal(lines.length, 2);
  assert.equal(lines[0], "  GSD  Progressing well — Plan S01");
  assert.match(lines[1]!, /Progress: M 0\/1 · S 0\/3 · T 0\/5/);
});

test("buildHealthLines: active state keeps issues secondary", () => {
  const lines = buildHealthLines(activeData({
    executionStatus: "Struggling",
    executionTarget: "Execute T03",
    providerIssue: "✗ Anthropic (Claude) key missing",
    environmentWarningCount: 1,
    budgetSpent: 0.42,
  }));

  assert.equal(lines.length, 2);
  assert.equal(lines[0], "  GSD  Struggling — Execute T03");
  assert.match(lines[1]!, /✗ Anthropic \(Claude\) key missing/);
  assert.match(lines[1]!, /Env: 1 warning/);
  assert.match(lines[1]!, /Spent: 42\.0¢/);
});

test("buildHealthLines: blocked state explains wait reason", () => {
  const lines = buildHealthLines(activeData({
    executionStatus: "Blocked",
    executionTarget: "waiting on unmet deps: M001",
    blocker: "M002 is waiting on unmet deps: M001",
  }));

  assert.equal(lines[0], "  GSD  Blocked — waiting on unmet deps: M001");
});

test("buildHealthLines: paused state can omit secondary line", () => {
  const lines = buildHealthLines(activeData({
    executionStatus: "Paused",
    executionTarget: "waiting to resume",
  }));

  assert.deepEqual(lines, ["  GSD  Paused — waiting to resume"]);
});

test("buildHealthLines: active state with budget ceiling shows percent summary", () => {
  const lines = buildHealthLines(activeData({
    executionStatus: "Progressing well",
    executionTarget: "Plan S01",
    budgetSpent: 2.5,
    budgetCeiling: 10,
  }));
  assert.equal(lines.length, 2);
  assert.match(lines[1]!, /Budget: \$2\.50\/\$10\.00 \(25%\)/);
});

test("detectHealthWidgetProjectState: metrics file alone does not imply project", () => {
  const dir = makeTempDir("metrics-only");
  try {
    mkdirSync(join(dir, ".gsd"), { recursive: true });
    writeFileSync(
      join(dir, ".gsd", "metrics.json"),
      JSON.stringify({ version: 1, projectStartedAt: Date.now(), units: [] }),
      "utf-8",
    );
    assert.equal(detectHealthWidgetProjectState(dir), "initialized");
  } finally {
    cleanup(dir);
  }
});
