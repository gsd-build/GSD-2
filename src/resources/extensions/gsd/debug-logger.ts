// GSD Extension — Debug Logger
// Structured JSONL debug logging for diagnosing stuck/slow GSD sessions.
// Zero overhead when disabled — all public functions are no-ops.

import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { gsdRoot } from './paths.js';

// ─── State ────────────────────────────────────────────────────────────────────

let _enabled = false;
let _logPath: string | null = null;
let _startTime = 0;

/** Rolling counters for the debug summary written on stop. */
const _counters = {
  deriveStateCalls: 0,
  deriveStateTotalMs: 0,
  ttsrChecks: 0,
  ttsrTotalMs: 0,
  ttsrPeakBuffer: 0,
  parseRoadmapCalls: 0,
  parseRoadmapTotalMs: 0,
  parsePlanCalls: 0,
  parsePlanTotalMs: 0,
  dispatches: 0,
  renders: 0,
  // Per-phase timing (added for throughput measurement)
  preDispatchCalls: 0,
  preDispatchTotalMs: 0,
  guardsCalls: 0,
  guardsTotalMs: 0,
  dispatchCalls: 0,
  dispatchTotalMs: 0,
  unitExecutionCalls: 0,
  unitExecutionTotalMs: 0,
  finalizeCalls: 0,
  finalizeTotalMs: 0,
  promptBuildCalls: 0,
  promptBuildTotalMs: 0,
  cacheInvalidations: 0,
  cacheSkips: 0,
};

/** Max debug log files to keep. Older ones are pruned on enable. */
const MAX_DEBUG_LOGS = 5;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enable debug logging. Creates the log file and prunes old logs.
 * Can be activated via `--debug` flag or `GSD_DEBUG=1` env var.
 */
export function enableDebug(basePath: string): void {
  const debugDir = join(gsdRoot(basePath), 'debug');
  mkdirSync(debugDir, { recursive: true });

  // Prune old debug logs
  try {
    const files = readdirSync(debugDir)
      .filter(f => f.startsWith('debug-') && f.endsWith('.log'))
      .sort();
    while (files.length >= MAX_DEBUG_LOGS) {
      const oldest = files.shift()!;
      try { unlinkSync(join(debugDir, oldest)); } catch { /* ignore */ }
    }
  } catch { /* non-fatal */ }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  _logPath = join(debugDir, `debug-${timestamp}.log`);
  _startTime = Date.now();
  _enabled = true;

  // Reset counters
  for (const key of Object.keys(_counters) as (keyof typeof _counters)[]) {
    _counters[key] = 0;
  }
}

/** Disable debug logging and return the log file path (if any). */
export function disableDebug(): string | null {
  const path = _logPath;
  _enabled = false;
  _logPath = null;
  _startTime = 0;
  return path;
}

/** Check if debug mode is active. */
export function isDebugEnabled(): boolean {
  return _enabled;
}

/** Return the current log file path (or null). */
export function getDebugLogPath(): string | null {
  return _logPath;
}

/**
 * Log a structured debug event. No-op when debug is disabled.
 *
 * Each event is one JSON line: `{ ts, event, ...data }`
 */
export function debugLog(event: string, data?: Record<string, unknown>): void {
  if (!_enabled || !_logPath) return;

  const entry = {
    ts: new Date().toISOString(),
    event,
    ...data,
  };

  try {
    appendFileSync(_logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Silently ignore write failures — debug logging must never break GSD
  }
}

/**
 * Start a timer for a named operation. Returns a stop function that logs
 * the elapsed time and optional result data.
 *
 * Usage:
 * ```ts
 * const stop = debugTime('derive-state');
 * const result = await deriveState(base);
 * stop({ phase: result.phase });
 * ```
 */
export function debugTime(event: string): (data?: Record<string, unknown>) => void {
  if (!_enabled) return _noop;

  const start = performance.now();
  return (data?: Record<string, unknown>) => {
    const elapsed_ms = Math.round((performance.now() - start) * 100) / 100;
    debugLog(event, { elapsed_ms, ...data });
  };
}

/**
 * Like debugTime(), but also accumulates elapsed time into a counter pair.
 * Use for phase-level timing where you want both per-event JSONL logs and
 * aggregate totals in the debug summary.
 *
 * @param event   - Event name for the JSONL log entry
 * @param callsCounter  - Counter key to increment (e.g., "preDispatchCalls")
 * @param totalMsCounter - Counter key to accumulate elapsed ms (e.g., "preDispatchTotalMs")
 */
export function debugTimeAccum(
  event: string,
  callsCounter: keyof typeof _counters,
  totalMsCounter: keyof typeof _counters,
): (data?: Record<string, unknown>) => void {
  if (!_enabled) return _noop;

  const start = performance.now();
  return (data?: Record<string, unknown>) => {
    const elapsed_ms = Math.round((performance.now() - start) * 100) / 100;
    _counters[callsCounter] += 1;
    _counters[totalMsCounter] += elapsed_ms;
    debugLog(event, { elapsed_ms, ...data });
  };
}

// ─── Counter Helpers ──────────────────────────────────────────────────────────

/** Increment a debug counter (used by instrumentation points). */
export function debugCount(counter: keyof typeof _counters, value = 1): void {
  if (!_enabled) return;
  _counters[counter] += value;
}

/** Record a peak value (only updates if new value is higher). */
export function debugPeak(counter: keyof typeof _counters, value: number): void {
  if (!_enabled) return;
  if (value > _counters[counter]) {
    _counters[counter] = value;
  }
}

/**
 * Write the debug summary and disable logging. Call this when auto-mode stops.
 * Returns the log file path for user notification.
 */
export function writeDebugSummary(): string | null {
  if (!_enabled || !_logPath) return null;

  const totalElapsed_ms = Date.now() - _startTime;
  const avgDeriveState_ms = _counters.deriveStateCalls > 0
    ? Math.round((_counters.deriveStateTotalMs / _counters.deriveStateCalls) * 100) / 100
    : 0;
  const avgTtsrCheck_ms = _counters.ttsrChecks > 0
    ? Math.round((_counters.ttsrTotalMs / _counters.ttsrChecks) * 100) / 100
    : 0;

  const avg = (total: number, count: number) =>
    count > 0 ? Math.round((total / count) * 100) / 100 : 0;

  debugLog('debug-summary', {
    totalElapsed_ms,
    dispatches: _counters.dispatches,
    deriveStateCalls: _counters.deriveStateCalls,
    avgDeriveState_ms,
    parseRoadmapCalls: _counters.parseRoadmapCalls,
    avgParseRoadmap_ms: avg(_counters.parseRoadmapTotalMs, _counters.parseRoadmapCalls),
    parsePlanCalls: _counters.parsePlanCalls,
    ttsrChecks: _counters.ttsrChecks,
    avgTtsrCheck_ms,
    ttsrPeakBuffer: _counters.ttsrPeakBuffer,
    renders: _counters.renders,
    // Per-phase timing (throughput measurement)
    phases: {
      preDispatch:    { calls: _counters.preDispatchCalls,    totalMs: Math.round(_counters.preDispatchTotalMs * 100) / 100,    avgMs: avg(_counters.preDispatchTotalMs, _counters.preDispatchCalls) },
      guards:         { calls: _counters.guardsCalls,         totalMs: Math.round(_counters.guardsTotalMs * 100) / 100,         avgMs: avg(_counters.guardsTotalMs, _counters.guardsCalls) },
      dispatch:       { calls: _counters.dispatchCalls,       totalMs: Math.round(_counters.dispatchTotalMs * 100) / 100,       avgMs: avg(_counters.dispatchTotalMs, _counters.dispatchCalls) },
      unitExecution:  { calls: _counters.unitExecutionCalls,  totalMs: Math.round(_counters.unitExecutionTotalMs * 100) / 100,  avgMs: avg(_counters.unitExecutionTotalMs, _counters.unitExecutionCalls) },
      finalize:       { calls: _counters.finalizeCalls,       totalMs: Math.round(_counters.finalizeTotalMs * 100) / 100,       avgMs: avg(_counters.finalizeTotalMs, _counters.finalizeCalls) },
      promptBuild:    { calls: _counters.promptBuildCalls,    totalMs: Math.round(_counters.promptBuildTotalMs * 100) / 100,    avgMs: avg(_counters.promptBuildTotalMs, _counters.promptBuildCalls) },
    },
    cache: {
      invalidations: _counters.cacheInvalidations,
      skips: _counters.cacheSkips,
    },
  });

  return disableDebug();
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _noop(_data?: Record<string, unknown>): void { /* no-op */ }
