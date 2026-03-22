// GSD Extension — Event Log (Append-Only JSONL)
// Records every engine command as a JSONL event with content hash.
// Enables fork-point detection for diverged worktree reconciliation.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── Event Types ─────────────────────────────────────────────────────────

export interface WorkflowEvent {
  cmd: string;           // e.g. "complete_task"
  params: Record<string, unknown>;
  ts: string;            // ISO 8601
  hash: string;          // content hash (hex, 16 chars)
  actor: "agent" | "system";
}

// ─── appendEvent ─────────────────────────────────────────────────────────

/**
 * Append one event to .gsd/event-log.jsonl.
 * Computes a content hash from cmd+params (deterministic, independent of ts/actor).
 * Creates .gsd directory if needed.
 */
export function appendEvent(
  basePath: string,
  event: Omit<WorkflowEvent, "hash">,
): void {
  const hash = createHash("sha256")
    .update(JSON.stringify({ cmd: event.cmd, params: event.params }))
    .digest("hex")
    .slice(0, 16);

  const fullEvent: WorkflowEvent = { ...event, hash };
  const dir = join(basePath, ".gsd");
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "event-log.jsonl"), JSON.stringify(fullEvent) + "\n", "utf-8");
}

// ─── readEvents ──────────────────────────────────────────────────────────

/**
 * Read all events from a JSONL file.
 * Returns empty array if file doesn't exist.
 * Corrupted lines are skipped with stderr warning.
 */
export function readEvents(logPath: string): WorkflowEvent[] {
  if (!existsSync(logPath)) {
    return [];
  }

  const content = readFileSync(logPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.length > 0);
  const events: WorkflowEvent[] = [];

  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as WorkflowEvent);
    } catch {
      process.stderr.write(`workflow-events: skipping corrupted event line: ${line.slice(0, 80)}\n`);
    }
  }

  return events;
}

// ─── findForkPoint ───────────────────────────────────────────────────────

/**
 * Find the index of the last common event between two logs by comparing hashes.
 * Returns -1 if the first events differ (completely diverged).
 * If one log is a prefix of the other, returns length of shorter - 1.
 */
export function findForkPoint(
  logA: WorkflowEvent[],
  logB: WorkflowEvent[],
): number {
  const minLen = Math.min(logA.length, logB.length);
  let lastCommon = -1;

  for (let i = 0; i < minLen; i++) {
    if (logA[i]!.hash === logB[i]!.hash) {
      lastCommon = i;
    } else {
      break;
    }
  }

  return lastCommon;
}
