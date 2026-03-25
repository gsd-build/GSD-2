import { clearParseCache } from "../files.js";
import { transaction, getSlice, getTask, insertTask, upsertTaskPlanning } from "../gsd-db.js";
import { invalidateStateCache } from "../state.js";
import { renderTaskPlanFromDb } from "../markdown-renderer.js";
import { renderAllProjections } from "../workflow-projections.js";
import { writeManifest } from "../workflow-manifest.js";
import { appendEvent } from "../workflow-events.js";

export interface PlanTaskParams {
  milestoneId: string;
  sliceId: string;
  taskId: string;
  title: string;
  description: string;
  estimate: string;
  files: string[];
  verify: string;
  inputs: string[];
  expectedOutput: string[];
  observabilityImpact?: string;
}

export interface PlanTaskResult {
  milestoneId: string;
  sliceId: string;
  taskId: string;
  taskPlanPath: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (value.some((item) => !isNonEmptyString(item))) {
    throw new Error(`${field} must contain only non-empty strings`);
  }
  return value;
}

function validateParams(params: PlanTaskParams): PlanTaskParams {
  if (!isNonEmptyString(params?.milestoneId)) throw new Error("milestoneId is required");
  if (!isNonEmptyString(params?.sliceId)) throw new Error("sliceId is required");
  if (!isNonEmptyString(params?.taskId)) throw new Error("taskId is required");
  if (!isNonEmptyString(params?.title)) throw new Error("title is required");
  if (!isNonEmptyString(params?.description)) throw new Error("description is required");
  if (!isNonEmptyString(params?.estimate)) throw new Error("estimate is required");
  if (!isNonEmptyString(params?.verify)) throw new Error("verify is required");
  if (params.observabilityImpact !== undefined && !isNonEmptyString(params.observabilityImpact)) {
    throw new Error("observabilityImpact must be a non-empty string when provided");
  }

  return {
    ...params,
    files: validateStringArray(params.files, "files"),
    inputs: validateStringArray(params.inputs, "inputs"),
    expectedOutput: validateStringArray(params.expectedOutput, "expectedOutput"),
  };
}

export async function handlePlanTask(
  rawParams: PlanTaskParams,
  basePath: string,
): Promise<PlanTaskResult | { error: string }> {
  let params: PlanTaskParams;
  try {
    params = validateParams(rawParams);
  } catch (err) {
    return { error: `validation failed: ${(err as Error).message}` };
  }

  const parentSlice = getSlice(params.milestoneId, params.sliceId);
  if (!parentSlice) {
    return { error: `missing parent slice: ${params.milestoneId}/${params.sliceId}` };
  }

  try {
    transaction(() => {
      if (!getTask(params.milestoneId, params.sliceId, params.taskId)) {
        insertTask({
          id: params.taskId,
          sliceId: params.sliceId,
          milestoneId: params.milestoneId,
          title: params.title,
          status: "pending",
        });
      }
      upsertTaskPlanning(params.milestoneId, params.sliceId, params.taskId, {
        title: params.title,
        description: params.description,
        estimate: params.estimate,
        files: params.files,
        verify: params.verify,
        inputs: params.inputs,
        expectedOutput: params.expectedOutput,
        observabilityImpact: params.observabilityImpact ?? "",
      });
    });
  } catch (err) {
    return { error: `db write failed: ${(err as Error).message}` };
  }

  try {
    const renderResult = await renderTaskPlanFromDb(basePath, params.milestoneId, params.sliceId, params.taskId);
    invalidateStateCache();
    clearParseCache();

    // ── Post-mutation hook: projections, manifest, event log ─────────────
    try {
      await renderAllProjections(basePath, params.milestoneId);
      writeManifest(basePath);
      appendEvent(basePath, {
        cmd: "plan-task",
        params: { milestoneId: params.milestoneId, sliceId: params.sliceId, taskId: params.taskId },
        ts: new Date().toISOString(),
        actor: "agent",
      });
    } catch (hookErr) {
      process.stderr.write(
        `gsd: plan-task post-mutation hook warning: ${(hookErr as Error).message}\n`,
      );
    }

    return {
      milestoneId: params.milestoneId,
      sliceId: params.sliceId,
      taskId: params.taskId,
      taskPlanPath: renderResult.taskPlanPath,
    };
  } catch (err) {
    return { error: `render failed: ${(err as Error).message}` };
  }
}
