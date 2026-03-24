/**
 * GSD Work Distributor — Load balancing and work stealing scheduler.
 *
 * Provides strategies for distributing work items across workers:
 * - round-robin: simple rotation
 * - least-loaded: assign to worker with fewest in-progress items
 * - capability-match: match task requirements to worker capabilities
 *
 * Also provides work stealing (idle workers take from busy ones)
 * and auto-scaling decisions.
 */

import type { WorkQueueItem, WorkerCapacity, WorkDistributionConfig } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface Assignment {
  itemId: string;
  workerId: string;
}

// ─── Load Balancing ───────────────────────────────────────────────────────

/**
 * Assign queued items to available workers using the configured strategy.
 * Returns a list of assignments (item → worker).
 */
export function assignWork(
  items: WorkQueueItem[],
  workers: WorkerCapacity[],
  strategy: WorkDistributionConfig["strategy"],
): Assignment[] {
  const queued = items
    .filter(i => i.status === "queued")
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });

  if (queued.length === 0 || workers.length === 0) return [];

  const available = workers.filter(w => w.currentLoad < w.maxLoad);
  if (available.length === 0) return [];

  switch (strategy) {
    case "round-robin":
      return assignRoundRobin(queued, available);
    case "least-loaded":
      return assignLeastLoaded(queued, available);
    case "capability-match":
      return assignCapabilityMatch(queued, available);
    default:
      return assignLeastLoaded(queued, available);
  }
}

function assignRoundRobin(
  items: WorkQueueItem[],
  workers: WorkerCapacity[],
): Assignment[] {
  const assignments: Assignment[] = [];
  let workerIdx = 0;

  for (const item of items) {
    // Find next available worker
    let tried = 0;
    while (tried < workers.length) {
      const w = workers[workerIdx % workers.length];
      workerIdx++;
      if (w.currentLoad < w.maxLoad) {
        assignments.push({ itemId: item.id, workerId: w.workerId });
        w.currentLoad++;
        break;
      }
      tried++;
    }
  }

  return assignments;
}

function assignLeastLoaded(
  items: WorkQueueItem[],
  workers: WorkerCapacity[],
): Assignment[] {
  const assignments: Assignment[] = [];

  for (const item of items) {
    // Sort workers by current load (ascending), then by completed count (descending for experience)
    const sorted = [...workers]
      .filter(w => w.currentLoad < w.maxLoad)
      .sort((a, b) => {
        if (a.currentLoad !== b.currentLoad) return a.currentLoad - b.currentLoad;
        return b.completedCount - a.completedCount;
      });

    if (sorted.length === 0) break;

    const target = sorted[0];
    assignments.push({ itemId: item.id, workerId: target.workerId });
    target.currentLoad++;
  }

  return assignments;
}

function assignCapabilityMatch(
  items: WorkQueueItem[],
  workers: WorkerCapacity[],
): Assignment[] {
  const assignments: Assignment[] = [];

  for (const item of items) {
    const available = workers.filter(w => w.currentLoad < w.maxLoad);
    if (available.length === 0) break;

    // Score each worker by capability match
    const scored = available.map(w => {
      let capScore = 0;
      if (item.requirements && item.requirements.length > 0) {
        const capSet = new Set(w.capabilities);
        const matched = item.requirements.filter(r => capSet.has(r));
        capScore = matched.length / item.requirements.length;
      }
      // Combine capability match (60%) with load factor (40%)
      const loadFactor = 1 - (w.currentLoad / w.maxLoad);
      return { worker: w, score: capScore * 0.6 + loadFactor * 0.4 };
    }).sort((a, b) => b.score - a.score);

    const target = scored[0].worker;
    assignments.push({ itemId: item.id, workerId: target.workerId });
    target.currentLoad++;
  }

  return assignments;
}

// ─── Work Stealing ────────────────────────────────────────────────────────

/**
 * Find a work item to steal from a busy worker for an idle worker.
 * Returns the item ID to reassign, or null if nothing to steal.
 *
 * Steals the oldest queued/assigned item from the busiest worker.
 */
export function stealWork(
  idleWorkerId: string,
  items: WorkQueueItem[],
  workers: WorkerCapacity[],
): string | null {
  // Find the busiest worker (excluding the idle one)
  const busy = workers
    .filter(w => w.workerId !== idleWorkerId && w.currentLoad > 1)
    .sort((a, b) => b.currentLoad - a.currentLoad);

  if (busy.length === 0) return null;

  const busiestWorker = busy[0];

  // Find the oldest queued or assigned item for this worker
  const stealable = items
    .filter(i =>
      i.assignedTo === busiestWorker.workerId &&
      (i.status === "queued" || i.status === "assigned")
    )
    .sort((a, b) => a.enqueuedAt - b.enqueuedAt);

  if (stealable.length === 0) return null;
  return stealable[0].id;
}

// ─── Scaling Decisions ────────────────────────────────────────────────────

/**
 * Determine if we should scale up (add more workers).
 */
export function shouldScaleUp(
  queueDepth: number,
  activeWorkers: number,
  config: Pick<WorkDistributionConfig, "max_workers" | "queue_depth_scale_threshold">,
): boolean {
  if (activeWorkers >= config.max_workers) return false;
  return queueDepth > config.queue_depth_scale_threshold;
}

/**
 * Determine which workers should be scaled down (terminated).
 * Returns worker IDs that have been idle longer than the timeout.
 */
export function shouldScaleDown(
  workers: WorkerCapacity[],
  config: Pick<WorkDistributionConfig, "min_workers" | "idle_timeout_ms">,
): string[] {
  const now = Date.now();
  const active = workers.filter(w => w.currentLoad > 0 || w.idleSince === null);
  const idle = workers.filter(w => w.currentLoad === 0 && w.idleSince !== null);

  // Don't scale below minimum
  const canRemove = workers.length - config.min_workers;
  if (canRemove <= 0) return [];

  // Find idle workers past timeout
  const expired = idle
    .filter(w => (now - (w.idleSince ?? now)) > config.idle_timeout_ms)
    .sort((a, b) => (a.idleSince ?? 0) - (b.idleSince ?? 0));

  return expired.slice(0, canRemove).map(w => w.workerId);
}
