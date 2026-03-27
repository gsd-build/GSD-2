/**
 * Status predicates for GSD state-machine guards.
 *
 * The DB stores status as free-form strings. Two values indicate
 * "closed": "complete" (canonical) and "done" (legacy / alias).
 * Every inline `status === "complete" || status === "done"` should
 * use isClosedStatus() instead.
 */

/** Returns true when a milestone, slice, or task status indicates closure. */
export function isClosedStatus(status: string): boolean {
  return status === "complete" || status === "done";
}
