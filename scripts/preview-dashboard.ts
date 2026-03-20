/**
 * Visual preview of the auto-mode dashboard widget.
 * Run: npx tsx scripts/preview-dashboard.ts [width] [--no-milestone] [--narrow] [--unhealthy]
 *
 * Renders the two-column layout with mock data so you can see
 * exactly how it looks at any terminal width.
 *
 * Examples:
 *   npx tsx scripts/preview-dashboard.ts              # default 120 cols, with milestone
 *   npx tsx scripts/preview-dashboard.ts 80            # narrow single-column
 *   npx tsx scripts/preview-dashboard.ts --no-milestone # compact no-milestone view
 *   npx tsx scripts/preview-dashboard.ts --unhealthy   # yellow/red health states
 *   npx tsx scripts/preview-dashboard.ts --narrow      # force 80 cols
 */

import { truncateToWidth, visibleWidth } from "@gsd/pi-tui";
import { makeUI, GLYPH, INDENT } from "../src/resources/extensions/shared/mod.js";

// ── Minimal ANSI color theme (no Theme class dependency) ────────────────

const COLORS: Record<string, string> = {
  accent:  "\x1b[36m",   // cyan
  dim:     "\x1b[2m",    // dim
  text:    "\x1b[37m",   // white
  success: "\x1b[32m",   // green
  error:   "\x1b[31m",   // red
  warning: "\x1b[33m",   // yellow
  muted:   "\x1b[90m",   // gray
};
const RESET_FG = "\x1b[22m\x1b[39m";

const theme = {
  fg(color: string, text: string): string {
    const ansi = COLORS[color] ?? COLORS.text;
    return `${ansi}${text}${RESET_FG}`;
  },
  bold(text: string): string {
    return `\x1b[1m${text}\x1b[22m`;
  },
};

// ── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const noMilestone = args.includes("--no-milestone");
const forceNarrow = args.includes("--narrow");
const unhealthy = args.includes("--unhealthy");
const modeArg = args.find(a => ["--small", "--min"].includes(a));
const widgetMode = modeArg === "--small" ? "small" : modeArg === "--min" ? "min" : "full";
const widthArg = args.find(a => /^\d+$/.test(a));
const width = forceNarrow ? 80 : (parseInt(widthArg ?? "", 10) || process.stdout.columns || 120);

// ── Mock data ───────────────────────────────────────────────────────────

const mockTasks = [
  { id: "T01", title: "Core type definitions & interfaces", done: true },
  { id: "T02", title: "Database schema migration", done: true },
  { id: "T03", title: "API route handlers", done: true },
  { id: "T04", title: "Authentication middleware", done: false },
  { id: "T05", title: "Unit & integration tests", done: false },
  { id: "T06", title: "Documentation updates", done: false },
];

const currentTaskId = "T04";
const milestoneTitle = "Core Patching Daemon";
const sliceId = "S04";
const sliceTitle = "CI gate";
const unitId = noMilestone ? "some-unit-id" : "M001-07dqzj/S04";
const verb = noMilestone ? "executing" : "completing";
const phaseLabel = noMilestone ? "EXECUTE" : "COMPLETE";
const modeTag = "AUTO";
const elapsed = "1h 23m";
const slicesDone = 3;
const slicesTotal = 6;
const taskNum = 4;
const taskTotal = 6;
const etaShort = "~47m left";
const pwd = noMilestone
  ? "my-project (main)"
  : "worktrees/M001 (\u2387 M001-07dqzj)";
// Mock token/cost stats — simplified 3 items
const mockHitRate = 85;
const mockCost = "$18.67";
const mockCtxUsage = "35%/200k";
const modelDisplay = "anthropic/claude-opus-4-6";
// Mock last commit
const lastCommitTimeAgo = "3m";
const lastCommitMessage = "fix auth middleware";

// Health states
const healthStates = unhealthy
  ? [
    { icon: "!", color: "warning", summary: "Struggling — 2 consecutive error unit(s)" },
    { icon: "x", color: "error", summary: "Stuck — 4 consecutive error units" },
  ]
  : [{ icon: "o", color: "success", summary: "Progressing well" }];

// ── Render helpers ──────────────────────────────────────────────────────

function rightAlign(left: string, right: string, w: number): string {
  const leftVis = visibleWidth(left);
  const rightVis = visibleWidth(right);
  const gap = Math.max(1, w - leftVis - rightVis);
  return truncateToWidth(left + " ".repeat(gap) + right, w);
}

function padToWidth(s: string, colWidth: number): string {
  const vis = visibleWidth(s);
  if (vis >= colWidth) return truncateToWidth(s, colWidth);
  return s + " ".repeat(colWidth - vis);
}

// ── Render ──────────────────────────────────────────────────────────────

function render(w: number, healthState: { icon: string; color: string; summary: string }): string[] {
  const ui = makeUI(theme as any, w);
  const lines: string[] = [];
  const pad = INDENT.base;

  // Top bar
  lines.push(...ui.bar());

  // Header: GSD AUTO + health ... elapsed + ETA
  const dot = theme.fg("accent", GLYPH.statusActive);
  const healthIcon = healthState.color === "success" ? "o"
    : healthState.color === "warning" ? "!"
      : "x";
  const healthStr = `  ${theme.fg(healthState.color, healthIcon)} ${theme.fg(healthState.color, healthState.summary)}`;
  const headerLeft = `${pad}${dot} ${theme.fg("accent", theme.bold("GSD"))}  ${theme.fg("success", modeTag)}${healthStr}`;
  const headerRight = `${theme.fg("dim", elapsed)} ${theme.fg("dim", "·")} ${theme.fg("dim", etaShort)}`;
  lines.push(rightAlign(headerLeft, headerRight, w));

  // ── min mode: header only ──────────────────────────────────────────
  if (widgetMode === "min") {
    lines.push(...ui.bar());
    return lines;
  }

  // ── small mode: header + action + progress + compact stats ─────────
  if (widgetMode === "small") {
    lines.push("");
    const target = noMilestone ? unitId : `${currentTaskId}: ${mockTasks.find(t => t.id === currentTaskId)!.title}`;
    const actionLeft = `${pad}${theme.fg("accent", "▸")} ${theme.fg("accent", verb)}  ${theme.fg("text", target)}`;
    lines.push(rightAlign(actionLeft, theme.fg("dim", phaseLabel), w));

    if (!noMilestone) {
      const barWidth = Math.max(6, Math.min(18, Math.floor(w * 0.25)));
      const pct = slicesDone / slicesTotal;
      const filled = Math.round(pct * barWidth);
      const bar = theme.fg("success", "━".repeat(filled))
        + theme.fg("dim", "─".repeat(barWidth - filled));
      const meta = `${theme.fg("text", `${slicesDone}`)}${theme.fg("dim", `/${slicesTotal} slices`)}` +
        `${theme.fg("dim", " · task ")}${theme.fg("accent", `${taskNum}`)}${theme.fg("dim", `/${taskTotal}`)}`;
      lines.push(`${pad}${bar} ${meta}`);
    }

    const smallStats = [
      theme.fg("warning", "$18.67"),
      theme.fg("dim", "35.2%ctx"),
    ];
    lines.push(rightAlign("", smallStats.join(theme.fg("dim", "  ")), w));

    lines.push(...ui.bar());
    return lines;
  }

  // ── full mode ──────────────────────────────────────────────────────
  lines.push("");

  // Context section: milestone + slice + model
  if (!noMilestone) {
    const modelTag = theme.fg("muted", `  ${modelDisplay}`);
    lines.push(truncateToWidth(`${pad}${theme.fg("dim", milestoneTitle)}${modelTag}`, w));
    lines.push(truncateToWidth(
      `${pad}${theme.fg("text", theme.bold(`${sliceId}: ${sliceTitle}`))}`,
      w,
    ));
    lines.push("");
  }

  // Action line
  const target = noMilestone ? unitId : `${currentTaskId}: ${mockTasks.find(t => t.id === currentTaskId)!.title}`;
  const actionLeft = `${pad}${theme.fg("accent", "▸")} ${theme.fg("accent", verb)}  ${theme.fg("text", target)}`;
  const phaseBadge = theme.fg("dim", phaseLabel);
  lines.push(rightAlign(actionLeft, phaseBadge, w));
  lines.push("");

  // Two-column body — pad left to fixed width, concatenate right
  const minTwoColWidth = 76;
  const hasTasks = !noMilestone;
  const useTwoCol = w >= minTwoColWidth && hasTasks;
  const leftColWidth = useTwoCol
    ? Math.floor(w * (w >= 100 ? 0.45 : 0.50))
    : w;

  // Left column
  const leftLines: string[] = [];

  if (!noMilestone) {
    const barWidth = Math.max(6, Math.min(18, Math.floor(leftColWidth * 0.4)));
    const pct = slicesDone / slicesTotal;
    const filled = Math.round(pct * barWidth);
    const bar = theme.fg("success", "━".repeat(filled))
      + theme.fg("dim", "─".repeat(barWidth - filled));
    const meta = `${theme.fg("text", `${slicesDone}`)}${theme.fg("dim", `/${slicesTotal} slices`)}`
      + `${theme.fg("dim", " · task ")}${theme.fg("accent", `${taskNum}`)}${theme.fg("dim", `/${taskTotal}`)}`;
    leftLines.push(`${pad}${bar} ${meta}`);
  }

  // Right column: task checklist — ASCII glyphs only (* > .)
  const rightLines: string[] = [];

  function fmtTask(t: typeof mockTasks[0]): string {
    const isCurrent = t.id === currentTaskId;
    const glyph = t.done
      ? theme.fg("success", "*")
      : isCurrent
        ? theme.fg("accent", ">")
        : theme.fg("dim", ".");
    const id = isCurrent
      ? theme.fg("accent", t.id)
      : t.done
        ? theme.fg("muted", t.id)
        : theme.fg("dim", t.id);
    const title = isCurrent
      ? theme.fg("text", t.title)
      : t.done
        ? theme.fg("muted", t.title)
        : theme.fg("text", t.title);
    return `${glyph} ${id}: ${title}`;
  }

  if (useTwoCol) {
    for (const t of mockTasks) rightLines.push(fmtTask(t));
  } else if (hasTasks) {
    for (const t of mockTasks) leftLines.push(`${pad}${fmtTask(t)}`);
  }

  // Compose columns — pad left to fixed width, concatenate right
  if (useTwoCol) {
    const maxRows = Math.max(leftLines.length, rightLines.length);
    lines.push("");
    for (let i = 0; i < maxRows; i++) {
      const left = padToWidth(truncateToWidth(leftLines[i] ?? "", leftColWidth), leftColWidth);
      const right = rightLines[i] ?? "";
      lines.push(`${left}${right}`);
    }
  } else {
    lines.push("");
    for (const l of leftLines) lines.push(truncateToWidth(l, w));
  }

  // Footer: simplified stats + pwd + last commit + hints
  lines.push("");
  const hitColor = mockHitRate >= 70 ? "success" : mockHitRate >= 40 ? "warning" : "error";
  const statsParts = [
    theme.fg(hitColor, `${mockHitRate}%hit`),
    theme.fg("warning", mockCost),
    theme.fg("dim", mockCtxUsage),
  ];
  const statsStr = statsParts.join(theme.fg("dim", "  "));
  lines.push(rightAlign("", statsStr, w));
  // PWD + last commit
  const pwdStr = theme.fg("dim", pwd);
  const commitStr = theme.fg("dim", `${lastCommitTimeAgo} ago: ${lastCommitMessage}`);
  lines.push(rightAlign(`${pad}${pwdStr}`, truncateToWidth(commitStr, Math.floor(w * 0.45)), w));
  // Hints
  const hintStr = theme.fg("dim", "esc pause | ⌃⌥G dashboard");
  lines.push(rightAlign("", hintStr, w));

  lines.push(...ui.bar());

  return lines;
}

// ── Main ────────────────────────────────────────────────────────────────

for (const healthState of healthStates) {
  const label = noMilestone ? "no-milestone" : `${width} cols`;
  console.log(`\n  Preview: ${label}, health=${healthState.color}\n`);
  for (const line of render(width, healthState)) {
    console.log(line);
  }
}
console.log();
