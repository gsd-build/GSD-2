/**
 * Headless Event Detection — notification classification and command detection
 *
 * Detects terminal notifications, blocked notifications, milestone-ready signals,
 * and classifies commands as quick (single-turn) vs long-running.
 *
 * Also defines exit code constants and the status→exit-code mapping function.
 */

// ---------------------------------------------------------------------------
// Exit Code Constants
// ---------------------------------------------------------------------------

export const EXIT_SUCCESS = 0
export const EXIT_ERROR = 1
export const EXIT_BLOCKED = 10
export const EXIT_CANCELLED = 11

/**
 * Map a headless session status string to its standardized exit code.
 *
 *   success   → 0
 *   complete  → 0
 *   completed → 0
 *   error     → 1
 *   timeout   → 1
 *   blocked   → 10
 *   cancelled → 11
 *
 * Unknown statuses default to EXIT_ERROR (1).
 */
export function mapStatusToExitCode(status: string): number {
  switch (status) {
    case 'success':
    case 'complete':
    case 'completed':
      return EXIT_SUCCESS
    case 'error':
    case 'timeout':
      return EXIT_ERROR
    case 'blocked':
      return EXIT_BLOCKED
    case 'cancelled':
      return EXIT_CANCELLED
    default:
      return EXIT_ERROR
  }
}

// ---------------------------------------------------------------------------
// Completion Detection
// ---------------------------------------------------------------------------

/**
 * Detect genuine auto-mode termination notifications.
 *
 * Only matches the actual stop signals emitted by stopAuto():
 *   "Auto-mode stopped..."
 *   "Step-mode stopped..."
 *
 * Does NOT match progress notifications that happen to contain words like
 * "complete" or "stopped" (e.g., "Override resolved — rewrite-docs completed",
 * "All slices are complete — nothing to discuss", "Skipped 5+ completed units").
 *
 * Blocked detection is separate — checked via isBlockedNotification.
 */
export const TERMINAL_PREFIXES = ['auto-mode stopped', 'step-mode stopped']
export const PAUSE_PREFIXES = ['auto-mode paused', 'step-mode paused']
export const AUTO_RESUME_RE = /auto-resuming in (\d+)s/i
export const IDLE_TIMEOUT_MS = 15_000
// new-milestone is a long-running creative task where the LLM may pause
// between tool calls (e.g. after mkdir, before writing files). Use a
// longer idle timeout to avoid killing the session prematurely (#808).
export const NEW_MILESTONE_IDLE_TIMEOUT_MS = 120_000

export function isTerminalNotification(event: Record<string, unknown>): boolean {
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  const message = String(event.message ?? '').toLowerCase()
  return TERMINAL_PREFIXES.some((prefix) => message.startsWith(prefix))
}

/**
 * Detect auto-mode pause notification.
 * These are emitted by pauseAuto() and indicate the auto-loop exited but
 * the session may be resumable (e.g. after a provider error recovery delay).
 */
export function isPauseNotification(event: Record<string, unknown>): boolean {
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  const message = String(event.message ?? '').toLowerCase()
  return PAUSE_PREFIXES.some((prefix) => message.startsWith(prefix))
}

/**
 * Extract auto-resume delay from a notification like "Auto-resuming in 30s...".
 * Returns the delay in milliseconds, or null if not an auto-resume notification.
 */
export function extractAutoResumeDelay(event: Record<string, unknown>): number | null {
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return null
  const message = String(event.message ?? '')
  const match = AUTO_RESUME_RE.exec(message)
  return match ? parseInt(match[1], 10) * 1000 : null
}

export function isBlockedNotification(event: Record<string, unknown>): boolean {
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  const message = String(event.message ?? '').toLowerCase()
  // Blocked notifications come through stopAuto as "Auto-mode stopped (Blocked: ...)"
  return message.includes('blocked:')
}

export function isMilestoneReadyNotification(event: Record<string, unknown>): boolean {
  if (event.type !== 'extension_ui_request' || event.method !== 'notify') return false
  return /milestone\s+m\d+.*ready/i.test(String(event.message ?? ''))
}

// ---------------------------------------------------------------------------
// Quick Command Detection
// ---------------------------------------------------------------------------

export const FIRE_AND_FORGET_METHODS = new Set(['notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'])

export const QUICK_COMMANDS = new Set([
  'status', 'queue', 'history', 'hooks', 'export', 'stop', 'pause',
  'capture', 'skip', 'undo', 'knowledge', 'config', 'prefs',
  'cleanup', 'migrate', 'doctor', 'remote', 'help', 'steer',
  'triage', 'visualize',
])

export function isQuickCommand(command: string): boolean {
  return QUICK_COMMANDS.has(command)
}
