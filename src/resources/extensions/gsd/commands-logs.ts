/**
 * /gsd logs — Browse activity logs, debug logs, and metrics.
 *
 * Subcommands:
 *   /gsd logs              — List recent activity + debug logs
 *   /gsd logs <N>          — Show summary of activity log #N
 *   /gsd logs debug        — List debug log files
 *   /gsd logs debug <N>    — Show debug log summary #N
 *   /gsd logs tail [N]     — Show last N activity log entries (default 5)
 *   /gsd logs clear        — Remove old activity and debug logs
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { gsdRoot } from "./paths.js";
import { loadJsonFileOrNull } from "./json-persistence.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LogEntry {
  seq: number;
  filename: string;
  unitType: string;
  unitId: string;
  size: number;
  mtime: Date;
}

interface DebugLogEntry {
  filename: string;
  size: number;
  mtime: Date;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function activityDir(basePath: string): string {
  return join(gsdRoot(basePath), "activity");
}

function debugDir(basePath: string): string {
  return join(gsdRoot(basePath), "debug");
}

function listActivityLogs(basePath: string): LogEntry[] {
  const dir = activityDir(basePath);
  if (!existsSync(dir)) return [];

  const entries: LogEntry[] = [];
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      // Filename format: {seq}-{unitType}-{unitId}.jsonl
      // unitType is lowercase-with-hyphens (e.g., "execute-task", "complete-slice")
      // unitId starts with M followed by digits (e.g., "M001-S01-T01")
      const match = f.match(/^(\d+)-([\w-]+?)-(M\d[\w-]*)\.jsonl$/);
      if (!match) continue;

      const filePath = join(dir, f);
      let stat;
      try { stat = statSync(filePath); } catch { continue; }

      entries.push({
        seq: parseInt(match[1], 10),
        filename: f,
        unitType: match[2],
        unitId: match[3].replace(/-/g, "/"),
        size: stat.size,
        mtime: stat.mtime,
      });
    }
  } catch { /* dir not readable */ }

  return entries.sort((a, b) => a.seq - b.seq);
}

function listDebugLogs(basePath: string): DebugLogEntry[] {
  const dir = debugDir(basePath);
  if (!existsSync(dir)) return [];

  const entries: DebugLogEntry[] = [];
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".log")) continue;
      const filePath = join(dir, f);
      let stat;
      try { stat = statSync(filePath); } catch { continue; }
      entries.push({ filename: f, size: stat.size, mtime: stat.mtime });
    }
  } catch { /* dir not readable */ }

  return entries.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Extract a summary from an activity log JSONL file.
 * Parses the entries to count tool calls, errors, and extract key events.
 */
function summarizeActivityLog(filePath: string): {
  toolCalls: number;
  errors: number;
  filesWritten: string[];
  commandsRun: Array<{ command: string; failed: boolean }>;
  lastReasoning: string;
  entryCount: number;
} {
  const result = {
    toolCalls: 0,
    errors: 0,
    filesWritten: new Set<string>(),
    commandsRun: [] as Array<{ command: string; failed: boolean }>,
    lastReasoning: "",
    entryCount: 0,
  };

  let raw: string;
  try { raw = readFileSync(filePath, "utf-8"); } catch { return { ...result, filesWritten: [] }; }

  const lines = raw.split("\n").filter(l => l.trim());
  result.entryCount = lines.length;

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try { entry = JSON.parse(line); } catch { continue; }

    // Count tool calls
    if (entry.type === "toolCall" || (entry.role === "assistant" && entry.content && Array.isArray(entry.content))) {
      if (entry.type === "toolCall") {
        result.toolCalls++;
        const name = entry.name as string | undefined;
        const args = entry.arguments as Record<string, unknown> | undefined;

        if (name === "write" || name === "edit") {
          const path = args?.file_path as string | undefined;
          if (path) result.filesWritten.add(path);
        }
        if (name === "bash") {
          const cmd = args?.command as string | undefined;
          if (cmd) result.commandsRun.push({ command: cmd.slice(0, 80), failed: false });
        }
      }
    }

    // Count errors
    if (entry.role === "toolResult" && entry.isError) {
      result.errors++;
      // Mark last command as failed
      if (result.commandsRun.length > 0) {
        result.commandsRun[result.commandsRun.length - 1].failed = true;
      }
    }

    // Track assistant reasoning
    if (entry.role === "assistant" && typeof entry.content === "string") {
      result.lastReasoning = entry.content.slice(0, 200);
    }
  }

  return {
    ...result,
    filesWritten: [...result.filesWritten],
  };
}

/**
 * Extract summary events from a debug log file.
 */
function summarizeDebugLog(filePath: string): {
  events: number;
  duration: string;
  dispatches: number;
  errors: Array<{ event: string; message: string }>;
} {
  const result = {
    events: 0,
    duration: "unknown",
    dispatches: 0,
    errors: [] as Array<{ event: string; message: string }>,
  };

  let raw: string;
  try { raw = readFileSync(filePath, "utf-8"); } catch { return result; }

  const lines = raw.split("\n").filter(l => l.trim());
  result.events = lines.length;

  let firstTs = 0;
  let lastTs = 0;

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try { entry = JSON.parse(line); } catch { continue; }

    const ts = entry.ts as string | undefined;
    if (ts) {
      const t = new Date(ts).getTime();
      if (!firstTs) firstTs = t;
      lastTs = t;
    }

    const event = entry.event as string | undefined;
    if (!event) continue;

    if (event === "debug-summary") {
      result.dispatches = (entry.dispatches as number) ?? 0;
    }

    if (event.includes("error") || event.includes("failed")) {
      const msg = (entry.error as string) ?? (entry.message as string) ?? JSON.stringify(entry).slice(0, 100);
      result.errors.push({ event, message: msg });
    }
  }

  if (firstTs && lastTs) {
    const elapsed = lastTs - firstTs;
    const mins = Math.floor(elapsed / 60_000);
    if (mins < 1) result.duration = `${Math.floor(elapsed / 1000)}s`;
    else if (mins < 60) result.duration = `${mins}m`;
    else result.duration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return result;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

export async function handleLogs(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const basePath = process.cwd();
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const subCmd = parts[0] ?? "";

  // /gsd logs clear
  if (subCmd === "clear") {
    await handleLogsClear(basePath, ctx);
    return;
  }

  // /gsd logs debug [N]
  if (subCmd === "debug") {
    const idx = parts[1] ? parseInt(parts[1], 10) : undefined;
    await handleLogsDebug(basePath, ctx, idx);
    return;
  }

  // /gsd logs tail [N]
  if (subCmd === "tail") {
    const count = parts[1] ? parseInt(parts[1], 10) : 5;
    await handleLogsTail(basePath, ctx, count);
    return;
  }

  // /gsd logs <N> — show specific activity log
  if (subCmd && /^\d+$/.test(subCmd)) {
    const seq = parseInt(subCmd, 10);
    await handleLogsShow(basePath, ctx, seq);
    return;
  }

  // /gsd logs — list overview
  await handleLogsList(basePath, ctx);
}

// ─── Subcommand Handlers ────────────────────────────────────────────────────

async function handleLogsList(basePath: string, ctx: ExtensionCommandContext): Promise<void> {
  const activities = listActivityLogs(basePath);
  const debugLogs = listDebugLogs(basePath);

  if (activities.length === 0 && debugLogs.length === 0) {
    ctx.ui.notify(
      "No logs found.\n\nActivity logs are created during auto-mode.\nDebug logs require GSD_DEBUG=1.",
      "info",
    );
    return;
  }

  const lines: string[] = [];

  if (activities.length > 0) {
    lines.push("Activity Logs (.gsd/activity/):");
    lines.push("  #   Unit Type         Unit ID              Size    Age");
    lines.push("  " + "─".repeat(70));

    // Show last 15 entries
    const recent = activities.slice(-15);
    for (const e of recent) {
      const seq = String(e.seq).padStart(3, " ");
      const type = e.unitType.padEnd(18, " ");
      const id = e.unitId.padEnd(20, " ");
      const size = formatSize(e.size).padStart(7, " ");
      const age = formatAge(e.mtime);
      lines.push(`  ${seq} ${type} ${id} ${size}  ${age}`);
    }

    if (activities.length > 15) {
      lines.push(`  ... and ${activities.length - 15} older entries`);
    }
    lines.push("");
    lines.push("  View details: /gsd logs <#>");
  }

  if (debugLogs.length > 0) {
    lines.push("");
    lines.push("Debug Logs (.gsd/debug/):");
    for (let i = 0; i < debugLogs.length; i++) {
      const d = debugLogs[i];
      const size = formatSize(d.size).padStart(7, " ");
      const age = formatAge(d.mtime);
      lines.push(`  ${i + 1}. ${d.filename}  ${size}  ${age}`);
    }
    lines.push("");
    lines.push("  View details: /gsd logs debug <#>");
  }

  // Metrics summary
  const metricsPath = join(gsdRoot(basePath), "metrics.json");
  const isMetrics = (d: unknown): d is { units: Array<Record<string, unknown>> } =>
    d !== null && typeof d === "object" && "units" in d! && Array.isArray((d as Record<string, unknown>).units);
  const metrics = loadJsonFileOrNull(metricsPath, isMetrics);
  if (metrics && metrics.units.length > 0) {
    const units = metrics.units;
    const totalCost = units.reduce((sum: number, u) => sum + ((u.cost as number) ?? 0), 0);
    const totalTokens = units.reduce((sum: number, u) => {
      const t = u.tokens as Record<string, number> | undefined;
      return sum + (t?.total ?? 0);
    }, 0);
    lines.push("");
    lines.push(`Metrics: ${units.length} units tracked · $${totalCost.toFixed(2)} · ${(totalTokens / 1000).toFixed(0)}K tokens`);
  }

  lines.push("");
  lines.push("Tip: Enable debug logging with GSD_DEBUG=1 before /gsd auto");

  ctx.ui.notify(lines.join("\n"), "info");
}

async function handleLogsShow(basePath: string, ctx: ExtensionCommandContext, seq: number): Promise<void> {
  const activities = listActivityLogs(basePath);
  const entry = activities.find(e => e.seq === seq);

  if (!entry) {
    ctx.ui.notify(`Activity log #${seq} not found. Run /gsd logs to see available logs.`, "warning");
    return;
  }

  const filePath = join(activityDir(basePath), entry.filename);
  const summary = summarizeActivityLog(filePath);

  const lines: string[] = [];
  lines.push(`Activity Log #${entry.seq}: ${entry.unitType} — ${entry.unitId}`);
  lines.push("─".repeat(60));
  lines.push(`File: ${entry.filename}`);
  lines.push(`Size: ${formatSize(entry.size)}  |  Age: ${formatAge(entry.mtime)}`);
  lines.push(`Entries: ${summary.entryCount}  |  Tool calls: ${summary.toolCalls}  |  Errors: ${summary.errors}`);

  if (summary.filesWritten.length > 0) {
    lines.push("");
    lines.push("Files written/edited:");
    for (const f of summary.filesWritten.slice(0, 10)) {
      lines.push(`  ${f}`);
    }
    if (summary.filesWritten.length > 10) {
      lines.push(`  ... and ${summary.filesWritten.length - 10} more`);
    }
  }

  if (summary.commandsRun.length > 0) {
    lines.push("");
    lines.push("Commands run:");
    for (const c of summary.commandsRun.slice(0, 10)) {
      const status = c.failed ? " FAILED" : "";
      lines.push(`  ${c.command}${status}`);
    }
    if (summary.commandsRun.length > 10) {
      lines.push(`  ... and ${summary.commandsRun.length - 10} more`);
    }
  }

  if (summary.errors > 0) {
    lines.push("");
    lines.push(`${summary.errors} error(s) encountered during this unit.`);
  }

  if (summary.lastReasoning) {
    lines.push("");
    lines.push("Last reasoning:");
    lines.push(`  "${summary.lastReasoning}${summary.lastReasoning.length >= 200 ? "..." : ""}"`);
  }

  lines.push("");
  lines.push(`Full log: ${filePath}`);

  ctx.ui.notify(lines.join("\n"), "info");
}

async function handleLogsDebug(basePath: string, ctx: ExtensionCommandContext, idx?: number): Promise<void> {
  const debugLogs = listDebugLogs(basePath);

  if (debugLogs.length === 0) {
    ctx.ui.notify(
      "No debug logs found.\n\nEnable debug logging: GSD_DEBUG=1 gsd auto",
      "info",
    );
    return;
  }

  if (idx === undefined) {
    // List debug logs
    const lines: string[] = ["Debug Logs (.gsd/debug/):", ""];
    for (let i = 0; i < debugLogs.length; i++) {
      const d = debugLogs[i];
      lines.push(`  ${i + 1}. ${d.filename}  ${formatSize(d.size)}  ${formatAge(d.mtime)}`);
    }
    lines.push("");
    lines.push("View details: /gsd logs debug <#>");
    ctx.ui.notify(lines.join("\n"), "info");
    return;
  }

  // Show specific debug log
  if (idx < 1 || idx > debugLogs.length) {
    ctx.ui.notify(`Debug log #${idx} not found. Available: 1-${debugLogs.length}`, "warning");
    return;
  }

  const entry = debugLogs[idx - 1];
  const filePath = join(debugDir(basePath), entry.filename);
  const summary = summarizeDebugLog(filePath);

  const lines: string[] = [];
  lines.push(`Debug Log: ${entry.filename}`);
  lines.push("─".repeat(60));
  lines.push(`Size: ${formatSize(entry.size)}  |  Age: ${formatAge(entry.mtime)}`);
  lines.push(`Events: ${summary.events}  |  Duration: ${summary.duration}  |  Dispatches: ${summary.dispatches}`);

  if (summary.errors.length > 0) {
    lines.push("");
    lines.push("Errors/failures:");
    for (const e of summary.errors.slice(0, 10)) {
      lines.push(`  [${e.event}] ${e.message}`);
    }
    if (summary.errors.length > 10) {
      lines.push(`  ... and ${summary.errors.length - 10} more`);
    }
  }

  lines.push("");
  lines.push(`Full log: ${filePath}`);

  ctx.ui.notify(lines.join("\n"), "info");
}

async function handleLogsTail(basePath: string, ctx: ExtensionCommandContext, count: number): Promise<void> {
  const activities = listActivityLogs(basePath);

  if (activities.length === 0) {
    ctx.ui.notify("No activity logs found. Logs are created during auto-mode.", "info");
    return;
  }

  const recent = activities.slice(-Math.max(1, Math.min(count, 20)));
  const lines: string[] = [`Last ${recent.length} activity log(s):`, ""];

  for (const e of recent) {
    const filePath = join(activityDir(basePath), e.filename);
    const summary = summarizeActivityLog(filePath);
    const status = summary.errors > 0 ? `${summary.errors} err` : "ok";
    lines.push(`  #${e.seq} ${e.unitType} ${e.unitId} — ${summary.toolCalls} tools, ${status}, ${formatAge(e.mtime)}`);
  }

  ctx.ui.notify(lines.join("\n"), "info");
}

async function handleLogsClear(basePath: string, ctx: ExtensionCommandContext): Promise<void> {
  let removedActivity = 0;
  let removedDebug = 0;

  // Clear activity logs older than 7 days, keep the 5 most recent
  const activities = listActivityLogs(basePath);
  const keepRecent = activities.slice(-5);
  const keepSeqs = new Set(keepRecent.map(e => e.seq));
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const e of activities) {
    if (keepSeqs.has(e.seq)) continue;
    if (e.mtime.getTime() < cutoff) {
      try {
        unlinkSync(join(activityDir(basePath), e.filename));
        removedActivity++;
      } catch { /* ignore */ }
    }
  }

  // Clear debug logs older than 3 days, keep latest 2
  const debugLogs = listDebugLogs(basePath);
  const keepDebug = debugLogs.slice(-2);
  const keepDebugNames = new Set(keepDebug.map(d => d.filename));
  const debugCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;

  for (const d of debugLogs) {
    if (keepDebugNames.has(d.filename)) continue;
    if (d.mtime.getTime() < debugCutoff) {
      try {
        unlinkSync(join(debugDir(basePath), d.filename));
        removedDebug++;
      } catch { /* ignore */ }
    }
  }

  if (removedActivity === 0 && removedDebug === 0) {
    ctx.ui.notify("No old logs to clear.", "info");
  } else {
    ctx.ui.notify(
      `Cleared ${removedActivity} activity log(s) and ${removedDebug} debug log(s).`,
      "info",
    );
  }
}
