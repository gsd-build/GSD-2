/**
 * Shared types for the file-to-state pipeline.
 * Used by watcher, state-deriver, differ, and ws-server.
 *
 * GSD 2 schema: reads from .gsd/ flat directory structure.
 * See state-deriver.ts for derivation logic.
 */

// -- GSD 2 Project State (from .gsd/STATE.md frontmatter) --

export interface GSD2ProjectState {
  gsd_state_version: string;
  milestone: string;
  milestone_name: string;
  status: string;
  active_milestone: string; // "M001", "M002", etc.
  active_slice: string;     // "S01", "S02", etc.
  active_task: string;      // "T01", "T02", etc.
  auto_mode: boolean;
  cost: number;
  tokens: number;
  last_updated: string;
  last_activity?: string;
}

// -- GSD 2 Preferences (from .gsd/preferences.md YAML frontmatter) --

export interface GSD2Preferences {
  research_model?: string;
  planning_model?: string;
  execution_model?: string;
  completion_model?: string;
  budget_ceiling?: number;
  skill_discovery?: "auto" | "suggest" | "off";
}

// -- GSD 2 Roadmap State (from .gsd/M{NNN}-ROADMAP.md) --

export type SliceStatus = "planned" | "in_progress" | "needs_review" | "complete";

export interface GSD2SliceInfo {
  id: string;           // "S01", "S02"
  name: string;
  status: SliceStatus;
  taskCount: number;
  costEstimate: number | null; // parsed from "~$0.40" → 0.40
  branch: string;       // "gsd/M001/S01"
  dependencies: Array<{ id: string; name: string; complete: boolean }>;
}

export interface GSD2RoadmapState {
  milestoneId: string;  // "M001"
  milestoneName: string;
  slices: GSD2SliceInfo[];
}

// -- GSD 2 Slice Plan (from .gsd/S{NN}-PLAN.md) --

export interface GSD2TaskEntry {
  id: string;    // "T01"
  name: string;
  status: "pending" | "complete";
}

export interface GSD2SlicePlan {
  sliceId: string;
  costEstimate: number | null;
  tasks: GSD2TaskEntry[];
  mustHaves: string[];  // plain text lines from must_haves block
}

// -- GSD 2 Task Summary (from .gsd/T{NN}-SUMMARY.md) --

export interface GSD2TaskSummary {
  taskId: string;
  sliceId: string;
  summary: string;  // first 200 chars of body
}

// -- GSD 2 UAT File (from .gsd/S{NN}-UAT.md) --

export interface GSD2UatItem {
  id: string;   // "UAT-01"
  text: string;
  checked: boolean;
}

export interface GSD2UatFile {
  sliceId: string;
  items: GSD2UatItem[];
}

// -- Slice action union type --

export type SliceAction =
  | { type: 'start_slice'; sliceId: string }
  | { type: 'pause' }
  | { type: 'steer'; message: string }
  | { type: 'view_plan'; sliceId: string }
  | { type: 'view_task'; sliceId: string }
  | { type: 'run_uat'; sliceId: string }
  | { type: 'merge'; sliceId: string }
  | { type: 'view_diff'; sliceId: string }
  | { type: 'view_uat_results'; sliceId: string };

// -- Top-level GSD 2 State --

export interface GSD2State {
  /** Parsed from .gsd/STATE.md frontmatter */
  projectState: GSD2ProjectState;
  /** Parsed from .gsd/M{NNN}-ROADMAP.md (null if missing) */
  roadmap: GSD2RoadmapState | null;
  /** Parsed from .gsd/S{NN}-PLAN.md (null if missing) */
  activePlan: GSD2SlicePlan | null;
  /** Parsed from .gsd/T{NN}-SUMMARY.md (null if missing) */
  activeTask: GSD2TaskSummary | null;
  /** Raw content of .gsd/DECISIONS.md (null if missing) */
  decisions: string | null;
  /** Parsed from .gsd/preferences.md YAML frontmatter (null if missing) */
  preferences: GSD2Preferences | null;
  /** Raw content of .gsd/PROJECT.md (null if missing) */
  project: string | null;
  /** Raw content of .gsd/M{NNN}-CONTEXT.md (null if missing) */
  milestoneContext: string | null;
  /** True when .planning/ exists but .gsd/ does not — migration needed */
  needsMigration: boolean;
  /** All slices from M{NNN}-ROADMAP.md */
  slices: GSD2SliceInfo[];
  /** All milestones scanned from .gsd/milestones/ — used by MilestoneView for stacked display */
  allMilestones: GSD2RoadmapState[];
  /** Parsed S{NN}-UAT.md for active slice (null if missing) */
  uatFile: GSD2UatFile | null;
  /** Commit count on active slice branch (0 when branch not found) */
  gitBranchCommits: number;
  /** Last commit message on active slice branch (empty string when not found) */
  lastCommitMessage: string;
}

/**
 * PlanningState alias for GSD2State.
 * Maintained for backward compatibility during Phase 12 transition.
 * Downstream components (differ, ws-server, pipeline, hooks) use this alias.
 * TODO (Phase 13-14): Update all consumers to reference GSD2State directly.
 */
export type PlanningState = GSD2State;

// -- State Diff (for WebSocket push) --

export interface StateDiff {
  type: "full" | "diff";
  changes: Partial<GSD2State>;
  timestamp: number;
  sequence: number;
}

// -- Shared Constants --

/** Maximum number of concurrent chat sessions per project. Single source of truth. */
export const MAX_SESSIONS = 4;

// -- Watcher Options --

export interface WatcherOptions {
  /** Path to the .gsd/ directory being watched */
  planningDir: string;
  debounceMs?: number;
  onChange: (changedFiles: Set<string>) => void;
}

// -- Legacy v1 type stubs (Phase 12 backward compat) --
// TODO (Phase 13-14): Remove these stubs once UI components are updated to GSD2State.

/** @deprecated Use GSD2ProjectState. Legacy v1 ProjectState stub. */
export interface ProjectState {
  milestone: string;
  milestone_name: string;
  status: string;
  stopped_at: string;
  last_updated: string;
  last_activity: string;
  branch: string;
  progress: {
    total_phases: number;
    completed_phases: number;
    total_plans: number;
    completed_plans: number;
    percent: number;
  };
}

/** @deprecated Legacy v1 RoadmapPhase stub. */
export interface RoadmapPhase {
  completed: boolean;
  number: number;
  name: string;
  description: string;
}

/** @deprecated Legacy v1 RoadmapState stub. */
export interface RoadmapState {
  phases: RoadmapPhase[];
}

/** @deprecated Legacy v1 PhaseStatus stub. */
export type PhaseStatus = "not_started" | "in_progress" | "complete";

/** @deprecated Legacy v1 MustHavesArtifact stub. */
export interface MustHavesArtifact {
  path: string;
  provides: string;
  exports?: string[];
  contains?: string;
  min_lines?: number;
}

/** @deprecated Legacy v1 MustHavesKeyLink stub. */
export interface MustHavesKeyLink {
  from: string;
  to: string;
  via: string;
  pattern?: string;
}

/** @deprecated Legacy v1 MustHaves stub. */
export interface MustHaves {
  truths: string[];
  artifacts: MustHavesArtifact[];
  key_links: MustHavesKeyLink[];
}

/** @deprecated Legacy v1 VerificationTruth stub. */
export interface VerificationTruth {
  truth: string;
  status: "pass" | "fail" | "skip";
}

/** @deprecated Legacy v1 VerificationState stub. */
export interface VerificationState {
  score: number;
  status: string;
  truths: VerificationTruth[];
}

/** @deprecated Legacy v1 PlanState stub. */
export interface PlanState {
  phase: string;
  plan: number;
  wave: number;
  requirements: string[];
  autonomous: boolean;
  type: string;
  files_modified: string[];
  depends_on: string[];
  must_haves?: MustHaves;
  task_count: number;
}

/** @deprecated Legacy v1 PhaseState stub. */
export interface PhaseState {
  number: number;
  name: string;
  status: PhaseStatus;
  completedPlans: number;
  plans: PlanState[];
  verifications: VerificationState[];
}

/** @deprecated Legacy v1 ConfigState stub. Use GSD2Preferences. */
export interface ConfigState {
  model_profile: string;
  commit_docs: boolean;
  search_gitignored: boolean;
  branching_strategy: string;
  phase_branch_template: string;
  milestone_branch_template: string;
  workflow: {
    research: boolean;
    plan_check: boolean;
    verifier: boolean;
    nyquist_validation: boolean;
    _auto_chain_active: boolean;
  };
  parallelization: boolean;
  brave_search: boolean;
  mode: string;
  granularity: string;
  worktree_enabled?: boolean;
  skip_permissions?: boolean;
}

/** @deprecated Legacy v1 RequirementState stub. */
export interface RequirementState {
  id: string;
  description: string;
  completed: boolean;
}

