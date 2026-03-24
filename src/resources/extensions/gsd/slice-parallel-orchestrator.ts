/**
 * GSD Slice Parallel Orchestrator — Worker lifecycle for parallel slice execution.
 *
 * Manages concurrent slice workers within a single milestone. Each slice
 * worker runs in its own git worktree with GSD_SLICE_LOCK set for isolation.
 * Architecturally mirrors parallel-orchestrator.ts but operates one level down.
 *
 * Workers are spawned as child processes running `gsd --mode json --print "/gsd auto"`.
 * The coordinator monitors them via NDJSON stdout parsing and status files.
 */

import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gsdRoot } from "./paths.js";
import { createWorktree } from "./worktree-manager.js";
import { autoWorktreeBranch } from "./auto-worktree.js";
import { nativeBranchExists } from "./native-git-bridge.js";
import { readIntegrationBranch } from "./git-service.js";
import {
  writeSessionStatus,
  readSessionStatus,
  readAllSessionStatuses,
  removeSessionStatus,
  cleanupStaleSessions,
  type SessionStatus,
} from "./session-status-io.js";
import { writeJsonFileAtomic, loadJsonFileOrNull } from "./json-persistence.js";
import { getErrorMessage } from "./error-utils.js";
import type { SliceParallelConfig } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface SliceWorkerInfo {
  milestoneId: string;
  sliceId: string;
  /** Composite key: "M001-S02" */
  workerId: string;
  pid: number;
  process: ChildProcess | null;
  worktreePath: string;
  startedAt: number;
  state: "running" | "paused" | "stopped" | "error" | "completed";
  completedUnits: number;
  cost: number;
}

export interface SliceOrchestratorState {
  active: boolean;
  milestoneId: string;
  workers: Map<string, SliceWorkerInfo>;
  config: SliceParallelConfig;
  totalCost: number;
  startedAt: number;
}

interface PersistedSliceState {
  active: boolean;
  milestoneId: string;
  workers: Array<Omit<SliceWorkerInfo, "process">>;
  totalCost: number;
  startedAt: number;
}

// ─── Module State ─────────────────────────────────────────────────────────

let sliceState: SliceOrchestratorState | null = null;

// ─── Accessors ────────────────────────────────────────────────────────────

export function isSliceParallelActive(): boolean {
  return sliceState?.active === true;
}

export function getSliceOrchestratorState(): SliceOrchestratorState | null {
  return sliceState;
}

export function getSliceWorkerStatuses(): SliceWorkerInfo[] {
  if (!sliceState) return [];
  return [...sliceState.workers.values()];
}

export function getSliceAggregateCost(): number {
  return sliceState?.totalCost ?? 0;
}

// ─── Worker ID ────────────────────────────────────────────────────────────

function makeWorkerId(milestoneId: string, sliceId: string): string {
  return `${milestoneId}-${sliceId}`;
}

// ─── Persistence ──────────────────────────────────────────────────────────

const SLICE_STATE_FILE = "slice-orchestrator.json";

function stateFilePath(basePath: string): string {
  return join(gsdRoot(basePath), SLICE_STATE_FILE);
}

function isPersistedSliceState(data: unknown): data is PersistedSliceState {
  return data !== null && typeof data === "object" && "milestoneId" in data && "workers" in data;
}

export function persistSliceState(basePath: string): void {
  if (!sliceState) return;
  const persisted: PersistedSliceState = {
    active: sliceState.active,
    milestoneId: sliceState.milestoneId,
    workers: [...sliceState.workers.values()].map(w => ({
      milestoneId: w.milestoneId,
      sliceId: w.sliceId,
      workerId: w.workerId,
      pid: w.pid,
      worktreePath: w.worktreePath,
      startedAt: w.startedAt,
      state: w.state,
      completedUnits: w.completedUnits,
      cost: w.cost,
    })),
    totalCost: sliceState.totalCost,
    startedAt: sliceState.startedAt,
  };
  writeJsonFileAtomic(stateFilePath(basePath), persisted);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function restoreSliceState(basePath: string): PersistedSliceState | null {
  const persisted = loadJsonFileOrNull(stateFilePath(basePath), isPersistedSliceState);
  if (!persisted || !persisted.active) return null;

  // Filter out dead workers
  persisted.workers = persisted.workers.filter(w => {
    if (w.state === "stopped" || w.state === "error" || w.state === "completed") return false;
    return isPidAlive(w.pid);
  });

  if (persisted.workers.length === 0) {
    persisted.active = false;
  }
  return persisted;
}

function removeStateFile(basePath: string): void {
  try {
    const p = stateFilePath(basePath);
    if (existsSync(p)) unlinkSync(p);
  } catch { /* non-fatal */ }
}

// ─── Worktree Creation ────────────────────────────────────────────────────

function createSliceWorktree(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): string {
  const name = makeWorkerId(milestoneId, sliceId);
  const branch = `slice/${milestoneId}/${sliceId}`;
  const branchExists = nativeBranchExists(basePath, branch);

  let info: { name: string; path: string; branch: string; exists: boolean };
  if (branchExists) {
    info = createWorktree(basePath, name, { branch, reuseExistingBranch: true });
  } else {
    const integrationBranch = readIntegrationBranch(basePath, milestoneId) ?? undefined;
    info = createWorktree(basePath, name, { branch, startPoint: integrationBranch });
  }

  return info.path;
}

// ─── GSD Binary Resolution ───────────────────────────────────────────────

function resolveGsdBin(): string | null {
  // GSD_BIN_PATH is set by loader.ts to the absolute path of dist/loader.js
  if (process.env.GSD_BIN_PATH && existsSync(process.env.GSD_BIN_PATH)) {
    return process.env.GSD_BIN_PATH;
  }

  // Fallback: try to find loader.js relative to this file
  let thisDir: string;
  try {
    thisDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    thisDir = process.cwd();
  }
  const candidates = [
    join(thisDir, "..", "..", "..", "loader.js"),
    join(thisDir, "..", "..", "..", "..", "dist", "loader.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

// ─── Worker Spawning ──────────────────────────────────────────────────────

function spawnSliceWorker(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): boolean {
  if (!sliceState) return false;
  const wid = makeWorkerId(milestoneId, sliceId);
  const worker = sliceState.workers.get(wid);
  if (!worker) return false;
  if (worker.process) return true;

  const binPath = resolveGsdBin();
  if (!binPath) return false;

  let child: ChildProcess;
  try {
    child = spawn(process.execPath, [binPath, "--mode", "json", "--print", "/gsd auto"], {
      cwd: worker.worktreePath,
      env: {
        ...process.env,
        GSD_MILESTONE_LOCK: milestoneId,
        GSD_SLICE_LOCK: `${milestoneId}/${sliceId}`,
        GSD_PARALLEL_WORKER: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
  } catch {
    return false;
  }

  child.on("error", () => {
    if (!sliceState) return;
    const w = sliceState.workers.get(wid);
    if (w) w.process = null;
  });

  worker.process = child;
  worker.pid = child.pid ?? 0;

  if (!child.pid) {
    worker.process = null;
    return false;
  }

  // NDJSON stdout monitoring
  if (child.stdout) {
    let buffer = "";
    child.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        processWorkerLine(basePath, wid, line);
      }
    });
    child.stdout.on("close", () => {
      if (buffer.trim()) processWorkerLine(basePath, wid, buffer);
    });
  }

  // Handle process exit
  child.on("exit", (code) => {
    if (!sliceState) return;
    const w = sliceState.workers.get(wid);
    if (w) {
      w.process = null;
      if (w.state === "running") {
        w.state = code === 0 ? "completed" : "error";
      }
      persistSliceState(basePath);
    }
  });

  // Write session status
  writeSessionStatus(basePath, {
    milestoneId: wid, // Use composite ID for slice-level tracking
    pid: worker.pid,
    state: "running",
    currentUnit: null,
    completedUnits: 0,
    cost: 0,
    lastHeartbeat: Date.now(),
    startedAt: worker.startedAt,
    worktreePath: worker.worktreePath,
  });

  return true;
}

function processWorkerLine(basePath: string, workerId: string, line: string): void {
  if (!sliceState) return;
  const worker = sliceState.workers.get(workerId);
  if (!worker) return;

  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const event = JSON.parse(trimmed);
    if (event.type === "message_end") {
      // Extract cost from usage
      const cost = event.usage?.cost?.total ?? 0;
      if (cost > 0) {
        worker.cost += cost;
        sliceState.totalCost += cost;
      }
      // Track completed units (assistant messages)
      if (event.role === "assistant") {
        worker.completedUnits++;
      }
      // Update session status
      writeSessionStatus(basePath, {
        milestoneId: workerId,
        pid: worker.pid,
        state: worker.state === "completed" ? "stopped" : worker.state,
        currentUnit: null,
        completedUnits: worker.completedUnits,
        cost: worker.cost,
        lastHeartbeat: Date.now(),
        startedAt: worker.startedAt,
        worktreePath: worker.worktreePath,
      });
    }
  } catch { /* ignore non-JSON lines */ }
}

// ─── Orchestration ────────────────────────────────────────────────────────

/**
 * Start parallel execution for multiple slices within a milestone.
 */
export function startSliceParallelExecution(
  basePath: string,
  milestoneId: string,
  sliceIds: string[],
  config: SliceParallelConfig,
  distributionConfig?: import("./types.js").WorkDistributionConfig,
): { started: string[]; errors: Array<{ sliceId: string; error: string }> } {
  // If distribution is enabled, enqueue work items instead of direct spawn
  if (distributionConfig?.enabled) {
    try {
      const { enqueue } = require("./work-queue.js") as { enqueue: Function };
      for (let i = 0; i < sliceIds.length; i++) {
        enqueue(basePath, {
          unitType: "execute-slice",
          unitId: `${milestoneId}/${sliceIds[i]}`,
          prompt: "",
          priority: i,
        });
      }
      return { started: sliceIds, errors: [] };
    } catch { /* fall through to direct spawn */ }
  }

  // Limit to configured max
  const toStart = sliceIds.slice(0, config.max_concurrent_slices);

  sliceState = {
    active: true,
    milestoneId,
    workers: new Map(),
    config,
    totalCost: 0,
    startedAt: Date.now(),
  };

  const started: string[] = [];
  const errors: Array<{ sliceId: string; error: string }> = [];

  for (const sid of toStart) {
    const wid = makeWorkerId(milestoneId, sid);
    try {
      let wtPath: string;
      try {
        wtPath = createSliceWorktree(basePath, milestoneId, sid);
      } catch {
        // Fallback: use a placeholder path
        const fallbackDir = join(gsdRoot(basePath), "worktrees", wid);
        mkdirSync(fallbackDir, { recursive: true });
        wtPath = fallbackDir;
      }

      const worker: SliceWorkerInfo = {
        milestoneId,
        sliceId: sid,
        workerId: wid,
        pid: 0,
        process: null,
        worktreePath: wtPath,
        startedAt: Date.now(),
        state: "running",
        completedUnits: 0,
        cost: 0,
      };

      sliceState.workers.set(wid, worker);

      const spawned = spawnSliceWorker(basePath, milestoneId, sid);
      if (!spawned) {
        worker.state = "error";
      }

      started.push(sid);
    } catch (err) {
      errors.push({ sliceId: sid, error: getErrorMessage(err) });
    }
  }

  if (started.length === 0) {
    sliceState.active = false;
  }

  persistSliceState(basePath);
  return { started, errors };
}

/**
 * Stop all slice workers (or a specific one).
 */
export async function stopSliceWorkers(
  basePath: string,
  sliceId?: string,
): Promise<void> {
  if (!sliceState) return;

  const targets = sliceId
    ? [sliceState.workers.get(makeWorkerId(sliceState.milestoneId, sliceId))]
    : [...sliceState.workers.values()];

  for (const worker of targets) {
    if (!worker || worker.state === "stopped" || worker.state === "completed") continue;

    worker.state = "stopped";

    if (worker.process) {
      try { worker.process.kill("SIGTERM"); } catch { /* non-fatal */ }

      // Wait briefly for graceful shutdown
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          if (worker.process) {
            try { worker.process.kill("SIGKILL"); } catch { /* non-fatal */ }
          }
          resolve();
        }, 750);

        worker.process?.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      worker.process = null;
    }

    removeSessionStatus(basePath, worker.workerId);
  }

  // If all workers stopped, deactivate
  const allStopped = [...sliceState.workers.values()].every(
    w => w.state === "stopped" || w.state === "error" || w.state === "completed"
  );
  if (allStopped) {
    sliceState.active = false;
    removeStateFile(basePath);
  } else {
    persistSliceState(basePath);
  }
}

/**
 * Refresh worker statuses from disk and detect stale/dead workers.
 */
export function refreshSliceWorkerStatuses(basePath: string): void {
  if (!sliceState) return;

  // Check each worker's PID liveness
  for (const [wid, worker] of sliceState.workers) {
    if (worker.state !== "running" && worker.state !== "paused") continue;

    if (worker.pid > 0 && !isPidAlive(worker.pid)) {
      worker.state = "error";
      worker.process = null;
    }

    // Read session status file for latest metrics
    const status = readSessionStatus(basePath, wid);
    if (status) {
      worker.completedUnits = status.completedUnits;
      worker.cost = status.cost;
    }
  }

  // Recalculate total cost
  sliceState.totalCost = [...sliceState.workers.values()]
    .reduce((sum, w) => sum + w.cost, 0);

  persistSliceState(basePath);
}

/**
 * Check if all slice workers have completed.
 */
export function allSliceWorkersComplete(): boolean {
  if (!sliceState) return true;
  return [...sliceState.workers.values()].every(
    w => w.state === "completed" || w.state === "stopped" || w.state === "error"
  );
}

/**
 * Get workers that completed successfully.
 */
export function getCompletedSliceWorkers(): SliceWorkerInfo[] {
  if (!sliceState) return [];
  return [...sliceState.workers.values()].filter(w => w.state === "completed");
}

/**
 * Reset the slice orchestrator state (after merge or cleanup).
 */
export function resetSliceOrchestrator(basePath: string): void {
  // Clean up worktrees for all workers
  if (sliceState) {
    for (const worker of sliceState.workers.values()) {
      try {
        const { removeWorktree } = require("./worktree-manager.js") as { removeWorktree: (base: string, name: string) => void };
        removeWorktree(basePath, worker.workerId);
      } catch { /* non-fatal — worktree may already be removed */ }
      // Clean up session status file
      removeSessionStatus(basePath, worker.workerId);
    }
  }
  sliceState = null;
  removeStateFile(basePath);
}
