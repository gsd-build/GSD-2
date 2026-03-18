/**
 * Custom Workflow Definition — types, parsing, and validation.
 *
 * A workflow is a `.md` file with YAML frontmatter describing a sequence of
 * steps the auto-mode engine should execute. Each step produces an artifact
 * (file or directory) that serves as its completion signal.
 */

import { parse as parseYaml } from "yaml";

// ─── Types ────────────────────────────────────────────────────────────────

export interface WorkflowDefinition {
  name: string;
  description: string;
  version: number;
  author?: string;
  artifactDir: string;
  steps: WorkflowStep[];
  isolation: "none" | "worktree";
  verification: VerificationMode;
}

export interface WorkflowStep {
  id: string;
  name: string;
  modelCategory: "research" | "planning" | "execution" | "completion";
  produces: string;
  requires: string[];
  verification: VerificationMode;
  promptTemplate: string;
  iterate?: IterationConfig;
}

export interface IterationConfig {
  source: string;
  pattern: string;
  idFormat: string;
  count?: number;
}

export type VerificationMode = "none" | "inherit" | { commands: VerificationCommand[] };

export interface VerificationCommand {
  command: string;
  blocking?: boolean;
}

// ─── Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a workflow definition from a `.md` file's contents.
 * Uses the same frontmatter parsing pattern as `parsePreferencesMarkdown`.
 */
export function parseWorkflowDefinition(content: string): WorkflowDefinition | null {
  const startMarker = content.startsWith("---\r\n") ? "---\r\n" : "---\n";
  if (!content.startsWith(startMarker)) return null;
  const searchStart = startMarker.length;
  const endIdx = content.indexOf("\n---", searchStart);
  if (endIdx === -1) return null;
  const block = content.slice(searchStart, endIdx).replace(/\r/g, "");

  let raw: Record<string, unknown>;
  try {
    const parsed = parseYaml(block);
    if (typeof parsed !== "object" || parsed === null) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  // Required fields
  if (typeof raw.name !== "string" || !raw.name) return null;
  if (typeof raw.description !== "string" || !raw.description) return null;
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) return null;
  if (typeof raw.artifact_dir !== "string" || !raw.artifact_dir) return null;

  const steps = parseSteps(raw.steps);
  if (!steps) return null;

  const validation = validateSteps(steps);
  if (!validation.valid) return null;

  return {
    name: raw.name,
    description: raw.description,
    version: typeof raw.version === "number" ? raw.version : 1,
    author: typeof raw.author === "string" ? raw.author : undefined,
    artifactDir: raw.artifact_dir,
    steps,
    isolation: raw.isolation === "worktree" ? "worktree" : "none",
    verification: parseVerificationMode(raw.verification) ?? "none",
  };
}

// ─── Step Parsing ─────────────────────────────────────────────────────────

const VALID_MODEL_CATEGORIES = new Set(["research", "planning", "execution", "completion"]);

function parseSteps(rawSteps: unknown[]): WorkflowStep[] | null {
  const steps: WorkflowStep[] = [];

  for (const rawStep of rawSteps) {
    if (typeof rawStep !== "object" || rawStep === null) return null;
    const s = rawStep as Record<string, unknown>;

    if (typeof s.id !== "string" || !s.id) return null;
    if (typeof s.name !== "string" || !s.name) return null;
    if (typeof s.produces !== "string" || !s.produces) return null;
    if (typeof s.prompt !== "string" || !s.prompt) return null;

    const modelCategory = typeof s.model_category === "string" && VALID_MODEL_CATEGORIES.has(s.model_category)
      ? s.model_category as WorkflowStep["modelCategory"]
      : "execution";

    const requires = Array.isArray(s.requires)
      ? s.requires.filter((r): r is string => typeof r === "string")
      : [];

    const iterate = parseIterationConfig(s.iterate);

    steps.push({
      id: s.id,
      name: s.name,
      modelCategory,
      produces: s.produces,
      requires,
      verification: parseVerificationMode(s.verification) ?? "none",
      promptTemplate: s.prompt,
      iterate: iterate ?? undefined,
    });
  }

  return steps;
}

function parseIterationConfig(raw: unknown): IterationConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;

  if (typeof c.source !== "string" || !c.source) return null;
  if (typeof c.pattern !== "string" || !c.pattern) return null;

  return {
    source: c.source,
    pattern: c.pattern,
    idFormat: typeof c.id_format === "string" ? c.id_format : "ITEM{:02d}",
    count: typeof c.count === "number" ? c.count : undefined,
  };
}

function parseVerificationMode(raw: unknown): VerificationMode | null {
  if (raw === "none" || raw === undefined || raw === null) return "none";
  if (raw === "inherit") return "inherit";
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.commands)) {
      const commands: VerificationCommand[] = obj.commands
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map(c => ({
          command: String(c.command ?? ""),
          blocking: c.blocking !== false,
        }))
        .filter(c => c.command.length > 0);
      if (commands.length > 0) return { commands };
    }
  }
  return null;
}

// ─── Validation ───────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateSteps(steps: WorkflowStep[]): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const step of steps) {
    // Unique IDs
    if (ids.has(step.id)) {
      errors.push(`Duplicate step ID: ${step.id}`);
    }
    ids.add(step.id);
  }

  // Validate requires references
  for (const step of steps) {
    for (const req of step.requires) {
      if (!ids.has(req)) {
        errors.push(`Step "${step.id}" requires unknown step "${req}"`);
      }
      if (req === step.id) {
        errors.push(`Step "${step.id}" cannot require itself`);
      }
    }
  }

  // Check for cycles (simple DFS)
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stepMap = new Map(steps.map(s => [s.id, s]));

  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const step = stepMap.get(id);
    if (step) {
      for (const req of step.requires) {
        if (hasCycle(req)) return true;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const step of steps) {
    if (hasCycle(step.id)) {
      errors.push(`Dependency cycle detected involving step "${step.id}"`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a workflow definition and return detailed errors.
 * Useful for user-facing error messages.
 */
export function validateWorkflowDefinition(content: string): { valid: boolean; errors: string[] } {
  const startMarker = content.startsWith("---\r\n") ? "---\r\n" : "---\n";
  if (!content.startsWith(startMarker)) return { valid: false, errors: ["Missing YAML frontmatter"] };
  const searchStart = startMarker.length;
  const endIdx = content.indexOf("\n---", searchStart);
  if (endIdx === -1) return { valid: false, errors: ["Unclosed YAML frontmatter"] };
  const block = content.slice(searchStart, endIdx).replace(/\r/g, "");

  let raw: Record<string, unknown>;
  try {
    const parsed = parseYaml(block);
    if (typeof parsed !== "object" || parsed === null) return { valid: false, errors: ["Frontmatter is not an object"] };
    raw = parsed as Record<string, unknown>;
  } catch (e) {
    return { valid: false, errors: [`YAML parse error: ${e instanceof Error ? e.message : String(e)}`] };
  }

  const errors: string[] = [];
  if (typeof raw.name !== "string" || !raw.name) errors.push("Missing required field: name");
  if (typeof raw.description !== "string" || !raw.description) errors.push("Missing required field: description");
  if (typeof raw.artifact_dir !== "string" || !raw.artifact_dir) errors.push("Missing required field: artifact_dir");
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) errors.push("Missing or empty steps array");

  if (errors.length > 0) return { valid: false, errors };

  const steps = parseSteps(raw.steps as unknown[]);
  if (!steps) return { valid: false, errors: ["Invalid step definitions"] };

  const validation = validateSteps(steps);
  return validation;
}
