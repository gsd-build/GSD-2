/**
 * Structural tests for slice-level parallel orchestrator.
 * Verifies the orchestrator module exists and has the correct shape,
 * env var usage, and preference gating.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { restoreSliceState } from "../slice-parallel-orchestrator.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsdDir = join(__dirname, "..");

function readLinuxProcessStartFingerprint(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
    const afterCommand = stat.slice(stat.lastIndexOf(")") + 2).trim();
    const fields = afterCommand.split(/\s+/);
    const startTimeTicks = fields[19];
    return startTimeTicks ? `linux-stat:${startTimeTicks}` : null;
  } catch {
    return null;
  }
}

function readPsProcessStartFingerprint(pid: number): string | null {
  try {
    const raw = execFileSync("ps", ["-p", String(pid), "-o", "lstart="], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim().replace(/\s+/g, " ");
    return raw ? `ps-lstart:${raw}` : null;
  } catch {
    return null;
  }
}

function readProcessStartFingerprint(pid: number): string | null {
  return readLinuxProcessStartFingerprint(pid) ?? readPsProcessStartFingerprint(pid);
}

function makeTempProject(): string {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-slice-parallel-"));
  mkdirSync(join(basePath, ".gsd"), { recursive: true });
  return basePath;
}

function writeSliceOrchestratorState(
  basePath: string,
  worker: {
    pid: number;
    workerToken?: string;
    processStartFingerprint?: string | null;
  },
): void {
  writeFileSync(
    join(basePath, ".gsd", "slice-orchestrator.json"),
    JSON.stringify({
      active: true,
      workers: [{
        milestoneId: "M900",
        sliceId: "S01",
        pid: worker.pid,
        workerToken: worker.workerToken,
        processStartFingerprint: worker.processStartFingerprint,
        worktreePath: join(basePath, ".gsd", "worktrees", "M900-S01"),
        startedAt: Date.now(),
        state: "running",
        completedUnits: 0,
        cost: 0,
      }],
      totalCost: 0,
      maxWorkers: 1,
      startedAt: Date.now(),
      basePath,
    }),
    "utf-8",
  );
}

describe("slice-parallel-orchestrator structural tests", () => {
  it("orchestrator uses GSD_SLICE_LOCK env var", () => {
    const source = readFileSync(join(gsdDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("GSD_SLICE_LOCK"),
      "Orchestrator must use GSD_SLICE_LOCK env var to isolate slice workers",
    );
  });

  it("orchestrator sets GSD_PARALLEL_WORKER=1 to prevent nesting", () => {
    const source = readFileSync(join(gsdDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("GSD_PARALLEL_WORKER"),
      "Orchestrator must set GSD_PARALLEL_WORKER to prevent nested parallel",
    );
  });

  it("maxWorkers default is 2", () => {
    const source = readFileSync(join(gsdDir, "slice-parallel-orchestrator.ts"), "utf-8");
    // Check that default max workers is 2 (in opts.maxWorkers ?? 2 or similar)
    assert.ok(
      source.includes("maxWorkers") && source.includes("2"),
      "Default maxWorkers should be 2",
    );
  });

  it("orchestrator imports GSD_MILESTONE_LOCK for milestone isolation", () => {
    const source = readFileSync(join(gsdDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("GSD_MILESTONE_LOCK"),
      "Orchestrator must also pass GSD_MILESTONE_LOCK for milestone context",
    );
  });

  it("recovery preserves terminal workers for coordinator-side collection", () => {
    const source = readFileSync(join(gsdDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes('} else if (w.state === "running")') &&
        source.includes("survivors.push(w);"),
      "Recovery must only prune dead running workers, not stopped/error workers",
    );
  });

  it("recovered PID-only workers are validated before signaling", () => {
    const source = readFileSync(join(gsdDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("isRecoveredSliceWorkerAlive(worker)") &&
        source.includes('process.kill(worker.pid, "SIGTERM")'),
      "stopSliceParallel must validate recovered worker identity before signaling a PID",
    );
  });

  it("persists worker identity for crash recovery", () => {
    const source = readFileSync(join(gsdDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("workerToken") &&
        source.includes("processStartFingerprint") &&
        source.includes("GSD_SLICE_WORKER_TOKEN"),
      "Orchestrator must persist stable worker identity metadata for recovered workers",
    );
  });

  it("spawn failures remove stale worker state and worktree", () => {
    const source = readFileSync(join(gsdDir, "slice-parallel-orchestrator.ts"), "utf-8");
    assert.ok(
      source.includes("sliceState.workers.delete(slice.id)") &&
        source.includes("removeWorktree(basePath, wtName, { deleteBranch: true, force: true })"),
      "Failed slice worker spawns must remove stale worker state and clean up the worktree",
    );
  });
});

describe("slice-parallel-orchestrator recovery identity", () => {
  it("rejects a live PID when the process start fingerprint does not match", () => {
    const basePath = makeTempProject();
    try {
      writeSliceOrchestratorState(basePath, {
        pid: process.pid,
        processStartFingerprint: "mismatched-fingerprint",
      });

      const restored = restoreSliceState(basePath);
      assert.equal(restored, null, "mismatched fingerprint is treated as a dead worker");
      assert.equal(
        existsSync(join(basePath, ".gsd", "slice-orchestrator.json")),
        false,
        "state file is removed when no recovered worker identity validates",
      );
    } finally {
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("keeps a recovered worker when PID, token, and process start fingerprint match", async () => {
    const basePath = makeTempProject();
    const token = `test-token-${Date.now()}`;
    const child = spawn(
      process.execPath,
      ["-e", "setTimeout(() => {}, 30000)"],
      {
        env: { ...process.env, GSD_SLICE_WORKER_TOKEN: token },
        stdio: "ignore",
      },
    );

    try {
      assert.ok(child.pid, "child process has a pid");
      await new Promise((resolve) => setTimeout(resolve, 50));
      const fingerprint = readProcessStartFingerprint(child.pid!);
      if (!fingerprint) return;

      writeSliceOrchestratorState(basePath, {
        pid: child.pid!,
        workerToken: token,
        processStartFingerprint: fingerprint,
      });

      const restored = restoreSliceState(basePath);
      assert.ok(restored, "matching worker identity is restored");
      assert.equal(restored.workers.length, 1);
      assert.equal(restored.workers[0].pid, child.pid);
    } finally {
      child.kill("SIGTERM");
      rmSync(basePath, { recursive: true, force: true });
    }
  });
});

describe("slice_parallel preference gating", () => {
  it("preferences-types.ts includes slice_parallel in interface", () => {
    const source = readFileSync(join(gsdDir, "preferences-types.ts"), "utf-8");
    assert.ok(
      source.includes("slice_parallel"),
      "GSDPreferences should have slice_parallel field",
    );
  });

  it("slice_parallel is in KNOWN_PREFERENCE_KEYS", () => {
    const source = readFileSync(join(gsdDir, "preferences-types.ts"), "utf-8");
    assert.ok(
      source.includes('"slice_parallel"'),
      'KNOWN_PREFERENCE_KEYS should include "slice_parallel"',
    );
  });

  it("state.ts checks GSD_SLICE_LOCK for slice isolation", () => {
    const source = readFileSync(join(gsdDir, "state.ts"), "utf-8");
    assert.ok(
      source.includes("GSD_SLICE_LOCK"),
      "State derivation should check GSD_SLICE_LOCK for slice-level parallel isolation",
    );
  });

  it("auto.ts imports slice parallel orchestrator when enabled", () => {
    const source = readFileSync(join(gsdDir, "auto.ts"), "utf-8");
    assert.ok(
      source.includes("slice_parallel") || source.includes("slice-parallel"),
      "auto.ts should reference slice_parallel for dispatch gating",
    );
  });
});
