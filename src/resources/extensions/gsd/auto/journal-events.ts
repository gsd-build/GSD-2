/**
 * auto/journal-events.ts — Typed builder functions for journal events.
 *
 * Centralises the journal event schema so call sites are readable
 * single-line or short multi-line calls instead of 200-char object literals.
 *
 * Each builder stamps `ts: new Date().toISOString()` at call time and returns
 * a complete JournalEntry ready to pass to `deps.emitJournalEvent`.
 */

import type { JournalEntry } from "../journal.js";
import type { ErrorContext } from "./types.js";

// ─── Shared types ─────────────────────────────────────────────────────────────

/** Resource descriptor stamped on every iteration-start event. */
export interface JournalResource {
  gsdVersion: string;
  model: string;
  cwd: string;
}

// ─── Error type ───────────────────────────────────────────────────────────────

/** Classification of why a unit ended in a non-completed state. */
export type JournalErrorType =
  | "tool-error"
  | "timeout"
  | "context-overflow"
  | "provider-error"
  | "network-error"
  | "aborted"
  | "session-failed"
  | "unknown";

// ─── Builder functions ────────────────────────────────────────────────────────

export interface IterationStartParams {
  flowId: string;
  seq: number;
  iteration: number;
  resource: JournalResource;
  causedBy?: { flowId: string; seq: number };
}

export function buildIterationStartEvent(p: IterationStartParams): JournalEntry {
  return {
    ts: new Date().toISOString(),
    flowId: p.flowId,
    seq: p.seq,
    eventType: "iteration-start",
    data: { iteration: p.iteration, resource: p.resource },
    ...(p.causedBy && { causedBy: p.causedBy }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface UnitStartParams {
  flowId: string;
  seq: number;
  unitType: string;
  unitId: string;
  sessionId: string;
  messageOffset: number;
}

export function buildUnitStartEvent(p: UnitStartParams): JournalEntry {
  return {
    ts: new Date().toISOString(),
    flowId: p.flowId,
    seq: p.seq,
    eventType: "unit-start",
    data: {
      unitType: p.unitType,
      unitId: p.unitId,
      sessionId: p.sessionId,
      messageOffset: p.messageOffset,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface UnitEndParams {
  flowId: string;
  seq: number;
  unitType: string;
  unitId: string;
  status: string;
  artifactVerified: boolean;
  durationMs: number;
  error?: string;
  errorType?: JournalErrorType;
  errorContext?: ErrorContext;
  causedBy: { flowId: string; seq: number };
}

export function buildUnitEndEvent(p: UnitEndParams): JournalEntry {
  return {
    ts: new Date().toISOString(),
    flowId: p.flowId,
    seq: p.seq,
    eventType: "unit-end",
    causedBy: p.causedBy,
    data: {
      unitType: p.unitType,
      unitId: p.unitId,
      status: p.status,
      artifactVerified: p.artifactVerified,
      durationMs: p.durationMs,
      ...(p.error && { error: p.error, errorType: p.errorType }),
      ...(p.errorContext && { errorContext: p.errorContext }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface StuckDetectedParams {
  flowId: string;
  seq: number;
  unitType: string;
  unitId: string;
  reason: string;
  level: 1 | 2;
}

export function buildStuckDetectedEvent(p: StuckDetectedParams): JournalEntry {
  return {
    ts: new Date().toISOString(),
    flowId: p.flowId,
    seq: p.seq,
    eventType: "stuck-detected",
    data: {
      unitType: p.unitType,
      unitId: p.unitId,
      reason: p.reason,
      level: p.level,
    },
  };
}
