import { clearParseCache } from "../files.js";
import {
  transaction,
  getSlice,
  insertTask,
  upsertSlicePlanning,
  upsertTaskPlanning,
  _getAdapter,
} from "../gsd-db.js";
import { invalidateStateCache } from "../state.js";
import { renderPlanFromDb } from "../markdown-renderer.js";

export interface PlanSliceTaskInput {
  taskId: string;
  title: string;
  description: string;
  estimate: string;
  files: string[];
  verify: string;
  inputs: string[];
  expectedOutput: string[];
  observabilityImpact?: string;
  fullPlanMd?: string;
}

export interface PlanSliceParams {
  milestoneId: string;
  sliceId: string;
  goal: string;
  successCriteria: string;
  proofLevel: string;
  integrationClosure: string;
  observabilityImpact: string;
  tasks: PlanSliceTaskInput[];
}

export interface PlanSliceResult {
  milestoneId: string;
  sliceId: string;
  planPath: string;
  taskPlanPaths: string[];
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

function validateTasks(value: unknown): PlanSliceTaskInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("tasks must be a non-empty array");
  }

  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`tasks[${index}] must be an object`);
    }
    const obj = entry as Record<string, unknown>;
    const taskId = obj.taskId;
    const title = obj.title;
    const description = obj.description;
    const estimate = obj.estimate;
    const files = obj.files;
    const verify = obj.verify;
    const inputs = obj.inputs;
    const expectedOutput = obj.expectedOutput;
    const observabilityImpact = obj.observabilityImpact;

    if (!isNonEmptyString(taskId)) throw new Error(`tasks[${index}].taskId must be a non-empty string`);
    if (seen.has(taskId)) throw new Error(`tasks[${index}].taskId must be unique`);
    seen.add(taskId);
    if (!isNonEmptyString(title)) throw new Error(`tasks[${index}].title must be a non-empty string`);
    if (!isNonEmptyString(description)) throw new Error(`tasks[${index}].description must be a non-empty string`);
    if (!isNonEmptyString(estimate)) throw new Error(`tasks[${index}].estimate must be a non-empty string`);
    if (!Array.isArray(files) || files.some((item) => !isNonEmptyString(item))) {
      throw new Error(`tasks[${index}].files must be an array of non-empty strings`);
    }
    if (!isNonEmptyString(verify)) throw new Error(`tasks[${index}].verify must be a non-empty string`);
    if (!Array.isArray(inputs) || inputs.some((item) => !isNonEmptyString(item))) {
      throw new Error(`tasks[${index}].inputs must be an array of non-empty strings`);
    }
    if (!Array.isArray(expectedOutput) || expectedOutput.some((item) => !isNonEmptyString(item))) {
      throw new Error(`tasks[${index}].expectedOutput must be an array of non-empty strings`);
    }
    if (observabilityImpact !== undefined && !isNonEmptyString(observabilityImpact)) {
      throw new Error(`tasks[${index}].observabilityImpact must be a non-empty string when provided`);
    }

    return {
      taskId,
      title,
      description,
      estimate,
      files,
      verify,
      inputs,
      expectedOutput,
      observabilityImpact: typeof observabilityImpact === "string" ? observabilityImpact : "",
    };
  });
}

function validateParams(params: PlanSliceParams): PlanSliceParams {
  if (!isNonEmptyString(params?.milestoneId)) throw new Error("milestoneId is required");
  if (!isNonEmptyString(params?.sliceId)) throw new Error("sliceId is required");
  if (!isNonEmptyString(params?.goal)) throw new Error("goal is required");
  if (!isNonEmptyString(params?.successCriteria)) throw new Error("successCriteria is required");
  if (!isNonEmptyString(params?.proofLevel)) throw new Error("proofLevel is required");
  if (!isNonEmptyString(params?.integrationClosure)) throw new Error("integrationClosure is required");
  if (!isNonEmptyString(params?.observabilityImpact)) throw new Error("observabilityImpact is required");

  return {
    ...params,
    tasks: validateTasks(params.tasks),
  };
}

export async function handlePlanSlice(
  rawParams: PlanSliceParams,
  basePath: string,
): Promise<PlanSliceResult | { error: string }> {
  let params: PlanSliceParams;
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
      upsertSlicePlanning(params.milestoneId, params.sliceId, {
        goal: params.goal,
        successCriteria: params.successCriteria,
        proofLevel: params.proofLevel,
        integrationClosure: params.integrationClosure,
        observabilityImpact: params.observabilityImpact,
      });

      for (const task of params.tasks) {
        insertTask({
          id: task.taskId,
          sliceId: params.sliceId,
          milestoneId: params.milestoneId,
          title: task.title,
          status: "pending",
        });
        upsertTaskPlanning(params.milestoneId, params.sliceId, task.taskId, {
          title: task.title,
          description: task.description,
          estimate: task.estimate,
          files: task.files,
          verify: task.verify,
          inputs: task.inputs,
          expectedOutput: task.expectedOutput,
          observabilityImpact: task.observabilityImpact ?? "",
          fullPlanMd: task.fullPlanMd,
        });
      }
    });
  } catch (err) {
    return { error: `db write failed: ${(err as Error).message}` };
  }

  try {
    const renderResult = await renderPlanFromDb(basePath, params.milestoneId, params.sliceId);
    invalidateStateCache();
    clearParseCache();
    return {
      milestoneId: params.milestoneId,
      sliceId: params.sliceId,
      planPath: renderResult.planPath,
      taskPlanPaths: renderResult.taskPlanPaths,
    };
  } catch (renderErr) {
    process.stderr.write(
      `gsd-db: plan_slice — render failed (DB rows preserved for debugging): ${(renderErr as Error).message}\n`,
    );
    invalidateStateCache();
    return { error: `render failed: ${(renderErr as Error).message}` };
  }
}
