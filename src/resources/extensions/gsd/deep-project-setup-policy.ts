import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { GSDPreferences } from "./preferences.js";
import { clearParseCache } from "./files.js";
import { gsdRoot, clearPathCache } from "./paths.js";
import { validateArtifact } from "./schemas/validate.js";
import { getProjectResearchStatus } from "./project-research-policy.js";

export type DeepProjectSetupStage =
  | "workflow-preferences"
  | "project"
  | "requirements"
  | "research-decision"
  | "project-research";

export type DeepProjectSetupState =
  | { status: "not-applicable"; stage: null; reason: string }
  | { status: "complete"; stage: null; reason: string }
  | { status: "pending"; stage: DeepProjectSetupStage; reason: string }
  | { status: "blocked"; stage: DeepProjectSetupStage; reason: string };

type ResearchDecision = "research" | "skip";
type ResearchDecisionSource = "workflow-preferences" | "research-decision" | "user";

const EXPLICIT_RESEARCH_SOURCES = new Set<ResearchDecisionSource>([
  "research-decision",
  "user",
]);

function clearCaches(): void {
  clearPathCache();
  clearParseCache();
}

function runtimeDir(basePath: string): string {
  return join(gsdRoot(basePath), "runtime");
}

export function researchDecisionPath(basePath: string): string {
  return join(runtimeDir(basePath), "research-decision.json");
}

export function isWorkflowPrefsCaptured(basePath: string): boolean {
  const prefsPath = join(gsdRoot(basePath), "PREFERENCES.md");
  if (!existsSync(prefsPath)) return false;
  let content: string;
  try {
    content = readFileSync(prefsPath, "utf-8");
  } catch {
    return false;
  }
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return false;
  return /^workflow_prefs_captured:\s*true\s*$/m.test(match[1]);
}

export function writeDefaultResearchSkipDecision(
  basePath: string,
  reason = "deterministic-default",
  previousSource?: string,
): void {
  mkdirSync(runtimeDir(basePath), { recursive: true });
  const payload: Record<string, unknown> = {
    decision: "skip",
    decided_at: new Date().toISOString(),
    source: "workflow-preferences",
    reason,
  };
  if (previousSource) payload.previous_source = previousSource;
  writeFileSync(researchDecisionPath(basePath), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  clearCaches();
}

function readDecision(basePath: string): {
  exists: boolean;
  valid: boolean;
  decision?: ResearchDecision;
  source?: string;
} {
  const path = researchDecisionPath(basePath);
  if (!existsSync(path)) return { exists: false, valid: false };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    const decision = parsed.decision === "research" || parsed.decision === "skip"
      ? parsed.decision
      : undefined;
    return {
      exists: true,
      valid: decision !== undefined,
      decision,
      source: typeof parsed.source === "string" ? parsed.source : undefined,
    };
  } catch {
    return { exists: true, valid: false };
  }
}

function isExplicitResearchDecision(decision: {
  decision?: ResearchDecision;
  source?: string;
}): boolean {
  return decision.decision === "research" && EXPLICIT_RESEARCH_SOURCES.has(decision.source as ResearchDecisionSource);
}

export function resolveDeepProjectSetupState(
  prefs: GSDPreferences | undefined,
  basePath: string,
): DeepProjectSetupState {
  if (prefs?.planning_depth !== "deep") {
    return {
      status: "not-applicable",
      stage: null,
      reason: "Deep planning mode is not enabled.",
    };
  }

  const root = gsdRoot(basePath);
  if (!isWorkflowPrefsCaptured(basePath)) {
    return {
      status: "pending",
      stage: "workflow-preferences",
      reason: ".gsd/PREFERENCES.md is missing workflow_prefs_captured: true.",
    };
  }

  const projectPath = join(root, "PROJECT.md");
  if (!existsSync(projectPath)) {
    return {
      status: "pending",
      stage: "project",
      reason: ".gsd/PROJECT.md is missing.",
    };
  }
  if (!validateArtifact(projectPath, "project").ok) {
    return {
      status: "pending",
      stage: "project",
      reason: ".gsd/PROJECT.md is invalid.",
    };
  }

  const requirementsPath = join(root, "REQUIREMENTS.md");
  if (!existsSync(requirementsPath)) {
    return {
      status: "pending",
      stage: "requirements",
      reason: ".gsd/REQUIREMENTS.md is missing.",
    };
  }
  if (!validateArtifact(requirementsPath, "requirements").ok) {
    return {
      status: "pending",
      stage: "requirements",
      reason: ".gsd/REQUIREMENTS.md is invalid.",
    };
  }

  const marker = readDecision(basePath);
  if (!marker.exists) {
    writeDefaultResearchSkipDecision(basePath, "missing-default-repair");
    return {
      status: "complete",
      stage: null,
      reason: "Project research is skipped by the deterministic default.",
    };
  }
  if (!marker.valid) {
    writeDefaultResearchSkipDecision(basePath, "malformed-default-repair");
    return {
      status: "complete",
      stage: null,
      reason: "Malformed project research decision was repaired to the deterministic skip default.",
    };
  }
  if (marker.decision === "skip") {
    return {
      status: "complete",
      stage: null,
      reason: "Project research was skipped.",
    };
  }
  if (!isExplicitResearchDecision(marker)) {
    writeDefaultResearchSkipDecision(basePath, "legacy-workflow-research-default", marker.source);
    return {
      status: "complete",
      stage: null,
      reason: "Legacy workflow-defaulted project research was normalized to skip.",
    };
  }

  const researchStatus = getProjectResearchStatus(basePath);
  if (researchStatus.globalBlocker) {
    return {
      status: "blocked",
      stage: "project-research",
      reason:
        "Project research wrote PROJECT-RESEARCH-BLOCKER.md, so no verified research exists. Fix the blocker cause, delete the blocker, and rerun auto.",
    };
  }
  if (researchStatus.allDimensionBlockers) {
    return {
      status: "blocked",
      stage: "project-research",
      reason:
        "Project research produced only dimension blocker files, so no usable research exists. Fix the blocker cause, delete the dimension blocker files in `.gsd/research/`, and rerun auto.",
    };
  }
  if (!researchStatus.complete) {
    return {
      status: "pending",
      stage: "project-research",
      reason: researchStatus.missingDimensions.length > 0
        ? `Project research is missing dimensions: ${researchStatus.missingDimensions.join(", ")}.`
        : "Project research has not produced a verified research set.",
    };
  }

  return {
    status: "complete",
    stage: null,
    reason: "All deep project setup gates are complete.",
  };
}

