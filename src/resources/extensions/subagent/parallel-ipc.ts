/**
 * File-based IPC for parallel subagent batches.
 *
 * Writes worker state and a structured NDJSON event stream to
 * `.gsd/parallel/<batchId>/` so that external monitors, dashboards,
 * and other processes can observe batch progress without needing
 * access to the in-process worker registry.
 *
 * Directory layout:
 *   .gsd/parallel/<batchId>/
 *     batch.json          — batch metadata (start, counts, status)
 *     worker-<n>.json     — per-worker state (agent, task excerpt, timing)
 *     events.ndjson       — append-only NDJSON event stream
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatchMeta {
  batchId: string;
  startedAt: number;
  workerCount: number;
  status: "running" | "completed";
  successCount?: number;
  failedCount?: number;
  durationMs?: number;
}

export interface WorkerMeta {
  index: number;
  agent: string;
  /** First 120 chars of the task prompt */
  taskExcerpt: string;
  startedAt: number;
  status: "running" | "completed" | "failed";
  completedAt?: number;
  durationMs?: number;
}

export type IpcEvent =
  | { type: "batch_start"; batchId: string; workerCount: number; ts: number }
  | { type: "worker_start"; batchId: string; index: number; agent: string; ts: number }
  | { type: "worker_complete"; batchId: string; index: number; status: "completed" | "failed"; durationMs: number; ts: number }
  | { type: "batch_complete"; batchId: string; successCount: number; failedCount: number; durationMs: number; ts: number };

// ─── ParallelIPC ──────────────────────────────────────────────────────────────

/**
 * Manages the file-based IPC directory for a single parallel batch.
 * All writes are best-effort — failures are silently ignored so that
 * IPC problems never interrupt actual agent execution.
 */
export class ParallelIPC {
  private readonly batchId: string;
  private readonly batchDir: string;
  private readonly eventsPath: string;
  private readonly batchStartMs: number;

  constructor(repoRoot: string, batchId: string) {
    this.batchId = batchId;
    this.batchDir = path.join(repoRoot, ".gsd", "parallel", batchId);
    this.eventsPath = path.join(this.batchDir, "events.ndjson");
    this.batchStartMs = Date.now();
  }

  /**
   * Create the IPC directory and write initial batch metadata.
   * Must be called once before any workerStart() calls.
   */
  init(workerCount: number): void {
    try {
      fs.mkdirSync(this.batchDir, { recursive: true });
    } catch {
      return; // If we can't create the dir, all further writes will silently fail
    }

    const meta: BatchMeta = {
      batchId: this.batchId,
      startedAt: this.batchStartMs,
      workerCount,
      status: "running",
    };
    this.writeJson("batch.json", meta);
    this.appendEvent({
      type: "batch_start",
      batchId: this.batchId,
      workerCount,
      ts: this.batchStartMs,
    });
  }

  /** Record that a worker has started. */
  workerStart(index: number, agent: string, task: string): void {
    const taskExcerpt = task.length > 120 ? `${task.slice(0, 120)}...` : task;
    const now = Date.now();
    const meta: WorkerMeta = {
      index,
      agent,
      taskExcerpt,
      startedAt: now,
      status: "running",
    };
    this.writeJson(`worker-${index}.json`, meta);
    this.appendEvent({
      type: "worker_start",
      batchId: this.batchId,
      index,
      agent,
      ts: now,
    });
  }

  /** Record that a worker has finished. */
  workerComplete(index: number, status: "completed" | "failed", durationMs: number): void {
    const now = Date.now();
    try {
      const filePath = path.join(this.batchDir, `worker-${index}.json`);
      const existing: WorkerMeta = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      existing.status = status;
      existing.completedAt = now;
      existing.durationMs = durationMs;
      this.writeJson(`worker-${index}.json`, existing);
    } catch {
      // Worker file may not exist if init() failed; write a minimal record
      const meta: WorkerMeta = {
        index,
        agent: "(unknown)",
        taskExcerpt: "",
        startedAt: now - durationMs,
        status,
        completedAt: now,
        durationMs,
      };
      this.writeJson(`worker-${index}.json`, meta);
    }
    this.appendEvent({
      type: "worker_complete",
      batchId: this.batchId,
      index,
      status,
      durationMs,
      ts: now,
    });
  }

  /** Record batch completion with final counts. */
  batchComplete(successCount: number, failedCount: number): void {
    const durationMs = Date.now() - this.batchStartMs;
    try {
      const batchPath = path.join(this.batchDir, "batch.json");
      const meta: BatchMeta = JSON.parse(fs.readFileSync(batchPath, "utf-8"));
      meta.status = "completed";
      meta.successCount = successCount;
      meta.failedCount = failedCount;
      meta.durationMs = durationMs;
      this.writeJson("batch.json", meta);
    } catch {
      // Best effort
    }
    this.appendEvent({
      type: "batch_complete",
      batchId: this.batchId,
      successCount,
      failedCount,
      durationMs,
      ts: Date.now(),
    });
  }

  /** Absolute path to the NDJSON events file (for external monitoring). */
  get eventsFilePath(): string {
    return this.eventsPath;
  }

  /** Absolute path to the batch IPC directory. */
  get batchDirPath(): string {
    return this.batchDir;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private writeJson(filename: string, data: object): void {
    try {
      fs.writeFileSync(
        path.join(this.batchDir, filename),
        JSON.stringify(data, null, 2),
      );
    } catch {
      // Best effort — IPC failures must not break agent execution
    }
  }

  private appendEvent(event: IpcEvent): void {
    try {
      fs.appendFileSync(this.eventsPath, JSON.stringify(event) + "\n");
    } catch {
      // Best effort
    }
  }
}
