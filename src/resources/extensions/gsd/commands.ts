/**
 * GSD Command — /gsd
 *
 * One command, one wizard. Routes to smart entry or status.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveState } from "./state.js";
import { GSDDashboardOverlay } from "./dashboard-overlay.js";
import { showSmartEntry, showQueue, showDiscuss } from "./guided-flow.js";
import { startAuto, stopAuto, isAutoActive, isAutoPaused } from "./auto.js";
import {
  getGlobalGSDPreferencesPath,
  getLegacyGlobalGSDPreferencesPath,
  getProjectGSDPreferencesPath,
  loadGlobalGSDPreferences,
  loadProjectGSDPreferences,
  loadEffectiveGSDPreferences,
  resolveAllSkillReferences,
} from "./preferences.js";
import { loadFile, saveFile } from "./files.js";
import {
  formatDoctorIssuesForPrompt,
  formatDoctorReport,
  runGSDDoctor,
  selectDoctorScope,
  filterDoctorIssues,
} from "./doctor.js";
import { loadPrompt } from "./prompt-loader.js";
import { handleMigrate } from "./migrate/command.js";

function dispatchDoctorHeal(pi: ExtensionAPI, scope: string | undefined, reportText: string, structuredIssues: string): void {
  const workflowPath = process.env.GSD_WORKFLOW_PATH ?? join(process.env.HOME ?? "~", ".pi", "GSD-WORKFLOW.md");
  const workflow = readFileSync(workflowPath, "utf-8");
  const prompt = loadPrompt("doctor-heal", {
    doctorSummary: reportText,
    structuredIssues,
    scopeLabel: scope ?? "active milestone / blocking scope",
    doctorCommandSuffix: scope ? ` ${scope}` : "",
  });

  const content = `Read the following GSD workflow protocol and execute exactly.\n\n${workflow}\n\n## Your Task\n\n${prompt}`;

  pi.sendMessage(
    { customType: "gsd-doctor-heal", content, display: false },
    { triggerTurn: true },
  );
}

export function registerGSDCommand(pi: ExtensionAPI): void {
  pi.registerCommand("gsd", {
    description: "GSD — Get Shit Done: /gsd auto|stop|status|queue|prefs|doctor|migrate",

    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["auto", "stop", "status", "queue", "discuss", "prefs", "doctor", "migrate"];
      const parts = prefix.trim().split(/\s+/);

      if (parts.length <= 1) {
        return subcommands
          .filter((cmd) => cmd.startsWith(parts[0] ?? ""))
          .map((cmd) => ({ value: cmd, label: cmd }));
      }

      if (parts[0] === "auto" && parts.length <= 2) {
        const flagPrefix = parts[1] ?? "";
        return ["--verbose"]
          .filter((f) => f.startsWith(flagPrefix))
          .map((f) => ({ value: `auto ${f}`, label: f }));
      }

      if (parts[0] === "prefs" && parts.length <= 2) {
        const subPrefix = parts[1] ?? "";
        return ["global", "project", "status"]
          .filter((cmd) => cmd.startsWith(subPrefix))
          .map((cmd) => ({ value: `prefs ${cmd}`, label: cmd }));
      }

      if (parts[0] === "doctor") {
        const modePrefix = parts[1] ?? "";
        const modes = ["fix", "heal", "audit"];

        if (parts.length <= 2) {
          return modes
            .filter((cmd) => cmd.startsWith(modePrefix))
            .map((cmd) => ({ value: `doctor ${cmd}`, label: cmd }));
        }

        return [];
      }

      return [];
    },

    async handler(args: string, ctx: ExtensionCommandContext) {
      const trimmed = (typeof args === "string" ? args : "").trim();

      if (trimmed === "status") {
        await handleStatus(ctx);
        return;
      }

      if (trimmed === "prefs" || trimmed.startsWith("prefs ")) {
        await handlePrefs(trimmed.replace(/^prefs\s*/, "").trim(), ctx);
        return;
      }

      if (trimmed === "doctor" || trimmed.startsWith("doctor ")) {
        await handleDoctor(trimmed.replace(/^doctor\s*/, "").trim(), ctx, pi);
        return;
      }

      if (trimmed === "auto" || trimmed.startsWith("auto ")) {
        const verboseMode = trimmed.includes("--verbose");
        await startAuto(ctx, pi, process.cwd(), verboseMode);
        return;
      }

      if (trimmed === "stop") {
        if (!isAutoActive() && !isAutoPaused()) {
          ctx.ui.notify("Auto-mode is not running.", "info");
          return;
        }
        await stopAuto(ctx, pi);
        return;
      }

      if (trimmed === "queue") {
        await showQueue(ctx, pi, process.cwd());
        return;
      }

      if (trimmed === "discuss") {
        await showDiscuss(ctx, pi, process.cwd());
        return;
      }

      if (trimmed === "migrate" || trimmed.startsWith("migrate ")) {
        await handleMigrate(trimmed.replace(/^migrate\s*/, "").trim(), ctx, pi);
        return;
      }

      if (trimmed === "") {
        await showSmartEntry(ctx, pi, process.cwd());
        return;
      }

      ctx.ui.notify(
        `Unknown: /gsd ${trimmed}. Use /gsd, /gsd auto, /gsd stop, /gsd status, /gsd queue, /gsd discuss, /gsd prefs [global|project|status], /gsd doctor [audit|fix|heal] [M###/S##], or /gsd migrate <path>.`,
        "warning",
      );
    },
  });
}

async function handleStatus(ctx: ExtensionCommandContext): Promise<void> {
  const basePath = process.cwd();
  const state = await deriveState(basePath);

  if (state.registry.length === 0) {
    ctx.ui.notify("No GSD milestones found. Run /gsd to start.", "info");
    return;
  }

  await ctx.ui.custom<void>(
    (tui, theme, _kb, done) => {
      return new GSDDashboardOverlay(tui, theme, () => done());
    },
    {
      overlay: true,
      overlayOptions: {
        width: "70%",
        minWidth: 60,
        maxHeight: "90%",
        anchor: "center",
      },
    },
  );
}

export async function fireStatusViaCommand(
  ctx: import("@mariozechner/pi-coding-agent").ExtensionContext,
): Promise<void> {
  await handleStatus(ctx as ExtensionCommandContext);
}

async function handlePrefs(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const trimmed = args.trim();

  if (trimmed === "" || trimmed === "global") {
    await ensurePreferencesFile(getGlobalGSDPreferencesPath(), ctx, "global");
    return;
  }

  if (trimmed === "project") {
    await ensurePreferencesFile(getProjectGSDPreferencesPath(), ctx, "project");
    return;
  }

  if (trimmed === "status") {
    const globalPrefs = loadGlobalGSDPreferences();
    const projectPrefs = loadProjectGSDPreferences();
    const canonicalGlobal = getGlobalGSDPreferencesPath();
    const legacyGlobal = getLegacyGlobalGSDPreferencesPath();
    const globalStatus = globalPrefs
      ? `present: ${globalPrefs.path}${globalPrefs.path === legacyGlobal ? " (legacy fallback)" : ""}`
      : `missing: ${canonicalGlobal}`;
    const projectStatus = projectPrefs ? `present: ${projectPrefs.path}` : `missing: ${getProjectGSDPreferencesPath()}`;

    const lines = [`GSD skill prefs — global ${globalStatus}; project ${projectStatus}`];

    const effective = loadEffectiveGSDPreferences();
    let hasUnresolved = false;
    if (effective) {
      const report = resolveAllSkillReferences(effective.preferences, process.cwd());
      const resolved = [...report.resolutions.values()].filter(r => r.method !== "unresolved");
      hasUnresolved = report.warnings.length > 0;
      if (resolved.length > 0 || hasUnresolved) {
        lines.push(`Skills: ${resolved.length} resolved, ${report.warnings.length} unresolved`);
      }
      if (hasUnresolved) {
        lines.push(`Unresolved: ${report.warnings.join(", ")}`);
      }
    }

    ctx.ui.notify(lines.join("\n"), hasUnresolved ? "warning" : "info");
    return;
  }

  ctx.ui.notify("Usage: /gsd prefs [global|project|status]", "info");
}

async function handleDoctor(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  const trimmed = args.trim();
  const parts = trimmed ? trimmed.split(/\s+/) : [];
  const mode = parts[0] === "fix" || parts[0] === "heal" || parts[0] === "audit" ? parts[0] : "doctor";
  const requestedScope = mode === "doctor" ? parts[0] : parts[1];
  const scope = await selectDoctorScope(process.cwd(), requestedScope);
  const effectiveScope = mode === "audit" ? requestedScope : scope;
  const report = await runGSDDoctor(process.cwd(), {
    fix: mode === "fix" || mode === "heal",
    scope: effectiveScope,
  });

  const reportText = formatDoctorReport(report, {
    scope: effectiveScope,
    includeWarnings: mode === "audit",
    maxIssues: mode === "audit" ? 50 : 12,
    title: mode === "audit" ? "GSD doctor audit." : mode === "heal" ? "GSD doctor heal prep." : undefined,
  });

  ctx.ui.notify(reportText, report.ok ? "info" : "warning");

  if (mode === "heal") {
    const unresolved = filterDoctorIssues(report.issues, {
      scope: effectiveScope,
      includeWarnings: true,
    });
    const actionable = unresolved.filter(issue => issue.severity === "error" || issue.code === "all_tasks_done_missing_slice_uat" || issue.code === "slice_checked_missing_uat");
    if (actionable.length === 0) {
      ctx.ui.notify("Doctor heal found nothing actionable to hand off to the LLM.", "info");
      return;
    }

    const structuredIssues = formatDoctorIssuesForPrompt(actionable);
    dispatchDoctorHeal(pi, effectiveScope, reportText, structuredIssues);
    ctx.ui.notify(`Doctor heal dispatched ${actionable.length} issue(s) to the LLM.`, "info");
  }
}

async function ensurePreferencesFile(
  path: string,
  ctx: ExtensionCommandContext,
  scope: "global" | "project",
): Promise<void> {
  if (!existsSync(path)) {
    const template = await loadFile(join(dirname(fileURLToPath(import.meta.url)), "templates", "preferences.md"));
    if (!template) {
      ctx.ui.notify("Could not load GSD preferences template.", "error");
      return;
    }
    await saveFile(path, template);
    ctx.ui.notify(`Created ${scope} GSD skill preferences at ${path}`, "info");
  } else {
    ctx.ui.notify(`Using existing ${scope} GSD skill preferences at ${path}`, "info");
  }

  await ctx.waitForIdle();
  await ctx.reload();
  ctx.ui.notify(`Edit ${path} to update ${scope} GSD skill preferences.`, "info");
}
