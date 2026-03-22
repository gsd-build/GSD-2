import { join } from "node:path";

import { loadFile, parsePlan, parseRoadmap } from "./files.js";
import {
  resolveMilestoneFile,
  resolveSliceFile,
  resolveSlicePath,
  resolveTaskFile,
  resolveTasksDir,
} from "./paths.js";
import { deriveState } from "./state.js";
import { milestoneIdSort, findMilestoneIds } from "./guided-flow.js";
import type { RiskLevel } from "./types.js";
import { type ValidationIssue, validateCompleteBoundary, validatePlanBoundary } from "./observability-validator.js";
import { getSliceBranchName, detectWorktreeName } from "./worktree.js";

export interface WorkspaceTaskTarget {
  id: string;
  title: string;
  done: boolean;
  planPath?: string;
  summaryPath?: string;
}

export interface WorkspaceSliceTarget {
  id: string;
  title: string;
  done: boolean;
  planPath?: string;
  summaryPath?: string;
  uatPath?: string;
  tasksDir?: string;
  branch?: string;
  risk?: RiskLevel;
  depends?: string[];
  demo?: string;
  tasks: WorkspaceTaskTarget[];
}

export interface WorkspaceMilestoneTarget {
  id: string;
  title: string;
  roadmapPath?: string;
  slices: WorkspaceSliceTarget[];
}

export interface WorkspaceScopeTarget {
  scope: string;
  label: string;
  kind: "project" | "milestone" | "slice" | "task";
}

export interface GSDWorkspaceIndex {
  milestones: WorkspaceMilestoneTarget[];
  active: {
    milestoneId?: string;
    sliceId?: string;
    taskId?: string;
    phase: string;
  };
  scopes: WorkspaceScopeTarget[];
  validationIssues: ValidationIssue[];
}


function titleFromRoadmapHeader(content: string, fallbackId: string): string {
  const roadmap = parseRoadmap(content);
  return roadmap.title.replace(/^M\d+(?:-[a-z0-9]{6})?[^:]*:\s*/, "") || fallbackId;
}

async function indexSlice(basePath: string, milestoneId: string, sliceId: string, fallbackTitle: string, done: boolean, roadmapMeta?: { risk?: RiskLevel; depends?: string[]; demo?: string }): Promise<WorkspaceSliceTarget> {
  const planPath = resolveSliceFile(basePath, milestoneId, sliceId, "PLAN") ?? undefined;
  const summaryPath = resolveSliceFile(basePath, milestoneId, sliceId, "SUMMARY") ?? undefined;
  const uatPath = resolveSliceFile(basePath, milestoneId, sliceId, "UAT") ?? undefined;
  const tasksDir = resolveTasksDir(basePath, milestoneId, sliceId) ?? undefined;

  const tasks: WorkspaceTaskTarget[] = [];
  let title = fallbackTitle;

  if (planPath) {
    const content = await loadFile(planPath);
    if (content) {
      const plan = parsePlan(content);
      title = plan.title || fallbackTitle;
      for (const task of plan.tasks) {
        tasks.push({
          id: task.id,
          title: task.title,
          done: task.done,
          planPath: resolveTaskFile(basePath, milestoneId, sliceId, task.id, "PLAN") ?? undefined,
          summaryPath: resolveTaskFile(basePath, milestoneId, sliceId, task.id, "SUMMARY") ?? undefined,
        });
      }
    }
  }

  return {
    id: sliceId,
    title,
    done,
    planPath,
    summaryPath,
    uatPath,
    tasksDir,
    branch: getSliceBranchName(milestoneId, sliceId, detectWorktreeName(basePath)),
    risk: roadmapMeta?.risk,
    depends: roadmapMeta?.depends,
    demo: roadmapMeta?.demo,
    tasks,
  };
}

export interface IndexWorkspaceOptions {
  /**
   * When true, run validatePlanBoundary and validateCompleteBoundary for each slice.
   * Skipped by default — validation is expensive (content analysis) and only needed
   * for explicit doctor/audit flows. The /gsd status dashboard and scope pickers
   * don't need the full issue list.
   */
  validate?: boolean;
}

export async function indexWorkspace(basePath: string, opts: IndexWorkspaceOptions = {}): Promise<GSDWorkspaceIndex> {
  const milestoneIds = findMilestoneIds(basePath);
  const milestones: WorkspaceMilestoneTarget[] = [];
  const validationIssues: ValidationIssue[] = [];
  const runValidation = opts.validate === true;

  for (const milestoneId of milestoneIds) {
    const roadmapPath = resolveMilestoneFile(basePath, milestoneId, "ROADMAP") ?? undefined;
    let title = milestoneId;
    const slices: WorkspaceSliceTarget[] = [];

    if (roadmapPath) {
      const roadmapContent = await loadFile(roadmapPath);
      if (roadmapContent) {
        const roadmap = parseRoadmap(roadmapContent);
        title = titleFromRoadmapHeader(roadmapContent, milestoneId);

        // Parallelise all per-slice I/O: indexSlice + (optional) validation calls run concurrently.
        // Order is preserved via Promise.all on an array built from roadmap.slices.
        const sliceResults = await Promise.all(
          roadmap.slices.map(async (slice) => {
            if (runValidation) {
              const [indexedSlice, planIssues, completeIssues] = await Promise.all([
                indexSlice(basePath, milestoneId, slice.id, slice.title, slice.done, { risk: slice.risk, depends: slice.depends, demo: slice.demo }),
                validatePlanBoundary(basePath, milestoneId, slice.id),
                validateCompleteBoundary(basePath, milestoneId, slice.id),
              ]);
              return { indexedSlice, issues: [...planIssues, ...completeIssues] };
            }
            const indexedSlice = await indexSlice(basePath, milestoneId, slice.id, slice.title, slice.done, { risk: slice.risk, depends: slice.depends, demo: slice.demo });
            return { indexedSlice, issues: [] as ValidationIssue[] };
          }),
        );

        for (const { indexedSlice, issues } of sliceResults) {
          slices.push(indexedSlice);
          validationIssues.push(...issues);
        }
      }
    }

    milestones.push({ id: milestoneId, title, roadmapPath, slices });
  }

  const state = await deriveState(basePath);
  const active = {
    milestoneId: state.activeMilestone?.id,
    sliceId: state.activeSlice?.id,
    taskId: state.activeTask?.id,
    phase: state.phase,
  };

  const scopes: WorkspaceScopeTarget[] = [{ scope: "project", label: "project", kind: "project" }];
  for (const milestone of milestones) {
    scopes.push({ scope: milestone.id, label: `${milestone.id}: ${milestone.title}`, kind: "milestone" });
    for (const slice of milestone.slices) {
      scopes.push({ scope: `${milestone.id}/${slice.id}`, label: `${milestone.id}/${slice.id}: ${slice.title}`, kind: "slice" });
      for (const task of slice.tasks) {
        scopes.push({
          scope: `${milestone.id}/${slice.id}/${task.id}`,
          label: `${milestone.id}/${slice.id}/${task.id}: ${task.title}`,
          kind: "task",
        });
      }
    }
  }

  return { milestones, active, scopes, validationIssues };
}

export async function listDoctorScopeSuggestions(basePath: string): Promise<Array<{ value: string; label: string }>> {
  const index = await indexWorkspace(basePath);
  const activeSliceScope = index.active.milestoneId && index.active.sliceId
    ? `${index.active.milestoneId}/${index.active.sliceId}`
    : null;

  const ordered = [...index.scopes].filter(scope => scope.kind !== "project");
  ordered.sort((a, b) => {
    if (activeSliceScope && a.scope === activeSliceScope) return -1;
    if (activeSliceScope && b.scope === activeSliceScope) return 1;
    return a.scope.localeCompare(b.scope);
  });

  return ordered.map(scope => ({ value: scope.scope, label: scope.label }));
}

export async function getSuggestedNextCommands(basePath: string): Promise<string[]> {
  // Run validation here since we surface a /gsd doctor audit hint when issues exist.
  const index = await indexWorkspace(basePath, { validate: true });
  const scope = index.active.milestoneId && index.active.sliceId
    ? `${index.active.milestoneId}/${index.active.sliceId}`
    : index.active.milestoneId;

  const commands = new Set<string>();
  if (index.active.phase === "planning") commands.add("/gsd");
  if (index.active.phase === "executing" || index.active.phase === "summarizing") commands.add("/gsd auto");
  if (scope) commands.add(`/gsd doctor ${scope}`);
  if (scope) commands.add(`/gsd doctor fix ${scope}`);
  if (index.validationIssues.length > 0 && scope) commands.add(`/gsd doctor audit ${scope}`);
  commands.add("/gsd status");
  return [...commands];
}
