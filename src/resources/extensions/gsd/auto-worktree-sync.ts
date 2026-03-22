// GSD-2 Single-Writer State Architecture — Worktree Sync
// Syncs state between worktree and project root using snapshot/restore (engine
// projects) or file-copy (legacy projects without state-manifest.json).
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import {
  existsSync,
  readFileSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { join, sep as pathSep } from "node:path";
import { homedir } from "node:os";
import { safeCopy, safeCopyRecursive } from "./safe-fs.js";
import { restore, writeManifest } from "./workflow-manifest.js";
import type { StateManifest } from "./workflow-manifest.js";
import { renderAllProjections } from "./workflow-projections.js";
import { acquireSyncLock, releaseSyncLock } from "./sync-lock.js";
import { _getAdapter } from "./gsd-db.js";

const gsdHome = process.env.GSD_HOME || join(homedir(), ".gsd");

// ─── Project Root → Worktree Sync ─────────────────────────────────────────

/**
 * Sync state from project root INTO worktree before deriveState.
 *
 * Engine projects (state-manifest.json exists): reads manifest from projectRoot,
 * calls restore() to load into worktree DB, then renderAllProjections.
 * Legacy projects: falls through to file-copy + DB delete path.
 * Runtime artifacts (units/) are always file-copied (D-02 hybrid).
 *
 * Non-fatal — sync failure should never block dispatch.
 */
export function syncProjectRootToWorktree(
  projectRoot: string,
  worktreePath: string,
  milestoneId: string | null,
): void {
  if (!worktreePath || !projectRoot || worktreePath === projectRoot) return;
  if (!milestoneId) return;

  const prManifest = join(projectRoot, ".gsd", "state-manifest.json");

  // D-03: capability check — legacy project fallback
  if (!existsSync(prManifest)) {
    // Legacy path: file copy + DB delete (kept for projects without engine)
    const prGsd = join(projectRoot, ".gsd");
    const wtGsd = join(worktreePath, ".gsd");
    safeCopyRecursive(
      join(prGsd, "milestones", milestoneId),
      join(wtGsd, "milestones", milestoneId),
    );
    try {
      const wtDb = join(wtGsd, "gsd.db");
      if (existsSync(wtDb)) unlinkSync(wtDb);
    } catch { /* non-fatal */ }
    return;
  }

  // D-01: snapshot/restore path
  const lock = acquireSyncLock(worktreePath);
  if (!lock.acquired) {
    process.stderr.write("[gsd] sync project→worktree skipped: lock held\n");
    return;
  }
  try {
    // Pitfall #1: read manifest from projectRoot, restore into worktree DB
    const manifest = JSON.parse(readFileSync(prManifest, "utf-8")) as StateManifest;
    const db = _getAdapter();
    if (db) {
      restore(db, manifest);
      renderAllProjections(worktreePath, milestoneId);
    }
    // D-02: runtime artifacts still file-copied
    safeCopyRecursive(
      join(projectRoot, ".gsd", "runtime", "units"),
      join(worktreePath, ".gsd", "runtime", "units"),
    );
  } catch (err) {
    process.stderr.write(`[gsd] sync project→worktree failed (non-fatal): ${(err as Error).message}\n`);
  } finally {
    releaseSyncLock(worktreePath);
  }
}

// ─── Worktree → Project Root Sync ─────────────────────────────────────────

/**
 * Sync state from worktree to project root after mutations.
 *
 * Engine projects (state-manifest.json exists): calls writeManifest() to
 * snapshot DB state into projectRoot/.gsd/state-manifest.json, then
 * renderAllProjections at projectRoot.
 * Legacy projects: falls through to file-copy path (STATE.md + milestone dir).
 * Runtime artifacts (units/) are always file-copied with force (D-02 hybrid).
 *
 * Non-fatal — sync failure should never block dispatch.
 */
export function syncStateToProjectRoot(
  worktreePath: string,
  projectRoot: string,
  milestoneId: string | null,
): void {
  if (!worktreePath || !projectRoot || worktreePath === projectRoot) return;
  if (!milestoneId) return;

  const wtManifest = join(worktreePath, ".gsd", "state-manifest.json");

  // D-03: capability check — legacy fallback
  if (!existsSync(wtManifest)) {
    const wtGsd = join(worktreePath, ".gsd");
    const prGsd = join(projectRoot, ".gsd");
    safeCopy(join(wtGsd, "STATE.md"), join(prGsd, "STATE.md"), { force: true });
    safeCopyRecursive(
      join(wtGsd, "milestones", milestoneId),
      join(prGsd, "milestones", milestoneId),
      { force: true },
    );
    safeCopyRecursive(
      join(wtGsd, "runtime", "units"),
      join(prGsd, "runtime", "units"),
      { force: true },
    );
    return;
  }

  // D-01: snapshot → writeManifest → renderAllProjections
  const lock = acquireSyncLock(projectRoot);
  if (!lock.acquired) {
    process.stderr.write("[gsd] sync worktree→project skipped: lock held\n");
    return;
  }
  try {
    const db = _getAdapter();
    if (db) {
      writeManifest(projectRoot, db);
      renderAllProjections(projectRoot, milestoneId);
    }
    // D-02: runtime artifacts still file-copied
    safeCopyRecursive(
      join(worktreePath, ".gsd", "runtime", "units"),
      join(projectRoot, ".gsd", "runtime", "units"),
      { force: true },
    );
  } catch (err) {
    process.stderr.write(`[gsd] sync worktree→project failed (non-fatal): ${(err as Error).message}\n`);
  } finally {
    releaseSyncLock(projectRoot);
  }
}

// ─── Resource Staleness ───────────────────────────────────────────────────

/**
 * Read the resource version (semver) from the managed-resources manifest.
 * Uses gsdVersion instead of syncedAt so that launching a second session
 * doesn't falsely trigger staleness (#804).
 */
export function readResourceVersion(): string | null {
  const agentDir =
    process.env.GSD_CODING_AGENT_DIR || join(gsdHome, "agent");
  const manifestPath = join(agentDir, "managed-resources.json");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return typeof manifest?.gsdVersion === "string"
      ? manifest.gsdVersion
      : null;
  } catch {
    return null;
  }
}

/**
 * Check if managed resources have been updated since session start.
 * Returns a warning message if stale, null otherwise.
 */
export function checkResourcesStale(
  versionOnStart: string | null,
): string | null {
  if (versionOnStart === null) return null;
  const current = readResourceVersion();
  if (current === null) return null;
  if (current !== versionOnStart) {
    return "GSD resources were updated since this session started. Restart gsd to load the new code.";
  }
  return null;
}

// ─── Stale Worktree Escape ────────────────────────────────────────────────

/**
 * Detect and escape a stale worktree cwd (#608).
 *
 * After milestone completion + merge, the worktree directory is removed but
 * the process cwd may still point inside `.gsd/worktrees/<MID>/`.
 * When a new session starts, `process.cwd()` is passed as `base` to startAuto
 * and all subsequent writes land in the wrong directory. This function detects
 * that scenario and chdir back to the project root.
 *
 * Returns the corrected base path.
 */
export function escapeStaleWorktree(base: string): string {
  // Direct layout: /.gsd/worktrees/
  const directMarker = `${pathSep}.gsd${pathSep}worktrees${pathSep}`;
  let idx = base.indexOf(directMarker);
  if (idx === -1) {
    // Symlink-resolved layout: /.gsd/projects/<hash>/worktrees/
    const symlinkRe = new RegExp(
      `\\${pathSep}\\.gsd\\${pathSep}projects\\${pathSep}[a-f0-9]+\\${pathSep}worktrees\\${pathSep}`,
    );
    const match = base.match(symlinkRe);
    if (!match || match.index === undefined) return base;
    idx = match.index;
  }

  // base is inside .gsd/worktrees/<something> — extract the project root
  const projectRoot = base.slice(0, idx);

  // Guard: If the candidate project root's .gsd IS the user-level ~/.gsd,
  // the string-slice heuristic matched the wrong /.gsd/ boundary. This happens
  // when .gsd is a symlink into ~/.gsd/projects/<hash> and process.cwd()
  // resolved through the symlink. Returning ~ would be catastrophic (#1676).
  const candidateGsd = join(projectRoot, ".gsd").replaceAll("\\", "/");
  const gsdHomePath = gsdHome.replaceAll("\\", "/");
  if (candidateGsd === gsdHomePath || candidateGsd.startsWith(gsdHomePath + "/")) {
    // Don't chdir to home — return base unchanged.
    // resolveProjectRoot() in worktree.ts has the full git-file-based recovery
    // and will be called by the caller (startAuto → projectRoot()).
    return base;
  }

  try {
    process.chdir(projectRoot);
  } catch {
    // If chdir fails, return the original — caller will handle errors downstream
    return base;
  }
  return projectRoot;
}

/**
 * Clean stale runtime unit files for completed milestones.
 *
 * After restart, stale runtime/units/*.json from prior milestones can
 * cause deriveState to resume the wrong milestone (#887). Removes files
 * for milestones that have a SUMMARY (fully complete).
 */
export function cleanStaleRuntimeUnits(
  gsdRootPath: string,
  hasMilestoneSummary: (mid: string) => boolean,
): number {
  const runtimeUnitsDir = join(gsdRootPath, "runtime", "units");
  if (!existsSync(runtimeUnitsDir)) return 0;

  let cleaned = 0;
  try {
    for (const file of readdirSync(runtimeUnitsDir)) {
      if (!file.endsWith(".json")) continue;
      const midMatch = file.match(/(M\d+(?:-[a-z0-9]{6})?)/);
      if (!midMatch) continue;
      if (hasMilestoneSummary(midMatch[1])) {
        try {
          unlinkSync(join(runtimeUnitsDir, file));
          cleaned++;
        } catch {
          /* non-fatal */
        }
      }
    }
  } catch {
    /* non-fatal */
  }
  return cleaned;
}
