/**
 * GSD Command — /gsd eval-fix
 *
 * Reads an existing EVAL-REVIEW.md, extracts MISSING/PARTIAL gaps,
 * and spawns a fix agent to address them in the codebase.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { deriveState } from "./state.js";
import { loadPrompt } from "./prompt-loader.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvalFixArgs {
  sliceId: string | null;
}

// ── Pure Functions ────────────────────────────────────────────────────────────

export function parseEvalFixArgs(args: string): EvalFixArgs {
  const sliceId = args.trim().length > 0 ? args.trim() : null;
  return { sliceId };
}

export function findEvalReviewFile(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): string | null {
  const filePath = join(
    basePath,
    ".gsd",
    "milestones",
    milestoneId,
    "slices",
    sliceId,
    `${sliceId}-EVAL-REVIEW.md`,
  );
  return existsSync(filePath) ? filePath : null;
}

export function parseGapsFromEvalReview(content: string): string[] {
  // Split on ## headings, find the Gap Analysis section
  const sections = content.split(/^(?=## )/m);
  const gapSection = sections.find((s) => s.startsWith("## Gap Analysis"));
  if (!gapSection) return [];

  const gaps: string[] = [];
  for (const line of gapSection.split("\n")) {
    const match = line.match(/^[-*]\s+(.+)/);
    if (match) {
      gaps.push(match[1].trim());
    }
  }

  return gaps;
}

export function buildEvalFixOutputPath(sliceDir: string, sliceId: string): string {
  return join(sliceDir, `${sliceId}-EVAL-FIX.md`);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleEvalFix(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();
  const gsdState = await deriveState(basePath);

  if (!gsdState.activeMilestone) {
    ctx.ui.notify("No active milestone.", "warning");
    return;
  }

  const milestoneId = gsdState.activeMilestone.id;
  const parsed = parseEvalFixArgs(args);

  // Resolve target slice — explicit arg or active slice
  const sliceId = parsed.sliceId ?? gsdState.activeSlice?.id ?? null;
  if (!sliceId) {
    ctx.ui.notify(
      "No active slice. Specify a slice ID: /gsd eval-fix S01",
      "warning",
    );
    return;
  }

  const reviewFilePath = findEvalReviewFile(basePath, milestoneId, sliceId);
  if (!reviewFilePath) {
    ctx.ui.notify(
      `No EVAL-REVIEW.md found for slice ${sliceId}. Run /gsd eval-review first.`,
      "warning",
    );
    return;
  }

  const evalReviewContent = readFileSync(reviewFilePath, "utf-8");
  const gaps = parseGapsFromEvalReview(evalReviewContent);

  if (gaps.length === 0) {
    ctx.ui.notify(
      `No gaps found in EVAL-REVIEW for ${sliceId}. Re-run with /gsd eval-review --force ${sliceId} to refresh the score.`,
      "info",
    );
    return;
  }

  const sliceDir = join(basePath, ".gsd", "milestones", milestoneId, "slices", sliceId);
  const outputPath = buildEvalFixOutputPath(sliceDir, sliceId);

  ctx.ui.notify(
    `Running eval-fix for ${sliceId} — ${gaps.length} gap${gaps.length === 1 ? "" : "s"} to address...`,
    "info",
  );

  try {
    const prompt = loadPrompt("eval-fix", {
      sliceId,
      milestoneId,
      workingDirectory: basePath,
      gaps: gaps.join("\n"),
      evalReviewContent,
      outputPath,
    });

    pi.sendMessage(
      { customType: "gsd-eval-fix", content: prompt, display: false },
      { triggerTurn: true },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to dispatch eval-fix: ${msg}`, "error");
  }
}
