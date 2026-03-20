import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { enableDebug } from "../../debug-logger.js";
import { getAutoDashboardData, isAutoActive, isAutoPaused, pauseAuto, startAuto, stopAuto, stopAutoRemote } from "../../auto.js";
import { handleRate } from "../../commands-rate.js";
import { guardRemoteSession, projectRoot } from "../context.js";

export async function handleAutoCommand(trimmed: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<boolean> {
  if (trimmed === "next" || trimmed.startsWith("next ")) {
    if (trimmed.includes("--dry-run")) {
      const { handleDryRun } = await import("../../commands-maintenance.js");
      await handleDryRun(ctx, projectRoot());
      return true;
    }
    const verboseMode = trimmed.includes("--verbose");
    const debugMode = trimmed.includes("--debug");
    if (debugMode) enableDebug(projectRoot());
    if (!(await guardRemoteSession(ctx, pi))) return true;
    await startAuto(ctx, pi, projectRoot(), verboseMode, { step: true });
    return true;
  }

  if (trimmed === "auto" || trimmed.startsWith("auto ")) {
    const verboseMode = trimmed.includes("--verbose");
    const debugMode = trimmed.includes("--debug");
    if (debugMode) enableDebug(projectRoot());
    if (!(await guardRemoteSession(ctx, pi))) return true;
    await startAuto(ctx, pi, projectRoot(), verboseMode);
    return true;
  }

  if (trimmed === "stop") {
    if (!isAutoActive() && !isAutoPaused()) {
      const result = stopAutoRemote(projectRoot());
      if (result.found) {
        ctx.ui.notify(`Sent stop signal to auto-mode session (PID ${result.pid}). It will shut down gracefully.`, "info");
      } else if (result.error) {
        ctx.ui.notify(`Failed to stop remote auto-mode: ${result.error}`, "error");
      } else {
        ctx.ui.notify("Auto-mode is not running.", "info");
      }
      return true;
    }
    await stopAuto(ctx, pi, "User requested stop");
    return true;
  }

  if (trimmed === "pause") {
    if (!isAutoActive()) {
      if (isAutoPaused()) {
        ctx.ui.notify("Auto-mode is already paused. /gsd auto to resume.", "info");
      } else {
        ctx.ui.notify("Auto-mode is not running.", "info");
      }
      return true;
    }
    await pauseAuto(ctx, pi);
    return true;
  }

  if (trimmed === "rate" || trimmed.startsWith("rate ")) {
    await handleRate(trimmed.replace(/^rate\s*/, "").trim(), ctx, projectRoot());
    return true;
  }

  if (trimmed === "") {
    if (!(await guardRemoteSession(ctx, pi))) return true;
    await startAuto(ctx, pi, projectRoot(), false, { step: true });
    return true;
  }

  return false;
}

