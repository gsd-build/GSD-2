/**
 * In-flight tool call tracking for auto-mode idle detection.
 * Tracks which tool calls are currently executing so the idle watchdog
 * can distinguish "waiting for tool completion" from "truly idle".
 */

interface InFlightTool {
  startedAt: number;
  toolName: string;
}

const inFlightTools = new Map<string, InFlightTool>();

/**
 * Tools that block waiting for human input by design.
 * The idle watchdog must not treat these as stalled.
 */
const INTERACTIVE_TOOLS = new Set(["ask_user_questions", "secure_env_collect"]);

/**
 * Mark a tool execution as in-flight.
 * Records start time and tool name so the idle watchdog can detect tools
 * hung longer than the idle timeout while exempting interactive tools.
 */
export function markToolStart(toolCallId: string, isActive: boolean, toolName?: string): void {
  if (!isActive) return;
  inFlightTools.set(toolCallId, { startedAt: Date.now(), toolName: toolName ?? "unknown" });
}

/**
 * Mark a tool execution as completed.
 */
export function markToolEnd(toolCallId: string): void {
  inFlightTools.delete(toolCallId);
}

/**
 * Returns the age (ms) of the oldest currently in-flight tool, or 0 if none.
 */
export function getOldestInFlightToolAgeMs(): number {
  if (inFlightTools.size === 0) return 0;
  let oldestStart = Infinity;
  for (const t of inFlightTools.values()) {
    if (t.startedAt < oldestStart) oldestStart = t.startedAt;
  }
  return Date.now() - oldestStart;
}

/**
 * Returns the number of currently in-flight tools.
 */
export function getInFlightToolCount(): number {
  return inFlightTools.size;
}

/**
 * Returns the start timestamp of the oldest in-flight tool, or undefined if none.
 */
export function getOldestInFlightToolStart(): number | undefined {
  if (inFlightTools.size === 0) return undefined;
  let oldest = Infinity;
  for (const t of inFlightTools.values()) {
    if (t.startedAt < oldest) oldest = t.startedAt;
  }
  return oldest;
}

/**
 * Returns true if any currently in-flight tool is a user-interactive tool
 * (e.g. ask_user_questions, secure_env_collect) that blocks waiting for
 * human input. These must be exempt from idle stall detection.
 */
export function hasInteractiveToolInFlight(): boolean {
  for (const { toolName } of inFlightTools.values()) {
    if (INTERACTIVE_TOOLS.has(toolName)) return true;
  }
  return false;
}

/**
 * Returns true if the given tool name is a user-interactive tool.
 */
export function isInteractiveTool(toolName: string): boolean {
  return INTERACTIVE_TOOLS.has(toolName);
}

// ── Repeated notification throttle for interactive tools ──────────────────

let lastInteractiveNotificationAt = 0;
let interactiveNotificationCount = 0;

/**
 * Backoff schedule for repeated interactive-tool notifications.
 * Starts at 2min, escalates to 5min, 10min, then caps at 30min
 * so overnight waits don't spam every 2 minutes.
 */
const NOTIFICATION_BACKOFF_MS = [
  2 * 60 * 1000,   // 1st repeat: 2 min
  5 * 60 * 1000,   // 2nd repeat: 5 min
  10 * 60 * 1000,  // 3rd repeat: 10 min
  30 * 60 * 1000,  // 4th+ repeat: 30 min (cap)
];

function currentNotificationIntervalMs(): number {
  const idx = Math.min(interactiveNotificationCount, NOTIFICATION_BACKOFF_MS.length - 1);
  return NOTIFICATION_BACKOFF_MS[idx];
}

/**
 * Returns the current backoff interval in ms. Exposed for testing.
 */
export function getInteractiveNotificationIntervalMs(): number {
  return currentNotificationIntervalMs();
}

/**
 * Returns true if enough time has elapsed since the last interactive-tool
 * desktop notification to send another one. Uses incremental backoff:
 * 2min → 5min → 10min → 30min cap. Automatically updates the
 * timestamp and advances the backoff step when returning true.
 */
export function shouldRepeatInteractiveNotification(): boolean {
  const now = Date.now();
  if (now - lastInteractiveNotificationAt >= currentNotificationIntervalMs()) {
    lastInteractiveNotificationAt = now;
    interactiveNotificationCount++;
    return true;
  }
  return false;
}

/**
 * Record that an interactive-tool notification was just sent.
 * Called from the tool_execution_start hook so the first repeat
 * waits the full interval.
 */
export function markInteractiveNotificationSent(): void {
  lastInteractiveNotificationAt = Date.now();
  interactiveNotificationCount = 0;
}

/**
 * Clear all in-flight tool tracking state.
 */
export function clearInFlightTools(): void {
  inFlightTools.clear();
  lastInteractiveNotificationAt = 0;
  interactiveNotificationCount = 0;
}
