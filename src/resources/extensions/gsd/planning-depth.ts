// gsd-2 / Deep planning mode — Helper to set planning_depth in .gsd/PREFERENCES.md.
//
// Persists the user's deep-mode opt-in across sessions. Reads the existing
// preferences file (if any), parses its YAML frontmatter, sets/updates
// planning_depth, and writes the file back preserving body content and other
// frontmatter keys.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { getProjectGSDPreferencesPath } from "./preferences.js";
import { logWarning } from "./workflow-logger.js";
import {
  researchDecisionPath,
  writeDefaultResearchSkipDecision,
} from "./deep-project-setup-policy.js";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Set planning_depth in the project's .gsd/PREFERENCES.md.
 * Creates the file if it does not exist. Preserves existing frontmatter
 * keys and body content. Intended to be called when the user opts into
 * (or out of) deep mode via `/gsd new-project --deep` or similar.
 */
export function setPlanningDepth(
  basePath: string,
  depth: "light" | "deep",
): void {
  const path = getProjectGSDPreferencesPath(basePath);
  const { frontmatter, body } = readProjectPreferencesParts(path);

  frontmatter.planning_depth = depth;
  if (depth === "deep") {
    applyDeepWorkflowPreferenceDefaults(frontmatter);
  }

  writeProjectPreferencesParts(path, frontmatter, body);
  if (depth === "deep") {
    ensureResearchDecisionDefault(basePath);
  }
}

export function ensureWorkflowPreferencesCaptured(basePath: string): void {
  const path = getProjectGSDPreferencesPath(basePath);
  const { frontmatter, body } = readProjectPreferencesParts(path);

  frontmatter.planning_depth = "deep";
  applyDeepWorkflowPreferenceDefaults(frontmatter);

  writeProjectPreferencesParts(path, frontmatter, body);
  ensureResearchDecisionDefault(basePath);
}

function readProjectPreferencesParts(path: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  let frontmatter: Record<string, unknown> = {};
  let body = "";
  if (existsSync(path)) {
    const content = readFileSync(path, "utf-8");
    const match = content.match(FRONTMATTER_RE);
    if (match) {
      try {
        const parsed = parseYaml(match[1]);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        }
        body = match[2];
      } catch (err) {
        // Invalid YAML — don't lose user content. Treat the whole file as
        // a legacy non-frontmatter document and preserve it via the body
        // path. The depth setter then prepends a fresh frontmatter block.
        logWarning("guided", `PREFERENCES.md frontmatter has invalid YAML — preserving body and rewriting frontmatter: ${err instanceof Error ? err.message : String(err)}`);
        body = content;
      }
    } else {
      // No frontmatter delimiters — preserve existing content as body.
      body = content;
    }
  }
  return { frontmatter, body };
}

function writeProjectPreferencesParts(
  path: string,
  frontmatter: Record<string, unknown>,
  body: string,
): void {
  // yaml.stringify emits a trailing newline. Strip if present so we control framing.
  const yamlBlock = stringifyYaml(frontmatter).replace(/\n$/, "");
  const newContent = body
    ? `---\n${yamlBlock}\n---\n\n${body.replace(/^\n+/, "")}`
    : `---\n${yamlBlock}\n---\n`;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, newContent, "utf-8");
}

function applyDeepWorkflowPreferenceDefaults(frontmatter: Record<string, unknown>): void {
  if (frontmatter.commit_policy === undefined) {
    frontmatter.commit_policy = "per-task";
  }
  if (frontmatter.branch_model === undefined) {
    frontmatter.branch_model = "single";
  }
  if (frontmatter.uat_dispatch === undefined) {
    frontmatter.uat_dispatch = true;
  }

  const existingModels = frontmatter.models;
  const models = existingModels && typeof existingModels === "object" && !Array.isArray(existingModels)
    ? existingModels as Record<string, unknown>
    : {};
  if (models.executor_class === undefined) {
    models.executor_class = "balanced";
  }
  frontmatter.models = models;
  frontmatter.workflow_prefs_captured = true;
}

function ensureResearchDecisionDefault(basePath: string): void {
  const decisionPath = researchDecisionPath(basePath);
  if (existsSync(decisionPath)) {
    try {
      const parsed = JSON.parse(readFileSync(decisionPath, "utf-8")) as Record<string, unknown>;
      const source = typeof parsed.source === "string" ? parsed.source : undefined;
      if (parsed.decision === "research" && (source === "research-decision" || source === "user")) {
        return;
      }
      if (parsed.decision === "skip" && source !== "workflow-preferences") return;
    } catch {
      // Invalid runtime marker is replaced with the default decision.
    }
  }
  writeDefaultResearchSkipDecision(basePath);
}
