/**
 * Custom Workflow Dispatch — resolves the next unit to dispatch for a
 * custom workflow definition.
 *
 * The custom workflow equivalent of `auto-dispatch.ts`. Uses file existence
 * as the completion signal (same pattern as `deriveState()`), but operates
 * on a flat step list instead of the milestone/slice/task hierarchy.
 */

import type { DispatchAction } from "./auto-dispatch.js";
import type { WorkflowDefinition, WorkflowStep, IterationConfig, VerificationMode } from "./workflow-definition.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Iteration Items ──────────────────────────────────────────────────────

export interface IterationItem {
  id: string;
  index: number;
  title: string;
}

/**
 * Resolve iteration items from a source artifact using the configured pattern.
 */
export function resolveIterationItems(artDir: string, config: IterationConfig): IterationItem[] {
  if (config.count !== undefined && config.count > 0) {
    return Array.from({ length: config.count }, (_, i) => ({
      id: formatIterationId(config.idFormat, i + 1),
      index: i + 1,
      title: `Item ${i + 1}`,
    }));
  }

  const sourcePath = join(artDir, config.source);
  if (!existsSync(sourcePath)) return [];

  const content = readFileSync(sourcePath, "utf-8");
  const regex = new RegExp(config.pattern, "gm");
  const items: IterationItem[] = [];
  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = regex.exec(content)) !== null) {
    const line = content.slice(match.index).split("\n")[0];
    // Strip the matched pattern prefix to get the title
    const title = line.replace(match[0], "").trim() || `Item ${index}`;
    items.push({
      id: formatIterationId(config.idFormat, index),
      index,
      title,
    });
    index++;
  }

  return items;
}

function formatIterationId(format: string, index: number): string {
  // Simple format: replace {:02d} or {:03d} with zero-padded number
  return format.replace(/\{:0?(\d+)d\}/, (_match, width) => {
    const w = parseInt(width, 10);
    return String(index).padStart(w, "0");
  });
}

// ─── Template Rendering ───────────────────────────────────────────────────

/**
 * Render a workflow prompt template with variable substitution.
 */
export function renderWorkflowPrompt(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// ─── Artifact Existence ───────────────────────────────────────────────────

function artifactExists(artDir: string, produces: string): boolean {
  const path = join(artDir, produces);

  // Directory-based produces (ends with /)
  if (produces.endsWith("/")) {
    return existsSync(path) && isNonEmptyDir(path);
  }

  return existsSync(path);
}

function isNonEmptyDir(path: string): boolean {
  try {
    const entries = readdirSync(path);
    return entries.length > 0;
  } catch {
    return false;
  }
}

// ─── Dispatch Resolution ──────────────────────────────────────────────────

/**
 * Resolve the next dispatch action for a custom workflow.
 * Walks steps in dependency order, finds the first incomplete step
 * whose dependencies are satisfied.
 */
export async function resolveWorkflowDispatch(
  workflow: WorkflowDefinition,
  basePath: string,
): Promise<DispatchAction> {
  const artDir = join(basePath, workflow.artifactDir);

  for (const step of workflow.steps) {
    // Check requires: all required steps' artifacts must exist
    const depsReady = step.requires.every(depId => {
      const dep = workflow.steps.find(s => s.id === depId);
      return dep && artifactExists(artDir, dep.produces);
    });
    if (!depsReady) continue;

    if (step.iterate) {
      // Find first incomplete iteration
      const items = resolveIterationItems(artDir, step.iterate);
      for (const item of items) {
        const itemProduces = step.produces.includes("{{iter_id}}")
          ? step.produces.replaceAll("{{iter_id}}", item.id)
          : step.produces;

        // For directory-based produces, check individual iteration artifact
        if (step.produces.endsWith("/")) {
          const itemPath = join(artDir, step.produces, `${item.id}.md`);
          if (existsSync(itemPath)) continue;
        } else if (artifactExists(artDir, itemProduces)) {
          continue;
        }

        return {
          action: "dispatch",
          unitType: `wf/${workflow.name}/${step.id}`,
          unitId: item.id,
          prompt: renderWorkflowPrompt(step.promptTemplate, {
            artifact_dir: artDir,
            iter_id: item.id,
            iter_index: String(item.index),
            iter_title: item.title,
            step_name: step.name,
          }),
        };
      }

      // All iterations complete — check if directory-based produces is satisfied
      if (step.produces.endsWith("/")) {
        const dirPath = join(artDir, step.produces);
        if (!existsSync(dirPath) || !isNonEmptyDir(dirPath)) {
          // Edge case: source exists but yielded 0 items. Skip step.
          continue;
        }
      }
    } else {
      if (!artifactExists(artDir, step.produces)) {
        return {
          action: "dispatch",
          unitType: `wf/${workflow.name}/${step.id}`,
          unitId: step.id,
          prompt: renderWorkflowPrompt(step.promptTemplate, {
            artifact_dir: artDir,
            step_name: step.name,
          }),
        };
      }
    }
  }

  return {
    action: "stop",
    reason: `Workflow "${workflow.name}" complete.`,
    level: "info",
  };
}

// ─── Verification Resolution ──────────────────────────────────────────────

/**
 * Resolve the verification mode for a given workflow unit type.
 * Falls back to the workflow-level default if the step has no override.
 */
export function resolveWorkflowVerification(
  workflow: WorkflowDefinition,
  unitType: string,
): VerificationMode {
  // Parse step ID from unitType: "wf/<name>/<stepId>"
  const parts = unitType.split("/");
  if (parts.length < 3) return workflow.verification;

  const stepId = parts[2];
  const step = workflow.steps.find(s => s.id === stepId);
  if (!step) return workflow.verification;

  return step.verification !== "none" ? step.verification : workflow.verification;
}

// ─── Model Category Resolution ────────────────────────────────────────────

/**
 * Resolve the model category for a workflow unit type.
 * Maps to the same categories used in preferences (research, planning, etc.).
 */
export function resolveWorkflowModelCategory(
  workflow: WorkflowDefinition,
  unitType: string,
): string | undefined {
  const parts = unitType.split("/");
  if (parts.length < 3) return undefined;

  const stepId = parts[2];
  const step = workflow.steps.find(s => s.id === stepId);
  return step?.modelCategory;
}

/**
 * Map a workflow model category to the corresponding auto-mode unit type
 * for model resolution purposes.
 */
export function workflowCategoryToUnitType(category: string): string {
  switch (category) {
    case "research": return "research-milestone";
    case "planning": return "plan-milestone";
    case "execution": return "execute-task";
    case "completion": return "complete-slice";
    default: return "execute-task";
  }
}
