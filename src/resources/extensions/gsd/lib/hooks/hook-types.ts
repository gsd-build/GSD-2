// GSD Extension — Hook Library Type Definitions

import type { UnifiedRule, RulePhase } from "../../rule-types.js";
import type { PostUnitHookConfig, PreDispatchHookConfig } from "../../types.js";

// ─── Source Tracking ──────────────────────────────────────────────────────────

/** Where a hook registration originated. */
export type HookSource = "yaml" | "programmatic" | "community";

// ─── Prioritized Rule ─────────────────────────────────────────────────────────

/**
 * Extended rule with priority ordering and source tracking.
 * Compatible with UnifiedRule — can be used anywhere UnifiedRule is accepted.
 */
export interface PrioritizedRule extends UnifiedRule {
  /** Evaluation order within phase. Lower numbers evaluate first. Default 0. */
  priority?: number;
  /** Where this hook was registered from. */
  source?: HookSource;
  /** Community package that contributed this hook, when source === "community". */
  packageId?: string;
}

// ─── Registration Options ─────────────────────────────────────────────────────

/** Options for registering a post-unit hook programmatically. */
export interface RegisterPostUnitHookOptions {
  /** Unique hook identifier — used in idempotency keys and logging. */
  name: string;
  /** Unit types that trigger this hook (e.g., ["execute-task"]). */
  after: string[];
  /** Prompt sent to the LLM session. Supports {milestoneId}, {sliceId}, {taskId} substitutions. */
  prompt: string;
  /** Evaluation priority among programmatic hooks. Lower numbers evaluate first. Default 0.
   *  Note: YAML-configured hooks always evaluate before programmatic hooks regardless of priority. */
  priority?: number;
  /** Max times this hook can fire for the same trigger unit. Default 1, max 10. */
  max_cycles?: number;
  /** Model override for hook sessions. */
  model?: string;
  /** Expected output file name (relative to task/slice dir). Used for idempotency. */
  artifact?: string;
  /** If this file is produced instead of artifact, re-run the trigger unit. */
  retry_on?: string;
  /** Agent definition file to use. */
  agent?: string;
  /** Set false to disable without removing config. Default true. */
  enabled?: boolean;
  /** Community package ID when registered by a community loader. */
  packageId?: string;
}

/** Options for registering a pre-dispatch hook programmatically. */
export interface RegisterPreDispatchHookOptions {
  /** Unique hook identifier. */
  name: string;
  /** Unit types this hook intercepts before dispatch (e.g., ["execute-task"]). */
  before: string[];
  /** Action to take: "modify" mutates the prompt, "skip" skips the unit, "replace" swaps it. */
  action: "modify" | "skip" | "replace";
  /** Evaluation priority among programmatic hooks. Lower numbers evaluate first. Default 0.
   *  Note: YAML-configured hooks always evaluate before programmatic hooks regardless of priority. */
  priority?: number;
  /** For "modify": text prepended to the unit prompt. */
  prepend?: string;
  /** For "modify": text appended to the unit prompt. */
  append?: string;
  /** For "replace": the replacement prompt. */
  prompt?: string;
  /** For "replace": override the unit type label. */
  unit_type?: string;
  /** For "skip": optional condition file — only skip if this file exists. */
  skip_if?: string;
  /** Model override when this hook fires. */
  model?: string;
  /** Set false to disable without removing config. Default true. */
  enabled?: boolean;
  /** Community package ID when registered by a community loader. */
  packageId?: string;
}

// ─── Discovery Types ──────────────────────────────────────────────────────────

/** Resolved hook descriptor used in discovery and status output. */
export interface HookDescriptor {
  /** Hook name. */
  name: string;
  /** Which phase this hook targets. */
  phase: RulePhase;
  /** Where the hook was registered from. */
  source: HookSource;
  /** Community package ID, if applicable. */
  packageId?: string;
  /** Evaluation priority. */
  priority: number;
  /** Whether the hook is enabled. */
  enabled: boolean;
  /** What unit types it targets (after[] or before[]). */
  targets: string[];
  /** Human-readable description. */
  description?: string;
}

// ─── Community Manifest ───────────────────────────────────────────────────────

/** Schema version for forward compatibility. */
export const HOOK_MANIFEST_VERSION = 1;

/** Community hook package manifest (hooks-manifest.json). */
export interface HookPackageManifest {
  /** Schema version — must equal HOOK_MANIFEST_VERSION. */
  version: number;
  /** Globally unique package ID, e.g. "com.example.my-hooks". */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Package version (semver). */
  packageVersion: string;
  /** Post-unit hooks provided by this package. */
  postUnitHooks?: RegisterPostUnitHookOptions[];
  /** Pre-dispatch hooks provided by this package. */
  preDispatchHooks?: RegisterPreDispatchHookOptions[];
}

/** Result from loading community hooks. */
export interface CommunityLoadResult {
  /** Number of packages loaded successfully. */
  loaded: number;
  /** Total hooks registered across all packages. */
  hooksRegistered: number;
  /** Errors encountered during loading (non-fatal). */
  errors: Array<{ packagePath: string; error: string }>;
}
