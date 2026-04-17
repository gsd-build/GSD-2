// GSD Watch — Watch orchestrator: tmux guard, singleton lock, pane creation
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";
import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { WATCH_LOCK_FILE } from "./types.js";
import type { WatchLockData } from "./types.js";

/**
 * Resolve the .gsd directory for a project root.
 * Checks the root directly, then falls back to creating it.
 */
function resolveGsdDir(root: string): string {
  const gsdDir = join(root, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  return gsdDir;
}

/**
 * Returns an OS-appropriate install hint for tmux.
 * Per D-01: darwin → brew, linux → apt/dnf, other → GitHub wiki.
 */
export function buildTmuxInstallHint(): string {
  switch (platform()) {
    case "darwin":
      return "Install with: brew install tmux";
    case "linux":
      return "Install with: sudo apt install tmux (Debian/Ubuntu) or sudo dnf install tmux (Fedora/RHEL)";
    default:
      return "See https://github.com/tmux/tmux/wiki/Installing";
  }
}

/**
 * Read and parse the watch lock file from the given .gsd/ directory.
 * Returns null if the file is missing or contains invalid JSON.
 */
export function readWatchLock(gsdDir: string): WatchLockData | null {
  const lockPath = join(gsdDir, WATCH_LOCK_FILE);
  if (!existsSync(lockPath)) return null;
  try {
    const raw = readFileSync(lockPath, "utf-8");
    return JSON.parse(raw) as WatchLockData;
  } catch {
    return null;
  }
}

/**
 * Write watch lock data as JSON to .gsd/watch.lock.
 * Creates the .gsd/ directory if it does not exist.
 */
export function writeWatchLock(gsdDir: string, data: WatchLockData): void {
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(join(gsdDir, WATCH_LOCK_FILE), JSON.stringify(data, null, 2));
}

/**
 * Remove the watch lock file if it exists. Errors are silently swallowed.
 */
export function clearWatchLock(gsdDir: string): void {
  try {
    const lockPath = join(gsdDir, WATCH_LOCK_FILE);
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    // Non-fatal: lock removal failure
  }
}

/**
 * Check whether a process with the given PID is currently alive.
 * Uses process.kill(pid, 0) — no signal is sent; it merely checks existence.
 */
export function isWatchPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}

/**
 * Remove the stale watch lock and attempt to kill the orphaned tmux pane.
 * The kill-pane call is wrapped in try/catch since the pane may already be gone.
 */
export function cleanupStaleLock(gsdDir: string, lock: WatchLockData): void {
  clearWatchLock(gsdDir);
  try {
    execFileSync("tmux", ["kill-pane", "-t", lock.paneId]);
  } catch {
    // Pane may already be gone — non-fatal
  }
}

/**
 * Handle the /watch stop subcommand: kill the watch pane and remove the lock.
 */
function handleStop(gsdDir: string, ctx: ExtensionCommandContext): void {
  const lock = readWatchLock(gsdDir);
  if (lock === null) {
    ctx.ui.notify("Watch is not running", "info");
    return;
  }
  cleanupStaleLock(gsdDir, lock);
  ctx.ui.notify("Watch stopped", "info");
}

/**
 * Main entry point for the /watch command.
 *
 * Flow:
 *  1. If "stop" subcommand, kill existing pane and return
 *  2. If not in tmux, show OS-aware install hint and return
 *  3. Check singleton lock — if alive, notify; if stale, clean up
 *  4. Spawn a right-side tmux pane at 35% width running the renderer entry
 *  5. Capture the new pane's ID and PID, write the watch lock
 */
export async function handleWatch(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const root = ctx.cwd;
  const gsdDir = resolveGsdDir(root);

  // Subcommand: /watch stop
  if (args === "stop") {
    handleStop(gsdDir, ctx);
    return;
  }

  // Step 1: tmux guard
  if (!process.env.TMUX) {
    ctx.ui.notify(
      `tmux is required to run /watch.\n${buildTmuxInstallHint()}`,
      "warning",
    );
    return;
  }

  // Step 2: singleton guard
  const lock = readWatchLock(gsdDir);
  if (lock !== null) {
    if (isWatchPidAlive(lock.pid)) {
      ctx.ui.notify("Watch already running — use /watch stop to close", "info");
      return;
    }
    // Stale lock: PID is dead — clean up before relaunching
    cleanupStaleLock(gsdDir, lock);
  }

  // Step 3: spawn renderer pane
  const rendererEntryPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "renderer-entry.js",
  );

  execFileSync("tmux", [
    "split-window",
    "-h",
    "-l", "35%",
    "-d",
    "node",
    rendererEntryPath,
    root,
  ]);

  // Capture the new pane's ID and PID (targets the most recently created pane)
  const newPaneId = execFileSync(
    "tmux",
    ["display-message", "-p", "-t", "{last}", "#{pane_id}"],
    { encoding: "utf-8" },
  ).trim();

  const newPanePidStr = execFileSync(
    "tmux",
    ["display-message", "-p", "-t", "{last}", "#{pane_pid}"],
    { encoding: "utf-8" },
  ).trim();

  const newPanePid = parseInt(newPanePidStr, 10);

  writeWatchLock(gsdDir, {
    pid: newPanePid,
    paneId: newPaneId,
    startedAt: new Date().toISOString(),
    projectRoot: root,
  });

  ctx.ui.notify("Watch started — use /watch stop to close", "info");
}
