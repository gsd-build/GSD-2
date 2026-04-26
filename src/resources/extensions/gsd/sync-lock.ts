// GSD Extension — Advisory Sync Lock
// Prevents concurrent worktree syncs from colliding via a simple file lock.
// Stale locks (mtime > 60s, owner PID confirmed dead) are overridden. Lock
// acquisition waits up to 5 seconds then skips non-fatally.

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";

const STALE_THRESHOLD_MS = 60_000; // 60 seconds
const DEFAULT_TIMEOUT_MS = 5_000;  // 5 seconds
const SPIN_INTERVAL_MS = 100;      // 100ms polling interval

// SharedArrayBuffer for synchronous sleep via Atomics.wait
const SLEEP_BUFFER = new SharedArrayBuffer(4);
const SLEEP_VIEW = new Int32Array(SLEEP_BUFFER);

function lockFilePath(basePath: string): string {
  return join(basePath, ".gsd", "sync.lock");
}

function sleepSync(ms: number): void {
  Atomics.wait(SLEEP_VIEW, 0, 0, ms);
}

/** True if the given PID is alive in the current process namespace. */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}

/**
 * Atomically create the lock file with `O_EXCL` semantics. Returns true on
 * exclusive create, false if the file already existed. Any other error
 * propagates.
 */
function tryCreateLockFile(lp: string, payload: string): boolean {
  // Ensure parent dir exists (`atomicWriteSync` previously did this implicitly).
  try {
    mkdirSync(dirname(lp), { recursive: true });
  } catch {
    /* best-effort */
  }
  let fd: number;
  try {
    // "wx" → O_WRONLY | O_CREAT | O_EXCL — atomic create-if-not-exists on POSIX.
    fd = openSync(lp, "wx");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return false;
    throw err;
  }
  try {
    writeSync(fd, payload);
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * Acquire an advisory sync lock for the given basePath.
 * Returns { acquired: true } on success, { acquired: false } after timeout.
 *
 * Replaces a non-atomic `existsSync` + `atomicWriteSync` (write-temp+rename,
 * which is not exclusive-create) sequence that allowed two callers to both
 * believe they had acquired the lock, corrupting the event log.
 * (Issue #4980 CRIT-4)
 *
 * Stale-lock override now also verifies the recorded owner PID is dead
 * before stealing — prevents a slow event-loop pause (>60s under heavy I/O)
 * from making a legitimately-held lock appear stale and get stolen.
 * (Issue #4980 M-concurrency-3)
 */
export function acquireSyncLock(
  basePath: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): { acquired: boolean } {
  const lp = lockFilePath(basePath);
  const deadline = Date.now() + timeoutMs;
  const lockData = JSON.stringify(
    { pid: process.pid, acquired_at: new Date().toISOString() },
    null,
    2,
  );

  while (true) {
    // First try the fast path: atomic create. No check-then-write race.
    try {
      if (tryCreateLockFile(lp, lockData)) {
        return { acquired: true };
      }
    } catch {
      /* unexpected — fall through to retry */
    }

    // File exists. Decide whether to steal (stale + owner dead) or wait.
    let canSteal = false;
    try {
      const stat = statSync(lp);
      const age = Date.now() - stat.mtimeMs;
      if (age > STALE_THRESHOLD_MS) {
        // Verify the recorded owner PID is dead before stealing.
        let ownerAlive = false;
        try {
          const data = JSON.parse(readFileSync(lp, "utf-8")) as { pid?: number };
          if (typeof data.pid === "number" && data.pid !== process.pid) {
            ownerAlive = isPidAlive(data.pid);
          }
        } catch {
          // Lock contents unreadable — be conservative and steal only on age.
          // A garbage lock file that we cannot parse is safer to remove than
          // to leave wedging the lock indefinitely.
        }
        canSteal = !ownerAlive;
      }
    } catch {
      // stat failed (file removed between exists and stat) — retry create.
      continue;
    }

    if (canSteal) {
      try { unlinkSync(lp); } catch { /* race: already removed */ }
      // Loop back to retry create.
      continue;
    }

    // Lock is held and not stale (or owner is alive) — wait or give up.
    if (Date.now() >= deadline) {
      return { acquired: false };
    }
    sleepSync(SPIN_INTERVAL_MS);
  }
}

/**
 * Release the advisory sync lock. No-op if lock file does not exist.
 */
export function releaseSyncLock(basePath: string): void {
  const lp = lockFilePath(basePath);
  try {
    if (existsSync(lp)) {
      unlinkSync(lp);
    }
  } catch {
    // Non-fatal — lock may have been released by another process
  }
}
