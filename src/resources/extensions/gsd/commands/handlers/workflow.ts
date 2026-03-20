import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { handleQuick } from "../../quick.js";
import { showDiscuss, showHeadlessMilestoneCreation, showQueue } from "../../guided-flow.js";
import { handleStart, handleTemplates } from "../../commands-workflow-templates.js";
import { gsdRoot } from "../../paths.js";
import { deriveState } from "../../state.js";
import { isParked, parkMilestone, unparkMilestone } from "../../milestone-actions.js";
import { loadEffectiveGSDPreferences } from "../../preferences.js";
import { nextMilestoneId } from "../../milestone-ids.js";
import { findMilestoneIds } from "../../guided-flow.js";
import { projectRoot } from "../context.js";

export async function handleWorkflowCommand(trimmed: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<boolean> {
  if (trimmed === "queue") {
    await showQueue(ctx, pi, projectRoot());
    return true;
  }
  if (trimmed === "discuss") {
    await showDiscuss(ctx, pi, projectRoot());
    return true;
  }
  if (trimmed === "quick" || trimmed.startsWith("quick ")) {
    await handleQuick(trimmed.replace(/^quick\s*/, "").trim(), ctx, pi);
    return true;
  }
  if (trimmed === "new-milestone") {
    const basePath = projectRoot();
    const headlessContextPath = join(gsdRoot(basePath), "runtime", "headless-context.md");
    if (existsSync(headlessContextPath)) {
      const seedContext = readFileSync(headlessContextPath, "utf-8");
      try { unlinkSync(headlessContextPath); } catch { /* non-fatal */ }
      await showHeadlessMilestoneCreation(ctx, pi, basePath, seedContext);
    } else {
      const { showSmartEntry } = await import("../../guided-flow.js");
      await showSmartEntry(ctx, pi, basePath);
    }
    return true;
  }
  if (trimmed === "start" || trimmed.startsWith("start ")) {
    await handleStart(trimmed.replace(/^start\s*/, "").trim(), ctx, pi);
    return true;
  }
  if (trimmed === "templates" || trimmed.startsWith("templates ")) {
    await handleTemplates(trimmed.replace(/^templates\s*/, "").trim(), ctx);
    return true;
  }
  if (trimmed === "park" || trimmed.startsWith("park ")) {
    const basePath = projectRoot();
    const arg = trimmed.replace(/^park\s*/, "").trim();
    let targetId = arg;
    if (!targetId) {
      const state = await deriveState(basePath);
      if (!state.activeMilestone) {
        ctx.ui.notify("No active milestone to park.", "warning");
        return true;
      }
      targetId = state.activeMilestone.id;
    }
    if (isParked(basePath, targetId)) {
      ctx.ui.notify(`${targetId} is already parked. Use /gsd unpark ${targetId} to reactivate.`, "info");
      return true;
    }
    const reasonParts = arg.replace(targetId, "").trim().replace(/^["']|["']$/g, "");
    const reason = reasonParts || "Parked via /gsd park";
    const success = parkMilestone(basePath, targetId, reason);
    ctx.ui.notify(
      success ? `Parked ${targetId}. Run /gsd unpark ${targetId} to reactivate.` : `Could not park ${targetId} — milestone not found.`,
      success ? "info" : "warning",
    );
    return true;
  }
  if (trimmed === "unpark" || trimmed.startsWith("unpark ")) {
    const basePath = projectRoot();
    const arg = trimmed.replace(/^unpark\s*/, "").trim();
    let targetId = arg;
    if (!targetId) {
      const state = await deriveState(basePath);
      const parkedEntries = state.registry.filter((entry) => entry.status === "parked");
      if (parkedEntries.length === 0) {
        ctx.ui.notify("No parked milestones.", "info");
        return true;
      }
      if (parkedEntries.length === 1) {
        targetId = parkedEntries[0].id;
      } else {
        ctx.ui.notify(`Parked milestones: ${parkedEntries.map((entry) => entry.id).join(", ")}. Specify which to unpark: /gsd unpark <id>`, "info");
        return true;
      }
    }
    const success = unparkMilestone(basePath, targetId);
    ctx.ui.notify(
      success ? `Unparked ${targetId}. It will resume its normal position in the queue.` : `Could not unpark ${targetId} — milestone not found or not parked.`,
      success ? "info" : "warning",
    );
    return true;
  }
  return false;
}

export function getNextMilestoneId(basePath: string): string {
  const milestoneIds = findMilestoneIds(basePath);
  const uniqueIds = !!loadEffectiveGSDPreferences()?.preferences?.unique_milestone_ids;
  return nextMilestoneId(milestoneIds, uniqueIds);
}

