/**
 * Milestone validation quality gate persistence.
 *
 * #2945 Bug 4: validate-milestone was writing VALIDATION.md to disk and
 * inserting an assessment row, but never persisted structured quality_gates
 * records in the DB. This module inserts milestone-level validation gates
 * that correspond to the validation checks performed.
 *
 * Gate IDs for milestone validation (MV01–MV04) are sourced from the
 * gate registry so the definitions stay in lockstep with prompt builders,
 * dispatch rules, and state derivation. See gate-registry.ts.
 */

import { _getAdapter } from "./gsd-db.js";
import { getGatesForTurn } from "./gate-registry.js";

/**
 * Insert milestone-level quality_gates records for a validation run.
 *
 * Each gate is inserted with status "complete" and a verdict derived
 * from the overall milestone validation verdict. Individual gate-level
 * verdicts are not available (the handler receives a single verdict),
 * so all gates share the overall verdict.
 *
 * Gate IDs come from the registry — adding/removing an MV-scoped gate
 * in gate-registry.ts automatically flows through here.
 */
export function insertMilestoneValidationGates(
  milestoneId: string,
  sliceId: string,
  verdict: string,
  evaluatedAt: string,
): void {
  const db = _getAdapter();
  if (!db) return;

  const gateVerdict = verdict === "pass" ? "pass" : "flag";
  const milestoneGates = getGatesForTurn("validate-milestone");

  for (const def of milestoneGates) {
    db.prepare(
      `INSERT OR REPLACE INTO quality_gates
       (milestone_id, slice_id, gate_id, scope, task_id, status, verdict, rationale, findings, evaluated_at)
       VALUES (:mid, :sid, :gid, 'milestone', '', 'complete', :verdict, :rationale, '', :evaluated_at)`,
    ).run({
      ":mid": milestoneId,
      ":sid": sliceId,
      ":gid": def.id,
      ":verdict": gateVerdict,
      ":rationale": `${def.promptSection} — milestone validation verdict: ${verdict}`,
      ":evaluated_at": evaluatedAt,
    });
  }
}
