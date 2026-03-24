/**
 * GSD Agent Communication — File-based IPC for inter-agent coordination.
 *
 * Provides messaging, artifact sharing, knowledge base, and conflict detection
 * between parallel workers. Extends the session-status-io.ts atomic write
 * patterns to support richer agent-to-agent communication.
 *
 * Disk layout:
 *   .gsd/comms/messages/<id>.json       — ephemeral AgentMessage files
 *   .gsd/comms/artifacts/registry.jsonl  — append-only SharedArtifact log
 *   .gsd/comms/knowledge/entries.jsonl   — append-only SharedKnowledgeEntry log
 *   .gsd/comms/conflicts/<id>.json       — ConflictWarning files
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  appendFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { gsdRoot } from "./paths.js";
import { writeJsonFileAtomic, loadJsonFileOrNull } from "./json-persistence.js";
import type {
  AgentMessage,
  SharedArtifact,
  SharedKnowledgeEntry,
  ConflictWarning,
} from "./types.js";

// ─── Constants ────────────────────────────────────────────────────────────

const COMMS_DIR = "comms";
const MESSAGES_DIR = "messages";
const ARTIFACTS_DIR = "artifacts";
const KNOWLEDGE_DIR = "knowledge";
const CONFLICTS_DIR = "conflicts";
const ARTIFACTS_FILE = "registry.jsonl";
const KNOWLEDGE_FILE = "entries.jsonl";

// ─── Validators ───────────────────────────────────────────────────────────

function isAgentMessage(data: unknown): data is AgentMessage {
  return data !== null && typeof data === "object" && "id" in data && "from" in data && "channel" in data;
}

function isConflictWarning(data: unknown): data is ConflictWarning {
  return data !== null && typeof data === "object" && "id" in data && "workers" in data && "files" in data;
}

// ─── Path Helpers ─────────────────────────────────────────────────────────

function commsDir(basePath: string): string {
  return join(gsdRoot(basePath), COMMS_DIR);
}

function messagesDir(basePath: string): string {
  return join(commsDir(basePath), MESSAGES_DIR);
}

function artifactsDir(basePath: string): string {
  return join(commsDir(basePath), ARTIFACTS_DIR);
}

function knowledgeDir(basePath: string): string {
  return join(commsDir(basePath), KNOWLEDGE_DIR);
}

function conflictsDir(basePath: string): string {
  return join(commsDir(basePath), CONFLICTS_DIR);
}

function messagePath(basePath: string, id: string): string {
  return join(messagesDir(basePath), `${id}.json`);
}

function conflictPath(basePath: string, id: string): string {
  return join(conflictsDir(basePath), `${id}.json`);
}

function artifactsFilePath(basePath: string): string {
  return join(artifactsDir(basePath), ARTIFACTS_FILE);
}

function knowledgeFilePath(basePath: string): string {
  return join(knowledgeDir(basePath), KNOWLEDGE_FILE);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Message I/O ──────────────────────────────────────────────────────────

/** Post a message for another worker (or broadcast with to="*"). */
export function postMessage(
  basePath: string,
  msg: Omit<AgentMessage, "id" | "timestamp" | "acked">,
): AgentMessage {
  const full: AgentMessage = {
    ...msg,
    id: randomUUID(),
    timestamp: Date.now(),
    acked: false,
  };
  ensureDir(messagesDir(basePath));
  writeJsonFileAtomic(messagePath(basePath, full.id), full);
  return full;
}

/**
 * Poll for unacked messages addressed to a specific worker or broadcast ("*").
 * Returns messages sorted by timestamp (oldest first).
 */
export function pollMessages(basePath: string, workerId: string): AgentMessage[] {
  const dir = messagesDir(basePath);
  if (!existsSync(dir)) return [];

  const results: AgentMessage[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".json")) continue;
      const msg = loadJsonFileOrNull(join(dir, entry), isAgentMessage);
      if (msg && !msg.acked && (msg.to === workerId || msg.to === "*")) {
        results.push(msg);
      }
    }
  } catch { /* non-fatal */ }

  return results.sort((a, b) => a.timestamp - b.timestamp);
}

/** Acknowledge (delete) a message by ID. */
export function ackMessage(basePath: string, messageId: string): void {
  try {
    const p = messagePath(basePath, messageId);
    if (existsSync(p)) unlinkSync(p);
  } catch { /* non-fatal */ }
}

/** Read all messages (regardless of ack status). For diagnostics/cleanup. */
export function readAllMessages(basePath: string): AgentMessage[] {
  const dir = messagesDir(basePath);
  if (!existsSync(dir)) return [];

  const results: AgentMessage[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".json")) continue;
      const msg = loadJsonFileOrNull(join(dir, entry), isAgentMessage);
      if (msg) results.push(msg);
    }
  } catch { /* non-fatal */ }

  return results.sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Artifact Registry ────────────────────────────────────────────────────

/** Publish an artifact to the shared registry (append-only JSONL). */
export function publishArtifact(
  basePath: string,
  artifact: Omit<SharedArtifact, "id" | "timestamp">,
): SharedArtifact {
  const full: SharedArtifact = {
    ...artifact,
    id: randomUUID(),
    timestamp: Date.now(),
  };
  ensureDir(artifactsDir(basePath));
  try {
    appendFileSync(artifactsFilePath(basePath), JSON.stringify(full) + "\n", "utf-8");
  } catch { /* non-fatal */ }
  return full;
}

/** Query artifacts with an optional filter. */
export function queryArtifacts(
  basePath: string,
  filter?: Partial<Pick<SharedArtifact, "producedBy" | "unitId" | "type">>,
): SharedArtifact[] {
  return readJsonl<SharedArtifact>(artifactsFilePath(basePath)).filter(a => {
    if (filter?.producedBy && a.producedBy !== filter.producedBy) return false;
    if (filter?.unitId && a.unitId !== filter.unitId) return false;
    if (filter?.type && a.type !== filter.type) return false;
    return true;
  });
}

// ─── Knowledge Base ───────────────────────────────────────────────────────

/** Add a knowledge entry to the shared knowledge base (append-only JSONL). */
export function addKnowledge(
  basePath: string,
  entry: Omit<SharedKnowledgeEntry, "id" | "timestamp">,
): SharedKnowledgeEntry {
  const full: SharedKnowledgeEntry = {
    ...entry,
    id: randomUUID(),
    timestamp: Date.now(),
  };
  ensureDir(knowledgeDir(basePath));
  try {
    appendFileSync(knowledgeFilePath(basePath), JSON.stringify(full) + "\n", "utf-8");
  } catch { /* non-fatal */ }
  return full;
}

/**
 * Query knowledge entries, optionally filtering by relevance.
 * If relevantTo is provided, returns entries whose relevantTo array
 * intersects with the given IDs, plus entries with no relevantTo (global).
 */
export function queryKnowledge(
  basePath: string,
  relevantTo?: string[],
): SharedKnowledgeEntry[] {
  const entries = readJsonl<SharedKnowledgeEntry>(knowledgeFilePath(basePath));
  if (!relevantTo || relevantTo.length === 0) return entries;

  const targetSet = new Set(relevantTo);
  return entries.filter(e => {
    if (!e.relevantTo || e.relevantTo.length === 0) return true;
    return e.relevantTo.some(id => targetSet.has(id));
  });
}

// ─── Conflict Tracking ────────────────────────────────────────────────────

/** Raise a conflict warning between workers. */
export function raiseConflict(
  basePath: string,
  warning: Omit<ConflictWarning, "id" | "timestamp" | "resolved">,
): ConflictWarning {
  const full: ConflictWarning = {
    ...warning,
    id: randomUUID(),
    timestamp: Date.now(),
    resolved: false,
  };
  ensureDir(conflictsDir(basePath));
  writeJsonFileAtomic(conflictPath(basePath, full.id), full);
  return full;
}

/** Get all active (unresolved) conflict warnings. */
export function getActiveConflicts(basePath: string): ConflictWarning[] {
  const dir = conflictsDir(basePath);
  if (!existsSync(dir)) return [];

  const results: ConflictWarning[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".json")) continue;
      const warning = loadJsonFileOrNull(join(dir, entry), isConflictWarning);
      if (warning && !warning.resolved) results.push(warning);
    }
  } catch { /* non-fatal */ }

  return results.sort((a, b) => a.timestamp - b.timestamp);
}

/** Mark a conflict as resolved (deletes the file). */
export function resolveConflict(basePath: string, conflictId: string): void {
  try {
    const p = conflictPath(basePath, conflictId);
    if (existsSync(p)) unlinkSync(p);
  } catch { /* non-fatal */ }
}

/**
 * Proactive file overlap detection across worker file sets.
 * Returns ConflictWarning objects for any overlapping file pairs.
 *
 * Reuses the O(n^2) comparison pattern from parallel-eligibility.ts.
 */
export function detectFileOverlaps(
  workerFiles: Map<string, string[]>,
): Array<{ workers: [string, string]; files: string[] }> {
  const overlaps: Array<{ workers: [string, string]; files: string[] }> = [];
  const ids = [...workerFiles.keys()];

  for (let i = 0; i < ids.length; i++) {
    const files1 = new Set(workerFiles.get(ids[i])!);
    for (let j = i + 1; j < ids.length; j++) {
      const files2 = workerFiles.get(ids[j])!;
      const shared = files2.filter(f => files1.has(f));
      if (shared.length > 0) {
        overlaps.push({ workers: [ids[i], ids[j]], files: shared.sort() });
      }
    }
  }

  return overlaps;
}

/**
 * Detect overlaps and raise conflict warnings for any found.
 * Returns the raised ConflictWarning objects.
 */
export function detectAndRaiseOverlaps(
  basePath: string,
  workerFiles: Map<string, string[]>,
): ConflictWarning[] {
  const overlaps = detectFileOverlaps(workerFiles);
  const warnings: ConflictWarning[] = [];

  for (const overlap of overlaps) {
    const severity = overlap.files.length > 5 ? "critical" as const
      : overlap.files.length > 2 ? "warning" as const
      : "info" as const;

    const warning = raiseConflict(basePath, {
      workers: overlap.workers,
      files: overlap.files,
      severity,
    });
    warnings.push(warning);
  }

  return warnings;
}

// ─── JSONL Helper ─────────────────────────────────────────────────────────

/** Read a JSONL file and return parsed entries. Skips invalid lines. */
function readJsonl<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, "utf-8");
    const results: T[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        results.push(JSON.parse(trimmed) as T);
      } catch { /* skip invalid lines */ }
    }
    return results;
  } catch {
    return [];
  }
}
