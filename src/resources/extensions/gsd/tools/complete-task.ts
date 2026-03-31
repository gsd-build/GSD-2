/**
 * complete-task handler — the core operation behind gsd_complete_task.
 *
 * Validates inputs, writes task row to DB in a transaction, then (outside
 * the transaction) renders SUMMARY.md to disk, toggles the plan checkbox,
 * stores the rendered markdown in the DB for D004 recovery, and invalidates
 * caches.
 */

import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

import type { CompleteTaskParams } from "../types.js";
import { isClosedStatus } from "../status-guards.js";
import {
  transaction,
  insertMilestone,
  insertSlice,
  insertTask,
  insertVerificationEvidence,
  getMilestone,
  getSlice,
  getTask,
  updateTaskStatus,
  setTaskSummaryMd,
  deleteVerificationEvidence,
} from "../gsd-db.js";
import { resolveSliceFile, resolveTasksDir, clearPathCache } from "../paths.js";
import { checkOwnership, taskUnitKey } from "../unit-ownership.js";
import { saveFile, clearParseCache } from "../files.js";
import { invalidateStateCache } from "../state.js";
import { renderPlanCheckboxes } from "../markdown-renderer.js";
import { renderAllProjections, renderSummaryContent } from "../workflow-projections.js";
import { writeManifest } from "../workflow-manifest.js";
import { appendEvent } from "../workflow-events.js";

export interface CompleteTaskResult {
  taskId: string;
  sliceId: string;
  milestoneId: string;
  summaryPath: string;
}

import type { TaskRow } from "../gsd-db.js";

type CompleteTaskParamsNormalized = Omit<CompleteTaskParams, "keyFiles" | "keyDecisions"> & {
  keyFiles: string[];
  keyDecisions: string[];
};

function normalizeListInput(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(item => item.trim()).filter(item => item.length > 0);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || /^none\.?$/i.test(trimmed)) {
    return [];
  }

  const items = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(line => line.length > 0 && !/^none\.?$/i.test(line));

  return items.length > 0 ? items : [trimmed];
}

function normalizeCompleteTaskParams(params: CompleteTaskParams): CompleteTaskParamsNormalized {
  return {
    ...params,
    keyFiles: normalizeListInput(params.keyFiles),
    keyDecisions: normalizeListInput(params.keyDecisions),
  };
}

/**
 * Build a TaskRow-shaped object from CompleteTaskParams so the unified
 * renderSummaryContent() can be used at completion time (#2720).
 */
function paramsToTaskRow(params: CompleteTaskParamsNormalized, completedAt: string): TaskRow {
  return {
    milestone_id: params.milestoneId,
    slice_id: params.sliceId,
    id: params.taskId,
    title: params.oneLiner || params.taskId,
    status: "complete",
    one_liner: params.oneLiner,
    narrative: params.narrative,
    verification_result: params.verification,
    duration: "",
    completed_at: completedAt,
    blocker_discovered: params.blockerDiscovered,
    deviations: params.deviations,
    known_issues: params.knownIssues,
    key_files: params.keyFiles,
    key_decisions: params.keyDecisions,
    full_summary_md: "",
    description: "",
    estimate: "",
    files: [],
    verify: "",
    inputs: [],
    expected_output: [],
    observability_impact: "",
    full_plan_md: "",
    sequence: 0,
  };
}

/**
 * Handle the complete_task operation end-to-end.
 *
 * 1. Validate required fields
 * 2. Write DB in a transaction (milestone, slice, task, verification evidence)
 * 3. Render SUMMARY.md to disk
 * 4. Toggle plan checkbox
 * 5. Store rendered markdown back in DB (for D004 recovery)
 * 6. Invalidate caches
 */
export async function handleCompleteTask(
  params: CompleteTaskParams,
  basePath: string,
): Promise<CompleteTaskResult | { error: string }> {
  const normalizedParams = normalizeCompleteTaskParams(params);

  // ── Validate required fields ────────────────────────────────────────────
  if (!normalizedParams.taskId || typeof normalizedParams.taskId !== "string" || normalizedParams.taskId.trim() === "") {
    return { error: "taskId is required and must be a non-empty string" };
  }
  if (!normalizedParams.sliceId || typeof normalizedParams.sliceId !== "string" || normalizedParams.sliceId.trim() === "") {
    return { error: "sliceId is required and must be a non-empty string" };
  }
  if (!normalizedParams.milestoneId || typeof normalizedParams.milestoneId !== "string" || normalizedParams.milestoneId.trim() === "") {
    return { error: "milestoneId is required and must be a non-empty string" };
  }

  // ── Ownership check (opt-in: only enforced when claim file exists) ──────
  const ownershipErr = checkOwnership(
    basePath,
    taskUnitKey(normalizedParams.milestoneId, normalizedParams.sliceId, normalizedParams.taskId),
    normalizedParams.actorName,
  );
  if (ownershipErr) {
    return { error: ownershipErr };
  }

  // ── Guards + DB writes inside a single transaction (prevents TOCTOU) ───
  const completedAt = new Date().toISOString();
  let guardError: string | null = null;

  transaction(() => {
    // State machine preconditions (inside txn for atomicity).
    // Milestone/slice not existing is OK — insertMilestone/insertSlice below will auto-create.
    // Only block if they exist and are closed.
    const milestone = getMilestone(normalizedParams.milestoneId);
    if (milestone && isClosedStatus(milestone.status)) {
      guardError = `cannot complete task in a closed milestone: ${normalizedParams.milestoneId} (status: ${milestone.status})`;
      return;
    }

    const slice = getSlice(normalizedParams.milestoneId, normalizedParams.sliceId);
    if (slice && isClosedStatus(slice.status)) {
      guardError = `cannot complete task in a closed slice: ${normalizedParams.sliceId} (status: ${slice.status})`;
      return;
    }

    const existingTask = getTask(normalizedParams.milestoneId, normalizedParams.sliceId, normalizedParams.taskId);
    if (existingTask && isClosedStatus(existingTask.status)) {
      guardError = `task ${normalizedParams.taskId} is already complete — use gsd_task_reopen first if you need to redo it`;
      return;
    }

    // All guards passed — perform writes
    insertMilestone({ id: normalizedParams.milestoneId });
    insertSlice({ id: normalizedParams.sliceId, milestoneId: normalizedParams.milestoneId });
    insertTask({
      id: normalizedParams.taskId,
      sliceId: normalizedParams.sliceId,
      milestoneId: normalizedParams.milestoneId,
      title: normalizedParams.oneLiner,
      status: "complete",
      oneLiner: normalizedParams.oneLiner,
      narrative: normalizedParams.narrative,
      verificationResult: normalizedParams.verification,
      duration: "",
      blockerDiscovered: normalizedParams.blockerDiscovered,
      deviations: normalizedParams.deviations,
      knownIssues: normalizedParams.knownIssues,
      keyFiles: normalizedParams.keyFiles,
      keyDecisions: normalizedParams.keyDecisions,
    });

    for (const evidence of normalizedParams.verificationEvidence) {
      insertVerificationEvidence({
        taskId: normalizedParams.taskId,
        sliceId: normalizedParams.sliceId,
        milestoneId: normalizedParams.milestoneId,
        command: evidence.command,
        exitCode: evidence.exitCode,
        verdict: evidence.verdict,
        durationMs: evidence.durationMs,
      });
    }
  });

  if (guardError) {
    return { error: guardError };
  }

  // ── Filesystem operations (outside transaction) ─────────────────────────
  // If disk render fails, roll back the DB status so deriveState() and
  // verifyExpectedArtifact() stay consistent (both say "not done").

  // Render summary markdown via the single source of truth (#2720)
  const taskRow = paramsToTaskRow(normalizedParams, completedAt);
  const summaryMd = renderSummaryContent(taskRow, normalizedParams.sliceId, normalizedParams.milestoneId, normalizedParams.verificationEvidence);

  // Resolve and write summary to disk
  let summaryPath: string;
  const tasksDir = resolveTasksDir(basePath, normalizedParams.milestoneId, normalizedParams.sliceId);
  if (tasksDir) {
    summaryPath = join(tasksDir, `${normalizedParams.taskId}-SUMMARY.md`);
  } else {
    // Tasks dir doesn't exist on disk yet — build path manually and ensure dirs
    const gsdDir = join(basePath, ".gsd");
    const manualTasksDir = join(gsdDir, "milestones", normalizedParams.milestoneId, "slices", normalizedParams.sliceId, "tasks");
    mkdirSync(manualTasksDir, { recursive: true });
    summaryPath = join(manualTasksDir, `${normalizedParams.taskId}-SUMMARY.md`);
  }

  try {
    await saveFile(summaryPath, summaryMd);

    // Toggle plan checkbox via renderer module
    const planPath = resolveSliceFile(basePath, normalizedParams.milestoneId, normalizedParams.sliceId, "PLAN");
    if (planPath) {
      await renderPlanCheckboxes(basePath, normalizedParams.milestoneId, normalizedParams.sliceId);
    } else {
      process.stderr.write(
        `gsd-db: complete_task — could not find plan file for ${normalizedParams.sliceId}/${normalizedParams.milestoneId}, skipping checkbox toggle\n`,
      );
    }
  } catch (renderErr) {
    // Disk render failed — roll back DB status so state stays consistent
    process.stderr.write(
      `gsd-db: complete_task — disk render failed, rolling back DB status: ${(renderErr as Error).message}\n`,
    );
    // Delete orphaned verification_evidence rows first (FK constraint
    // references tasks, so evidence must go before status change).
    // Without this, retries accumulate duplicate evidence rows (#2724).
    deleteVerificationEvidence(normalizedParams.milestoneId, normalizedParams.sliceId, normalizedParams.taskId);
    updateTaskStatus(normalizedParams.milestoneId, normalizedParams.sliceId, normalizedParams.taskId, 'pending');
    invalidateStateCache();
    return { error: `disk render failed: ${(renderErr as Error).message}` };
  }

  // Store rendered markdown in DB for D004 recovery
  setTaskSummaryMd(normalizedParams.milestoneId, normalizedParams.sliceId, normalizedParams.taskId, summaryMd);

  // Invalidate all caches
  invalidateStateCache();
  clearPathCache();
  clearParseCache();

  // ── Post-mutation hook: projections, manifest, event log ───────────────
  try {
    await renderAllProjections(basePath, normalizedParams.milestoneId);
    writeManifest(basePath);
    appendEvent(basePath, {
      cmd: "complete-task",
      params: { milestoneId: normalizedParams.milestoneId, sliceId: normalizedParams.sliceId, taskId: normalizedParams.taskId },
      ts: new Date().toISOString(),
      actor: "agent",
      actor_name: normalizedParams.actorName,
      trigger_reason: normalizedParams.triggerReason,
    });
  } catch (hookErr) {
    process.stderr.write(
      `gsd: complete-task post-mutation hook warning: ${(hookErr as Error).message}\n`,
    );
  }

  return {
    taskId: normalizedParams.taskId,
    sliceId: normalizedParams.sliceId,
    milestoneId: normalizedParams.milestoneId,
    summaryPath,
  };
}
