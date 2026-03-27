/**
 * GSD Milestone Actions — Park, Unpark, and Discard operations.
 *
 * Park: Creates a PARKED.md marker file. deriveState() skips parked milestones
 * when finding the active milestone, but keeps them in the registry.
 *
 * Unpark: Removes the PARKED.md marker. The milestone resumes normal state
 * derivation (active/pending depending on position and dependencies).
 *
 * Discard: Permanently removes the milestone directory. Also prunes
 * QUEUE-ORDER.json if the discarded milestone was in it.
 */

import { existsSync, rmSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { parse, stringify } from "yaml";
import { join } from "node:path";
import {
  resolveMilestonePath,
  resolveMilestoneFile,
  buildMilestoneFileName,
} from "./paths.js";
import { invalidateAllCaches } from "./cache.js";
import { loadQueueOrder, saveQueueOrder } from "./queue-order.js";
import { isDbAvailable, updateMilestoneStatus } from "./gsd-db.js";

// ─── Park ──────────────────────────────────────────────────────────────────

/**
 * Park a milestone — creates a PARKED.md marker file with reason and timestamp.
 * Parked milestones are skipped during active-milestone discovery but stay on disk.
 * Returns true if successfully parked, false if milestone not found or already parked.
 */
export function parkMilestone(basePath: string, milestoneId: string, reason: string): boolean {
  const mDir = resolveMilestonePath(basePath, milestoneId);
  if (!mDir || !existsSync(mDir)) return false;

  // Guard: do not park a completed milestone — it would corrupt depends_on satisfaction
  const summaryFile = resolveMilestoneFile(basePath, milestoneId, "SUMMARY");
  if (summaryFile) return false;

  const parkedPath = join(mDir, buildMilestoneFileName(milestoneId, "PARKED"));
  if (existsSync(parkedPath)) return false; // already parked

  const fm = { parked_at: new Date().toISOString(), reason };
  const content = `---\n${stringify(fm).trimEnd()}\n---\n\n# ${milestoneId} — Parked\n\n> ${reason}\n`;

  writeFileSync(parkedPath, content, "utf-8");
  // Sync DB status so deriveStateFromDb also skips this milestone (#2694)
  if (isDbAvailable()) {
    try {
      updateMilestoneStatus(milestoneId, "parked");
    } catch (err) {
      process.stderr.write(`gsd: parkMilestone DB sync failed for ${milestoneId}: ${(err as Error).message}\n`);
    }
  }
  invalidateAllCaches();
  return true;
}

// ─── Unpark ────────────────────────────────────────────────────────────────

/**
 * Unpark a milestone — removes the PARKED.md marker file.
 * Returns true if successfully unparked, false if milestone not found or not parked.
 */
export function unparkMilestone(basePath: string, milestoneId: string): boolean {
  const mDir = resolveMilestonePath(basePath, milestoneId);
  if (!mDir || !existsSync(mDir)) return false;

  const parkedPath = join(mDir, buildMilestoneFileName(milestoneId, "PARKED"));
  if (!existsSync(parkedPath)) return false; // not parked

  unlinkSync(parkedPath);
  // Sync DB status so deriveStateFromDb picks up the unparked milestone (#2694)
  if (isDbAvailable()) {
    try {
      updateMilestoneStatus(milestoneId, "active");
    } catch (err) {
      process.stderr.write(`gsd: unparkMilestone DB sync failed for ${milestoneId}: ${(err as Error).message}\n`);
    }
  }
  invalidateAllCaches();
  return true;
}

// ─── Discard ───────────────────────────────────────────────────────────────

/**
 * Discard a milestone — permanently removes the milestone directory and
 * prunes it from QUEUE-ORDER.json if present.
 * Returns true if successfully discarded, false if milestone not found.
 */
export function discardMilestone(basePath: string, milestoneId: string): boolean {
  const mDir = resolveMilestonePath(basePath, milestoneId);
  if (!mDir || !existsSync(mDir)) return false;

  rmSync(mDir, { recursive: true, force: true });

  // Prune from queue order if present
  const order = loadQueueOrder(basePath);
  if (order && order.includes(milestoneId)) {
    saveQueueOrder(basePath, order.filter(id => id !== milestoneId));
  }

  invalidateAllCaches();
  return true;
}

// ─── Query ─────────────────────────────────────────────────────────────────

/**
 * Check whether a milestone is parked (PARKED.md exists).
 */
export function isParked(basePath: string, milestoneId: string): boolean {
  return !!resolveMilestoneFile(basePath, milestoneId, "PARKED");
}

/**
 * Read the park reason from PARKED.md frontmatter.
 * Returns null if the milestone is not parked or the reason can't be extracted.
 */
export function getParkedReason(basePath: string, milestoneId: string): string | null {
  const parkedFile = resolveMilestoneFile(basePath, milestoneId, "PARKED");
  if (!parkedFile) return null;

  try {
    const content = readFileSync(parkedFile, "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const parsed = parse(match[1], { schema: "failsafe" }) as Record<string, unknown> | null;
    return typeof parsed?.reason === "string" ? parsed.reason : null;
  } catch {
    return null;
  }
}
