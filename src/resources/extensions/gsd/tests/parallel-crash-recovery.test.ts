/**
 * Tests for parallel orchestrator crash recovery.
 *
 * Validates that orchestrator state is persisted to disk and can be
 * restored after a coordinator crash, with PID liveness filtering.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  restoreState,
  resetOrchestrator,
  type PersistedState,
} from "../parallel-orchestrator.ts";
import {
  writeSessionStatus,
  readAllSessionStatuses,
  cleanupStaleSessions,
} from "../session-status-io.ts";
// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-crash-recovery-"));
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  return dir;
}

function stateFilePath(basePath: string): string {
  return join(basePath, ".gsd", "orchestrator.json");
}

function writeStateFile(basePath: string, state: PersistedState): void {
  writeFileSync(stateFilePath(basePath), JSON.stringify(state, null, 2), "utf-8");
}

function makePersistedState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    active: true,
    workers: [],
    totalCost: 0,
    startedAt: Date.now(),
    configSnapshot: { max_workers: 3 },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────


describe('parallel-crash-recovery', () => {
test('Test 1: orchestrator.json round-trips through restoreState (preserves worker fields)', () => {
  const basePath = makeTempDir();
  try {
    // Write a full state file to disk and then exercise the real production
    // restoreState() reader against it. This verifies the persisted file
    // schema (the contract between persistState's writer and the reader)
    // — earlier this test inlined a test-only writer and re-parsed JSON,
    // bypassing production code entirely.
    const state = makePersistedState({
      workers: [
        {
          milestoneId: "M001",
          title: "M001",
          pid: process.pid, // alive — survives restoreState's PID filter
          worktreePath: "/tmp/wt-M001",
          startedAt: Date.now(),
          state: "running",
          cost: 0.15,
        },
      ],
      totalCost: 0.15,
    });
    writeStateFile(basePath, state);

    const restored = restoreState(basePath);
    assert.ok(restored !== null, "restoreState: returns state for live worker");
    assert.deepStrictEqual(restored!.active, true, "active field preserved through round-trip");
    assert.deepStrictEqual(restored!.workers.length, 1, "worker count preserved");
    assert.deepStrictEqual(restored!.workers[0].milestoneId, "M001", "milestoneId preserved");
    assert.deepStrictEqual(restored!.workers[0].cost, 0.15, "cost preserved");
    assert.deepStrictEqual(restored!.totalCost, 0.15, "totalCost preserved");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test('Test 2: restoreState returns null for missing file', () => {
  const basePath = makeTempDir();
  try {
    const result = restoreState(basePath);
    assert.deepStrictEqual(result, null, "restoreState: returns null when no state file");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test('Test 3: restoreState filters dead PIDs', () => {
  const basePath = makeTempDir();
  try {
    // PID 99999999 is almost certainly not alive
    const state = makePersistedState({
      workers: [
        {
          milestoneId: "M001",
          title: "M001",
          pid: 99999999,
          worktreePath: "/tmp/wt-M001",
          startedAt: Date.now(),
          state: "running",
          cost: 0,
        },
        {
          milestoneId: "M002",
          title: "M002",
          pid: 99999998,
          worktreePath: "/tmp/wt-M002",
          startedAt: Date.now(),
          state: "running",
          cost: 0,
        },
      ],
    });
    writeStateFile(basePath, state);

    const result = restoreState(basePath);
    // Both PIDs are dead, so result should be null and file should be cleaned up
    assert.deepStrictEqual(result, null, "restoreState: returns null when all PIDs dead");
    assert.ok(!existsSync(stateFilePath(basePath)), "restoreState: cleans up state file when all dead");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test('Test 4: restoreState keeps alive PIDs', () => {
  const basePath = makeTempDir();
  try {
    // Use current process PID (definitely alive)
    const state = makePersistedState({
      workers: [
        {
          milestoneId: "M001",
          title: "M001",
          pid: process.pid,
          worktreePath: "/tmp/wt-M001",
          startedAt: Date.now(),
          state: "running",
          cost: 0.25,
        },
        {
          milestoneId: "M002",
          title: "M002",
          pid: 99999999, // dead
          worktreePath: "/tmp/wt-M002",
          startedAt: Date.now(),
          state: "running",
          cost: 0,
        },
      ],
      totalCost: 0.25,
    });
    writeStateFile(basePath, state);

    const result = restoreState(basePath);
    assert.ok(result !== null, "restoreState: returns state when alive PID exists");
    assert.deepStrictEqual(result!.workers.length, 1, "restoreState: filters out dead PID");
    assert.deepStrictEqual(result!.workers[0].milestoneId, "M001", "restoreState: keeps alive worker");
    assert.deepStrictEqual(result!.workers[0].pid, process.pid, "restoreState: preserves PID");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test('Test 5: restoreState skips stopped/error workers even with alive PIDs', () => {
  const basePath = makeTempDir();
  try {
    const state = makePersistedState({
      workers: [
        {
          milestoneId: "M001",
          title: "M001",
          pid: process.pid,
          worktreePath: "/tmp/wt-M001",
          startedAt: Date.now(),
          state: "stopped",
          cost: 0.50,
        },
      ],
    });
    writeStateFile(basePath, state);

    const result = restoreState(basePath);
    assert.deepStrictEqual(result, null, "restoreState: skips stopped workers");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test('Test 6: cleanupStaleSessions removes dead-PID sessions and keeps live ones', () => {
  const basePath = makeTempDir();
  try {
    mkdirSync(join(basePath, ".gsd", "parallel"), { recursive: true });

    // Dead PID
    writeSessionStatus(basePath, {
      milestoneId: "M001",
      pid: 99999999,
      state: "running",
      currentUnit: null,
      completedUnits: 3,
      cost: 0.10,
      lastHeartbeat: Date.now(),
      startedAt: Date.now(),
      worktreePath: "/tmp/wt-M001",
    });

    // Live PID (this process)
    writeSessionStatus(basePath, {
      milestoneId: "M002",
      pid: process.pid,
      state: "running",
      currentUnit: null,
      completedUnits: 1,
      cost: 0.05,
      lastHeartbeat: Date.now(),
      startedAt: Date.now(),
      worktreePath: "/tmp/wt-M002",
    });

    const before = readAllSessionStatuses(basePath);
    assert.deepStrictEqual(before.length, 2, "both sessions exist before cleanup");

    // Drive the real production cleanup function. Earlier this test
    // re-implemented the cleanup loop inline (process.kill + remove*) and
    // never exercised cleanupStaleSessions itself — so changes to the
    // production sweep would not have been caught.
    const removed = cleanupStaleSessions(basePath);

    assert.deepStrictEqual(removed, ["M001"], "dead-PID session id is reported as removed");

    const after = readAllSessionStatuses(basePath);
    assert.deepStrictEqual(after.length, 1, "dead session cleaned up");
    assert.deepStrictEqual(after[0].milestoneId, "M002", "alive session remains");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test('Test 7: restoreState handles corrupt JSON gracefully', () => {
  const basePath = makeTempDir();
  try {
    writeFileSync(stateFilePath(basePath), "{ not valid json !!!", "utf-8");
    const result = restoreState(basePath);
    assert.deepStrictEqual(result, null, "restoreState: returns null for corrupt JSON");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

// Clean up module state
resetOrchestrator();

});
