// GSD Extension — Hook Priority Sort Utility

import type { PrioritizedRule } from "./hook-types.js";

/**
 * Stable sort of rules by priority (ascending — lower numbers evaluate first).
 * Rules without an explicit priority are treated as priority 0.
 * Insertion order is preserved for rules with equal priority.
 */
export function sortByPriority<T extends Pick<PrioritizedRule, "priority">>(rules: T[]): T[] {
  return [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
}
