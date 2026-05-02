// GSD-2 + metrics-scope.test.ts: tests for scope-aware metrics variants (C6)

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  initMetrics,
  resetMetrics,
  getLedger,
  snapshotUnitMetrics,
  initMetricsByScope,
  getLedgerByScope,
  resetMetricsByScope,
  snapshotUnitMetricsByScope,
  type MetricsLedger,
  type UnitMetrics,
} from "../metrics.js";
import { createWorkspace, scopeMilestone } from "../workspace.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-metrics-scope-")));
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  return dir;
}

function mockCtx(messages: any[] = []): any {
  const entries = messages.map((msg, i) => ({
    type: "message",
    id: `entry-${i}`,
    parentId: i > 0 ? `entry-${i - 1}` : null,
    timestamp: new Date().toISOString(),
    message: msg,
  }));
  return {
    sessionManager: { getEntries: () => entries },
    model: { id: "test-model" },
  };
}

function assistantMsg(input = 1000, output = 500): any {
  return {
    role: "assistant",
    content: [{ type: "text", text: "done" }],
    usage: {
      input,
      output,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: input + output,
      cost: { total: 0.01 },
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("ByScope variant writes to the same path as legacy variant", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
    resetMetrics();
  });

  afterEach(() => {
    resetMetrics();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("metrics.json written by snapshotUnitMetrics matches path used by snapshotUnitMetricsByScope", () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");

    const ctx = mockCtx([assistantMsg()]);
    const startedAt = Date.now() - 5000;

    // Write via legacy path
    initMetrics(projectDir);
    snapshotUnitMetrics(ctx, "execute-task", "M001/S01/T01", startedAt, "test-model");
    resetMetrics();

    // Read via scope path
    initMetricsByScope(scope);
    const scopedLedger = getLedgerByScope(scope);
    assert.ok(scopedLedger, "scoped ledger should load the same metrics.json");
    assert.equal(scopedLedger!.units.length, 1, "should see the unit written by legacy path");
    assert.equal(scopedLedger!.units[0].id, "M001/S01/T01");
    resetMetricsByScope(scope);
  });

  test("snapshotUnitMetricsByScope writes to the same metrics.json as the legacy path", () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");
    const ctx = mockCtx([assistantMsg()]);
    const startedAt = Date.now() - 5000;

    // Write via scope path (no initMetrics called)
    snapshotUnitMetricsByScope(scope, ctx, "execute-task", "M001/S01/T01", startedAt, "test-model");
    resetMetricsByScope(scope);

    // Read via legacy path
    initMetrics(projectDir);
    const legacyLedger = getLedger();
    assert.ok(legacyLedger, "legacy path should read what the scope variant wrote");
    assert.equal(legacyLedger!.units.length, 1);
    assert.equal(legacyLedger!.units[0].id, "M001/S01/T01");
    resetMetrics();
  });
});

describe("ByScope variant is pinned to scope — cwd-drift does not move write target", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
    resetMetrics();
  });

  afterEach(() => {
    resetMetrics();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("write target is the scope's projectRoot regardless of process.cwd()", () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");
    const ctx = mockCtx([assistantMsg()]);
    const startedAt = Date.now() - 3000;

    // Record projectRoot before writing
    const expectedMetricsPath = join(ws.projectRoot, ".gsd", "metrics.json");

    snapshotUnitMetricsByScope(scope, ctx, "execute-task", "M001/S01/T01", startedAt, "test-model");

    // Verify the file was written to the expected location
    const raw = readFileSync(expectedMetricsPath, "utf-8");
    const parsed: MetricsLedger = JSON.parse(raw);
    assert.equal(parsed.units.length, 1);
    assert.equal(parsed.units[0].id, "M001/S01/T01");

    resetMetricsByScope(scope);
  });

  test("two scopes for different projectRoots write to separate metrics.json files", () => {
    const projectDir2 = makeProjectDir();
    try {
      const ws1 = createWorkspace(projectDir);
      const ws2 = createWorkspace(projectDir2);
      const scope1 = scopeMilestone(ws1, "M001");
      const scope2 = scopeMilestone(ws2, "M002");

      const ctx = mockCtx([assistantMsg()]);
      const startedAt = Date.now() - 3000;

      snapshotUnitMetricsByScope(scope1, ctx, "execute-task", "M001/S01/T01", startedAt, "test-model");
      snapshotUnitMetricsByScope(scope2, ctx, "execute-task", "M002/S01/T01", startedAt, "test-model");

      const metrics1 = JSON.parse(
        readFileSync(join(ws1.projectRoot, ".gsd", "metrics.json"), "utf-8"),
      ) as MetricsLedger;
      const metrics2 = JSON.parse(
        readFileSync(join(ws2.projectRoot, ".gsd", "metrics.json"), "utf-8"),
      ) as MetricsLedger;

      assert.equal(metrics1.units.length, 1);
      assert.equal(metrics1.units[0].id, "M001/S01/T01");
      assert.equal(metrics2.units.length, 1);
      assert.equal(metrics2.units[0].id, "M002/S01/T01");

      resetMetricsByScope(scope1);
      resetMetricsByScope(scope2);
    } finally {
      rmSync(projectDir2, { recursive: true, force: true });
    }
  });
});

describe("ByScope works without calling initMetrics", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
    // Deliberately do NOT call initMetrics / resetMetrics
  });

  afterEach(() => {
    resetMetrics();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("snapshotUnitMetricsByScope succeeds without initMetrics having been called", () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");
    const ctx = mockCtx([assistantMsg()]);

    // Confirm singleton was never initialized
    assert.equal(getLedger(), null, "module singleton should be null — initMetrics was never called");

    const unit = snapshotUnitMetricsByScope(
      scope,
      ctx,
      "execute-task",
      "M001/S01/T01",
      Date.now() - 2000,
      "test-model",
    );
    assert.ok(unit, "snapshotUnitMetricsByScope should return a unit");
    assert.equal(unit!.id, "M001/S01/T01");

    // Verify on disk
    const raw = readFileSync(join(projectDir, ".gsd", "metrics.json"), "utf-8");
    const parsed: MetricsLedger = JSON.parse(raw);
    assert.equal(parsed.units.length, 1);

    resetMetricsByScope(scope);
  });

  test("initMetricsByScope succeeds without initMetrics having been called", () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");

    assert.equal(getLedger(), null);

    initMetricsByScope(scope);
    const l = getLedgerByScope(scope);
    assert.ok(l, "getLedgerByScope should return a ledger after initMetricsByScope");
    assert.equal(l!.version, 1);
    assert.equal(l!.units.length, 0);

    resetMetricsByScope(scope);
  });
});

describe("ByScope atomic write-merge — concurrent writers do not clobber", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
    resetMetrics();
  });

  afterEach(() => {
    resetMetrics();
    rmSync(projectDir, { recursive: true, force: true });
  });

  // Worker script: same lock+merge semantics as saveLedger, written in plain CJS
  // so it can run as a child process without loading the full extension tree.
  const MERGE_WORKER = `
const { openSync, closeSync, unlinkSync, existsSync, readFileSync, mkdirSync, renameSync } = require('node:fs');
const { dirname } = require('node:path');
const { randomBytes } = require('node:crypto');

const metricsPath = process.env.GSD_SCOPE_METRICS_PATH;
const milestoneId = process.env.GSD_SCOPE_MILESTONE_ID;
const lockPath = metricsPath + '.lock';

function acquireLock(lp, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { const fd = openSync(lp, 'wx'); closeSync(fd); return true; }
    catch { const w = Date.now() + Math.min(50, deadline - Date.now()); while (Date.now() < w) {} }
  }
  return false;
}
function releaseLock(lp) { try { unlinkSync(lp); } catch {} }
function saveAtomic(fp, data) {
  mkdirSync(dirname(fp), { recursive: true });
  const tmp = fp + '.tmp.' + randomBytes(4).toString('hex');
  require('node:fs').writeFileSync(tmp, JSON.stringify(data, null, 2) + '\\n', 'utf-8');
  renameSync(tmp, fp);
}
function dedup(units) {
  const m = new Map();
  for (const u of units) {
    const k = u.type + '\\0' + u.id + '\\0' + u.startedAt;
    const e = m.get(k);
    if (!e || u.finishedAt > e.finishedAt) m.set(k, u);
  }
  return Array.from(m.values());
}

const unit = {
  type: 'execute-task', id: milestoneId + '/S01/T01', model: 'test',
  startedAt: 1000, finishedAt: Date.now(),
  tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 },
  cost: 0.001, toolCalls: 0, assistantMessages: 1, userMessages: 1,
};
const workerLedger = { version: 1, projectStartedAt: 1000, units: [unit] };

const acquired = acquireLock(lockPath, 5000);
try {
  let diskUnits = [];
  if (existsSync(metricsPath)) {
    try { const p = JSON.parse(readFileSync(metricsPath, 'utf-8')); if (p && Array.isArray(p.units)) diskUnits = p.units; } catch {}
  }
  saveAtomic(metricsPath, { ...workerLedger, units: dedup([...diskUnits, ...workerLedger.units]) });
} finally {
  if (acquired) releaseLock(lockPath);
}
`;

  function spawnMergeWorker(metricsPath: string, milestoneId: string): void {
    const result = spawnSync(process.execPath, ["-e", MERGE_WORKER], {
      env: {
        ...process.env,
        GSD_SCOPE_METRICS_PATH: metricsPath,
        GSD_SCOPE_MILESTONE_ID: milestoneId,
      },
      encoding: "utf-8",
      timeout: 10_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Worker for ${milestoneId} failed:\n${result.stderr}`);
    }
  }

  test("snapshotUnitMetricsByScope preserves a pre-existing entry written by a concurrent worker", () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M002");
    const metricsPath = join(ws.projectRoot, ".gsd", "metrics.json");

    // Simulate a concurrent worker that already wrote M001's entry to disk
    spawnMergeWorker(metricsPath, "M001");

    // Now write M002 via scope variant — must preserve M001's entry
    const ctx = mockCtx([assistantMsg()]);
    snapshotUnitMetricsByScope(
      scope,
      ctx,
      "execute-task",
      "M002/S01/T01",
      Date.now() - 2000,
      "test-model",
    );

    const raw = readFileSync(metricsPath, "utf-8");
    const parsed: MetricsLedger = JSON.parse(raw);
    assert.equal(parsed.units.length, 2, "both M001 and M002 units must be in metrics.json");

    const ids = parsed.units.map((u: UnitMetrics) => u.id);
    assert.ok(ids.some((id) => id.startsWith("M001")), "M001 unit must be preserved");
    assert.ok(ids.some((id) => id.startsWith("M002")), "M002 unit must be present");

    resetMetricsByScope(scope);
  });

  test("idempotent ByScope snapshot does not duplicate units on disk", () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");
    const ctx = mockCtx([assistantMsg()]);
    const startedAt = Date.now() - 3000;
    const metricsPath = join(ws.projectRoot, ".gsd", "metrics.json");

    // Snapshot twice with same type+id+startedAt
    snapshotUnitMetricsByScope(scope, ctx, "execute-task", "M001/S01/T01", startedAt, "test-model");
    snapshotUnitMetricsByScope(scope, ctx, "execute-task", "M001/S01/T01", startedAt, "test-model");

    const parsed: MetricsLedger = JSON.parse(readFileSync(metricsPath, "utf-8"));
    assert.equal(parsed.units.length, 1, "duplicate snapshots must not create duplicate entries");

    resetMetricsByScope(scope);
  });
});
