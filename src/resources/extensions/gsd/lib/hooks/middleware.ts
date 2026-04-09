// GSD Extension — Pre-Dispatch Hook Middleware Composition

import type { PreDispatchHookConfig, PreDispatchResult } from "../../types.js";
import { existsSync } from "node:fs";

/** Context for variable substitution in hook prompts. */
export interface SubstitutionContext {
  milestoneId: string;
  sliceId: string;
  taskId: string;
}

/**
 * Apply variable substitution to a template string.
 * Replaces {milestoneId}, {sliceId}, {taskId} with context values.
 */
function substitute(text: string, ctx: SubstitutionContext): string {
  return text
    .replace(/\{milestoneId\}/g, ctx.milestoneId)
    .replace(/\{sliceId\}/g, ctx.sliceId)
    .replace(/\{taskId\}/g, ctx.taskId);
}

/**
 * Compose pre-dispatch hooks into a single PreDispatchResult.
 *
 * Preserves the exact semantics of the original RuleRegistry.evaluatePreDispatch:
 * - "skip" hooks short-circuit immediately (with optional skip_if condition)
 * - "replace" hooks short-circuit with a replacement prompt
 * - "modify" hooks compose — prepend/append accumulate on the prompt
 *
 * @param hooks - Filtered, enabled hooks that match the target unit type
 * @param prompt - The original prompt to compose over
 * @param subCtx - Variable substitution context
 * @param resolveArtifactPath - Function to resolve artifact paths for skip_if conditions
 */
export function composePreDispatchMiddleware(
  hooks: PreDispatchHookConfig[],
  prompt: string,
  subCtx: SubstitutionContext,
  resolveArtifactPath: (artifactName: string) => string,
): PreDispatchResult {
  const firedHooks: string[] = [];
  let currentPrompt = prompt;

  for (const hook of hooks) {
    if (hook.action === "skip") {
      if (hook.skip_if) {
        const conditionPath = resolveArtifactPath(hook.skip_if);
        if (!existsSync(conditionPath)) continue;
      }
      firedHooks.push(hook.name);
      return { action: "skip", firedHooks };
    }

    if (hook.action === "replace") {
      firedHooks.push(hook.name);
      return {
        action: "replace",
        prompt: substitute(hook.prompt ?? "", subCtx),
        unitType: hook.unit_type,
        model: hook.model,
        firedHooks,
      };
    }

    if (hook.action === "modify") {
      firedHooks.push(hook.name);
      if (hook.prepend) {
        currentPrompt = `${substitute(hook.prepend, subCtx)}\n\n${currentPrompt}`;
      }
      if (hook.append) {
        currentPrompt = `${currentPrompt}\n\n${substitute(hook.append, subCtx)}`;
      }
    }
  }

  return {
    action: "proceed",
    prompt: currentPrompt,
    model: hooks.find(h => h.action === "modify" && h.model)?.model,
    firedHooks,
  };
}
