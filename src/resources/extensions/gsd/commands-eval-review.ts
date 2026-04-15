/**
 * GSD Command — /gsd eval-review
 *
 * Reviews an AI-SPEC and SUMMARY to evaluate how well the implementation
 * covers the original specification. Dispatches the gsd-eval-auditor agent
 * which scans eval-related files and produces a scored review report.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { deriveState } from "./state.js";
import { loadPrompt, getTemplatesDir } from "./prompt-loader.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvalReviewArgs {
  sliceId: string | null;
  force?: boolean;
  show?: boolean;
}

export type EvalReviewStateType = "full" | "no-spec" | "no-summary";

export interface EvalReviewState {
  state: EvalReviewStateType;
  summaryPath: string | null;
  specPath: string | null;
  sliceDir: string | null;
}

// ── Pure Functions ────────────────────────────────────────────────────────────

export function parseEvalReviewArgs(args: string): EvalReviewArgs {
  const force = args.includes("--force");
  const show = args.includes("--show");
  // Remove flags and trim whitespace to get the bare slice ID
  const withoutFlags = args.replace(/--force\s*/g, "").replace(/--show\s*/g, "").trim();
  const sliceId = withoutFlags.length > 0 ? withoutFlags : null;
  return { sliceId, force: force || undefined, show: show || undefined };
}

export function detectEvalReviewState(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): EvalReviewState {
  const sliceDir = join(basePath, ".gsd", "milestones", milestoneId, "slices", sliceId);

  if (!existsSync(sliceDir)) {
    return { state: "no-summary", summaryPath: null, specPath: null, sliceDir: null };
  }

  // SUMMARY uses SliceID prefix: S01-SUMMARY.md
  const summaryPath = join(sliceDir, `${sliceId}-SUMMARY.md`);
  if (!existsSync(summaryPath)) {
    return { state: "no-summary", summaryPath: null, specPath: null, sliceDir };
  }

  // AI-SPEC has no prefix: AI-SPEC.md
  const specPath = join(sliceDir, "AI-SPEC.md");
  if (!existsSync(specPath)) {
    return { state: "no-spec", summaryPath, specPath: null, sliceDir };
  }

  return { state: "full", summaryPath, specPath, sliceDir };
}

export function buildEvalReviewOutputPath(sliceDir: string, sliceId: string): string {
  return join(sliceDir, `${sliceId}-EVAL-REVIEW.md`);
}

export function buildEvalReviewContext(state: EvalReviewState): { spec: string | null; summary: string } {
  const summary = state.summaryPath ? readFileSync(state.summaryPath, "utf-8") : "(no summary available)";
  const spec = state.specPath ? readFileSync(state.specPath, "utf-8") : null;
  return { spec, summary };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleEvalReview(
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
  const parsed = parseEvalReviewArgs(args);

  // Resolve target slice — explicit arg or active slice
  const sliceId = parsed.sliceId ?? gsdState.activeSlice?.id ?? null;
  if (!sliceId) {
    ctx.ui.notify(
      "No active slice. Specify a slice ID: /gsd eval-review S01",
      "warning",
    );
    return;
  }

  const evalState = detectEvalReviewState(basePath, milestoneId, sliceId);

  if (evalState.state === "no-summary") {
    ctx.ui.notify(
      `No SUMMARY.md found for slice ${sliceId}. Run /gsd execute-phase first.`,
      "warning",
    );
    return;
  }

  if (!evalState.sliceDir) {
    ctx.ui.notify("Could not resolve slice directory.", "error");
    return;
  }

  const outputPath = buildEvalReviewOutputPath(evalState.sliceDir, sliceId);

  // --show: read and summarise an existing review without re-running
  // --force is ignored when --show is set
  if (parsed.show && parsed.force) {
    ctx.ui.notify("--force is ignored when --show is set.", "info");
  }
  if (parsed.show) {
    if (!existsSync(outputPath)) {
      ctx.ui.notify(`No EVAL-REVIEW.md found for ${sliceId}. Run /gsd eval-review first.`, "warning");
      return;
    }
    const content = readFileSync(outputPath, "utf-8");
    const scoreMatch = content.match(/\*\*Overall Score:\*\*\s*(\d+)\/100/);
    const verdictMatch = content.match(/\*\*Verdict:\*\*\s*([^\n]+)/);
    const score = scoreMatch?.[1] ?? "?";
    const verdict = verdictMatch?.[1]?.trim() ?? "unknown";
    ctx.ui.notify(`EVAL-REVIEW ${sliceId}: ${verdict} (${score}/100)\nFile: ${outputPath}`, "info");
    return;
  }

  // Check if already reviewed (unless --force)
  if (!parsed.force && existsSync(outputPath)) {
    ctx.ui.notify(
      `Eval review already exists for ${sliceId}. Use --force to re-run: /gsd eval-review --force ${sliceId}`,
      "info",
    );
    return;
  }

  const context = buildEvalReviewContext(evalState);

  const stateLabel = evalState.state === "full" ? "AI-SPEC + SUMMARY" : "SUMMARY only (no AI-SPEC)";
  ctx.ui.notify(`Running eval review for ${sliceId} [${stateLabel}]...`, "info");

  try {
    const prompt = loadPrompt("eval-review", {
      sliceId,
      milestoneId,
      summaryContent: context.summary,
      specContent: context.spec ?? "(no AI-SPEC available for this slice)",
      outputPath,
      hasSpec: String(evalState.state === "full"),
      templatesDir: getTemplatesDir(),
    });

    pi.sendMessage(
      { customType: "gsd-eval-review", content: prompt, display: false },
      { triggerTurn: true },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to dispatch eval review: ${msg}`, "error");
  }
}
