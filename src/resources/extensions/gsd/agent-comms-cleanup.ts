/**
 * GSD Agent Comms Cleanup — Periodic maintenance of inter-agent communication files.
 *
 * Removes acked/stale messages and truncates old JSONL entries.
 * Called from the orchestrator's polling loop.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { gsdRoot } from "./paths.js";
import { loadJsonFileOrNull } from "./json-persistence.js";
import type { AgentMessage, ConflictWarning } from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────

const COMMS_DIR = "comms";
const DEFAULT_MESSAGE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const DEFAULT_JSONL_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_CONFLICT_TTL_MS = 30 * 60 * 1000;  // 30 minutes for resolved conflicts

// ─── Validators ───────────────────────────────────────────────────────────

function isAgentMessage(data: unknown): data is AgentMessage {
  return data !== null && typeof data === "object" && "id" in data && "from" in data && "timestamp" in data;
}

function isConflictWarning(data: unknown): data is ConflictWarning {
  return data !== null && typeof data === "object" && "id" in data && "workers" in data && "resolved" in data;
}

// ─── Path Helpers ─────────────────────────────────────────────────────────

function commsPath(basePath: string, ...segments: string[]): string {
  return join(gsdRoot(basePath), COMMS_DIR, ...segments);
}

// ─── Message Cleanup ──────────────────────────────────────────────────────

/**
 * Remove stale messages older than ttlMs. Acked messages and expired
 * broadcast messages are removed.
 */
export function cleanupMessages(
  basePath: string,
  ttlMs: number = DEFAULT_MESSAGE_TTL_MS,
): number {
  const dir = commsPath(basePath, "messages");
  if (!existsSync(dir)) return 0;

  let removed = 0;
  const now = Date.now();

  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".json")) continue;
      const filePath = join(dir, entry);
      const msg = loadJsonFileOrNull(filePath, isAgentMessage);
      if (!msg) {
        // Invalid file, remove it
        try { unlinkSync(filePath); removed++; } catch { /* non-fatal */ }
        continue;
      }
      // Remove acked messages or messages older than TTL
      if (msg.acked || (now - msg.timestamp > ttlMs)) {
        try { unlinkSync(filePath); removed++; } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }

  return removed;
}

// ─── JSONL Cleanup ────────────────────────────────────────────────────────

/**
 * Truncate a JSONL file by removing entries older than maxAgeMs.
 * Rewrites the file with only recent entries.
 */
export function truncateJsonl(
  filePath: string,
  maxAgeMs: number = DEFAULT_JSONL_MAX_AGE_MS,
): number {
  if (!existsSync(filePath)) return 0;

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim());
    const now = Date.now();
    let removed = 0;

    const kept: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (typeof entry.timestamp === "number" && (now - entry.timestamp > maxAgeMs)) {
          removed++;
        } else {
          kept.push(line);
        }
      } catch {
        removed++; // remove unparseable lines
      }
    }

    if (removed > 0) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, kept.join("\n") + (kept.length > 0 ? "\n" : ""), "utf-8");
    }

    return removed;
  } catch {
    return 0;
  }
}

// ─── Conflict Cleanup ─────────────────────────────────────────────────────

/**
 * Remove resolved conflict warnings older than ttlMs.
 * Unresolved conflicts are left untouched.
 */
export function cleanupConflicts(
  basePath: string,
  ttlMs: number = DEFAULT_CONFLICT_TTL_MS,
): number {
  const dir = commsPath(basePath, "conflicts");
  if (!existsSync(dir)) return 0;

  let removed = 0;
  const now = Date.now();

  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".json")) continue;
      const filePath = join(dir, entry);
      const warning = loadJsonFileOrNull(filePath, isConflictWarning);
      if (!warning) {
        try { unlinkSync(filePath); removed++; } catch { /* non-fatal */ }
        continue;
      }
      // Only remove resolved conflicts past TTL
      if (warning.resolved && (now - warning.timestamp > ttlMs)) {
        try { unlinkSync(filePath); removed++; } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }

  return removed;
}

// ─── Full Cleanup ─────────────────────────────────────────────────────────

export interface CleanupResult {
  messagesRemoved: number;
  artifactsTruncated: number;
  knowledgeTruncated: number;
  conflictsRemoved: number;
}

/**
 * Run all cleanup operations. Safe to call from a polling loop.
 */
export function cleanupComms(
  basePath: string,
  options?: {
    messageTtlMs?: number;
    jsonlMaxAgeMs?: number;
    conflictTtlMs?: number;
  },
): CleanupResult {
  return {
    messagesRemoved: cleanupMessages(basePath, options?.messageTtlMs),
    artifactsTruncated: truncateJsonl(
      commsPath(basePath, "artifacts", "registry.jsonl"),
      options?.jsonlMaxAgeMs,
    ),
    knowledgeTruncated: truncateJsonl(
      commsPath(basePath, "knowledge", "entries.jsonl"),
      options?.jsonlMaxAgeMs,
    ),
    conflictsRemoved: cleanupConflicts(basePath, options?.conflictTtlMs),
  };
}
