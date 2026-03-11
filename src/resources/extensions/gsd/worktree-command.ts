/**
 * GSD Worktree Command — /worktree
 *
 * Create, list, merge, and remove git worktrees under .gsd/worktrees/.
 *
 * Usage:
 *   /worktree <name>        — create a new worktree
 *   /worktree list          — list existing worktrees
 *   /worktree merge <branch> [target] — start LLM-guided merge (default target: main)
 *   /worktree remove <name> — remove a worktree and its branch
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { loadPrompt } from "./prompt-loader.js";
import { autoCommitCurrentBranch } from "./worktree.js";
import { showConfirm } from "../shared/confirm-ui.js";
import {
  createWorktree,
  listWorktrees,
  removeWorktree,
  diffWorktreeGSD,
  getWorktreeGSDDiff,
  getWorktreeLog,
  worktreeBranchName,
  worktreePath,
} from "./worktree-manager.js";
import { existsSync, realpathSync, readFileSync, utimesSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";

/**
 * Tracks the original project root so we can switch back.
 * Set when we first chdir into a worktree, cleared on return.
 */
let originalCwd: string | null = null;

/** Get the original project root if currently in a worktree, or null. */
export function getWorktreeOriginalCwd(): string | null {
  return originalCwd;
}

/**
 * Resolve the git HEAD file path for a given directory.
 * Handles both normal repos (.git is a directory) and worktrees (.git is a file).
 */
function resolveGitHeadPath(dir: string): string | null {
  const gitPath = join(dir, ".git");
  if (!existsSync(gitPath)) return null;

  try {
    const content = readFileSync(gitPath, "utf8").trim();
    if (content.startsWith("gitdir: ")) {
      // Worktree — .git is a file pointing to the real gitdir
      const gitDir = resolve(dir, content.slice(8));
      const headPath = join(gitDir, "HEAD");
      return existsSync(headPath) ? headPath : null;
    }
    // Normal repo — .git is a directory
    const headPath = join(dir, ".git", "HEAD");
    return existsSync(headPath) ? headPath : null;
  } catch {
    return null;
  }
}

/**
 * Nudge pi's FooterDataProvider to re-read the git branch.
 *
 * The footer caches the branch and watches a single .git dir for changes.
 * After process.chdir() into a worktree (or back), the watcher is stale —
 * it's still watching the old git dir. We touch HEAD in both the old and
 * new git dirs to ensure the watcher fires regardless of which one it's
 * monitoring. This clears cachedBranch; the next getGitBranch() call uses
 * the new process.cwd() and picks up the correct branch.
 */
function nudgeGitBranchCache(previousCwd: string): void {
  const now = new Date();
  for (const dir of [previousCwd, process.cwd()]) {
    try {
      const headPath = resolveGitHeadPath(dir);
      if (headPath) utimesSync(headPath, now, now);
    } catch {
      // Best-effort — branch display may be stale
    }
  }
}

/** Get the name of the active worktree, or null if not in one. */
export function getActiveWorktreeName(): string | null {
  if (!originalCwd) return null;
  const cwd = process.cwd();
  const wtDir = join(originalCwd, ".gsd", "worktrees");
  if (!cwd.startsWith(wtDir)) return null;
  const rel = cwd.slice(wtDir.length + 1);
  const name = rel.split("/")[0] ?? rel.split("\\")[0];
  return name || null;
}

function getMainBranch(basePath: string): string {
  try {
    const symbolic = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8",
    }).trim();
    const match = symbolic.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1]!;
  } catch { /* ignore */ }

  try {
    execSync("git show-ref --verify refs/heads/main", {
      cwd: basePath, stdio: ["ignore", "pipe", "pipe"],
    });
    return "main";
  } catch { /* ignore */ }

  try {
    execSync("git show-ref --verify refs/heads/master", {
      cwd: basePath, stdio: ["ignore", "pipe", "pipe"],
    });
    return "master";
  } catch { /* ignore */ }

  return execSync("git branch --show-current", {
    cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8",
  }).trim();
}

// ─── Shared completions and handler (used by both /worktree and /wt) ────────

function worktreeCompletions(prefix: string) {
  const parts = prefix.trim().split(/\s+/);
  const subcommands = ["list", "merge", "remove", "switch", "return"];

  if (parts.length <= 1) {
    const partial = parts[0] ?? "";
    const cmdCompletions = subcommands
      .filter(cmd => cmd.startsWith(partial))
      .map(cmd => ({ value: cmd, label: cmd }));
    try {
      const mainBase = getWorktreeOriginalCwd() ?? process.cwd();
      const existing = listWorktrees(mainBase);
      const nameCompletions = existing
        .filter(wt => wt.name.startsWith(partial))
        .map(wt => ({ value: wt.name, label: wt.name }));
      return [...cmdCompletions, ...nameCompletions];
    } catch {
      return cmdCompletions;
    }
  }

  if ((parts[0] === "merge" || parts[0] === "remove" || parts[0] === "switch") && parts.length <= 2) {
    const namePrefix = parts[1] ?? "";
    try {
      const existing = listWorktrees(process.cwd());
      return existing
        .filter(wt => wt.name.startsWith(namePrefix))
        .map(wt => ({ value: `${parts[0]} ${wt.name}`, label: wt.name }));
    } catch {
      return [];
    }
  }

  return [];
}

async function worktreeHandler(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  alias: string,
): Promise<void> {
  const trimmed = (typeof args === "string" ? args : "").trim();
  const basePath = process.cwd();

  if (trimmed === "") {
    ctx.ui.notify(
      [
        "Usage:",
        `  /${alias} <name>        — create and switch into a new worktree`,
        `  /${alias} switch <name> — switch into an existing worktree`,
        `  /${alias} return        — switch back to the main project tree`,
        `  /${alias} list          — list all worktrees`,
        `  /${alias} merge <branch> [target] — merge worktree into target branch`,
        `  /${alias} remove <name> — remove a worktree and its branch`,
      ].join("\n"),
      "info",
    );
    return;
  }

  if (trimmed === "list") {
    await handleList(basePath, ctx);
    return;
  }

  if (trimmed === "return") {
    await handleReturn(ctx);
    return;
  }

  if (trimmed.startsWith("switch ")) {
    const name = trimmed.replace(/^switch\s+/, "").trim();
    if (!name) {
      ctx.ui.notify(`Usage: /${alias} switch <name>`, "warning");
      return;
    }
    await handleSwitch(basePath, name, ctx);
    return;
  }

  if (trimmed.startsWith("merge ")) {
    const mergeArgs = trimmed.replace(/^merge\s+/, "").trim().split(/\s+/);
    const name = mergeArgs[0] ?? "";
    const targetBranch = mergeArgs[1];
    if (!name) {
      ctx.ui.notify(`Usage: /${alias} merge <branch> [target]`, "warning");
      return;
    }
    const mainBase = originalCwd ?? basePath;
    await handleMerge(mainBase, name, ctx, pi, targetBranch);
    return;
  }

  if (trimmed.startsWith("remove ")) {
    const name = trimmed.replace(/^remove\s+/, "").trim();
    if (!name) {
      ctx.ui.notify(`Usage: /${alias} remove <name>`, "warning");
      return;
    }
    const mainBase = originalCwd ?? basePath;
    await handleRemove(mainBase, name, ctx);
    return;
  }

  const RESERVED = ["list", "return", "switch", "merge", "remove"];
  if (RESERVED.includes(trimmed)) {
    ctx.ui.notify(`Usage: /${alias} ${trimmed}${trimmed === "list" || trimmed === "return" ? "" : " <name>"}`, "warning");
    return;
  }

  const mainBase = originalCwd ?? basePath;
  const nameOnly = trimmed.split(/\s+/)[0]!;
  if (trimmed !== nameOnly) {
    ctx.ui.notify(`Unknown command. Did you mean /${alias} switch ${nameOnly}?`, "warning");
    return;
  }

  const existing = listWorktrees(mainBase);
  if (existing.some(wt => wt.name === nameOnly)) {
    await handleSwitch(basePath, nameOnly, ctx);
  } else {
    await handleCreate(basePath, nameOnly, ctx);
  }
}

export function registerWorktreeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("worktree", {
    description: "Git worktrees: /worktree <name> | list | merge <branch> [target] | remove <name>",
    getArgumentCompletions: worktreeCompletions,

    async handler(args: string, ctx: ExtensionCommandContext) {
      await worktreeHandler(args, ctx, pi, "worktree");
    },
  });

  // /wt alias — same handler, same completions
  pi.registerCommand("wt", {
    description: "Alias for /worktree — Git worktrees: /wt <name> | list | merge | remove",
    getArgumentCompletions: worktreeCompletions,
    async handler(args: string, ctx: ExtensionCommandContext) {
      await worktreeHandler(args, ctx, pi, "wt");
    },
  });
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleCreate(
  basePath: string,
  name: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  try {
    // Create from the main tree, not from inside another worktree
    const mainBase = originalCwd ?? basePath;
    const info = createWorktree(mainBase, name);

    // Auto-commit dirty files before leaving current workspace
    const commitMsg = autoCommitCurrentBranch(basePath, "worktree-switch", name);

    // Track original cwd before switching
    if (!originalCwd) originalCwd = basePath;

    const prevCwd = process.cwd();
    process.chdir(info.path);
    nudgeGitBranchCache(prevCwd);

    const commitNote = commitMsg ? `\n  Auto-committed on previous branch before switching.` : "";
    ctx.ui.notify(
      [
        `Worktree "${name}" created and activated.`,
        `  Path:   ${info.path}`,
        `  Branch: ${info.branch}`,
        commitNote,
        `Session is now in the worktree. All commands run here.`,
        `Use /worktree merge ${name} to merge back when done.`,
        `Use /worktree return to switch back to the main tree.`,
      ].filter(Boolean).join("\n"),
      "info",
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to create worktree: ${msg}`, "error");
  }
}

async function handleSwitch(
  basePath: string,
  name: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  try {
    const mainBase = originalCwd ?? basePath;
    const wtPath = worktreePath(mainBase, name);

    if (!existsSync(wtPath)) {
      ctx.ui.notify(
        `Worktree "${name}" not found. Run /worktree list to see available worktrees.`,
        "warning",
      );
      return;
    }

    // Auto-commit dirty files before leaving current workspace
    const commitMsg = autoCommitCurrentBranch(basePath, "worktree-switch", name);

    // Track original cwd before switching
    if (!originalCwd) originalCwd = basePath;

    const prevCwd = process.cwd();
    process.chdir(wtPath);
    nudgeGitBranchCache(prevCwd);

    const commitNote = commitMsg ? `\n  Auto-committed on previous branch before switching.` : "";
    ctx.ui.notify(
      [
        `Switched to worktree "${name}".`,
        `  Path:   ${wtPath}`,
        `  Branch: ${worktreeBranchName(name)}`,
        commitNote,
        `Use /worktree return to switch back to the main tree.`,
      ].filter(Boolean).join("\n"),
      "info",
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to switch to worktree: ${msg}`, "error");
  }
}

async function handleReturn(ctx: ExtensionCommandContext): Promise<void> {
  if (!originalCwd) {
    ctx.ui.notify("Already in the main project tree.", "info");
    return;
  }

  // Auto-commit dirty files before leaving worktree
  const commitMsg = autoCommitCurrentBranch(process.cwd(), "worktree-return", "worktree");

  const returnTo = originalCwd;
  originalCwd = null;

  const prevCwd = process.cwd();
  process.chdir(returnTo);
  nudgeGitBranchCache(prevCwd);

  const commitNote = commitMsg ? `\n  Auto-committed on worktree branch before returning.` : "";
  ctx.ui.notify(
    [
      `Returned to main project tree.`,
      `  Path: ${returnTo}`,
      commitNote,
    ].filter(Boolean).join("\n"),
    "info",
  );
}

// ANSI helpers for list formatting
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const WHITE = "\x1b[37m";

async function handleList(
  basePath: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  try {
    const mainBase = originalCwd ?? basePath;
    const worktrees = listWorktrees(mainBase);

    if (worktrees.length === 0) {
      ctx.ui.notify("No GSD worktrees found. Create one with /worktree <name>.", "info");
      return;
    }

    const cwd = process.cwd();
    const lines = [`${BOLD}${WHITE}GSD Worktrees${RESET}`, ""];
    for (const wt of worktrees) {
      const isCurrent = cwd === wt.path
        || (existsSync(cwd) && existsSync(wt.path)
          && realpathSync(cwd) === realpathSync(wt.path));

      const nameColor = isCurrent ? GREEN : CYAN;
      const badge = isCurrent ? `  ${GREEN}● active${RESET}` : !wt.exists ? `  ${YELLOW}✗ missing${RESET}` : "";
      lines.push(`  ${BOLD}${nameColor}${wt.name}${RESET}${badge}`);
      lines.push(`  ${DIM}  branch${RESET}  ${wt.branch}`);
      lines.push(`  ${DIM}  path${RESET}    ${DIM}${wt.path}${RESET}`);
      lines.push("");
    }

    if (originalCwd) {
      lines.push(`${DIM}Main tree: ${originalCwd}${RESET}`);
    }

    ctx.ui.notify(lines.join("\n"), "info");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to list worktrees: ${msg}`, "error");
  }
}

async function handleMerge(
  basePath: string,
  name: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  targetBranch?: string,
): Promise<void> {
  try {
    const branch = worktreeBranchName(name);
    const mainBranch = targetBranch ?? getMainBranch(basePath);

    // Validate the worktree/branch exists
    const worktrees = listWorktrees(basePath);
    const wt = worktrees.find(w => w.name === name);
    if (!wt) {
      ctx.ui.notify(`Worktree "${name}" not found. Run /worktree list to see available worktrees.`, "warning");
      return;
    }

    // Gather merge context
    const diffSummary = diffWorktreeGSD(basePath, name);
    const fullDiff = getWorktreeGSDDiff(basePath, name);
    const commitLog = getWorktreeLog(basePath, name);

    const totalChanges = diffSummary.added.length + diffSummary.modified.length + diffSummary.removed.length;
    if (totalChanges === 0 && !commitLog.trim()) {
      ctx.ui.notify(`Worktree "${name}" has no changes to merge.`, "info");
      return;
    }

    // Preview confirmation before merge dispatch
    const previewLines = [
      `Merge worktree "${name}" → ${mainBranch}`,
      "",
      `  ${diffSummary.added.length} added · ${diffSummary.modified.length} modified · ${diffSummary.removed.length} removed`,
    ];
    if (diffSummary.added.length > 0) {
      previewLines.push("", "  Added:");
      for (const f of diffSummary.added.slice(0, 10)) previewLines.push(`    + ${f}`);
      if (diffSummary.added.length > 10) previewLines.push(`    … and ${diffSummary.added.length - 10} more`);
    }
    if (diffSummary.modified.length > 0) {
      previewLines.push("", "  Modified:");
      for (const f of diffSummary.modified.slice(0, 10)) previewLines.push(`    ~ ${f}`);
      if (diffSummary.modified.length > 10) previewLines.push(`    … and ${diffSummary.modified.length - 10} more`);
    }
    if (diffSummary.removed.length > 0) {
      previewLines.push("", "  Removed:");
      for (const f of diffSummary.removed.slice(0, 10)) previewLines.push(`    - ${f}`);
      if (diffSummary.removed.length > 10) previewLines.push(`    … and ${diffSummary.removed.length - 10} more`);
    }

    const confirmed = await showConfirm(ctx, {
      title: "Worktree Merge",
      message: previewLines.join("\n"),
      confirmLabel: "Merge",
      declineLabel: "Cancel",
    });
    if (!confirmed) {
      ctx.ui.notify("Merge cancelled.", "info");
      return;
    }

    // Format file lists for the prompt
    const formatFiles = (files: string[]) =>
      files.length > 0 ? files.map(f => `- \`${f}\``).join("\n") : "_(none)_";

    // Load and populate the merge prompt
    const prompt = loadPrompt("worktree-merge", {
      worktreeName: name,
      worktreeBranch: branch,
      mainBranch,
      commitLog: commitLog || "(no commits)",
      addedFiles: formatFiles(diffSummary.added),
      modifiedFiles: formatFiles(diffSummary.modified),
      removedFiles: formatFiles(diffSummary.removed),
      fullDiff: fullDiff || "(no diff)",
    });

    // Dispatch to the LLM
    pi.sendMessage(
      {
        customType: "gsd-worktree-merge",
        content: prompt,
        display: false,
      },
      { triggerTurn: true },
    );

    ctx.ui.notify(
      `Merge helper started for worktree "${name}" (${totalChanges} GSD artifact change${totalChanges === 1 ? "" : "s"}).`,
      "info",
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to start merge: ${msg}`, "error");
  }
}

async function handleRemove(
  basePath: string,
  name: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  try {
    const mainBase = originalCwd ?? basePath;
    removeWorktree(mainBase, name, { deleteBranch: true });

    // If we were in that worktree, we've been chdir'd out — clear tracking
    if (originalCwd && process.cwd() === originalCwd) {
      originalCwd = null;
    }

    ctx.ui.notify(`Worktree "${name}" removed (branch deleted).`, "info");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to remove worktree: ${msg}`, "error");
  }
}
