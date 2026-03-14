// Barrel export for old .planning migration module

export { handleMigrate } from './command.js';
export { parsePlanningDirectory } from './parser.js';
export { validatePlanningDirectory } from './validator.js';
export { transformToGSD } from './transformer.js';
export { writeGSDDirectory } from './writer.js';
export type { WrittenFiles, MigrationPreview } from './writer.js';
export { generatePreview } from './preview.js';
export type {
  // Input types (old .planning format)
  PlanningProject,
  PlanningPhase,
  PlanningPlan,
  PlanningPlanFrontmatter,
  PlanningPlanMustHaves,
  PlanningSummary,
  PlanningSummaryFrontmatter,
  PlanningSummaryRequires,
  PlanningRoadmap,
  PlanningRoadmapMilestone,
  PlanningRoadmapEntry,
  PlanningRequirement,
  PlanningResearch,
  PlanningConfig,
  PlanningQuickTask,
  PlanningMilestone,
  PlanningState,
  PlanningPhaseFile,
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
  // Output types (GSD-2 format)
  GSDProject,
  GSDMilestone,
  GSDSlice,
  GSDTask,
  GSDRequirement,
  GSDSliceSummaryData,
  GSDTaskSummaryData,
  GSDBoundaryEntry,
} from './types.js';
