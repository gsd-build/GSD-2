import { z } from "zod";

import { getAutoDashboardData, markToolEnd, markToolStart } from "../auto.js";
import { verifyExpectedArtifact } from "../auto-recovery.js";
import {
  claimReservedId,
  findMilestoneIds,
  getDiscussionMilestoneId,
  getReservedMilestoneIds,
  nextMilestoneId,
} from "../guided-flow.js";
import { loadEffectiveGSDPreferences, resolveAutoSupervisorConfig } from "../preferences.js";
import {
  isDepthVerified,
  isQueuePhaseActive,
  shouldBlockContextWrite,
} from "./write-gate.js";
import { ensureDbOpen } from "./dynamic-tools.js";
import type { DecisionMadeBy } from "../types.js";

type ProviderDeps = {
  getSupervisorConfig: () => {
    soft_timeout_minutes?: number;
    idle_timeout_minutes?: number;
    hard_timeout_minutes?: number;
  };
  shouldBlockContextWrite: (
    toolName: string,
    inputPath: string,
    milestoneId: string | null,
    depthVerified: boolean,
  ) => { block: boolean; reason?: string };
  getMilestoneId: () => string | null;
  isDepthVerified: () => boolean;
  getIsUnitDone: () => boolean;
  onToolStart: (toolCallId: string) => void;
  onToolEnd: (toolCallId: string) => void;
  getBasePath: () => string;
  getUnitInfo: () => { unitType: string; unitId: string };
};

type TextToolResult = { content: Array<{ type: "text"; text: string }> };

type GsdToolDef = {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  execute: (args: Record<string, unknown>) => Promise<TextToolResult>;
};

type ToolRegistryArray = GsdToolDef[] & {
  set?: (name: string, def: GsdToolDef) => ToolRegistryArray;
  clear?: () => void;
  get?: (name: string) => GsdToolDef | undefined;
  has?: (name: string) => boolean;
};

type ProviderDepsStore = {
  value: ProviderDeps | null;
  waiters?: Array<(deps: ProviderDeps) => void>;
};

const PROVIDER_DEPS_KEY = Symbol.for("gsd-provider-deps");
const TOOL_REGISTRY_KEY = Symbol.for("gsd-tool-registry");

function getProviderDepsStore(): ProviderDepsStore {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[PROVIDER_DEPS_KEY] as ProviderDepsStore | undefined;
  if (existing && typeof existing === "object" && "value" in existing) {
    if (!Array.isArray(existing.waiters)) {
      existing.waiters = [];
    }
    return existing;
  }
  const created: ProviderDepsStore = { value: null, waiters: [] };
  g[PROVIDER_DEPS_KEY] = created;
  return created;
}

function setProviderDeps(deps: ProviderDeps): void {
  const store = getProviderDepsStore();
  store.value = deps;
  if (!Array.isArray(store.waiters) || store.waiters.length === 0) return;
  const waiters = store.waiters.splice(0, store.waiters.length);
  for (const resolve of waiters) {
    resolve(deps);
  }
}

function attachRegistryMethods(registry: ToolRegistryArray): ToolRegistryArray {
  if (typeof registry.set !== "function") {
    Object.defineProperty(registry, "set", {
      value: (name: string, def: GsdToolDef): ToolRegistryArray => {
        const idx = registry.findIndex((tool) => tool.name === name);
        if (idx >= 0) registry[idx] = def;
        else registry.push(def);
        return registry;
      },
      configurable: true,
      writable: true,
    });
  }
  if (typeof registry.clear !== "function") {
    Object.defineProperty(registry, "clear", {
      value: (): void => {
        registry.length = 0;
      },
      configurable: true,
      writable: true,
    });
  }
  if (typeof registry.get !== "function") {
    Object.defineProperty(registry, "get", {
      value: (name: string): GsdToolDef | undefined => registry.find((tool) => tool.name === name),
      configurable: true,
      writable: true,
    });
  }
  if (typeof registry.has !== "function") {
    Object.defineProperty(registry, "has", {
      value: (name: string): boolean => registry.some((tool) => tool.name === name),
      configurable: true,
      writable: true,
    });
  }
  return registry;
}

function getToolRegistry(): ToolRegistryArray {
  const g = globalThis as Record<symbol, unknown>;
  const existing = g[TOOL_REGISTRY_KEY];

  if (Array.isArray(existing)) {
    return attachRegistryMethods(existing as ToolRegistryArray);
  }

  if (existing instanceof Map) {
    const migrated: ToolRegistryArray = [];
    for (const value of existing.values()) {
      const def = value as GsdToolDef;
      if (def && typeof def.name === "string") migrated.push(def);
    }
    g[TOOL_REGISTRY_KEY] = attachRegistryMethods(migrated);
    return g[TOOL_REGISTRY_KEY] as ToolRegistryArray;
  }

  const created: ToolRegistryArray = [];
  g[TOOL_REGISTRY_KEY] = attachRegistryMethods(created);
  return g[TOOL_REGISTRY_KEY] as ToolRegistryArray;
}

function replaceTools(defs: readonly GsdToolDef[]): void {
  const registry = getToolRegistry();
  if (typeof registry.clear === "function") registry.clear();
  else registry.length = 0;
  for (const def of defs) {
    if (typeof registry.set === "function") registry.set(def.name, def);
    else registry.push(def);
  }
}

function textResult(text: string): TextToolResult {
  return { content: [{ type: "text", text }] };
}

function aliasTool(
  aliasName: string,
  canonicalName: string,
  canonicalDescription: string,
  schema: Record<string, z.ZodTypeAny>,
  execute: GsdToolDef["execute"],
): GsdToolDef {
  return {
    name: aliasName,
    description: `${canonicalDescription} (alias for ${canonicalName} — prefer the canonical name)`,
    schema,
    execute,
  };
}

function buildBridgeTools(): GsdToolDef[] {
  const decisionSchema = {
    scope: z.string().describe("Scope of the decision (e.g. 'architecture', 'library', 'observability')"),
    decision: z.string().describe("What is being decided"),
    choice: z.string().describe("The choice made"),
    rationale: z.string().describe("Why this choice was made"),
    revisable: z.string().optional().describe("Whether this can be revisited (default: 'Yes')"),
    when_context: z.string().optional().describe("When/context for the decision (e.g. milestone ID)"),
    made_by: z.enum(["human", "agent", "collaborative"]).optional()
      .describe("Who made this decision: human, agent, or collaborative"),
  } satisfies Record<string, z.ZodTypeAny>;

  const decisionDescription =
    "Record a project decision to the GSD database and regenerate DECISIONS.md. " +
    "Decision IDs are auto-assigned — never provide an ID manually.";

  const decisionExecute: GsdToolDef["execute"] = async (args) => {
    const dbAvailable = await ensureDbOpen();
    if (!dbAvailable) {
      return textResult("Error: GSD database is not available. Cannot save decision.");
    }

    try {
      const { saveDecisionToDb } = await import("../db-writer.js");
      const madeByRaw = args.made_by;
      const madeBy: DecisionMadeBy | undefined = (madeByRaw === "human" || madeByRaw === "agent" || madeByRaw === "collaborative")
        ? madeByRaw
        : undefined;
      const fields = {
        scope: String(args.scope ?? ""),
        decision: String(args.decision ?? ""),
        choice: String(args.choice ?? ""),
        rationale: String(args.rationale ?? ""),
        revisable: typeof args.revisable === "string" ? args.revisable : undefined,
        when_context: typeof args.when_context === "string" ? args.when_context : undefined,
        made_by: madeBy,
      };
      const { id } = await saveDecisionToDb(fields, process.cwd());
      return textResult(`Saved decision ${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`gsd-db: gsd_decision_save provider bridge failed: ${msg}\n`);
      return textResult(`Error saving decision: ${msg}`);
    }
  };

  const requirementSchema = {
    id: z.string().describe("The requirement ID (e.g. R001, R014)"),
    status: z.string().optional().describe("New status (e.g. 'active', 'validated', 'deferred')"),
    validation: z.string().optional().describe("Validation criteria or proof"),
    notes: z.string().optional().describe("Additional notes"),
    description: z.string().optional().describe("Updated description"),
    primary_owner: z.string().optional().describe("Primary owning slice"),
    supporting_slices: z.string().optional().describe("Supporting slices"),
  } satisfies Record<string, z.ZodTypeAny>;

  const requirementDescription =
    "Update an existing requirement in the GSD database and regenerate REQUIREMENTS.md. " +
    "Provide the requirement ID (e.g. R001) and any fields to update.";

  const requirementExecute: GsdToolDef["execute"] = async (args) => {
    const dbAvailable = await ensureDbOpen();
    if (!dbAvailable) {
      return textResult("Error: GSD database is not available. Cannot update requirement.");
    }

    try {
      const { getRequirementById } = await import("../gsd-db.js");
      const id = String(args.id ?? "");
      const existing = getRequirementById(id);
      if (!existing) {
        return textResult(`Error: Requirement ${id} not found.`);
      }

      const { updateRequirementInDb } = await import("../db-writer.js");
      const updates: Record<string, string> = {};
      if (typeof args.status === "string") updates.status = args.status;
      if (typeof args.validation === "string") updates.validation = args.validation;
      if (typeof args.notes === "string") updates.notes = args.notes;
      if (typeof args.description === "string") updates.description = args.description;
      if (typeof args.primary_owner === "string") updates.primary_owner = args.primary_owner;
      if (typeof args.supporting_slices === "string") updates.supporting_slices = args.supporting_slices;

      await updateRequirementInDb(id, updates, process.cwd());
      return textResult(`Updated requirement ${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`gsd-db: gsd_requirement_update provider bridge failed: ${msg}\n`);
      return textResult(`Error updating requirement: ${msg}`);
    }
  };

  const summarySchema = {
    milestone_id: z.string().describe("Milestone ID (e.g. M001)"),
    slice_id: z.string().optional().describe("Slice ID (e.g. S01)"),
    task_id: z.string().optional().describe("Task ID (e.g. T01)"),
    artifact_type: z.string().describe("One of: SUMMARY, RESEARCH, CONTEXT, ASSESSMENT"),
    content: z.string().describe("The full markdown content of the artifact"),
  } satisfies Record<string, z.ZodTypeAny>;

  const summaryDescription =
    "Save a summary, research, context, or assessment artifact to the GSD database and write it to disk. " +
    "Computes the file path from milestone/slice/task IDs automatically.";

  const summaryExecute: GsdToolDef["execute"] = async (args) => {
    const dbAvailable = await ensureDbOpen();
    if (!dbAvailable) {
      return textResult("Error: GSD database is not available. Cannot save artifact.");
    }

    const artifactType = String(args.artifact_type ?? "");
    const validTypes = ["SUMMARY", "RESEARCH", "CONTEXT", "ASSESSMENT"];
    if (!validTypes.includes(artifactType)) {
      return textResult(
        `Error: Invalid artifact_type "${artifactType}". Must be one of: ${validTypes.join(", ")}`,
      );
    }

    try {
      const milestoneId = String(args.milestone_id ?? "");
      const sliceId = typeof args.slice_id === "string" ? args.slice_id : undefined;
      const taskId = typeof args.task_id === "string" ? args.task_id : undefined;
      const content = String(args.content ?? "");

      let relativePath: string;
      if (taskId && sliceId) {
        relativePath = `milestones/${milestoneId}/slices/${sliceId}/tasks/${taskId}-${artifactType}.md`;
      } else if (sliceId) {
        relativePath = `milestones/${milestoneId}/slices/${sliceId}/${sliceId}-${artifactType}.md`;
      } else {
        relativePath = `milestones/${milestoneId}/${milestoneId}-${artifactType}.md`;
      }

      const { saveArtifactToDb } = await import("../db-writer.js");
      await saveArtifactToDb(
        {
          path: relativePath,
          artifact_type: artifactType,
          content,
          milestone_id: milestoneId,
          slice_id: sliceId,
          task_id: taskId,
        },
        process.cwd(),
      );
      return textResult(`Saved ${artifactType} artifact to ${relativePath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`gsd-db: gsd_summary_save provider bridge failed: ${msg}\n`);
      return textResult(`Error saving artifact: ${msg}`);
    }
  };

  const milestoneSchema = {} satisfies Record<string, z.ZodTypeAny>;

  const milestoneDescription =
    "Generate the next milestone ID for a new GSD milestone. " +
    "Scans existing milestones on disk and respects the unique_milestone_ids preference.";

  const milestoneExecute: GsdToolDef["execute"] = async () => {
    try {
      const reserved = claimReservedId();
      if (reserved) {
        return textResult(reserved);
      }

      const basePath = process.cwd();
      const existingIds = findMilestoneIds(basePath);
      const uniqueEnabled = !!loadEffectiveGSDPreferences()?.preferences?.unique_milestone_ids;
      const allIds = [...new Set([...existingIds, ...getReservedMilestoneIds()])];
      const newId = nextMilestoneId(allIds, uniqueEnabled);
      return textResult(newId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return textResult(`Error generating milestone ID: ${msg}`);
    }
  };

  const decisionTool: GsdToolDef = {
    name: "gsd_decision_save",
    description: decisionDescription,
    schema: decisionSchema,
    execute: decisionExecute,
  };
  const requirementTool: GsdToolDef = {
    name: "gsd_requirement_update",
    description: requirementDescription,
    schema: requirementSchema,
    execute: requirementExecute,
  };
  const summaryTool: GsdToolDef = {
    name: "gsd_summary_save",
    description: summaryDescription,
    schema: summarySchema,
    execute: summaryExecute,
  };
  const milestoneTool: GsdToolDef = {
    name: "gsd_milestone_generate_id",
    description: milestoneDescription,
    schema: milestoneSchema,
    execute: milestoneExecute,
  };

  return [
    decisionTool,
    aliasTool("gsd_save_decision", decisionTool.name, decisionDescription, decisionSchema, decisionExecute),
    requirementTool,
    aliasTool("gsd_update_requirement", requirementTool.name, requirementDescription, requirementSchema, requirementExecute),
    summaryTool,
    aliasTool("gsd_save_summary", summaryTool.name, summaryDescription, summarySchema, summaryExecute),
    milestoneTool,
    aliasTool("gsd_generate_milestone_id", milestoneTool.name, milestoneDescription, milestoneSchema, milestoneExecute),
  ];
}

function buildProviderDeps(): ProviderDeps {
  return {
    getSupervisorConfig: () => resolveAutoSupervisorConfig(),
    shouldBlockContextWrite: (
      toolName: string,
      inputPath: string,
      milestoneId: string | null,
      depthVerified: boolean,
    ) => shouldBlockContextWrite(
      toolName,
      inputPath,
      milestoneId,
      depthVerified,
      isQueuePhaseActive(),
    ),
    getMilestoneId: () => getDiscussionMilestoneId(),
    isDepthVerified: () => isDepthVerified(),
    getIsUnitDone: () => {
      const dash = getAutoDashboardData();
      const currentUnit = dash.currentUnit;
      if (!currentUnit) return true;
      try {
        return verifyExpectedArtifact(currentUnit.type, currentUnit.id, dash.basePath);
      } catch {
        return false;
      }
    },
    onToolStart: (toolCallId: string) => markToolStart(toolCallId),
    onToolEnd: (toolCallId: string) => markToolEnd(toolCallId),
    getBasePath: () => {
      const dash = getAutoDashboardData();
      return dash.basePath || process.cwd();
    },
    getUnitInfo: () => {
      const dash = getAutoDashboardData();
      if (dash.currentUnit) {
        return { unitType: dash.currentUnit.type, unitId: dash.currentUnit.id };
      }
      return { unitType: "unknown", unitId: "unknown" };
    },
  };
}

/**
 * Publish GSD orchestration deps + GSD tools to provider-api global symbols.
 *
 * This keeps provider-api external while letting extension packages consume
 * runtime data without extra core API surface.
 */
export function initializeProviderApiBridge(): void {
  setProviderDeps(buildProviderDeps());
  replaceTools(buildBridgeTools());
}
