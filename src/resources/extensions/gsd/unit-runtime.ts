import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { atomicWriteSync } from "./atomic-write.js";
import {
  gsdRoot,
  relSliceFile,
  relTaskFile,
  resolveSliceFile,
  resolveTaskFile,
} from "./paths.js";
import { loadFile, parseTaskPlanMustHaves, countMustHavesMentionedInSummary } from "./files.js";
import { parseUnitId } from "./unit-id.js";

// Per-record advisory lock — prevents read-modify-write races between
// concurrent writers updating disjoint fields of the same runtime record.
// Within a single Node process this is moot (writeUnitRuntimeRecord is sync),
// but cross-process callers (parallel slice executors, doctor --fix while a
// detached auto-mode session is alive) can otherwise clobber each other.
const RECORD_LOCK_TIMEOUT_MS = 2_000;
const RECORD_LOCK_STALE_MS = 5_000;
const RECORD_LOCK_SLEEP_BUFFER = new SharedArrayBuffer(4);
const RECORD_LOCK_SLEEP_VIEW = new Int32Array(RECORD_LOCK_SLEEP_BUFFER);

function withRecordLock<T>(recordPath: string, fn: () => T): T {
  const lockPath = recordPath + ".lock";
  try {
    mkdirSync(dirname(lockPath), { recursive: true });
  } catch {
    // best-effort
  }
  const deadline = Date.now() + RECORD_LOCK_TIMEOUT_MS;
  while (true) {
    try {
      // O_EXCL atomic create-if-not-exists.
      closeSync(openSync(lockPath, "wx"));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // Existing lock — check for staleness before either waiting or stealing.
      try {
        const stat = statSync(lockPath);
        if (Date.now() - stat.mtimeMs > RECORD_LOCK_STALE_MS) {
          try { unlinkSync(lockPath); } catch { /* race: already removed */ }
          continue;
        }
      } catch {
        // stat failed (file removed between EEXIST and stat) — retry create.
        continue;
      }
      if (Date.now() >= deadline) {
        // Last-resort steal — unlikely in practice but avoids permanent wedge.
        try { unlinkSync(lockPath); } catch { /* race */ }
        continue;
      }
      Atomics.wait(RECORD_LOCK_SLEEP_VIEW, 0, 0, 5);
    }
  }
  try {
    return fn();
  } finally {
    try { unlinkSync(lockPath); } catch { /* best-effort */ }
  }
}

export type UnitRuntimePhase =
  | "dispatched"
  | "wrapup-warning-sent"
  | "timeout"
  | "finalize-timeout"
  | "recovered"
  | "finalized"
  | "paused"
  | "skipped";

export interface ExecuteTaskRecoveryStatus {
  planPath: string;
  summaryPath: string;
  summaryExists: boolean;
  taskChecked: boolean;
  nextActionAdvanced: boolean;
  mustHaveCount: number;
  mustHavesMentionedInSummary: number;
}

export interface AutoUnitRuntimeRecord {
  version: 1;
  unitType: string;
  unitId: string;
  startedAt: number;
  updatedAt: number;
  phase: UnitRuntimePhase;
  wrapupWarningSent: boolean;
  continueHereFired: boolean;
  timeoutAt: number | null;
  lastProgressAt: number;
  progressCount: number;
  lastProgressKind: string;
  recovery?: ExecuteTaskRecoveryStatus;
  recoveryAttempts?: number;
  lastRecoveryReason?: "idle" | "hard";
}

function runtimeDir(basePath: string): string {
  return join(gsdRoot(basePath), "runtime", "units");
}

function runtimePath(basePath: string, unitType: string, unitId: string): string {
  const sanitizedUnitType = unitType.replace(/[\/]/g, "-");
  const sanitizedUnitId = unitId.replace(/[\/]/g, "-");
  return join(runtimeDir(basePath), `${sanitizedUnitType}-${sanitizedUnitId}.json`);
}

export function writeUnitRuntimeRecord(
  basePath: string,
  unitType: string,
  unitId: string,
  startedAt: number,
  updates: Partial<AutoUnitRuntimeRecord> = {},
): AutoUnitRuntimeRecord {
  const path = runtimePath(basePath, unitType, unitId);
  return withRecordLock(path, () => {
    const prev = readUnitRuntimeRecord(basePath, unitType, unitId);
    const next: AutoUnitRuntimeRecord = {
      version: 1,
      unitType,
      unitId,
      startedAt,
      updatedAt: Date.now(),
      phase: updates.phase ?? prev?.phase ?? "dispatched",
      wrapupWarningSent: updates.wrapupWarningSent ?? prev?.wrapupWarningSent ?? false,
      continueHereFired: updates.continueHereFired ?? prev?.continueHereFired ?? false,
      timeoutAt: updates.timeoutAt ?? prev?.timeoutAt ?? null,
      lastProgressAt: updates.lastProgressAt ?? prev?.lastProgressAt ?? Date.now(),
      progressCount: updates.progressCount ?? prev?.progressCount ?? 0,
      lastProgressKind: updates.lastProgressKind ?? prev?.lastProgressKind ?? "dispatch",
      recovery: updates.recovery ?? prev?.recovery,
      recoveryAttempts: updates.recoveryAttempts ?? prev?.recoveryAttempts ?? 0,
      lastRecoveryReason: updates.lastRecoveryReason ?? prev?.lastRecoveryReason,
    };
    atomicWriteSync(path, JSON.stringify(next, null, 2) + "\n", "utf-8");
    return next;
  });
}

export function readUnitRuntimeRecord(basePath: string, unitType: string, unitId: string): AutoUnitRuntimeRecord | null {
  const path = runtimePath(basePath, unitType, unitId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AutoUnitRuntimeRecord;
  } catch {
    return null;
  }
}

export function clearUnitRuntimeRecord(basePath: string, unitType: string, unitId: string): void {
  const path = runtimePath(basePath, unitType, unitId);
  if (existsSync(path)) unlinkSync(path);
}

/**
 * Return all runtime records currently on disk for `basePath`.
 * Returns an empty array if the runtime directory does not exist.
 */
export function listUnitRuntimeRecords(basePath: string): AutoUnitRuntimeRecord[] {
  const dir = runtimeDir(basePath);
  if (!existsSync(dir)) return [];
  const results: AutoUnitRuntimeRecord[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync(join(dir, file), "utf-8");
      const record = JSON.parse(raw) as AutoUnitRuntimeRecord;
      results.push(record);
    } catch {
      // Skip malformed files
    }
  }
  return results;
}

export async function inspectExecuteTaskDurability(
  basePath: string,
  unitId: string,
): Promise<ExecuteTaskRecoveryStatus | null> {
  const { milestone: mid, slice: sid, task: tid } = parseUnitId(unitId);
  if (!mid || !sid || !tid) return null;

  const planAbs = resolveSliceFile(basePath, mid, sid, "PLAN");
  const summaryAbs = resolveTaskFile(basePath, mid, sid, tid, "SUMMARY");
  const stateAbs = join(gsdRoot(basePath), "STATE.md");

  const planPath = relSliceFile(basePath, mid, sid, "PLAN");
  const summaryPath = relTaskFile(basePath, mid, sid, tid, "SUMMARY");

  const planContent = planAbs ? await loadFile(planAbs) : null;
  const stateContent = existsSync(stateAbs) ? readFileSync(stateAbs, "utf-8") : "";
  const summaryExists = !!(summaryAbs && existsSync(summaryAbs));

  const escapedTid = tid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const taskChecked = !!planContent && new RegExp(`^- \\[[xX]\\] \\*\\*${escapedTid}:`, "m").test(planContent);
  const nextActionAdvanced = !new RegExp(`Execute ${tid}\\b`).test(stateContent);

  // Must-have coverage: load task plan and count mentions in summary
  let mustHaveCount = 0;
  let mustHavesMentionedInSummary = 0;

  const taskPlanAbs = resolveTaskFile(basePath, mid, sid, tid, "PLAN");
  if (taskPlanAbs) {
    const taskPlanContent = await loadFile(taskPlanAbs);
    if (taskPlanContent) {
      const mustHaves = parseTaskPlanMustHaves(taskPlanContent);
      mustHaveCount = mustHaves.length;
      if (mustHaveCount > 0 && summaryExists && summaryAbs) {
        const summaryContent = await loadFile(summaryAbs);
        if (summaryContent) {
          mustHavesMentionedInSummary = countMustHavesMentionedInSummary(mustHaves, summaryContent);
        }
      }
    }
  }

  return {
    planPath,
    summaryPath,
    summaryExists,
    taskChecked,
    nextActionAdvanced,
    mustHaveCount,
    mustHavesMentionedInSummary,
  };
}

export function formatExecuteTaskRecoveryStatus(status: ExecuteTaskRecoveryStatus): string {
  const missing = [] as string[];
  if (!status.summaryExists) missing.push(`summary missing (${status.summaryPath})`);
  if (!status.taskChecked) missing.push(`task checkbox unchecked in ${status.planPath}`);
  if (!status.nextActionAdvanced) missing.push("state next action still points at the timed-out task");
  if (status.mustHaveCount > 0 && status.mustHavesMentionedInSummary < status.mustHaveCount) {
    missing.push(`must-have gap: ${status.mustHavesMentionedInSummary} of ${status.mustHaveCount} must-haves addressed in summary`);
  }
  return missing.length > 0 ? missing.join("; ") : "all durable task artifacts present";
}
