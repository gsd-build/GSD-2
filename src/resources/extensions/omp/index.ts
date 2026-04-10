// src/resources/extensions/omp/index.ts
//
// OMP (Oh My Pi) plugin bridge for GSD v2.
//
// This extension is loaded by OMP's plugin extension loader when `gsd-pi` is
// installed as an OMP plugin (`omp plugin install gsd-pi`). It registers the
// `/gsd` command with full sub-command completions using OMP's native
// ExtensionAPI, then delegates execution to the `gsd` CLI binary so GSD's
// own TUI gets full terminal control.
//
// Key constraints:
// - Must NOT import from @gsd/* — those modules are not available in OMP's context.
// - Types from @oh-my-pi/pi-coding-agent are import-type only (erased at runtime).
// - The catalog is inlined to avoid pulling in the @gsd import chain.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// Inlined catalog — must not import from @gsd/* to avoid pulling in the GSD import chain.
// Values copied exactly from dist/resources/extensions/gsd/commands/catalog.js

const TOP_LEVEL_SUBCOMMANDS = [
  { cmd: "help", desc: "Categorized command reference with descriptions" },
  { cmd: "next", desc: "Explicit step mode (same as /gsd)" },
  { cmd: "auto", desc: "Autonomous mode — research, plan, execute, commit, repeat" },
  { cmd: "stop", desc: "Stop auto mode gracefully" },
  { cmd: "pause", desc: "Pause auto-mode (preserves state, /gsd auto to resume)" },
  { cmd: "status", desc: "Progress dashboard" },
  { cmd: "widget", desc: "Cycle widget: full → small → min → off" },
  { cmd: "visualize", desc: "Open 10-tab workflow visualizer (progress, timeline, deps, metrics, health, agent, changes, knowledge, captures, export)" },
  { cmd: "queue", desc: "Queue and reorder future milestones" },
  { cmd: "quick", desc: "Execute a quick task without full planning overhead" },
  { cmd: "discuss", desc: "Discuss architecture and decisions" },
  { cmd: "capture", desc: "Fire-and-forget thought capture" },
  { cmd: "changelog", desc: "Show categorized release notes" },
  { cmd: "triage", desc: "Manually trigger triage of pending captures" },
  { cmd: "dispatch", desc: "Dispatch a specific phase directly" },
  { cmd: "history", desc: "View execution history" },
  { cmd: "undo", desc: "Revert last completed unit" },
  { cmd: "undo-task", desc: "Reset a specific task's completion state (DB + markdown)" },
  { cmd: "reset-slice", desc: "Reset a slice and all its tasks (DB + markdown)" },
  { cmd: "rate", desc: "Rate last unit's model tier (over/ok/under) — improves adaptive routing" },
  { cmd: "skip", desc: "Prevent a unit from auto-mode dispatch" },
  { cmd: "export", desc: "Export milestone/slice results" },
  { cmd: "cleanup", desc: "Remove merged branches or snapshots" },
  { cmd: "mode", desc: "Switch workflow mode (solo/team)" },
  { cmd: "prefs", desc: "Manage preferences (model selection, timeouts, etc.)" },
  { cmd: "config", desc: "Set API keys for external tools" },
  { cmd: "keys", desc: "API key manager — list, add, remove, test, rotate, doctor" },
  { cmd: "hooks", desc: "Show configured post-unit and pre-dispatch hooks" },
  { cmd: "run-hook", desc: "Manually trigger a specific hook" },
  { cmd: "skill-health", desc: "Skill lifecycle dashboard" },
  { cmd: "notifications", desc: "View, filter, and clear persistent notification history" },
  { cmd: "doctor", desc: "Runtime health checks with auto-fix" },
  { cmd: "logs", desc: "Browse activity logs, debug logs, and metrics" },
  { cmd: "forensics", desc: "Examine execution logs" },
  { cmd: "init", desc: "Project init wizard — detect, configure, bootstrap .gsd/" },
  { cmd: "setup", desc: "Global setup status and configuration" },
  { cmd: "migrate", desc: "Migrate a v1 .planning directory to .gsd format" },
  { cmd: "remote", desc: "Control remote auto-mode" },
  { cmd: "steer", desc: "Hard-steer plan documents during execution" },
  { cmd: "inspect", desc: "Show SQLite DB diagnostics" },
  { cmd: "knowledge", desc: "Add persistent project knowledge (rule, pattern, or lesson)" },
  { cmd: "new-milestone", desc: "Create a milestone from a specification document (headless)" },
  { cmd: "parallel", desc: "Parallel milestone orchestration (start, status, stop, merge, watch)" },
  { cmd: "cmux", desc: "Manage cmux integration (status, sidebar, notifications, splits)" },
  { cmd: "park", desc: "Park a milestone — skip without deleting" },
  { cmd: "unpark", desc: "Reactivate a parked milestone" },
  { cmd: "update", desc: "Update GSD to the latest version" },
  { cmd: "start", desc: "Start a workflow template (bugfix, spike, feature, etc.)" },
  { cmd: "templates", desc: "List available workflow templates" },
  { cmd: "extensions", desc: "Manage extensions (list, enable, disable, info)" },
  { cmd: "fast", desc: "Toggle OpenAI service tier (on/off/flex/status)" },
  { cmd: "mcp", desc: "MCP server status and connectivity check (status, check <server>)" },
  { cmd: "rethink", desc: "Conversational project reorganization — reorder, park, discard, add milestones" },
  { cmd: "workflow", desc: "Custom workflow lifecycle (new, run, list, validate, pause, resume)" },
  { cmd: "codebase", desc: "Generate and manage codebase map (.gsd/CODEBASE.md)" },
];

const NESTED_COMPLETIONS: Record<string, Array<{ cmd: string; desc: string }>> = {
  auto: [
    { cmd: "--verbose", desc: "Show detailed execution output" },
    { cmd: "--debug", desc: "Enable debug logging" },
  ],
  next: [
    { cmd: "--verbose", desc: "Show detailed step output" },
    { cmd: "--dry-run", desc: "Preview next step without executing" },
    { cmd: "--debug", desc: "Enable debug logging" },
  ],
  widget: [
    { cmd: "full", desc: "Full widget display" },
    { cmd: "small", desc: "Compact widget display" },
    { cmd: "min", desc: "Minimal widget display" },
    { cmd: "off", desc: "Hide widget" },
  ],
  mode: [
    { cmd: "global", desc: "Edit global workflow mode" },
    { cmd: "project", desc: "Edit project-specific workflow mode" },
  ],
  parallel: [
    { cmd: "start", desc: "Start parallel milestone orchestration" },
    { cmd: "status", desc: "Show parallel worker statuses" },
    { cmd: "stop", desc: "Stop all parallel workers" },
    { cmd: "pause", desc: "Pause a specific worker" },
    { cmd: "resume", desc: "Resume a paused worker" },
    { cmd: "merge", desc: "Merge completed milestone branches" },
    { cmd: "watch", desc: "Live TUI dashboard monitoring all workers" },
  ],
  setup: [
    { cmd: "llm", desc: "Configure LLM provider settings" },
    { cmd: "search", desc: "Configure web search provider" },
    { cmd: "remote", desc: "Configure remote integrations" },
    { cmd: "keys", desc: "Manage API keys" },
    { cmd: "prefs", desc: "Configure global preferences" },
  ],
  notifications: [
    { cmd: "clear", desc: "Clear all notifications" },
    { cmd: "tail", desc: "Show last N notifications (default: 20)" },
    { cmd: "filter", desc: "Filter by severity (error|warning|info|success)" },
  ],
  logs: [
    { cmd: "debug", desc: "List or view debug log files" },
    { cmd: "tail", desc: "Show last N activity log summaries" },
    { cmd: "clear", desc: "Remove old activity and debug logs" },
  ],
  keys: [
    { cmd: "list", desc: "Show key status dashboard" },
    { cmd: "add", desc: "Add a key for a provider" },
    { cmd: "remove", desc: "Remove a key" },
    { cmd: "test", desc: "Validate key(s) with API call" },
    { cmd: "rotate", desc: "Replace an existing key" },
    { cmd: "doctor", desc: "Health check all keys" },
  ],
  prefs: [
    { cmd: "global", desc: "Edit global preferences file" },
    { cmd: "project", desc: "Edit project preferences file" },
    { cmd: "status", desc: "Show effective preferences" },
    { cmd: "wizard", desc: "Interactive preferences wizard" },
    { cmd: "setup", desc: "First-time preferences setup" },
    { cmd: "import-claude", desc: "Import settings from Claude Code" },
  ],
  remote: [
    { cmd: "slack", desc: "Configure Slack integration" },
    { cmd: "discord", desc: "Configure Discord integration" },
    { cmd: "status", desc: "Show remote connection status" },
    { cmd: "disconnect", desc: "Disconnect remote integrations" },
  ],
  history: [
    { cmd: "--cost", desc: "Show cost breakdown per entry" },
    { cmd: "--phase", desc: "Filter by phase type" },
    { cmd: "--model", desc: "Filter by model used" },
    { cmd: "10", desc: "Show last 10 entries" },
    { cmd: "20", desc: "Show last 20 entries" },
    { cmd: "50", desc: "Show last 50 entries" },
  ],
  export: [
    { cmd: "--json", desc: "Export as JSON" },
    { cmd: "--markdown", desc: "Export as Markdown" },
    { cmd: "--html", desc: "Export as HTML" },
    { cmd: "--html --all", desc: "Export all milestones as HTML" },
  ],
  cleanup: [
    { cmd: "branches", desc: "Remove merged milestone and legacy branches" },
    { cmd: "snapshots", desc: "Remove old execution snapshots" },
    { cmd: "worktrees", desc: "Remove merged/safe-to-delete worktrees" },
    { cmd: "projects", desc: "Audit orphaned ~/.gsd/projects/ state directories" },
    { cmd: "projects --fix", desc: "Delete orphaned project state directories (cannot be undone)" },
  ],
  knowledge: [
    { cmd: "rule", desc: "Add a project rule (always/never do X)" },
    { cmd: "pattern", desc: "Add a code pattern to follow" },
    { cmd: "lesson", desc: "Record a lesson learned" },
  ],
  start: [
    { cmd: "bugfix", desc: "Triage, fix, test, and ship a bug fix" },
    { cmd: "small-feature", desc: "Lightweight feature with optional discussion" },
    { cmd: "spike", desc: "Research, prototype, and document findings" },
    { cmd: "hotfix", desc: "Minimal: fix it, test it, ship it" },
    { cmd: "refactor", desc: "Inventory, plan waves, migrate, verify" },
    { cmd: "security-audit", desc: "Scan, triage, remediate, re-scan" },
    { cmd: "dep-upgrade", desc: "Assess, upgrade, fix breaks, verify" },
    { cmd: "full-project", desc: "Complete GSD workflow with full ceremony" },
    { cmd: "resume", desc: "Resume an in-progress workflow" },
    { cmd: "--list", desc: "List all available templates" },
    { cmd: "--dry-run", desc: "Preview workflow without executing" },
  ],
  templates: [
    { cmd: "info", desc: "Show detailed template info" },
  ],
  extensions: [
    { cmd: "list", desc: "List all extensions and their status" },
    { cmd: "enable", desc: "Enable a disabled extension" },
    { cmd: "disable", desc: "Disable an extension" },
    { cmd: "info", desc: "Show extension details" },
  ],
  fast: [
    { cmd: "on", desc: "Priority tier (2x cost, faster)" },
    { cmd: "off", desc: "Disable service tier" },
    { cmd: "flex", desc: "Flex tier (0.5x cost, slower)" },
    { cmd: "status", desc: "Show current service tier setting" },
  ],
  mcp: [
    { cmd: "status", desc: "Show all MCP server statuses (default)" },
    { cmd: "check", desc: "Detailed status for a specific server" },
  ],
  doctor: [
    { cmd: "fix", desc: "Auto-fix detected issues" },
    { cmd: "heal", desc: "AI-driven deep healing" },
    { cmd: "audit", desc: "Run health audit without fixing" },
    { cmd: "--dry-run", desc: "Show what --fix would change without applying" },
    { cmd: "--json", desc: "Output report as JSON (CI/tooling friendly)" },
    { cmd: "--build", desc: "Include slow build health check (npm run build)" },
    { cmd: "--test", desc: "Include slow test health check (npm test)" },
  ],
  dispatch: [
    { cmd: "research", desc: "Run research phase" },
    { cmd: "plan", desc: "Run planning phase" },
    { cmd: "execute", desc: "Run execution phase" },
    { cmd: "complete", desc: "Run completion phase" },
    { cmd: "reassess", desc: "Reassess current progress" },
    { cmd: "uat", desc: "Run user acceptance testing" },
    { cmd: "replan", desc: "Replan the current slice" },
  ],
  rate: [
    { cmd: "over", desc: "Model was overqualified for this task" },
    { cmd: "ok", desc: "Model was appropriate for this task" },
    { cmd: "under", desc: "Model was underqualified for this task" },
  ],
  workflow: [
    { cmd: "new", desc: "Create a new workflow definition (via skill)" },
    { cmd: "run", desc: "Create a run and start auto-mode" },
    { cmd: "list", desc: "List workflow runs" },
    { cmd: "validate", desc: "Validate a workflow definition YAML" },
    { cmd: "pause", desc: "Pause custom workflow auto-mode" },
    { cmd: "resume", desc: "Resume paused custom workflow auto-mode" },
  ],
  codebase: [
    { cmd: "generate", desc: "Generate or regenerate CODEBASE.md" },
    { cmd: "generate --max-files", desc: "Generate with custom file limit (default: 500)" },
    { cmd: "generate --collapse-threshold", desc: "Generate with custom collapse threshold (default: 20)" },
    { cmd: "update", desc: "Incremental update (preserves descriptions)" },
    { cmd: "update --max-files", desc: "Update with custom file limit" },
    { cmd: "update --collapse-threshold", desc: "Update with custom collapse threshold" },
    { cmd: "stats", desc: "Show file count, description coverage, and generation time" },
    { cmd: "help", desc: "Show usage and available subcommands" },
  ],
};

function filterOptions(
  partial: string,
  options: Array<{ cmd: string; desc: string }>,
  prefix = "",
): Array<{ value: string; label: string; description: string }> {
  const normalizedPrefix = prefix ? `${prefix} ` : "";
  return options
    .filter((option) => option.cmd.startsWith(partial))
    .map((option) => ({
      value: `${normalizedPrefix}${option.cmd}`,
      label: option.cmd,
      description: option.desc,
    }));
}

function getArgumentCompletions(
  prefix: string,
): Array<{ value: string; label: string; description: string }> | null {
  const hasTrailingSpace = prefix.endsWith(" ");
  const parts = prefix.trim().split(/\s+/);
  if (hasTrailingSpace) {
    parts.push("");
  }
  if (parts.length <= 1) {
    return filterOptions(parts[0] ?? "", TOP_LEVEL_SUBCOMMANDS);
  }
  const [command, subcommand = ""] = parts;

  // cmux is a special case — inline its subcommands here
  if (command === "cmux") {
    if (parts.length <= 2) {
      return filterOptions(subcommand, [
        { cmd: "status", desc: "Show cmux detection, prefs, and capabilities" },
        { cmd: "on", desc: "Enable cmux integration" },
        { cmd: "off", desc: "Disable cmux integration" },
        { cmd: "notifications", desc: "Toggle cmux desktop notifications" },
        { cmd: "sidebar", desc: "Toggle cmux sidebar metadata" },
        { cmd: "splits", desc: "Toggle cmux visual subagent splits" },
        { cmd: "browser", desc: "Toggle future browser integration flag" },
      ], "cmux");
    }
    return [];
  }

  const nested = NESTED_COMPLETIONS[command];
  if (nested) {
    return filterOptions(subcommand, nested, command);
  }
  return null;
}

function handler(args: string, _ctx: unknown): void {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  spawnSync(gsdBin, parts, { stdio: "inherit", env: process.env });
}

// Resolve the gsd binary: prefer the local .bin/gsd inside the gsd-pi plugin,
// fall back to "gsd" (PATH lookup) if not installed there yet.
const gsdBin = existsSync(join(import.meta.dirname!, "../../../../.bin/gsd"))
  ? join(import.meta.dirname!, "../../../../.bin/gsd")
  : "gsd";

export default function gsdOmpBridge(pi: ExtensionAPI): void {
  pi.registerCommand("gsd", {
    description: "GSD — Get Shit Done: step-mode project execution with planning, execution, and verification",
    getArgumentCompletions,
    handler,
  });
}