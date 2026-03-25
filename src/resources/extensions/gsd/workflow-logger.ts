// GSD Extension — Workflow Logger
// Centralized warning/error accumulator for the workflow engine pipeline.
// Captures structured entries that the auto-loop can drain after each unit
// to surface root causes for stuck loops, silent degradation, and blocked writes.

// ─── Types ──────────────────────────────────────────────────────────────

export type LogSeverity = "warn" | "error";

export type LogComponent =
  | "engine"        // WorkflowEngine afterCommand side effects
  | "projection"    // Projection rendering
  | "manifest"      // Manifest write
  | "event-log"     // Event append
  | "intercept"     // Write intercept / tool-call blocks
  | "migration"     // Auto-migration from markdown
  | "state"         // deriveState fallback/degradation
  | "tool"          // Tool handler errors
  | "compaction"    // Event compaction
  | "reconcile";    // Worktree reconciliation

export interface LogEntry {
  ts: string;
  severity: LogSeverity;
  component: LogComponent;
  message: string;
  /** Optional structured context (file path, command name, etc.) */
  context?: Record<string, string>;
}

// ─── Buffer ─────────────────────────────────────────────────────────────

const MAX_BUFFER = 100;
let _buffer: LogEntry[] = [];

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Record a warning or error. Also writes to stderr for terminal visibility.
 */
export function logWarning(
  component: LogComponent,
  message: string,
  context?: Record<string, string>,
): void {
  _push("warn", component, message, context);
}

export function logError(
  component: LogComponent,
  message: string,
  context?: Record<string, string>,
): void {
  _push("error", component, message, context);
}

/**
 * Drain all accumulated entries and clear the buffer.
 * Returns entries oldest-first.
 */
export function drainLogs(): LogEntry[] {
  const entries = _buffer;
  _buffer = [];
  return entries;
}

/**
 * Peek at current entries without clearing.
 */
export function peekLogs(): readonly LogEntry[] {
  return _buffer;
}

/**
 * Check if there are any entries at a given severity or higher.
 */
export function hasErrors(): boolean {
  return _buffer.some((e) => e.severity === "error");
}

export function hasWarnings(): boolean {
  return _buffer.length > 0;
}

/**
 * Get a one-line summary of accumulated issues for stuck detection messages.
 * Returns null if no entries.
 */
export function summarizeLogs(): string | null {
  if (_buffer.length === 0) return null;
  const errors = _buffer.filter((e) => e.severity === "error");
  const warns = _buffer.filter((e) => e.severity === "warn");

  const parts: string[] = [];
  if (errors.length > 0) {
    parts.push(`${errors.length} error(s): ${errors.map((e) => e.message).join("; ")}`);
  }
  if (warns.length > 0) {
    parts.push(`${warns.length} warning(s): ${warns.map((e) => e.message).join("; ")}`);
  }
  return parts.join(" | ");
}

/**
 * Format entries for stderr output (used by auto-loop post-unit notification).
 */
export function formatForNotification(entries: readonly LogEntry[]): string {
  if (entries.length === 0) return "";
  if (entries.length === 1) {
    const e = entries[0];
    return `[${e.component}] ${e.message}`;
  }
  return entries
    .map((e) => `[${e.component}] ${e.message}`)
    .join("\n");
}

/**
 * Reset buffer (testing only).
 */
export function _resetLogs(): void {
  _buffer = [];
}

// ─── Internal ───────────────────────────────────────────────────────────

function _push(
  severity: LogSeverity,
  component: LogComponent,
  message: string,
  context?: Record<string, string>,
): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    severity,
    component,
    message,
    ...(context ? { context } : {}),
  };

  // Always forward to stderr so terminal watchers see it
  const prefix = severity === "error" ? "ERROR" : "WARN";
  const ctxStr = context ? ` ${JSON.stringify(context)}` : "";
  process.stderr.write(`[gsd:${component}] ${prefix}: ${message}${ctxStr}\n`);

  // Buffer for auto-loop to drain
  _buffer.push(entry);
  if (_buffer.length > MAX_BUFFER) {
    _buffer.shift();
  }
}
