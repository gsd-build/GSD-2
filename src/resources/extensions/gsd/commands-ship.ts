/**
 * GSD Command — /gsd ship
 *
 * Creates a PR from milestone artifacts: generates title + body from
 * roadmap, slice summaries, and metrics, then opens via `gh pr create`.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { deriveState } from "./state.js";
import { resolveMilestoneFile, resolveSlicePath, resolveSliceFile } from "./paths.js";
import { getLedger, getProjectTotals, aggregateByModel, formatCost, formatTokenCount, loadLedgerFromDisk } from "./metrics.js";
import { nativeGetCurrentBranch, nativeDetectMainBranch } from "./native-git-bridge.js";
import { formatDuration } from "../shared/format-utils.js";
import { parseEvalReviewFrontmatter, type Verdict } from "./eval-review-schema.js";
import { projectRoot } from "./commands/context.js";

function git(basePath: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: basePath, encoding: "utf-8" }).trim();
}

function isValidRefName(name: string): boolean {
  try {
    execFileSync("git", ["check-ref-format", "--branch", name], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

interface PRContent {
  title: string;
  body: string;
}

function listSliceIds(basePath: string, milestoneId: string): string[] {
  // Slices live at <milestoneDir>/slices/<sliceId>/ with canonical S\d+ IDs.
  // Use resolveSlicePath with a probe to find the real slices directory root.
  const probe = resolveSlicePath(basePath, milestoneId, "S01");
  let slicesDir: string | null = null;
  if (probe) {
    // probe looks like <milestoneDir>/slices/S01 — parent is slices dir.
    slicesDir = probe.replace(/[\\/][^\\/]+$/, "");
  } else {
    // Fall back to scanning the milestones roadmap file's sibling slices dir.
    const roadmap = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
    if (roadmap) {
      slicesDir = roadmap.replace(/[\\/][^\\/]+$/, "") + "/slices";
    }
  }
  if (!slicesDir || !existsSync(slicesDir)) return [];

  try {
    return readdirSync(slicesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^S\d+$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function collectSliceSummaries(basePath: string, milestoneId: string): string[] {
  const summaries: string[] = [];
  for (const sliceId of listSliceIds(basePath, milestoneId)) {
    const summaryPath = resolveSliceFile(basePath, milestoneId, sliceId, "SUMMARY");
    if (!summaryPath || !existsSync(summaryPath)) continue;
    try {
      const content = readFileSync(summaryPath, "utf-8").trim();
      if (content) summaries.push(`### ${sliceId}\n${content}`);
    } catch {
      // non-fatal
    }
  }
  return summaries;
}

/**
 * Discriminated result of inspecting a slice's `<sliceId>-EVAL-REVIEW.md`
 * for the pre-ship soft warning. Pure data — the caller decides how to
 * surface each variant to the user.
 */
export type SliceEvalCheck =
  | { readonly sliceId: string; readonly kind: "absent" }
  | {
      readonly sliceId: string;
      readonly kind: "malformed";
      readonly error: string;
      readonly pointer: string;
    }
  | {
      readonly sliceId: string;
      readonly kind: "ok";
      readonly verdict: Verdict;
      readonly overall_score: number;
    };

/**
 * Inspect a single slice's EVAL-REVIEW.md without throwing.
 *
 * One async file read attempt — no `existsSync` precheck (defense against the
 * TOCTOU race that bit prior implementations). ENOENT is treated as `absent`.
 * Other read errors
 * propagate so callers can decide how to handle them; the {@link handleShip}
 * caller wraps them in a non-blocking warning rather than aborting the
 * ship.
 *
 * @param basePath - project root.
 * @param milestoneId - active milestone ID.
 * @param sliceId - slice ID to check.
 * @returns A {@link SliceEvalCheck} discriminating on the four valid states.
 * @throws Forwarded `readFile` errors other than `ENOENT`.
 */
export async function checkSliceEvalReview(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): Promise<SliceEvalCheck> {
  const path = resolveSliceFile(basePath, milestoneId, sliceId, "EVAL-REVIEW");
  if (!path) {
    return { sliceId, kind: "absent" };
  }

  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { sliceId, kind: "absent" };
    }
    throw err;
  }

  const parsed = parseEvalReviewFrontmatter(raw);
  if (!parsed.ok) {
    return { sliceId, kind: "malformed", error: parsed.error, pointer: parsed.pointer };
  }

  return {
    sliceId,
    kind: "ok",
    verdict: parsed.data.verdict,
    overall_score: parsed.data.overall_score,
  };
}

function generatePRContent(basePath: string, milestoneId: string, milestoneTitle: string): PRContent {
  const title = `feat: ${milestoneTitle || milestoneId}`;

  const sections: string[] = [];

  // TL;DR
  sections.push("## TL;DR\n");
  sections.push(`**What:** Ship milestone ${milestoneId} — ${milestoneTitle || "(untitled)"}`);
  sections.push(`**Why:** Milestone work complete, ready for review.`);
  sections.push(`**How:** See slice summaries below.\n`);

  // What — slice summaries
  const summaries = collectSliceSummaries(basePath, milestoneId);
  if (summaries.length > 0) {
    sections.push("## What\n");
    sections.push(summaries.join("\n\n"));
    sections.push("");
  }

  // Roadmap status
  const roadmapPath = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
  if (roadmapPath && existsSync(roadmapPath)) {
    try {
      const roadmap = readFileSync(roadmapPath, "utf-8");
      const checkboxLines = roadmap.split("\n").filter((l) => /^\s*-\s*\[[ x]\]/.test(l));
      if (checkboxLines.length > 0) {
        sections.push("## Roadmap\n");
        sections.push(checkboxLines.join("\n"));
        sections.push("");
      }
    } catch {
      // non-fatal
    }
  }

  // Metrics
  const ledger = getLedger();
  const units = ledger?.units ?? loadLedgerFromDisk(basePath)?.units ?? [];
  if (units.length > 0) {
    const totals = getProjectTotals(units);
    const byModel = aggregateByModel(units);
    sections.push("## Metrics\n");
    sections.push(`- **Units executed:** ${units.length}`);
    sections.push(`- **Total cost:** ${formatCost(totals.cost)}`);
    sections.push(`- **Tokens:** ${formatTokenCount(totals.tokens.input)} input / ${formatTokenCount(totals.tokens.output)} output`);
    if (totals.duration > 0) {
      sections.push(`- **Duration:** ${formatDuration(totals.duration)}`);
    }
    if (byModel.length > 0) {
      sections.push(`- **Models:** ${byModel.map((m) => `${m.model} (${m.units} units)`).join(", ")}`);
    }
    sections.push("");
  }

  // Change type checklist
  sections.push("## Change type\n");
  sections.push("- [x] `feat` — New feature or capability");
  sections.push("- [ ] `fix` — Bug fix");
  sections.push("- [ ] `refactor` — Code restructuring");
  sections.push("- [ ] `test` — Adding or updating tests");
  sections.push("- [ ] `docs` — Documentation only");
  sections.push("- [ ] `chore` — Build, CI, or tooling changes\n");

  // AI disclosure
  sections.push("---\n");
  sections.push("*This PR was prepared with AI assistance (GSD auto-mode).*");

  return { title, body: sections.join("\n") };
}

export async function handleShip(
  args: string,
  ctx: ExtensionCommandContext,
  _pi: ExtensionAPI,
): Promise<void> {
  const basePath = projectRoot();
  const dryRun = args.includes("--dry-run");
  const draft = args.includes("--draft");
  const force = args.includes("--force");
  const baseMatch = args.match(/--base\s+(\S+)/);
  const base = baseMatch?.[1] ?? nativeDetectMainBranch(basePath);

  if (!isValidRefName(base)) {
    ctx.ui.notify(`Invalid base branch name: ${base}`, "error");
    return;
  }

  // 1. Validate milestone state
  const state = await deriveState(basePath);
  if (!state.activeMilestone) {
    ctx.ui.notify("No active milestone to ship. Complete milestone work first.", "warning");
    return;
  }

  const milestoneId = state.activeMilestone.id;
  const milestoneTitle = state.activeMilestone.title ?? "";

  // 2. Check for incomplete work (use GSD phase as proxy — no phase field on ActiveRef)
  if (state.phase !== "complete" && !force) {
    ctx.ui.notify(
      `Milestone ${milestoneId} may not be complete (phase: ${state.phase}). Use --force to ship anyway.`,
      "warning",
    );
    return;
  }

  // 2b. Pre-ship soft warning on EVAL-REVIEW.md status (non-blocking).
  for (const sliceId of listSliceIds(basePath, milestoneId)) {
    let result: SliceEvalCheck;
    try {
      result = await checkSliceEvalReview(basePath, milestoneId, sliceId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`Could not read EVAL-REVIEW.md for ${sliceId}: ${msg}`, "warning");
      continue;
    }
    if (result.kind === "absent") {
      ctx.ui.notify(
        `Slice ${sliceId} has no EVAL-REVIEW.md — consider /gsd eval-review ${sliceId} (non-blocking).`,
        "warning",
      );
    } else if (result.kind === "malformed") {
      ctx.ui.notify(
        `Slice ${sliceId} EVAL-REVIEW.md frontmatter invalid at ${result.pointer}: ${result.error} (non-blocking).`,
        "warning",
      );
    } else if (result.verdict === "NOT_IMPLEMENTED") {
      ctx.ui.notify(
        `Slice ${sliceId} eval verdict NOT_IMPLEMENTED (overall ${result.overall_score}/100) — shipping anyway, but the eval gap is unresolved.`,
        "warning",
      );
    }
  }

  // 3. Generate PR content
  const { title, body } = generatePRContent(basePath, milestoneId, milestoneTitle);

  // 4. Dry-run — just show the PR content
  if (dryRun) {
    ctx.ui.notify(`--- PR Preview ---\n\nTitle: ${title}\n\n${body}`, "info");
    return;
  }

  // 5. Check git state
  const currentBranch = nativeGetCurrentBranch(basePath);
  if (!isValidRefName(currentBranch)) {
    ctx.ui.notify(`Current branch name is invalid for git: ${currentBranch}`, "error");
    return;
  }
  if (currentBranch === base) {
    ctx.ui.notify(`You're on ${base} — create a feature branch first.`, "warning");
    return;
  }

  // 6. Push and create PR (all argv-safe, no shell interpolation)
  try {
    git(basePath, ["push", "-u", "origin", currentBranch]);

    const ghArgs = ["pr", "create", "--base", base, "--title", title, "--body", body];
    if (draft) ghArgs.push("--draft");

    const prUrl = execFileSync("gh", ghArgs, { cwd: basePath, encoding: "utf-8" }).trim();

    ctx.ui.notify(`PR created: ${prUrl}`, "success");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to create PR: ${msg}`, "error");
  }
}
