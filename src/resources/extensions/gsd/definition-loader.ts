/**
 * definition-loader.ts — Parse and validate V1 YAML workflow definitions.
 *
 * Loads definition YAML files from `.gsd/workflow-defs/`, validates the
 * V1 schema shape, and returns typed TypeScript objects. Pure functions
 * with no engine or runtime dependencies — just `yaml` and `node:fs`.
 *
 * YAML uses snake_case (`depends_on`, `context_from`) per project convention (P005).
 * TypeScript uses camelCase (`dependsOn`, `contextFrom`).
 */

import { parse } from "yaml";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Public TypeScript Types (camelCase) ─────────────────────────────────

export type VerifyPolicy =
  | { policy: "content-heuristic"; minSize?: number; pattern?: string }
  | { policy: "shell-command"; command: string }
  | { policy: "prompt-verify"; prompt: string }
  | { policy: "human-review" };

export interface IterateConfig {
  /** Artifact path (relative to run dir) to read and match against. */
  source: string;
  /** Regex pattern string. Must contain at least one capture group. Applied with global flag. */
  pattern: string;
}

export interface StepDefinition {
  /** Unique step identifier within the workflow. */
  id: string;
  /** Human-readable step name. */
  name: string;
  /** The prompt to dispatch for this step. */
  prompt: string;
  /** IDs of steps that must complete before this step can run. */
  requires: string[];
  /** Artifact paths produced by this step (relative to run dir). */
  produces: string[];
  /** Step IDs whose artifacts to include as context (S05 — accepted, not processed). */
  contextFrom?: string[];
  /** Verification policy for this step (S05 — typed + validated). */
  verify?: VerifyPolicy;
  /** Iteration config for this step (S06 — typed + validated). */
  iterate?: IterateConfig;
}

export interface WorkflowDefinition {
  /** Schema version — must be 1. */
  version: number;
  /** Workflow name. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Optional parameter map for template substitution (S07). */
  params?: Record<string, string>;
  /** Ordered list of steps. */
  steps: StepDefinition[];
}

// ─── Internal YAML Types (snake_case) ────────────────────────────────────

interface YamlStepDef {
  id?: unknown;
  name?: unknown;
  prompt?: unknown;
  requires?: unknown;
  depends_on?: unknown;
  produces?: unknown;
  context_from?: unknown;
  verify?: unknown;
  iterate?: unknown;
  [key: string]: unknown; // Forward-compat: unknown fields accepted silently
}

interface YamlWorkflowDef {
  version?: unknown;
  name?: unknown;
  description?: unknown;
  params?: unknown;
  steps?: unknown;
  [key: string]: unknown; // Forward-compat: unknown fields accepted silently
}

// ─── Validation ──────────────────────────────────────────────────────────

/**
 * Validate a parsed (but untyped) YAML object against the V1 workflow schema.
 *
 * Collects all errors (does not short-circuit) so a single call reveals
 * every problem with the definition.
 *
 * Unknown fields are silently accepted for forward compatibility with
 * S05/S06 features (`context_from`, `verify`, `iterate`).
 */
export function validateDefinition(parsed: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (parsed == null || typeof parsed !== "object") {
    return { valid: false, errors: ["Definition must be a non-null object"] };
  }

  const def = parsed as YamlWorkflowDef;

  // version: must be 1 (number)
  if (def.version === undefined || def.version === null) {
    errors.push("Missing required field: version");
  } else if (def.version !== 1) {
    errors.push(`Unsupported version: ${def.version} (expected 1)`);
  }

  // name: must be a non-empty string
  if (typeof def.name !== "string" || def.name.trim() === "") {
    errors.push("Missing or empty required field: name");
  }

  // steps: must be a non-empty array
  if (!Array.isArray(def.steps)) {
    errors.push("Missing required field: steps (must be an array)");
  } else if (def.steps.length === 0) {
    errors.push("steps must contain at least one step");
  } else {
    for (let i = 0; i < def.steps.length; i++) {
      const step = def.steps[i] as YamlStepDef;
      if (step == null || typeof step !== "object") {
        errors.push(`Step at index ${i} is not an object`);
        continue;
      }

      // Required step fields
      if (typeof step.id !== "string" || step.id.trim() === "") {
        errors.push(`Step at index ${i} missing required field: id`);
      }
      if (typeof step.name !== "string" || step.name.trim() === "") {
        errors.push(`Step at index ${i} missing required field: name`);
      }
      if (typeof step.prompt !== "string" || step.prompt.trim() === "") {
        errors.push(`Step at index ${i} missing required field: prompt`);
      }

      // produces: path traversal guard
      if (Array.isArray(step.produces)) {
        for (const p of step.produces) {
          if (typeof p === "string" && p.includes("..")) {
            errors.push(`Step "${step.id}" produces path contains disallowed '..': ${p}`);
          }
        }
      }

      // iterate: optional, but if present must conform to IterateConfig shape
      if (step.iterate !== undefined) {
        const it = step.iterate;
        const sid = typeof step.id === "string" ? step.id : `index ${i}`;
        if (it == null || typeof it !== "object" || Array.isArray(it)) {
          errors.push(`Step "${sid}" iterate must be an object with "source" and "pattern" fields`);
        } else {
          const itObj = it as Record<string, unknown>;
          if (typeof itObj.source !== "string" || (itObj.source as string).trim() === "") {
            errors.push(`Step "${sid}" iterate.source must be a non-empty string`);
          } else if ((itObj.source as string).includes("..")) {
            errors.push(`Step "${sid}" iterate.source contains disallowed '..' path traversal`);
          }
          if (typeof itObj.pattern !== "string" || (itObj.pattern as string).trim() === "") {
            errors.push(`Step "${sid}" iterate.pattern must be a non-empty string`);
          } else {
            const pat = itObj.pattern as string;
            let regexValid = true;
            try {
              new RegExp(pat);
            } catch {
              regexValid = false;
              errors.push(`Step "${sid}" iterate.pattern is not a valid regex: ${pat}`);
            }
            if (regexValid && !/\((?!\?)/.test(pat)) {
              errors.push(`Step "${sid}" iterate.pattern must contain at least one capture group`);
            }
          }
        }
      }

      // verify: optional, but if present must conform to VerifyPolicy shape
      if (step.verify !== undefined) {
        const v = step.verify;
        const sid = typeof step.id === "string" ? step.id : `index ${i}`;
        if (v == null || typeof v !== "object" || Array.isArray(v)) {
          errors.push(`Step "${sid}" verify must be an object with a "policy" field`);
        } else {
          const vObj = v as Record<string, unknown>;
          const VALID_POLICIES = ["content-heuristic", "shell-command", "prompt-verify", "human-review"];
          if (typeof vObj.policy !== "string" || !VALID_POLICIES.includes(vObj.policy)) {
            errors.push(`Step "${sid}" verify.policy must be one of: ${VALID_POLICIES.join(", ")}`);
          } else {
            // Policy-specific required field checks
            if (vObj.policy === "shell-command") {
              if (typeof vObj.command !== "string" || (vObj.command as string).trim() === "") {
                errors.push(`Step "${sid}" verify policy "shell-command" requires a non-empty "command" field`);
              }
            }
            if (vObj.policy === "prompt-verify") {
              if (typeof vObj.prompt !== "string" || (vObj.prompt as string).trim() === "") {
                errors.push(`Step "${sid}" verify policy "prompt-verify" requires a non-empty "prompt" field`);
              }
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Loading ─────────────────────────────────────────────────────────────

/**
 * Load and validate a YAML workflow definition from the filesystem.
 *
 * Reads `<defsDir>/<name>.yaml`, parses YAML, validates the V1 schema,
 * and converts snake_case YAML keys to camelCase TypeScript types.
 *
 * @param defsDir — directory containing definition YAML files
 * @param name — definition filename without extension
 * @returns Parsed and validated WorkflowDefinition
 * @throws Error if file is missing, YAML is malformed, or schema is invalid
 */
export function loadDefinition(defsDir: string, name: string): WorkflowDefinition {
  const filePath = join(defsDir, `${name}.yaml`);

  if (!existsSync(filePath)) {
    throw new Error(`Definition file not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to parse YAML in ${filePath}: ${msg}`);
  }

  const { valid, errors } = validateDefinition(parsed);
  if (!valid) {
    throw new Error(`Invalid workflow definition in ${filePath}:\n  - ${errors.join("\n  - ")}`);
  }

  // Convert snake_case YAML → camelCase TypeScript
  const yamlDef = parsed as YamlWorkflowDef;
  const yamlSteps = yamlDef.steps as YamlStepDef[];

  return {
    version: yamlDef.version as number,
    name: yamlDef.name as string,
    description: typeof yamlDef.description === "string" ? yamlDef.description : undefined,
    params: yamlDef.params != null && typeof yamlDef.params === "object"
      ? yamlDef.params as Record<string, string>
      : undefined,
    steps: yamlSteps.map((s) => ({
      id: s.id as string,
      name: s.name as string,
      prompt: s.prompt as string,
      requires: Array.isArray(s.requires)
        ? (s.requires as string[])
        : Array.isArray(s.depends_on)
          ? (s.depends_on as string[])
          : [],
      produces: Array.isArray(s.produces) ? (s.produces as string[]) : [],
      contextFrom: Array.isArray(s.context_from) ? (s.context_from as string[]) : undefined,
      verify: s.verify as VerifyPolicy | undefined,
      iterate: (s.iterate != null && typeof s.iterate === "object")
        ? s.iterate as IterateConfig
        : undefined,
    })),
  };
}
