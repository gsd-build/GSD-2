// GSD Extension — Undo Last Unit
// Rollback the most recent completed unit: revert git, remove state, uncheck plans.

import type { ExtensionCommandContext, ExtensionAPI } from "@gsd/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { nativeRevertCommit, nativeRevertAbort } from "./native-git-bridge.js";
import { deriveState } from "./state.js";
import { invalidateAllCaches } from "./cache.js";
import { gsdRoot, resolveTasksDir, resolveSlicePath, buildTaskFileName } from "./paths.js";
import { sendDesktopNotification } from "./notifications.js";

/**
 * Undo the last completed unit: revert git commits,
 * delete summary artifacts, and uncheck the task in PLAN.
 * deriveState() handles re-derivation after revert.
 */
export async function handleUndo(args: string, ctx: ExtensionCommandContext, _pi: ExtensionAPI, basePath: string): Promise<void> {
  const force = args.includes("--force");

  // Find the last GSD-related commit from git activity logs
  const activityDir = join(gsdRoot(basePath), "activity");
  if (!existsSync(activityDir)) {
    ctx.ui.notify("Nothing to undo — no activity logs found.", "info");
    return;
  }

  // Parse activity logs to find the most recent unit
  const files = readdirSync(activityDir)
    .filter(f => f.endsWith(".jsonl"))
    .sort()
    .reverse();

  if (files.length === 0) {
    ctx.ui.notify("Nothing to undo — no activity logs found.", "info");
    return;
  }

  // Extract unit type and ID from the most recent activity log filename
  // Format: <seq>-<unitType>-<unitId>.jsonl
  const match = files[0].match(/^\d+-(.+?)-(.+)\.jsonl$/);
  if (!match) {
    ctx.ui.notify("Nothing to undo — could not parse latest activity log.", "warning");
    return;
  }

  const unitType = match[1];
  const unitId = match[2].replace(/-/g, "/");

  if (!force) {
    ctx.ui.notify(
      `Will undo: ${unitType} (${unitId})\n` +
      `This will:\n` +
      `  - Delete summary artifacts\n` +
      `  - Uncheck task in PLAN (if execute-task)\n` +
      `  - Attempt to revert associated git commits\n\n` +
      `Run /gsd undo --force to confirm.`,
      "warning",
    );
    return;
  }

  // 1. Delete summary artifact
  const parts = unitId.split("/");
  let summaryRemoved = false;
  if (parts.length === 3) {
    // Task-level: M001/S01/T01
    const [mid, sid, tid] = parts;
    const tasksDir = resolveTasksDir(basePath, mid, sid);
    if (tasksDir) {
      const summaryFile = join(tasksDir, buildTaskFileName(tid, "SUMMARY"));
      if (existsSync(summaryFile)) {
        unlinkSync(summaryFile);
        summaryRemoved = true;
      }
    }
  } else if (parts.length === 2) {
    // Slice-level: M001/S01
    const [mid, sid] = parts;
    const slicePath = resolveSlicePath(basePath, mid, sid);
    if (slicePath) {
      for (const suffix of ["SUMMARY", "COMPLETE"]) {
        const candidates = findFileWithPrefix(slicePath, sid, suffix);
        for (const f of candidates) {
          unlinkSync(f);
          summaryRemoved = true;
        }
      }
    }
  }

  // 2. Uncheck task in PLAN if execute-task
  let planUpdated = false;
  if (unitType === "execute-task" && parts.length === 3) {
    const [mid, sid, tid] = parts;
    planUpdated = uncheckTaskInPlan(basePath, mid, sid, tid);
  }

  // 3. Try to revert git commits from activity log
  let commitsReverted = 0;
  try {
    const commits = findCommitsForUnit(activityDir, unitType, unitId);
    if (commits.length > 0) {
      for (const sha of commits.reverse()) {
        try {
          nativeRevertCommit(basePath, sha);
          commitsReverted++;
        } catch {
          // Revert conflict or already reverted — skip
          try { nativeRevertAbort(basePath); } catch { /* no-op */ }
          break;
        }
      }
    }
  } finally {
    // 4. Re-derive state — always invalidate caches even if git operations fail
    invalidateAllCaches();
    await deriveState(basePath);
  }

  // Build result message
  const results: string[] = [`Undone: ${unitType} (${unitId})`];
  if (summaryRemoved) results.push(`  - Deleted summary artifact`);
  if (planUpdated) results.push(`  - Unchecked task in PLAN`);
  if (commitsReverted > 0) {
    results.push(`  - Reverted ${commitsReverted} commit(s) (staged, not committed)`);
    results.push(`  Review with 'git diff --cached' then 'git commit' or 'git reset HEAD'`);
  }

  ctx.ui.notify(results.join("\n"), "success");
  sendDesktopNotification("GSD", `Undone: ${unitType} (${unitId})`, "info", "complete");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function uncheckTaskInPlan(basePath: string, mid: string, sid: string, tid: string): boolean {
  const slicePath = resolveSlicePath(basePath, mid, sid);
  if (!slicePath) return false;

  // Find the PLAN file
  const planCandidates = findFileWithPrefix(slicePath, sid, "PLAN");
  if (planCandidates.length === 0) return false;

  const planFile = planCandidates[0];
  let content = readFileSync(planFile, "utf-8");

  // Match checked task line: - [x] **T01** or - [x] T01:
  const regex = new RegExp(`^(\\s*-\\s*)\\[x\\](\\s*\\**${tid}\\**[:\\s])`, "mi");
  if (regex.test(content)) {
    content = content.replace(regex, "$1[ ]$2");
    writeFileSync(planFile, content, "utf-8");
    return true;
  }
  return false;
}

function findFileWithPrefix(dir: string, prefix: string, suffix: string): string[] {
  try {
    const files = readdirSync(dir);
    return files
      .filter(f => f.includes(suffix) && (f.startsWith(prefix) || f.startsWith(`${prefix}-`)))
      .map(f => join(dir, f));
  } catch {
    return [];
  }
}

export function findCommitsForUnit(activityDir: string, unitType: string, unitId: string): string[] {
  const safeUnitId = unitId.replace(/\//g, "-");
  const commitSet = new Set<string>();
  const commits: string[] = [];

  try {
    const files = readdirSync(activityDir)
      .filter(f => f.includes(unitType) && f.includes(safeUnitId) && f.endsWith(".jsonl"))
      .sort()
      .reverse();

    if (files.length === 0) return [];

    // Parse the most recent activity log for this unit
    const content = readFileSync(join(activityDir, files[0]), "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        // Look for tool results containing git commit output
        if (entry?.message?.content) {
          const blocks = Array.isArray(entry.message.content) ? entry.message.content : [];
          for (const block of blocks) {
            if (block.type === "tool_result" && typeof block.content === "string") {
              for (const sha of extractCommitShas(block.content)) {
                if (!commitSet.has(sha)) {
                  commitSet.add(sha);
                  commits.push(sha);
                }
              }
            }
          }
        }
      } catch { /* malformed JSON line — skip */ }
    }
  } catch { /* activity dir issues — skip */ }

  return commits;
}

export function extractCommitShas(content: string): string[] {
  const seen = new Set<string>();
  const commits: string[] = [];
  for (const match of content.matchAll(/\[[\w/.-]+\s+([a-f0-9]{7,40})\]/g)) {
    const sha = match[1];
    if (sha && !seen.has(sha)) {
      seen.add(sha);
      commits.push(sha);
    }
  }
  return commits;
}
