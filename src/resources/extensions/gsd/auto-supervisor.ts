/**
 * Auto-mode Supervisor — signal handling and working-tree activity detection.
 *
 * Pure functions — no module-level globals or AutoContext dependency.
 */

import { clearLock } from "./crash-recovery.js";
import { releaseSessionLock } from "./session-lock.js";
import { nativeHasChanges } from "./native-git-bridge.js";

// ─── Signal Handling ─────────────────────────────────────────────────────────

/** Signals that should trigger lock cleanup on process termination. */
const CLEANUP_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGHUP", "SIGINT"];

/**
 * Register signal handlers that clear lock files and exit cleanly.
 * Installs handlers on SIGTERM, SIGHUP, and SIGINT so that lock files
 * are cleaned up regardless of how the process is terminated (normal kill,
 * parent process death, or Ctrl+C).
 *
 * Captures the active base path at registration time so the handler
 * always references the correct path even if the module variable changes.
 * Removes any previously registered handler before installing the new one.
 *
 * Returns the new handler so the caller can store and deregister it later.
 */
export function registerSigtermHandler(
  currentBasePath: string,
  previousHandler: (() => void) | null,
): () => void {
  if (previousHandler) {
    for (const sig of CLEANUP_SIGNALS) process.off(sig, previousHandler);
  }
  const handler = () => {
    clearLock(currentBasePath);
    releaseSessionLock(currentBasePath);
    process.exit(0);
  };
  for (const sig of CLEANUP_SIGNALS) process.on(sig, handler);
  return handler;
}

/** Deregister signal handlers from all cleanup signals (called on stop/pause). */
export function deregisterSigtermHandler(handler: (() => void) | null): void {
  if (handler) {
    for (const sig of CLEANUP_SIGNALS) process.off(sig, handler);
  }
}

// ─── Working Tree Activity Detection ──────────────────────────────────────────

/**
 * Detect whether the agent is producing work on disk by checking git for
 * any working-tree changes (staged, unstaged, or untracked). Returns true
 * if there are uncommitted changes — meaning the agent is actively working,
 * even though it hasn't signaled progress through runtime records.
 */
export function detectWorkingTreeActivity(cwd: string): boolean {
  try {
    return nativeHasChanges(cwd);
  } catch {
    return false;
  }
}
