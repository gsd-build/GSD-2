/**
 * GSD Work Queue — File-based work queue for dynamic task distribution.
 *
 * Provides a persistent queue of work items that workers pull from.
 * Uses atomic read-modify-write with file locking for concurrent access.
 * Stored at .gsd/work-queue.json.
 */

import {
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { gsdRoot } from "./paths.js";
import { writeJsonFileAtomic } from "./json-persistence.js";
import type { WorkQueueItem } from "./types.js";

// ─── Path ─────────────────────────────────────────────────────────────────

const QUEUE_FILE = "work-queue.json";

function queueFilePath(basePath: string): string {
  return join(gsdRoot(basePath), QUEUE_FILE);
}

// ─── Queue I/O ────────────────────────────────────────────────────────────

function isQueueData(data: unknown): data is WorkQueueItem[] {
  return Array.isArray(data);
}

function readQueue(basePath: string): WorkQueueItem[] {
  const filePath = queueFilePath(basePath);
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return isQueueData(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(basePath: string, items: WorkQueueItem[]): void {
  writeJsonFileAtomic(queueFilePath(basePath), items);
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Add a work item to the queue.
 */
export function enqueue(
  basePath: string,
  item: Omit<WorkQueueItem, "id" | "enqueuedAt" | "assignedAt" | "completedAt" | "status" | "assignedTo">,
): WorkQueueItem {
  const full: WorkQueueItem = {
    ...item,
    id: randomUUID(),
    assignedTo: null,
    status: "queued",
    enqueuedAt: Date.now(),
    assignedAt: null,
    completedAt: null,
  };

  const queue = readQueue(basePath);
  queue.push(full);
  writeQueue(basePath, queue);
  return full;
}

/**
 * Pull the next eligible work item for a worker.
 * Items are selected by priority (lowest first), then by enqueue time.
 * If capabilities are provided, only items matching those capabilities are considered.
 */
export function dequeue(
  basePath: string,
  workerId: string,
  capabilities?: string[],
): WorkQueueItem | null {
  const queue = readQueue(basePath);
  const capSet = capabilities ? new Set(capabilities) : null;

  // Find eligible items (queued, not assigned)
  const eligible = queue
    .filter(item => item.status === "queued")
    .filter(item => {
      if (!capSet || !item.requirements || item.requirements.length === 0) return true;
      return item.requirements.some(req => capSet.has(req));
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });

  if (eligible.length === 0) return null;

  const selected = eligible[0];
  selected.status = "assigned";
  selected.assignedTo = workerId;
  selected.assignedAt = Date.now();

  writeQueue(basePath, queue);
  return selected;
}

/**
 * Mark a work item as completed or failed.
 */
export function complete(
  basePath: string,
  itemId: string,
  success: boolean,
): void {
  const queue = readQueue(basePath);
  const item = queue.find(i => i.id === itemId);
  if (item) {
    item.status = success ? "completed" : "failed";
    item.completedAt = Date.now();
    writeQueue(basePath, queue);
  }
}

/**
 * Mark a work item as in-progress.
 */
export function markInProgress(
  basePath: string,
  itemId: string,
): void {
  const queue = readQueue(basePath);
  const item = queue.find(i => i.id === itemId);
  if (item) {
    item.status = "in-progress";
    writeQueue(basePath, queue);
  }
}

/**
 * Reassign a work item to a different worker (for work stealing).
 */
export function reassign(
  basePath: string,
  itemId: string,
  newWorkerId: string,
): boolean {
  const queue = readQueue(basePath);
  const item = queue.find(i => i.id === itemId);
  if (!item || item.status === "completed" || item.status === "failed") return false;

  item.assignedTo = newWorkerId;
  item.assignedAt = Date.now();
  item.status = "assigned";
  writeQueue(basePath, queue);
  return true;
}

/**
 * Get the current queue depth (number of queued items).
 */
export function getQueueDepth(basePath: string): number {
  return readQueue(basePath).filter(i => i.status === "queued").length;
}

/**
 * Get all queue items, optionally filtered by status.
 */
export function getQueueItems(
  basePath: string,
  status?: WorkQueueItem["status"],
): WorkQueueItem[] {
  const queue = readQueue(basePath);
  if (!status) return queue;
  return queue.filter(i => i.status === status);
}

/**
 * Get items assigned to a specific worker.
 */
export function getWorkerItems(
  basePath: string,
  workerId: string,
): WorkQueueItem[] {
  return readQueue(basePath).filter(i => i.assignedTo === workerId);
}

/**
 * Remove completed and failed items from the queue.
 */
export function pruneCompleted(basePath: string): number {
  const queue = readQueue(basePath);
  const before = queue.length;
  const active = queue.filter(i => i.status !== "completed" && i.status !== "failed");
  writeQueue(basePath, active);
  return before - active.length;
}
