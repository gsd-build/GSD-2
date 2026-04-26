/**
 * GSD Slice Parallel Orchestrator — Engine for parallel slice execution
 * within a single milestone.
 *
 * Mirrors the existing parallel-orchestrator.ts pattern at slice scope
 * instead of milestone scope. Workers are separate processes spawned via
 * child_process, each running in its own git worktree with GSD_SLICE_LOCK
 * + GSD_MILESTONE_LOCK env vars set.
 *
 * Key differences from milestone-level parallelism:
 * - Scope: slices within one milestone, not milestones within a project
 * - Lock env: GSD_SLICE_LOCK (in addition to GSD_MILESTONE_LOCK)
 * - Conflict check: file overlap between slice plans (slice-parallel-conflict.ts)
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gsdRoot } from "./paths.js";
import { createWorktree, worktreePath, removeWorktree } from "./worktree-manager.js";
import { autoWorktreeBranch, runWorktreePostCreateHook } from "./auto-worktree.js";
import {
  writeSessionStatus,
  removeSessionStatus,
} from "./session-status-io.js";
import { hasFileConflict } from "./slice-parallel-conflict.js";
import { getErrorMessage } from "./error-utils.js";
import { selectConflictFreeBatch } from "./uok/execution-graph.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SliceWorkerInfo {
  milestoneId: string;
  sliceId: string;
  pid: number;
  workerToken: string;
  processStartFingerprint: string | null;
  process: ChildProcess | null;
  worktreePath: string;
  startedAt: number;
  state: "running" | "stopped" | "error";
  completedUnits: number;
  cost: number;
  cleanup?: () => void;
}

export interface SliceOrchestratorState {
  active: boolean;
  workers: Map<string, SliceWorkerInfo>;
  totalCost: number;
  budgetCeiling?: number;
  maxWorkers: number;
  startedAt: number;
  basePath: string;
}

export interface StartSliceParallelOpts {
  maxWorkers?: number;
  budgetCeiling?: number;
  useExecutionGraph?: boolean;
}

// ─── Module State ──────────────────────────────────────────────────────────

let sliceState: SliceOrchestratorState | null = null;

// ─── Persisted State (crash recovery) ──────────────────────────────────────
//
// Mirrors parallel-orchestrator.ts. Without persistence, a coordinator crash
// leaves orphaned worktrees on disk with no way to detect or clean them up
// on next session start. (Issue #4980 HIGH-8)

const SLICE_ORCHESTRATOR_STATE_FILE = "slice-orchestrator.json";
const TMP_SUFFIX = ".tmp";

interface PersistedSliceWorker {
  milestoneId: string;
  sliceId: string;
  pid: number;
  workerToken?: string;
  processStartFingerprint?: string | null;
  worktreePath: string;
  startedAt: number;
  state: "running" | "stopped" | "error";
  completedUnits: number;
  cost: number;
}

interface PersistedSliceState {
  active: boolean;
  workers: PersistedSliceWorker[];
  totalCost: number;
  budgetCeiling?: number;
  maxWorkers: number;
  startedAt: number;
  basePath: string;
}

function sliceStateFilePath(basePath: string): string {
  return join(gsdRoot(basePath), SLICE_ORCHESTRATOR_STATE_FILE);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}

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
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return readLinuxProcessStartFingerprint(pid) ?? readPsProcessStartFingerprint(pid);
}

function linuxProcessEnvContains(pid: number, key: string, value: string): boolean | null {
  if (process.platform !== "linux") return null;
  try {
    const env = readFileSync(`/proc/${pid}/environ`, "utf-8");
    return env.split("\0").includes(`${key}=${value}`);
  } catch {
    return null;
  }
}

function createWorkerToken(milestoneId: string, sliceId: string): string {
  return `slice:${milestoneId}:${sliceId}:${Date.now()}:${randomUUID()}`;
}

function isRecoveredSliceWorkerAlive(worker: {
  pid: number;
  workerToken?: string;
  processStartFingerprint?: string | null;
}): boolean {
  if (!isPidAlive(worker.pid)) return false;
  if (!worker.processStartFingerprint) return false;

  const currentFingerprint = readProcessStartFingerprint(worker.pid);
  if (!currentFingerprint || currentFingerprint !== worker.processStartFingerprint) {
    return false;
  }

  if (worker.workerToken) {
    const envMatches = linuxProcessEnvContains(
      worker.pid,
      "GSD_SLICE_WORKER_TOKEN",
      worker.workerToken,
    );
    if (envMatches === false) return false;
  }

  return true;
}

/**
 * Persist current slice orchestrator state. Atomic write (tmp + rename) to
 * prevent partial reads if the coordinator dies mid-write.
 */
function persistSliceState(): void {
  if (!sliceState) return;
  try {
    const dir = gsdRoot(sliceState.basePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const persisted: PersistedSliceState = {
      active: sliceState.active,
      workers: [...sliceState.workers.values()].map((w) => ({
        milestoneId: w.milestoneId,
        sliceId: w.sliceId,
        pid: w.pid,
        workerToken: w.workerToken,
        processStartFingerprint: w.processStartFingerprint,
        worktreePath: w.worktreePath,
        startedAt: w.startedAt,
        state: w.state,
        completedUnits: w.completedUnits,
        cost: w.cost,
      })),
      totalCost: sliceState.totalCost,
      budgetCeiling: sliceState.budgetCeiling,
      maxWorkers: sliceState.maxWorkers,
      startedAt: sliceState.startedAt,
      basePath: sliceState.basePath,
    };

    const dest = sliceStateFilePath(sliceState.basePath);
    const tmp = dest + TMP_SUFFIX;
    writeFileSync(tmp, JSON.stringify(persisted, null, 2), "utf-8");
    renameSync(tmp, dest);
    lastPersistTs = Date.now();
  } catch {
    /* non-fatal: persistence is best-effort */
  }
}

/**
 * Throttled wrapper around `persistSliceState`. Skips if the last successful
 * persist was less than `PERSIST_THROTTLE_MS` ago; otherwise persists
 * immediately. Use this on hot paths (e.g. `message_end` events) where we
 * receive many events per second per worker. Terminal events (worker exit,
 * crash, stop) should call `persistSliceState()` directly to guarantee the
 * final state hits disk regardless of timing.
 */
const PERSIST_THROTTLE_MS = 1000;
let lastPersistTs = 0;

function persistSliceStateThrottled(): void {
  if (Date.now() - lastPersistTs < PERSIST_THROTTLE_MS) return;
  persistSliceState();
}

function removeSliceStateFile(basePath: string): void {
  try {
    const p = sliceStateFilePath(basePath);
    if (existsSync(p)) unlinkSync(p);
  } catch {
    /* non-fatal */
  }
}

/**
 * Restore slice orchestrator state from disk. Filters dead-PID workers and
 * removes their orphaned worktrees so a clean restart is possible.
 *
 * Returns null if no state file exists or no workers survive.
 */
export function restoreSliceState(basePath: string): PersistedSliceState | null {
  try {
    const p = sliceStateFilePath(basePath);
    if (!existsSync(p)) return null;
    const persisted = JSON.parse(readFileSync(p, "utf-8")) as PersistedSliceState;

    const survivors: PersistedSliceWorker[] = [];
    const dead: PersistedSliceWorker[] = [];
    for (const w of persisted.workers) {
      if (w.state === "running" && isRecoveredSliceWorkerAlive(w)) {
        survivors.push(w);
      } else if (w.state === "running") {
        dead.push(w);
      } else {
        survivors.push(w);
      }
    }

    // Best-effort cleanup of orphaned worktrees from dead workers.
    for (const w of dead) {
      const wtName = `${w.milestoneId}-${w.sliceId}`;
      try {
        removeWorktree(persisted.basePath, wtName, { deleteBranch: true, force: true });
      } catch {
        /* worktree may already be gone */
      }
    }

    persisted.workers = survivors;

    if (survivors.length === 0) {
      removeSliceStateFile(basePath);
      return null;
    }

    return persisted;
  } catch {
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Check whether slice-level parallel is currently active.
 *
 * If in-memory state is unset but a persisted state file exists with at
 * least one live-PID worker, treat as active and rehydrate so a coordinator
 * crash followed by a fresh process is detectable. (Issue #4980 HIGH-8)
 */
export function isSliceParallelActive(basePath?: string): boolean {
  if (sliceState?.active === true) return true;
  if (!basePath) return false;
  const restored = restoreSliceState(basePath);
  if (!restored || restored.workers.length === 0) return false;

  // Rehydrate in-memory state from disk; processes are detached so we have
  // no ChildProcess handles, only PIDs.
  sliceState = {
    active: restored.active,
    workers: new Map(),
    totalCost: restored.totalCost,
    budgetCeiling: restored.budgetCeiling,
    maxWorkers: restored.maxWorkers,
    startedAt: restored.startedAt,
    basePath: restored.basePath,
  };
  for (const w of restored.workers) {
    sliceState.workers.set(w.sliceId, {
      milestoneId: w.milestoneId,
      sliceId: w.sliceId,
      pid: w.pid,
      process: null,
      worktreePath: w.worktreePath,
      workerToken: w.workerToken ?? "",
      processStartFingerprint: w.processStartFingerprint ?? null,
      startedAt: w.startedAt,
      state: w.state,
      completedUnits: w.completedUnits,
      cost: w.cost,
    });
  }
  return true;
}

/**
 * Get current slice orchestrator state (read-only snapshot).
 */
export function getSliceOrchestratorState(): SliceOrchestratorState | null {
  return sliceState;
}

/**
 * Start parallel execution for eligible slices within a milestone.
 *
 * For each eligible slice: create a worktree, spawn `gsd --mode json --print "/gsd auto"`
 * with env GSD_SLICE_LOCK=<SID> + GSD_MILESTONE_LOCK=<MID> + GSD_PARALLEL_WORKER=1.
 */
export async function startSliceParallel(
  basePath: string,
  milestoneId: string,
  eligibleSlices: Array<{ id: string }>,
  opts: StartSliceParallelOpts = {},
): Promise<{ started: string[]; errors: Array<{ sid: string; error: string }> }> {
  // Prevent nesting: if already a parallel worker, refuse
  if (process.env.GSD_PARALLEL_WORKER) {
    return { started: [], errors: [{ sid: "all", error: "Cannot start slice-parallel from within a parallel worker" }] };
  }

  const maxWorkers = opts.maxWorkers ?? 2;
  const budgetCeiling = opts.budgetCeiling;

  // Initialize orchestrator state
  sliceState = {
    active: true,
    workers: new Map(),
    totalCost: 0,
    budgetCeiling,
    maxWorkers,
    startedAt: Date.now(),
    basePath,
  };

  const started: string[] = [];
  const errors: Array<{ sid: string; error: string }> = [];

  // Filter out conflicting slices (conservative: check all pairs)
  const safeSlices = filterConflictingSlices(
    basePath,
    milestoneId,
    eligibleSlices,
    opts.useExecutionGraph === true,
  );

  // Limit to maxWorkers
  const toSpawn = safeSlices.slice(0, maxWorkers);

  for (const slice of toSpawn) {
    try {
      // Create worktree for this slice
      const wtBranch = `slice/${milestoneId}/${slice.id}`;
      const wtName = `${milestoneId}-${slice.id}`;
      const wtPath = worktreePath(basePath, wtName);

      if (!existsSync(wtPath)) {
        createWorktree(basePath, wtName, { branch: wtBranch });
      }

      // Create worker info
      const worker: SliceWorkerInfo = {
        milestoneId,
        sliceId: slice.id,
        pid: 0,
        workerToken: createWorkerToken(milestoneId, slice.id),
        processStartFingerprint: null,
        process: null,
        worktreePath: wtPath,
        startedAt: Date.now(),
        state: "running",
        completedUnits: 0,
        cost: 0,
      };

      sliceState.workers.set(slice.id, worker);

      // Spawn worker
      const spawned = spawnSliceWorker(basePath, milestoneId, slice.id);
      if (spawned) {
        started.push(slice.id);
      } else {
        errors.push({ sid: slice.id, error: "Failed to spawn worker process" });
        sliceState.workers.delete(slice.id);
        try {
          removeWorktree(basePath, wtName, { deleteBranch: true, force: true });
        } catch { /* ignore cleanup failures */ }
      }
    } catch (err) {
      errors.push({ sid: slice.id, error: getErrorMessage(err) });
      // Best-effort cleanup of partially created worktree
      const wtName = `${milestoneId}-${slice.id}`;
      sliceState.workers.delete(slice.id);
      try {
        removeWorktree(basePath, wtName, { deleteBranch: true, force: true });
      } catch { /* ignore cleanup failures */ }
    }
  }

  // If nothing started, deactivate
  if (started.length === 0) {
    sliceState.active = false;
    removeSliceStateFile(basePath);
  } else {
    // Persist state for crash recovery (Issue #4980 HIGH-8).
    persistSliceState();
  }

  return { started, errors };
}

/**
 * Stop all slice-parallel workers and deactivate.
 */
export function stopSliceParallel(): void {
  if (!sliceState) return;
  const basePath = sliceState.basePath;

  for (const worker of sliceState.workers.values()) {
    try {
      if (worker.process) {
        worker.process.kill("SIGTERM");
      } else if (worker.state === "running" && isRecoveredSliceWorkerAlive(worker)) {
        process.kill(worker.pid, "SIGTERM");
      }
    } catch { /* already dead */ }
    worker.cleanup?.();
    worker.cleanup = undefined;
    worker.process = null;
    worker.state = "stopped";

    // Clean up worktree created for this worker
    const wtName = `${worker.milestoneId}-${worker.sliceId}`;
    try {
      removeWorktree(sliceState.basePath, wtName, { deleteBranch: true, force: true });
    } catch { /* best-effort cleanup */ }
  }

  sliceState.active = false;
  // Clear persisted state — clean shutdown means no recovery on next start.
  // (Issue #4980 HIGH-8)
  removeSliceStateFile(basePath);
}

/**
 * Get aggregate cost across all slice workers.
 */
export function getSliceAggregateCost(): number {
  if (!sliceState) return 0;
  let total = 0;
  for (const w of sliceState.workers.values()) {
    total += w.cost;
  }
  return total;
}

/**
 * Check if budget ceiling has been exceeded.
 */
export function isSliceBudgetExceeded(): boolean {
  if (!sliceState?.budgetCeiling) return false;
  return getSliceAggregateCost() >= sliceState.budgetCeiling;
}

/**
 * Reset module state (for testing).
 */
export function resetSliceOrchestrator(): void {
  if (sliceState) {
    for (const w of sliceState.workers.values()) {
      w.cleanup?.();
    }
  }
  sliceState = null;
  lastPersistTs = 0;
}

// ─── Internal: Conflict Filtering ──────────────────────────────────────────

/**
 * Remove slices that have file conflicts with each other.
 * Greedy: add slices to the safe set in order; skip any that conflict
 * with an already-included slice.
 */
function filterConflictingSlices(
  basePath: string,
  milestoneId: string,
  slices: Array<{ id: string }>,
  useExecutionGraph: boolean,
): Array<{ id: string }> {
  if (useExecutionGraph) {
    const selectedIds = selectConflictFreeBatch({
      orderedIds: slices.map((slice) => slice.id),
      maxParallel: slices.length,
      hasConflict: (candidate, existing) =>
        hasFileConflict(basePath, milestoneId, candidate, existing),
    });
    const selected = new Set(selectedIds);
    return slices.filter((slice) => selected.has(slice.id));
  }

  const safe: Array<{ id: string }> = [];

  for (const candidate of slices) {
    let conflictsWithSafe = false;
    for (const existing of safe) {
      if (hasFileConflict(basePath, milestoneId, candidate.id, existing.id)) {
        conflictsWithSafe = true;
        break;
      }
    }
    if (!conflictsWithSafe) {
      safe.push(candidate);
    }
  }

  return safe;
}

// ─── Internal: Worker Spawning ─────────────────────────────────────────────

/**
 * Resolve the GSD CLI binary path.
 * Same logic as parallel-orchestrator.ts resolveGsdBin().
 */
function resolveGsdBin(): string | null {
  if (process.env.GSD_BIN_PATH && existsSync(process.env.GSD_BIN_PATH)) {
    return process.env.GSD_BIN_PATH;
  }

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

/**
 * Spawn a worker process for a slice.
 * The worker runs `gsd --mode json --print "/gsd auto"` in the slice's worktree
 * with GSD_SLICE_LOCK, GSD_MILESTONE_LOCK, and GSD_PARALLEL_WORKER set.
 */
function spawnSliceWorker(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): boolean {
  if (!sliceState) return false;
  const worker = sliceState.workers.get(sliceId);
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
        GSD_SLICE_LOCK: sliceId,
        GSD_MILESTONE_LOCK: milestoneId,
        GSD_PROJECT_ROOT: basePath,
        GSD_PARALLEL_WORKER: "1",
        GSD_SLICE_WORKER_TOKEN: worker.workerToken,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });
  } catch {
    return false;
  }

  child.on("error", () => {
    if (!sliceState) return;
    const w = sliceState.workers.get(sliceId);
    if (w) {
      w.process = null;
    }
  });

  worker.process = child;
  worker.pid = child.pid ?? 0;
  worker.processStartFingerprint = worker.pid > 0
    ? readProcessStartFingerprint(worker.pid)
    : null;

  if (!child.pid) {
    worker.process = null;
    worker.pid = 0;
    worker.processStartFingerprint = null;
    try { child.kill("SIGTERM"); } catch { /* best-effort */ }
    return false;
  }

  // ── NDJSON stdout monitoring ────────────────────────────────────────
  if (child.stdout) {
    let stdoutBuffer = "";
    child.stdout.on("data", (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        processSliceWorkerLine(basePath, milestoneId, sliceId, line);
      }
    });
    child.stdout.on("close", () => {
      if (stdoutBuffer.trim()) {
        processSliceWorkerLine(basePath, milestoneId, sliceId, stdoutBuffer);
      }
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (data: Buffer) => {
      appendSliceWorkerLog(basePath, milestoneId, sliceId, data.toString());
    });
  }

  // Update session status
  writeSessionStatus(basePath, {
    milestoneId: `${milestoneId}/${sliceId}`,
    pid: worker.pid,
    state: "running",
    currentUnit: null,
    completedUnits: worker.completedUnits,
    cost: worker.cost,
    lastHeartbeat: Date.now(),
    startedAt: worker.startedAt,
    worktreePath: worker.worktreePath,
  });

  // Store cleanup function
  worker.cleanup = () => {
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    child.removeAllListeners();
  };

  // Handle worker exit
  child.on("exit", (code) => {
    if (!sliceState) return;
    const w = sliceState.workers.get(sliceId);
    if (!w) return;

    w.cleanup?.();
    w.cleanup = undefined;
    w.process = null;

    if (w.state === "stopped") return;

    if (code === 0) {
      w.state = "stopped";
    } else {
      w.state = "error";
      appendSliceWorkerLog(basePath, milestoneId, sliceId,
        `\n[slice-orchestrator] worker exited with code ${code ?? "null"}\n`);
    }

    writeSessionStatus(basePath, {
      milestoneId: `${milestoneId}/${sliceId}`,
      pid: w.pid,
      state: w.state,
      currentUnit: null,
      completedUnits: w.completedUnits,
      cost: w.cost,
      lastHeartbeat: Date.now(),
      startedAt: w.startedAt,
      worktreePath: w.worktreePath,
    });

    // Persist worker terminal state for crash recovery.
    // (Issue #4980 HIGH-8)
    persistSliceState();
  });

  return true;
}

// ─── NDJSON Processing ──────────────────────────────────────────────────────

/**
 * Process a single NDJSON line from a slice worker's stdout.
 * Extracts cost from message_end events.
 */
function processSliceWorkerLine(
  _basePath: string,
  _milestoneId: string,
  sliceId: string,
  line: string,
): void {
  if (!line.trim() || !sliceState) return;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }

  const type = String(event.type ?? "");
  if (type === "message_end") {
    const worker = sliceState.workers.get(sliceId);
    if (worker) {
      const usage = event.usage as Record<string, unknown> | undefined;
      if (usage?.cost && typeof usage.cost === "number") {
        worker.cost += usage.cost;
        sliceState.totalCost += usage.cost;
      }
      worker.completedUnits++;
      // Persist cost / progress updates so a crash mid-run preserves them.
      // Throttled (~1/s per process) so high-frequency message_end traffic
      // does not saturate disk I/O. Worker exit / start / stop paths persist
      // unthrottled to guarantee the terminal state lands. (Issue #4980 HIGH-8)
      persistSliceStateThrottled();
    }
  }
}

// ─── Logging ────────────────────────────────────────────────────────────────

function sliceLogDir(basePath: string): string {
  return join(gsdRoot(basePath), "parallel", "slice-logs");
}

function appendSliceWorkerLog(
  basePath: string,
  milestoneId: string,
  sliceId: string,
  text: string,
): void {
  const dir = sliceLogDir(basePath);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${milestoneId}-${sliceId}.log`), text);
}
