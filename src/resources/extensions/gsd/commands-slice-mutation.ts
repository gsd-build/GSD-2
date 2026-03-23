/**
 * GSD Commands — /gsd add-slice, /gsd insert-slice, /gsd remove-slice
 *
 * Thin CLI wrappers around the engine's updateRoadmap() command.
 * All mutations go through the single-writer WorkflowEngine.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { deriveState } from "./state.js";
import { _getAdapter, isDbAvailable } from "./gsd-db.js";
import { updateRoadmap } from "./workflow-commands.js";
import { renderAllProjections } from "./workflow-projections.js";

function parseFlag(args: string, flag: string): string | undefined {
  const regex = new RegExp(`${flag}\\s+(\\S+)`);
  const match = args.match(regex);
  return match?.[1];
}

function stripFlags(args: string): string {
  return args
    .replace(/--\w+\s+\S+/g, "")
    .replace(/--\w+/g, "")
    .trim();
}

function generateNextSliceId(existingIds: string[]): string {
  let maxNum = 0;
  for (const id of existingIds) {
    const match = id.match(/^S(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `S${String(maxNum + 1).padStart(2, "0")}`;
}

export async function handleAddSlice(
  args: string,
  ctx: ExtensionCommandContext,
  _pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();
  const state = await deriveState(basePath);

  if (!state.activeMilestone) {
    ctx.ui.notify("No active milestone. Create one with /gsd new-milestone first.", "warning");
    return;
  }

  const id = parseFlag(args, "--id");
  const risk = parseFlag(args, "--risk") ?? "medium";
  const dependsStr = parseFlag(args, "--depends");
  const depends = dependsStr ? dependsStr.split(",").map((d) => d.trim()) : [];
  const title = stripFlags(args).replace(/^['"]|['"]$/g, "");

  if (!title) {
    ctx.ui.notify(
      "Usage: /gsd add-slice [--id S99] [--risk high] [--depends S01,S02] <title>",
      "warning",
    );
    return;
  }

  const milestoneId = state.activeMilestone.id;

  // Determine slice ID
  const existingSliceIds = (state.activeMilestone.slices ?? []).map((s: { id: string }) => s.id);
  const sliceId = id ?? generateNextSliceId(existingSliceIds);

  if (!isDbAvailable()) {
    ctx.ui.notify("Engine database not available. Run /gsd init first.", "warning");
    return;
  }

  try {
    const db = _getAdapter();
    const result = updateRoadmap(db, {
      milestoneId,
      addSlices: [{ id: sliceId, title, risk, depends, demo: "" }],
    });
    renderAllProjections(db, basePath, milestoneId);
    ctx.ui.notify(
      `Added ${sliceId}: "${title}" (${result.totalSlices} total slices)`,
      "success",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to add slice: ${msg}`, "error");
  }
}

export async function handleInsertSlice(
  args: string,
  ctx: ExtensionCommandContext,
  _pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();
  const state = await deriveState(basePath);

  if (!state.activeMilestone) {
    ctx.ui.notify("No active milestone. Create one with /gsd new-milestone first.", "warning");
    return;
  }

  const parts = args.trim().split(/\s+/);
  const afterId = parts[0];
  const title = parts.slice(1).join(" ").replace(/^['"]|['"]$/g, "");

  if (!afterId || !title) {
    ctx.ui.notify(
      'Usage: /gsd insert-slice <after-slice-id> <title>\nExample: /gsd insert-slice S03 "Auth middleware"',
      "warning",
    );
    return;
  }

  const milestoneId = state.activeMilestone.id;
  const existingSliceIds = (state.activeMilestone.slices ?? []).map((s: { id: string }) => s.id);

  if (!existingSliceIds.includes(afterId)) {
    ctx.ui.notify(
      `Slice ${afterId} not found. Available: ${existingSliceIds.join(", ")}`,
      "warning",
    );
    return;
  }

  const sliceId = generateNextSliceId(existingSliceIds);

  if (!isDbAvailable()) {
    ctx.ui.notify("Engine database not available. Run /gsd init first.", "warning");
    return;
  }

  try {
    const db = _getAdapter();

    // Add the new slice
    updateRoadmap(db, {
      milestoneId,
      addSlices: [{ id: sliceId, title, risk: "medium", depends: [], demo: "" }],
    });

    // Reorder: insert after the specified slice
    const reorder = [...existingSliceIds];
    const insertIdx = reorder.indexOf(afterId);
    reorder.splice(insertIdx + 1, 0, sliceId);

    const result = updateRoadmap(db, {
      milestoneId,
      reorderSliceIds: reorder,
    });

    renderAllProjections(db, basePath, milestoneId);
    ctx.ui.notify(
      `Inserted ${sliceId}: "${title}" after ${afterId} (${result.totalSlices} total slices)`,
      "success",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to insert slice: ${msg}`, "error");
  }
}

export async function handleRemoveSlice(
  args: string,
  ctx: ExtensionCommandContext,
  _pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();
  const state = await deriveState(basePath);

  if (!state.activeMilestone) {
    ctx.ui.notify("No active milestone.", "warning");
    return;
  }

  const force = args.includes("--force");
  const sliceId = args.replace(/--force/g, "").trim();

  if (!sliceId) {
    ctx.ui.notify("Usage: /gsd remove-slice <slice-id> [--force]", "warning");
    return;
  }

  const milestoneId = state.activeMilestone.id;

  if (!isDbAvailable()) {
    ctx.ui.notify("Engine database not available. Run /gsd init first.", "warning");
    return;
  }

  try {
    const db = _getAdapter();

    // If force, delete tasks first
    if (force) {
      db.prepare("DELETE FROM tasks WHERE milestone_id = ? AND slice_id = ?").run(milestoneId, sliceId);
    }

    const result = updateRoadmap(db, {
      milestoneId,
      removeSliceIds: [sliceId],
    });

    if (result.removed === 0) {
      ctx.ui.notify(
        `Could not remove ${sliceId} — only pending slices can be removed. Use --force to remove slices with tasks.`,
        "warning",
      );
      return;
    }

    renderAllProjections(db, basePath, milestoneId);
    ctx.ui.notify(
      `Removed ${sliceId} (${result.totalSlices} slices remaining)`,
      "success",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to remove slice: ${msg}`, "error");
  }
}
