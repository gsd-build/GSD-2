import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import type { GSDState } from "./types.js";
import type {
  InterruptedSessionAssessment,
  InterruptedSessionClassification,
} from "./interrupted-session.js";

import { showConfirm, showNextAction } from "../shared/tui.js";
import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { startAutoDetached, isAutoActive } from "./auto.js";
import { assessInterruptedSession, formatInterruptedSessionRunningMessage } from "./interrupted-session.js";
import { clearLock } from "./crash-recovery.js";
import { detectProjectState, hasGsdBootstrapArtifacts } from "./detection.js";
import { deriveState } from "./state.js";
import { findMilestoneIds } from "./milestone-ids.js";
import { gsdRoot } from "./paths.js";
import { loadEffectiveGSDPreferences } from "./preferences.js";
import { setPlanningDepth } from "./planning-depth.js";
import { validateDirectory } from "./validate-directory.js";
import { logWarning } from "./workflow-logger.js";

export type LauncherStateKind =
  | "uninitialized"
  | "first-project"
  | "new-milestone"
  | "interrupted"
  | "planning"
  | "executing"
  | "complete";

export type LauncherActionId =
  | "init"
  | "quick"
  | "deep_project"
  | "deep_milestone"
  | "step"
  | "auto"
  | "status"
  | "template"
  | "discuss"
  | "plan"
  | "resume"
  | "stop"
  | "ship"
  | "setup"
  | "not_yet";

export interface SmartLauncherFacts {
  hasBootstrapArtifacts: boolean;
  milestoneCount: number;
  autoActive: boolean;
  deepStagePending: boolean;
  interruptedClassification: InterruptedSessionClassification;
  state: GSDState | null;
}

export interface SmartLauncherAction {
  id: LauncherActionId;
  label: string;
  description: string;
  recommended?: boolean;
}

export interface SmartLauncherModel {
  kind: LauncherStateKind;
  title: string;
  summary: string[];
  actions: SmartLauncherAction[];
}

function quickAction(): SmartLauncherAction {
  return {
    id: "quick",
    label: "Quick task",
    description: "Handle a small one-off task without full milestone ceremony.",
  };
}

function statusAction(): SmartLauncherAction {
  return {
    id: "status",
    label: "View status",
    description: "Open the progress dashboard for the current project.",
  };
}

function firstActiveAction(actions: SmartLauncherAction[]): SmartLauncherAction[] {
  if (actions.some((action) => action.recommended)) return actions;
  return actions.map((action, index) => index === 0 ? { ...action, recommended: true } : action);
}

function canOfferQuick(facts: SmartLauncherFacts): boolean {
  return facts.hasBootstrapArtifacts &&
    !facts.autoActive &&
    facts.interruptedClassification !== "running" &&
    facts.interruptedClassification !== "recoverable";
}

function stateTitle(state: GSDState | null): string {
  if (state?.activeMilestone) {
    const slice = state.activeSlice ? ` / ${state.activeSlice.id}` : "";
    return `GSD — ${state.activeMilestone.id}${slice}`;
  }
  if (state?.lastCompletedMilestone) {
    return `GSD — ${state.lastCompletedMilestone.id}`;
  }
  return "GSD — Get Shit Done";
}

export function buildSmartLauncherModel(facts: SmartLauncherFacts): SmartLauncherModel {
  const state = facts.state;

  if (facts.autoActive) {
    return {
      kind: "interrupted",
      title: "GSD — Auto-mode Active",
      summary: ["Auto-mode is already running. Choose a safe control action."],
      actions: firstActiveAction([
        statusAction(),
        {
          id: "stop",
          label: "Stop auto-mode",
          description: "Ask the active auto session to stop gracefully.",
        },
      ]),
    };
  }

  if (facts.interruptedClassification === "recoverable") {
    return {
      kind: "interrupted",
      title: "GSD — Resume Work",
      summary: ["A paused or interrupted GSD session can be resumed."],
      actions: firstActiveAction([
        {
          id: "resume",
          label: "Resume",
          description: "Pick up the interrupted session where it left off.",
        },
        {
          id: "step",
          label: "Continue manually",
          description: "Open the guided step flow instead of direct recovery.",
        },
        statusAction(),
        {
          id: "stop",
          label: "Stop/reset",
          description: "Clear the active auto-mode session through the normal stop flow.",
        },
      ]),
    };
  }

  if (facts.interruptedClassification === "running") {
    return {
      kind: "interrupted",
      title: "GSD — Session Running",
      summary: ["Another GSD session appears to be running."],
      actions: firstActiveAction([statusAction()]),
    };
  }

  if (!facts.hasBootstrapArtifacts) {
    return {
      kind: "uninitialized",
      title: "GSD — Start Here",
      summary: ["No initialized GSD project was found in this directory."],
      actions: firstActiveAction([
        {
          id: "init",
          label: "Initialize project",
          description: "Run the project init wizard and create local GSD state.",
        },
        {
          id: "deep_project",
          label: "Deep new project",
          description: "Initialize and use staged project discovery before planning.",
        },
        {
          id: "setup",
          label: "Setup",
          description: "Open provider, key, and preference configuration.",
        },
      ]),
    };
  }

  const hasMilestones = facts.milestoneCount > 0 || (state?.registry.length ?? 0) > 0;
  if (!hasMilestones) {
    const actions: SmartLauncherAction[] = [
      ...(canOfferQuick(facts) ? [quickAction()] : []),
      {
        id: "step",
        label: facts.deepStagePending ? "Continue deep discovery" : "Create first milestone",
        description: facts.deepStagePending
          ? "Continue the staged project discovery flow."
          : "Start the guided first-milestone flow.",
      },
      {
        id: "deep_project",
        label: "Deep project discovery",
        description: "Use staged project, requirements, and research setup before planning.",
      },
      {
        id: "template",
        label: "Run template",
        description: "Open workflow template choices such as bugfix, spike, or refactor.",
      },
      {
        id: "setup",
        label: "Setup",
        description: "Review GSD configuration for this project.",
      },
    ];
    return {
      kind: "first-project",
      title: "GSD — New Project",
      summary: ["No milestones exist yet. Pick how much structure this work needs."],
      actions: firstActiveAction(actions),
    };
  }

  if (state?.phase === "complete") {
    const actions: SmartLauncherAction[] = [
      {
        id: "step",
        label: "Start new milestone",
        description: "Define and plan the next milestone.",
      },
      {
        id: "deep_milestone",
        label: "Deep next milestone",
        description: "Use staged discovery before creating the next milestone.",
      },
      {
        id: "ship",
        label: "Ship/status",
        description: "Prepare shipping artifacts or review what was built.",
      },
      ...(canOfferQuick(facts) ? [quickAction()] : []),
      statusAction(),
    ];
    return {
      kind: "complete",
      title: stateTitle(state),
      summary: ["All current milestones are complete."],
      actions: firstActiveAction(actions),
    };
  }

  if (!state?.activeMilestone) {
    const actions: SmartLauncherAction[] = [
      {
        id: "step",
        label: "Create next milestone",
        description: "Define the next milestone from the guided flow.",
      },
      {
        id: "deep_milestone",
        label: "Deep next milestone",
        description: "Use staged discovery before creating the next milestone.",
      },
      ...(canOfferQuick(facts) ? [quickAction()] : []),
      statusAction(),
    ];
    return {
      kind: "new-milestone",
      title: "GSD — Next Milestone",
      summary: ["No active milestone is selected."],
      actions: firstActiveAction(actions),
    };
  }

  if (state.phase === "pre-planning" || state.phase === "needs-discussion") {
    const actions: SmartLauncherAction[] = [
      {
        id: "discuss",
        label: "Discuss first",
        description: "Capture context and decisions before planning.",
      },
      {
        id: "plan",
        label: "Create roadmap",
        description: "Decompose the milestone and move to the next planning unit.",
      },
      {
        id: "deep_milestone",
        label: "Deepen discovery",
        description: "Enable deep mode and continue staged discovery.",
      },
      ...(canOfferQuick(facts) ? [quickAction()] : []),
      statusAction(),
    ];
    return {
      kind: "planning",
      title: stateTitle(state),
      summary: [`${state.activeMilestone.id}: ${state.activeMilestone.title}`, "This milestone needs context or a roadmap."],
      actions: firstActiveAction(actions),
    };
  }

  const actions: SmartLauncherAction[] = [
    {
      id: "step",
      label: "Step next",
      description: "Execute one guided unit, then pause.",
    },
    {
      id: "auto",
      label: "Go auto",
      description: "Run continuously until the next stop condition.",
    },
    ...(canOfferQuick(facts) ? [quickAction()] : []),
    statusAction(),
  ];
  return {
    kind: "executing",
    title: stateTitle(state),
    summary: [state.nextAction || "Work is ready to continue."],
    actions: firstActiveAction(actions),
  };
}

async function promptQuickDescription(ctx: ExtensionCommandContext): Promise<string | null> {
  const input = await ctx.ui.input(
    "Quick task",
    "Describe the small task to execute",
  );
  const description = input?.trim() ?? "";
  if (!description) {
    ctx.ui.notify("Quick task cancelled — no task description provided.", "info");
    return null;
  }
  return description;
}

async function runLauncherAction(
  action: LauncherActionId,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  basePath: string,
  interrupted: InterruptedSessionAssessment | null,
): Promise<void> {
  switch (action) {
    case "init": {
      const { showSmartEntry } = await import("./guided-flow.js");
      await showSmartEntry(ctx, pi, basePath);
      return;
    }
    case "deep_project":
    case "deep_milestone": {
      setPlanningDepth(basePath, "deep");
      ctx.ui.notify("Deep planning mode enabled (.gsd/PREFERENCES.md updated).", "info");
      const { showSmartEntry } = await import("./guided-flow.js");
      await showSmartEntry(ctx, pi, basePath);
      return;
    }
    case "step":
    case "plan": {
      startAutoDetached(ctx, pi, basePath, false, { step: true });
      return;
    }
    case "auto": {
      startAutoDetached(ctx, pi, basePath, false);
      return;
    }
    case "resume": {
      startAutoDetached(ctx, pi, basePath, false, {
        interrupted: interrupted ?? undefined,
        step: interrupted?.pausedSession?.stepMode ?? false,
      });
      return;
    }
    case "stop": {
      const { handleAutoCommand } = await import("./commands/handlers/auto.js");
      await handleAutoCommand("stop", ctx, pi);
      return;
    }
    case "status": {
      const { handleStatus } = await import("./commands/handlers/core.js");
      await handleStatus(ctx);
      return;
    }
    case "setup": {
      const { handleSetup } = await import("./commands/handlers/core.js");
      await handleSetup("", ctx, pi);
      return;
    }
    case "template": {
      const { handleStart } = await import("./commands-workflow-templates.js");
      await handleStart("", ctx, pi);
      return;
    }
    case "quick": {
      const description = await promptQuickDescription(ctx);
      if (!description) return;
      const { handleQuick } = await import("./quick.js");
      await handleQuick(description, ctx, pi);
      return;
    }
    case "discuss": {
      const { showDiscuss } = await import("./guided-flow.js");
      await showDiscuss(ctx, pi, basePath);
      return;
    }
    case "ship": {
      const { handleShip } = await import("./commands-ship.js");
      await handleShip("", ctx, pi);
      return;
    }
    case "not_yet":
      return;
  }
}

export async function showSmartLauncher(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  basePath: string,
): Promise<void> {
  const dirCheck = validateDirectory(basePath);
  if (dirCheck.severity === "blocked") {
    ctx.ui.notify(dirCheck.reason!, "error");
    return;
  }
  if (dirCheck.severity === "warning") {
    const proceed = await showConfirm(ctx, {
      title: "GSD — Unusual Directory",
      message: dirCheck.reason!,
      confirmLabel: "Continue anyway",
      declineLabel: "Cancel",
    });
    if (!proceed) return;
  }

  const detection = detectProjectState(basePath);
  const hasBootstrap = hasGsdBootstrapArtifacts(gsdRoot(basePath));
  let interrupted: InterruptedSessionAssessment | null = null;
  let state: GSDState | null = null;
  let deepStagePending = false;

  if (hasBootstrap) {
    interrupted = await assessInterruptedSession(basePath);
    if (interrupted.classification === "running") {
      ctx.ui.notify(formatInterruptedSessionRunningMessage(interrupted), "error");
      return;
    }
    if (interrupted.classification === "stale") {
      clearLock(basePath);
      if (interrupted.pausedSession) {
        try {
          unlinkSync(join(gsdRoot(basePath), "runtime", "paused-session.json"));
        } catch (err) {
          logWarning("command", `stale paused-session cleanup failed before launcher state derivation: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      interrupted = null;
    }

    try {
      const { ensureDbOpen } = await import("./bootstrap/dynamic-tools.js");
      await ensureDbOpen(basePath);
    } catch (err) {
      logWarning("command", `DB open skipped before launcher state derivation: ${err instanceof Error ? err.message : String(err)}`);
    }

    state = await deriveState(basePath);
    const { hasPendingDeepStage } = await import("./auto-dispatch.js");
    deepStagePending = hasPendingDeepStage(
      loadEffectiveGSDPreferences(basePath)?.preferences,
      basePath,
    );
  }

  const milestoneCount = hasBootstrap
    ? Math.max(findMilestoneIds(basePath).length, state?.registry.length ?? 0)
    : detection.v2?.milestoneCount ?? 0;

  const model = buildSmartLauncherModel({
    hasBootstrapArtifacts: hasBootstrap,
    milestoneCount,
    autoActive: isAutoActive(),
    deepStagePending,
    interruptedClassification: interrupted?.classification ?? "none",
    state,
  });

  const choice = await showNextAction(ctx, {
    title: model.title,
    summary: model.summary,
    actions: model.actions,
    notYetMessage: "Run /gsd when ready.",
  }) as LauncherActionId;

  if (choice === "not_yet") return;
  await runLauncherAction(choice, ctx, pi, basePath, interrupted);
}
