/**
 * GSD Command — /gsd eval-review
 *
 * Audits the implemented evaluation strategy of a slice against the planned
 * `AI-SPEC.md` and observed `SUMMARY.md`. Dispatches an LLM turn that scores
 * the slice on coverage and infrastructure dimensions and writes a scored
 * `EVAL-REVIEW.md` whose machine-readable contract lives in YAML frontmatter
 * (see `eval-review-schema.ts`).
 *
 * Distilled from the closed PR #4247, which received an adversarial review on
 * the following points (each addressed in this implementation, with regression
 * tests in `tests/commands-eval-review.test.ts`):
 *
 *   1. Path-traversal in `sliceId` — strict `/^S\d+$/` validation before any
 *      filesystem access (matches `commands-ship.ts` repo convention).
 *   2. Regex-over-LLM-prose for verdict/gaps — eliminated; consumers parse
 *      the validated YAML frontmatter only (eval-review-schema.ts).
 *   3. State conflation — three discriminated states: `no-slice-dir`,
 *      `no-summary`, `ready`.
 *   4. Sync FS in async handler — uses `node:fs/promises`.
 *   5. No prompt-size cap — combined SPEC+SUMMARY hard-capped at
 *      `MAX_CONTEXT_BYTES`; truncation surfaced via `ctx.ui.notify`.
 *   6. Silent flag stripping — token-level argument parser; unknown
 *      `--*` tokens raise an explicit error.
 *
 * Refs: #4246 (parent), #5114 (this issue), #4247 (closed predecessor).
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
  buildSliceFileName,
  resolveMilestonePath,
  resolveSliceFile,
  resolveSlicePath,
} from "./paths.js";
import { projectRoot } from "./commands/context.js";
import { deriveState } from "./state.js";
import {
  COVERAGE_WEIGHT,
  DIMENSION_VALUES,
  EVAL_REVIEW_SCHEMA_VERSION,
  INFRASTRUCTURE_WEIGHT,
  MAX_SCORE,
  MIN_SCORE,
  SEVERITY_VALUES,
  VERDICT_VALUES,
} from "./eval-review-schema.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Slice-ID format. Must match the canonical `/^S\d+$/` used elsewhere in the
 * GSD extension (`commands-ship.ts:56`). Trailing whitespace, embedded
 * separators, traversal sequences, and unicode look-alikes are all rejected.
 */
export const SLICE_ID_PATTERN = /^S\d+$/;

/**
 * Hard cap on the combined byte length of `SUMMARY.md` + `AI-SPEC.md` content
 * inlined into the auditor prompt. Exceeding this triggers truncation with an
 * inline marker; the handler also surfaces a warning via `ctx.ui.notify`.
 */
export const MAX_CONTEXT_BYTES = 200 * 1024;

const USAGE = "Usage: /gsd eval-review <sliceId> [--force] [--show]  (e.g. S07)";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Parsed and validated arguments for the `/gsd eval-review` command. */
export interface EvalReviewArgs {
  /** Validated slice ID matching {@link SLICE_ID_PATTERN}. */
  sliceId: string;
  /** When true, overwrite an existing EVAL-REVIEW.md without confirmation. */
  force: boolean;
  /** When true, print an existing EVAL-REVIEW.md to the UI and skip dispatch. */
  show: boolean;
}

/** Discriminated state returned by {@link detectEvalReviewState}. */
export type EvalReviewState =
  | {
      readonly kind: "no-slice-dir";
      readonly sliceId: string;
      /** The directory the handler expected to find. Used in the user message. */
      readonly expectedDir: string;
    }
  | {
      readonly kind: "no-summary";
      readonly sliceId: string;
      readonly sliceDir: string;
      readonly specPath: string | null;
    }
  | {
      readonly kind: "ready";
      readonly sliceId: string;
      readonly sliceDir: string;
      readonly summaryPath: string;
      readonly specPath: string | null;
    };

/**
 * Inputs to the auditor prompt builder. Constructed by
 * {@link buildEvalReviewContext} from a `ready` state.
 */
export interface EvalReviewContext {
  readonly milestoneId: string;
  readonly sliceId: string;
  readonly summary: string;
  readonly summaryPath: string;
  /** `null` when the slice has no AI-SPEC.md (state `no-spec` flavor of `ready`). */
  readonly spec: string | null;
  readonly specPath: string | null;
  /** Absolute path the auditor agent will write its EVAL-REVIEW.md to. */
  readonly outputPath: string;
  readonly relativeOutputPath: string;
  /** True when at least one of summary/spec was truncated to fit the cap. */
  readonly truncated: boolean;
  readonly generatedAt: string;
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

/**
 * Typed error thrown by {@link parseEvalReviewArgs} on argument validation
 * failure. Tests assert on `instanceof EvalReviewArgError` rather than the
 * message text.
 */
export class EvalReviewArgError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EvalReviewArgError";
  }
}

/**
 * Parse and validate the raw argument string.
 *
 * Tokenization is whitespace-based; flag detection runs per-token. Unknown
 * `--*` tokens raise rather than getting silently stripped (the explicit
 * response to the closed PR #4247 finding where `--force-wipe` was mangled).
 *
 * `sliceId` is validated against {@link SLICE_ID_PATTERN} before any
 * filesystem access can possibly happen — defense in depth against
 * path-traversal payloads.
 *
 * @param raw - The argument substring after the subcommand name.
 * @returns A validated {@link EvalReviewArgs}.
 * @throws {EvalReviewArgError} on missing slice ID, invalid slice ID, or
 *   unknown flag.
 */
export function parseEvalReviewArgs(raw: string): EvalReviewArgs {
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0);
  let sliceId: string | null = null;
  let force = false;
  let show = false;

  for (const token of tokens) {
    if (token === "--force") {
      force = true;
      continue;
    }
    if (token === "--show") {
      show = true;
      continue;
    }
    if (token.startsWith("--")) {
      throw new EvalReviewArgError(`Unknown flag: ${token}. ${USAGE}`);
    }
    if (sliceId !== null) {
      throw new EvalReviewArgError(
        `Multiple slice IDs supplied (${sliceId}, ${token}). ${USAGE}`,
      );
    }
    sliceId = token;
  }

  if (sliceId === null) {
    throw new EvalReviewArgError(`Missing slice ID. ${USAGE}`);
  }
  if (!SLICE_ID_PATTERN.test(sliceId)) {
    throw new EvalReviewArgError(
      `Invalid slice ID '${sliceId}'. Expected pattern /^S\\d+$/ (e.g. S07).`,
    );
  }

  return { sliceId, force, show };
}

// ─── State detection ──────────────────────────────────────────────────────────

/**
 * Synchronously inspect the slice directory and classify the state.
 *
 * Three states with distinct error semantics:
 *   - `no-slice-dir` → likely a typo in the slice ID, milestone exists but
 *      slice does not.
 *   - `no-summary` → slice exists but `SUMMARY.md` is missing; the user
 *      probably skipped `/gsd execute-phase`.
 *   - `ready` → audit can run.
 *
 * AI-SPEC.md is optional in every state where the slice directory exists —
 * its absence reduces the audit to a best-practices comparison rather than a
 * spec-vs-implementation diff.
 *
 * @param args - validated args (caller has already run {@link parseEvalReviewArgs}).
 * @param basePath - project root.
 * @param milestoneId - active milestone ID.
 * @returns A discriminated state object.
 */
export function detectEvalReviewState(
  args: EvalReviewArgs,
  basePath: string,
  milestoneId: string,
): EvalReviewState {
  const { sliceId } = args;
  const sliceDir = resolveSlicePath(basePath, milestoneId, sliceId);
  if (!sliceDir || !existsSync(sliceDir)) {
    const milestoneDir = resolveMilestonePath(basePath, milestoneId);
    const expectedDir = milestoneDir
      ? join(milestoneDir, "slices", sliceId)
      : join(basePath, ".gsd", "milestones", milestoneId, "slices", sliceId);
    return { kind: "no-slice-dir", sliceId, expectedDir };
  }

  const specPath = resolveSliceFile(basePath, milestoneId, sliceId, "AI-SPEC");
  const summaryPath = resolveSliceFile(basePath, milestoneId, sliceId, "SUMMARY");

  if (!summaryPath || !existsSync(summaryPath)) {
    return { kind: "no-summary", sliceId, sliceDir, specPath: specPath ?? null };
  }

  return { kind: "ready", sliceId, sliceDir, summaryPath, specPath: specPath ?? null };
}

// ─── Context builder ──────────────────────────────────────────────────────────

/**
 * Read SUMMARY.md and (optional) AI-SPEC.md from disk asynchronously, applying
 * the {@link MAX_CONTEXT_BYTES} cap.
 *
 * SUMMARY.md is the primary input; if it alone exceeds the cap, it is
 * truncated and AI-SPEC.md is skipped entirely (with a marker).
 * Otherwise the residual budget is allocated to AI-SPEC.md.
 *
 * Truncation is communicated to the LLM via an inline marker (`[truncated:
 * N bytes elided]`) so the auditor can flag the slice as "too large to fully
 * audit" if relevant.
 *
 * @param state - a `ready` state from {@link detectEvalReviewState}.
 * @param milestoneId - active milestone ID, propagated for path-relative
 *   prompt rendering.
 * @param now - clock injection seam for tests.
 * @returns the inlined context ready for the prompt builder.
 * @throws {Error} when a required file read fails for any reason other than
 *   the absence of the optional spec.
 */
export async function buildEvalReviewContext(
  state: Extract<EvalReviewState, { kind: "ready" }>,
  milestoneId: string,
  now: () => Date = () => new Date(),
): Promise<EvalReviewContext> {
  const summaryRead = await readCapped(state.summaryPath, MAX_CONTEXT_BYTES);
  const summaryBytes = summaryRead.bytesUsed;
  const remaining = MAX_CONTEXT_BYTES - summaryBytes;

  let spec: string | null = null;
  let specTruncated = false;
  if (state.specPath && remaining > 0) {
    try {
      const specRead = await readCapped(state.specPath, remaining);
      spec = specRead.content;
      specTruncated = specRead.truncated;
    } catch (err) {
      // The spec is optional — surface the read failure as missing rather than
      // crashing the audit. A malformed/unreadable AI-SPEC.md should not block
      // /gsd eval-review.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read ${state.specPath}: ${msg}`);
    }
  }

  const truncated = summaryRead.truncated || specTruncated;
  const outputPath = evalReviewWritePath(state.sliceDir, state.sliceId);
  const basePath = projectRoot();
  const relativeOutputPath = relative(basePath, outputPath);

  return {
    milestoneId,
    sliceId: state.sliceId,
    summary: summaryRead.content,
    summaryPath: state.summaryPath,
    spec,
    specPath: state.specPath,
    outputPath,
    relativeOutputPath,
    truncated,
    generatedAt: now().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

interface CappedRead {
  readonly content: string;
  readonly bytesUsed: number;
  readonly truncated: boolean;
}

async function readCapped(filePath: string, maxBytes: number): Promise<CappedRead> {
  const buf = await readFile(filePath);
  if (buf.byteLength <= maxBytes) {
    return {
      content: buf.toString("utf-8"),
      bytesUsed: buf.byteLength,
      truncated: false,
    };
  }
  const head = buf.subarray(0, maxBytes).toString("utf-8");
  const elided = buf.byteLength - maxBytes;
  return {
    content: `${head}\n\n[truncated: ${elided} bytes elided to fit eval-review context cap of ${maxBytes} bytes]\n`,
    bytesUsed: maxBytes,
    truncated: true,
  };
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the canonical write path for a slice's EVAL-REVIEW.md.
 *
 * Pure path math — does not touch the filesystem. Used both for finding an
 * existing file and for determining where the auditor agent will write its
 * output.
 *
 * @param sliceDir - absolute slice directory.
 * @param sliceId - validated slice ID.
 * @returns absolute path to `<sliceDir>/<sliceId>-EVAL-REVIEW.md`.
 */
export function evalReviewWritePath(sliceDir: string, sliceId: string): string {
  return join(sliceDir, buildSliceFileName(sliceId, "EVAL-REVIEW"));
}

/**
 * Locate an existing `<sliceId>-EVAL-REVIEW.md` for the slice via the same
 * resolver other slice files use, returning `null` if absent.
 *
 * @param basePath - project root.
 * @param milestoneId - active milestone ID.
 * @param sliceId - validated slice ID.
 * @returns absolute path or `null`.
 */
export function findEvalReviewFile(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): string | null {
  return resolveSliceFile(basePath, milestoneId, sliceId, "EVAL-REVIEW");
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build the dispatch prompt for the auditor agent.
 *
 * The prompt is verbatim — it embeds the YAML frontmatter contract (see
 * {@link EVAL_REVIEW_SCHEMA_VERSION}) inline so the agent has a literal
 * template to fill, and it embeds the scoring rubric with the explicit
 * anti-Goodhart language: string presence is not evidence; cite an executed
 * code path or a test that exercises the dimension. The rubric weights
 * (60% coverage, 40% infrastructure) are documented in
 * `docs/dev/ADR-011-eval-review-scoring.md`.
 *
 * @param ctx - prompt context built by {@link buildEvalReviewContext}.
 * @returns the fully-formed prompt as a single markdown string.
 */
export function buildEvalReviewPrompt(ctx: EvalReviewContext): string {
  const truncationNote = ctx.truncated
    ? "\n> ⚠️  Inputs were truncated to fit the prompt size cap. Audit conclusions should account for the elided content; flag the slice as `NEEDS_WORK` or lower if an unreviewed remainder could materially change the verdict.\n"
    : "";

  const specBlock = ctx.spec
    ? `### AI-SPEC.md\n\n${ctx.spec}`
    : "### AI-SPEC.md\n\n(not present — audit against best-practice eval dimensions instead of a per-spec gap analysis)";

  return `# Eval Review — ${ctx.milestoneId} / ${ctx.sliceId}

**Output file:** ${ctx.outputPath}
**Schema version:** ${EVAL_REVIEW_SCHEMA_VERSION}
**Generated at:** ${ctx.generatedAt}
${truncationNote}
## Your Task

Audit the implemented evaluation strategy of slice **${ctx.sliceId}** against
the artefacts inlined below. Score each dimension on coverage and
infrastructure, identify gaps, and write a fully-formed EVAL-REVIEW.md to
the output path above using the **Write** tool.

## Output Contract (machine-readable — frontmatter only)

The output file must begin with YAML frontmatter using this exact schema.
Body content after the closing \`---\` is for human readers and is never
parsed; do not put scores or gaps in the body.

\`\`\`yaml
---
schema: ${EVAL_REVIEW_SCHEMA_VERSION}
verdict: ${VERDICT_VALUES.join(" | ")}
coverage_score: <int ${MIN_SCORE}..${MAX_SCORE}>
infrastructure_score: <int ${MIN_SCORE}..${MAX_SCORE}>
overall_score: <int ${MIN_SCORE}..${MAX_SCORE}>   # = round(coverage * ${COVERAGE_WEIGHT} + infra * ${INFRASTRUCTURE_WEIGHT})
generated: ${ctx.generatedAt}
slice: ${ctx.sliceId}
milestone: ${ctx.milestoneId}
gaps:
  - id: G01
    dimension: ${DIMENSION_VALUES.join(" | ")}
    severity: ${SEVERITY_VALUES.join(" | ")}
    description: "<one-sentence what's missing>"
    evidence: "<file>:<line> — cited code path or test (REQUIRED, see Anti-Goodhart Rule)"
    suggested_fix: "<one-sentence how to close the gap>"
counts:
  blocker: <int>
  major: <int>
  minor: <int>
---
\`\`\`

The body that follows the closing \`---\` is free-form prose for humans:
your detailed reasoning, supporting quotes from the artefacts, and any
caveats. None of it is parsed.

## Scoring Rubric (60% coverage, 40% infrastructure)

\`overall_score = round(coverage_score * ${COVERAGE_WEIGHT} + infrastructure_score * ${INFRASTRUCTURE_WEIGHT})\`

| Verdict | Range |
|---|---|
| PRODUCTION_READY | overall_score ≥ 80 |
| NEEDS_WORK | 60 ≤ overall_score < 80 |
| SIGNIFICANT_GAPS | 40 ≤ overall_score < 60 |
| NOT_IMPLEMENTED | overall_score < 40 |

**Coverage (60% weight)** — fraction of the eval dimensions called for by
the AI-SPEC (or, when AI-SPEC.md is absent, the standard set
${DIMENSION_VALUES.filter((d) => d !== "other").join(", ")}) that have
**behavior evidence** in the slice. Behavior evidence means a code path you
can cite by file and line that *executes* the dimension at runtime, or a
test that exercises it. Higher weight because coverage gaps compound — an
unobserved feature is harder to recover than a missing logging library.

**Infrastructure (40% weight)** — presence of the tooling layer the
dimensions require: a logging provider, a metrics sink, an eval harness,
training/evaluation datasets. Lower weight because infrastructure tends
toward binary: it's either wired up or not, and adding it is mechanical.

The 60/40 split is justified in \`docs/dev/ADR-011-eval-review-scoring.md\`.
Alternatives considered: 50/50 (under-rewards behavior verification),
70/30 (over-penalizes greenfield slices that haven't yet built infra).

## Anti-Goodhart Rule (read carefully)

A dimension scores **0 on coverage** if your only evidence is string or file
presence. \`grep langfuse\` in the source tree is not evidence; it's a token.
Examples of acceptable evidence:

- ✅ \`src/llm/wrapper.ts:42 — emit('llm.latency', { latency_ms })\` (cited
  call site that runs at request time).
- ✅ \`tests/llm-budget.test.ts: asserts the request is rejected when
  budget cap is exceeded\` (a test that exercises the guardrail dimension).
- ❌ \`package.json includes 'langfuse' as a dependency\` (not evidence;
  the dependency might be unused).
- ❌ \`src/observability/types.ts: defines a TraceId type\` (a type
  declaration is not a runtime path).

Every \`gaps[*].evidence\` field is **required** by the schema. If you
cannot cite evidence for a dimension, it is a gap, not a passed score.

## Slice Artefacts

${specBlock}

### SUMMARY.md

${ctx.summary}

---

## Final checklist before writing

1. Does the frontmatter match the schema exactly (all field names, all
   enum values)? An invalid frontmatter is a regression of PR #4247.
2. Is every \`gaps[*].evidence\` a cited file:line, not a token presence
   claim?
3. Does \`overall_score\` actually equal \`round(coverage * 0.6 + infra * 0.4)\`?
   The handler will recompute and warn if not.
4. Do \`counts\` add up to \`gaps.length\` and match each severity bucket?
5. Did you write to **${ctx.outputPath}** (the canonical path), and only
   that path?
`;
}

// ─── Handler entry ────────────────────────────────────────────────────────────

/**
 * Handle `/gsd eval-review <sliceId> [--force] [--show]`.
 *
 * Workflow:
 *   1. Parse and validate args (path-traversal-safe).
 *   2. Resolve the active milestone via `deriveState`.
 *   3. Detect state — bail on `no-slice-dir` / `no-summary` with distinct
 *      messages.
 *   4. If `--show` and an existing EVAL-REVIEW.md is present, surface it
 *      and stop.
 *   5. If a previous EVAL-REVIEW.md exists and `--force` is not set,
 *      refuse with a path hint.
 *   6. Build the prompt context (size-capped) and dispatch the LLM turn
 *      via `pi.sendMessage(...)`.
 *
 * Errors from `parseEvalReviewArgs` are caught and surfaced as `ctx.ui.notify`
 * warnings so the user sees a friendly message rather than a stack trace.
 *
 * @param args - the substring after `eval-review` in the slash command.
 * @param ctx - extension command context (notification surface).
 * @param pi - extension API (LLM dispatch + tool surface).
 */
export async function handleEvalReview(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  let parsed: EvalReviewArgs;
  try {
    parsed = parseEvalReviewArgs(args);
  } catch (err) {
    if (err instanceof EvalReviewArgError) {
      ctx.ui.notify(err.message, "warning");
      return;
    }
    throw err;
  }

  const basePath = projectRoot();
  const state = await deriveState(basePath);
  if (!state.activeMilestone) {
    ctx.ui.notify(
      "No active milestone — start or resume one before running /gsd eval-review.",
      "warning",
    );
    return;
  }
  const milestoneId = state.activeMilestone.id;

  const detected = detectEvalReviewState(parsed, basePath, milestoneId);

  if (detected.kind === "no-slice-dir") {
    ctx.ui.notify(
      `Slice not found: ${detected.sliceId}. Expected at ${detected.expectedDir} — check the slice ID for typos.`,
      "error",
    );
    return;
  }
  if (detected.kind === "no-summary") {
    ctx.ui.notify(
      `Slice ${detected.sliceId} exists but has no SUMMARY.md — run /gsd execute-phase first to generate one.`,
      "warning",
    );
    return;
  }

  const existing = findEvalReviewFile(basePath, milestoneId, detected.sliceId);

  if (parsed.show) {
    if (!existing) {
      ctx.ui.notify(
        `No EVAL-REVIEW.md present for ${detected.sliceId}. Run /gsd eval-review ${detected.sliceId} to generate one.`,
        "warning",
      );
      return;
    }
    try {
      const content = await readFile(existing, "utf-8");
      ctx.ui.notify(`--- ${detected.sliceId}-EVAL-REVIEW.md ---\n\n${content}`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`Failed to read ${existing}: ${msg}`, "error");
    }
    return;
  }

  if (existing && !parsed.force) {
    ctx.ui.notify(
      `EVAL-REVIEW.md already exists at ${existing}. Re-run with --force to overwrite.`,
      "warning",
    );
    return;
  }

  let context: EvalReviewContext;
  try {
    context = await buildEvalReviewContext(detected, milestoneId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to build eval-review context: ${msg}`, "error");
    return;
  }

  if (context.truncated) {
    ctx.ui.notify(
      `Inputs exceeded ${MAX_CONTEXT_BYTES} bytes; some content was truncated for the prompt. The auditor will be told to flag accordingly.`,
      "warning",
    );
  }

  const prompt = buildEvalReviewPrompt(context);

  ctx.ui.notify(
    `Auditing ${milestoneId}/${detected.sliceId} → ${context.relativeOutputPath}…`,
    "info",
  );

  pi.sendMessage(
    { customType: "gsd-eval-review", content: prompt, display: false },
    { triggerTurn: true },
  );
}
