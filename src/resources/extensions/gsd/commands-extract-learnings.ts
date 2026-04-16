/**
 * GSD Command — /gsd extract-learnings
 *
 * Analyses completed milestone artefacts and dispatches an LLM turn that
 * extracts structured knowledge into 4 categories:
 *   Decisions · Lessons · Patterns · Surprises
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

import { gsdRoot, resolveMilestonePath } from "./paths.js";
import { projectRoot } from "./commands/context.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhaseArtifacts {
  plan: string | null;
  summary: string | null;
  verification: string | null;
  uat: string | null;
  missingRequired: string[];
}

export interface ExtractLearningsPromptContext {
  milestoneId: string;
  milestoneName: string;
  outputPath: string;
  relativeOutputPath: string;
  planContent: string;
  summaryContent: string;
  verificationContent: string | null;
  uatContent: string | null;
  missingArtifacts: string[];
  projectName: string;
}

export interface FrontmatterContext {
  milestoneId: string;
  milestoneName: string;
  projectName: string;
  generatedAt: string;
  counts: {
    decisions: number;
    lessons: number;
    patterns: number;
    surprises: number;
  };
  missingArtifacts: string[];
}

// ─── Pure functions ───────────────────────────────────────────────────────────

export function parseExtractLearningsArgs(args: string): { milestoneId: string | null } {
  const trimmed = args.trim();
  return { milestoneId: trimmed || null };
}

export function buildLearningsOutputPath(milestoneDir: string, milestoneId: string): string {
  return join(milestoneDir, `${milestoneId}-LEARNINGS.md`);
}

export function resolvePhaseArtifacts(milestoneDir: string, milestoneId: string): PhaseArtifacts {
  const missingRequired: string[] = [];

  const planFile = `${milestoneId}-PLAN.md`;
  const summaryFile = `${milestoneId}-SUMMARY.md`;
  const verificationFile = `${milestoneId}-VERIFICATION.md`;
  const uatFile = `${milestoneId}-UAT.md`;

  const planPath = join(milestoneDir, planFile);
  const summaryPath = join(milestoneDir, summaryFile);
  const verificationPath = join(milestoneDir, verificationFile);
  const uatPath = join(milestoneDir, uatFile);

  const plan = existsSync(planPath) ? planPath : null;
  const summary = existsSync(summaryPath) ? summaryPath : null;
  const verification = existsSync(verificationPath) ? verificationPath : null;
  const uat = existsSync(uatPath) ? uatPath : null;

  if (!plan) missingRequired.push(planFile);
  if (!summary) missingRequired.push(summaryFile);

  return { plan, summary, verification, uat, missingRequired };
}

export function buildExtractLearningsPrompt(ctx: ExtractLearningsPromptContext): string {
  const optionalSections: string[] = [];

  if (ctx.verificationContent) {
    optionalSections.push(`## Verification Report\n\n${ctx.verificationContent}`);
  }
  if (ctx.uatContent) {
    optionalSections.push(`## UAT Report\n\n${ctx.uatContent}`);
  }

  const missingNote = ctx.missingArtifacts.length > 0
    ? `\nNote: The following optional artefacts were not available: ${ctx.missingArtifacts.join(", ")}\n`
    : "";

  return `# Extract Learnings — ${ctx.milestoneId}: ${ctx.milestoneName}

**Project:** ${ctx.projectName}
**Output file:** ${ctx.outputPath}

## Your Task

Analyse the artefacts below and extract structured knowledge from milestone **${ctx.milestoneId}**.

Write a LEARNINGS document to \`${ctx.outputPath}\` with the following 4 sections:

### Decisions
Key architectural and design decisions made during this milestone, including the rationale and alternatives considered.

### Lessons
What the team learned — technical discoveries, process insights, and knowledge gaps that were filled.

### Patterns
Reusable patterns, approaches, or solutions that emerged and should be applied in future work.

### Surprises
Unexpected challenges, discoveries, or outcomes — things that deviated from assumptions.

### Source Attribution (REQUIRED)

Every extracted item MUST include a \`Source:\` line immediately after the item text.
Format: \`Source: {artifact-filename}/{section}\`
Example: \`Source: M001-PLAN.md/Architecture Decisions\`

Items without a Source attribution are invalid and must not be included in the output.

---

## Artefacts

### Plan

${ctx.planContent}

---

### Summary

${ctx.summaryContent}

${optionalSections.join("\n\n---\n\n")}
${missingNote}
---

## Output Format

Write the LEARNINGS file to \`${ctx.relativeOutputPath}\` with YAML frontmatter followed by the 4 sections above.
Each section should contain concise, actionable bullet points.
Every bullet point MUST be followed by a source line, for example:

\`\`\`
### Decisions
- Chose PostgreSQL over SQLite for concurrent write support.
  Source: M001-PLAN.md/Architecture Decisions
\`\`\`

Items without a \`Source:\` line are invalid.

---

## Optional: Capture Individual Learnings

If the \`capture_thought\` tool is available, call it once for each extracted item with:
- category: "decision" | "lesson" | "pattern" | "surprise"
- phase: "${ctx.milestoneId}"
- content: {the learning text}
- source: {artifact filename}

If \`capture_thought\` is not available, skip this step silently — do not report an error.

---

## Rebuild Knowledge Graph

After writing LEARNINGS.md, call the \`gsd_graph\` tool with \`{ "mode": "build" }\` to rebuild the knowledge graph so the new learnings are immediately queryable by future milestone prompts.

If the \`gsd_graph\` tool is not available, skip this step silently.
`;
}

export function buildFrontmatter(ctx: FrontmatterContext): string {
  const missingList = ctx.missingArtifacts.length > 0
    ? ctx.missingArtifacts.map((a) => `  - ${a}`).join("\n")
    : "  []";

  const missingValue = ctx.missingArtifacts.length > 0
    ? `\n${missingList}`
    : " []";

  return `---
phase: ${ctx.milestoneId}
phase_name: ${ctx.milestoneName}
project: ${ctx.projectName}
generated: ${ctx.generatedAt}
counts:
  decisions: ${ctx.counts.decisions}
  lessons: ${ctx.counts.lessons}
  patterns: ${ctx.counts.patterns}
  surprises: ${ctx.counts.surprises}
missing_artifacts:${missingValue}
---`;
}

export function extractProjectName(basePath: string): string {
  const projectMdPath = join(gsdRoot(basePath), "PROJECT.md");

  if (existsSync(projectMdPath)) {
    try {
      const content = readFileSync(projectMdPath, "utf-8");
      const match = content.match(/^name:\s*(.+)$/m);
      if (match) return match[1].trim();
    } catch {
      // non-fatal
    }
  }

  return basename(basePath);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleExtractLearnings(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const { milestoneId } = parseExtractLearningsArgs(args);

  if (!milestoneId) {
    ctx.ui.notify("Usage: /gsd extract-learnings <milestoneId>  (e.g. M001)", "warning");
    return;
  }

  // projectRoot() throws GSDNoProjectError if no project found — intentional, handled by dispatcher
  const basePath = projectRoot();
  const milestoneDir = resolveMilestonePath(basePath, milestoneId);

  if (!milestoneDir) {
    ctx.ui.notify(`Milestone not found: ${milestoneId}`, "error");
    return;
  }

  const artifacts = resolvePhaseArtifacts(milestoneDir, milestoneId);

  if (artifacts.missingRequired.length > 0) {
    ctx.ui.notify(
      `Cannot extract learnings — required artefacts missing: ${artifacts.missingRequired.join(", ")}`,
      "error",
    );
    return;
  }

  // Read required artefacts
  const planContent = readFileSync(artifacts.plan!, "utf-8");
  const summaryContent = readFileSync(artifacts.summary!, "utf-8");

  // Read optional artefacts
  const verificationContent = artifacts.verification
    ? readFileSync(artifacts.verification, "utf-8")
    : null;
  const uatContent = artifacts.uat
    ? readFileSync(artifacts.uat, "utf-8")
    : null;

  // Determine missing optional artefacts for context
  const missingArtifacts: string[] = [];
  if (!artifacts.verification) missingArtifacts.push(`${milestoneId}-VERIFICATION.md`);
  if (!artifacts.uat) missingArtifacts.push(`${milestoneId}-UAT.md`);

  // Extract milestone name from Plan H1 or fall back to milestoneId
  const h1Match = planContent.match(/^#\s+(.+)$/m);
  const milestoneName = h1Match?.[1]?.trim() ?? milestoneId;

  const projectName = extractProjectName(basePath);
  const outputPath = buildLearningsOutputPath(milestoneDir, milestoneId);
  const relativeOutputPath = outputPath.replace(basePath + "/", "");

  const prompt = buildExtractLearningsPrompt({
    milestoneId,
    milestoneName,
    outputPath,
    relativeOutputPath,
    planContent,
    summaryContent,
    verificationContent,
    uatContent,
    missingArtifacts,
    projectName,
  });

  ctx.ui.notify(`Extracting learnings for ${milestoneId}: "${milestoneName}"...`, "info");

  pi.sendMessage(
    { customType: "gsd-extract-learnings", content: prompt, display: false },
    { triggerTurn: true },
  );
}
