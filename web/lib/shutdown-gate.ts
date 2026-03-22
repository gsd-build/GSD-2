/**
 * Shutdown gate — defers process.exit() so that page refreshes (which fire
 * `pagehide` then immediately re-boot) don't kill the server.
 *
 * Flow:
 *   pagehide → POST /api/shutdown → scheduleShutdown() → timer starts
 *   refresh  → GET  /api/boot     → cancelShutdown()   → timer cleared
 *   tab close → timer fires → process.exit(0)
 */

const SHUTDOWN_DELAY_MS = 3_000;

let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a graceful process exit after SHUTDOWN_DELAY_MS.
 * If cancelShutdown() is called before the timer fires (e.g. a page refresh
 * triggers a boot request), the exit is aborted.
 */
export function scheduleShutdown(): void {
  // Don't stack timers — reset if already scheduled
  if (shutdownTimer !== null) {
    clearTimeout(shutdownTimer);
  }

  shutdownTimer = setTimeout(() => {
    shutdownTimer = null;
    process.exit(0);
  }, SHUTDOWN_DELAY_MS);
}

/**
 * Cancel a pending shutdown. Called by any incoming API request that proves
 * the client is still alive (boot, SSE reconnect, etc.).
 */
export function cancelShutdown(): void {
  if (shutdownTimer !== null) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
}

/**
 * Check whether a shutdown is currently pending.
 */
export function isShutdownPending(): boolean {
  return shutdownTimer !== null;
}
