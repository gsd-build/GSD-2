// GSD Extension — Hook Discovery and Status Reporting

import type { RuleRegistry } from "../../rule-registry.js";
import type { ProgrammaticHookStore } from "./programmatic-store.js";
import type { HookDescriptor } from "./hook-types.js";
import { resolvePostUnitHooks, resolvePreDispatchHooks } from "../../preferences.js";

/**
 * Discover all hooks from both YAML config and programmatic registrations.
 * Returns a unified list of HookDescriptor sorted by phase then priority.
 *
 * @param store - The programmatic hook store (may be null if not initialized)
 */
export function discoverHooks(store: ProgrammaticHookStore | null): HookDescriptor[] {
  const descriptors: HookDescriptor[] = [];

  // YAML-configured post-unit hooks (priority 0, source "yaml")
  const yamlPostHooks = resolvePostUnitHooks();
  for (const hook of yamlPostHooks) {
    descriptors.push({
      name: hook.name,
      phase: "post-unit",
      source: "yaml",
      priority: 0,
      enabled: hook.enabled !== false,
      targets: hook.after,
      description: `YAML: fires after ${hook.after.join(", ")}`,
    });
  }

  // YAML-configured pre-dispatch hooks (priority 0, source "yaml")
  const yamlPreHooks = resolvePreDispatchHooks();
  for (const hook of yamlPreHooks) {
    descriptors.push({
      name: hook.name,
      phase: "pre-dispatch",
      source: "yaml",
      priority: 0,
      enabled: hook.enabled !== false,
      targets: hook.before,
      description: `YAML: ${hook.action} before ${hook.before.join(", ")}`,
    });
  }

  // Programmatic hooks (with their own priority and source)
  if (store) {
    descriptors.push(...store.listDescriptors());
  }

  // Sort by phase grouping, then by priority within each phase
  const phaseOrder: Record<string, number> = {
    "post-unit": 0,
    "pre-dispatch": 1,
    "dispatch": 2,
  };

  return descriptors.sort((a, b) => {
    const phaseDiff = (phaseOrder[a.phase] ?? 99) - (phaseOrder[b.phase] ?? 99);
    if (phaseDiff !== 0) return phaseDiff;
    return (a.priority ?? 0) - (b.priority ?? 0);
  });
}

/**
 * Format discovered hooks for terminal display.
 */
export function formatDiscoveredHooks(store: ProgrammaticHookStore | null): string {
  const hooks = discoverHooks(store);
  if (hooks.length === 0) {
    return "No hooks configured. Add post_unit_hooks or pre_dispatch_hooks to .gsd/PREFERENCES.md, or register programmatically.";
  }

  const lines: string[] = ["Discovered Hooks:", ""];

  const postHooks = hooks.filter(h => h.phase === "post-unit");
  const preHooks = hooks.filter(h => h.phase === "pre-dispatch");

  if (postHooks.length > 0) {
    lines.push("Post-Unit Hooks (run after unit completes):");
    for (const hook of postHooks) {
      const status = hook.enabled ? "enabled" : "disabled";
      const sourceTag = hook.source === "yaml" ? "yaml" : hook.packageId ? `community:${hook.packageId}` : "programmatic";
      const priorityTag = hook.priority !== 0 ? ` p=${hook.priority}` : "";
      lines.push(`  ${hook.name} [${status}] [${sourceTag}${priorityTag}] → after: ${hook.targets.join(", ")}`);
    }
    lines.push("");
  }

  if (preHooks.length > 0) {
    lines.push("Pre-Dispatch Hooks (run before unit dispatches):");
    for (const hook of preHooks) {
      const status = hook.enabled ? "enabled" : "disabled";
      const sourceTag = hook.source === "yaml" ? "yaml" : hook.packageId ? `community:${hook.packageId}` : "programmatic";
      const priorityTag = hook.priority !== 0 ? ` p=${hook.priority}` : "";
      lines.push(`  ${hook.name} [${status}] [${sourceTag}${priorityTag}] → before: ${hook.targets.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
