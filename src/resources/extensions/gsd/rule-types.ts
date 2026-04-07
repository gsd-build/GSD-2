// GSD Extension — Unified Rule Type Definitions
//
// Every dispatch rule and hook is expressed as a `UnifiedRule` with a
// consistent when/where/then shape. This file defines the type system;
// the `RuleRegistry` class in rule-registry.ts holds instances at runtime.

import type { DispatchAction, DispatchContext } from "./auto-dispatch.js";
import type {
  PostUnitHookConfig,
  PreDispatchHookConfig,
  HookDispatchResult,
  PreDispatchResult,
  HookExecutionState,
  HookStatusEntry,
} from "./types.js";

// ─── Phase & Evaluation Strategy ────────────────────────────────────────────

/** Which phase/event a rule responds to. */
export type RulePhase = "dispatch" | "post-unit" | "pre-dispatch";

/** How a rule is evaluated relative to peers in the same phase. */
export type RuleEvaluation = "first-match" | "all-matching";

// ─── Lifecycle Metadata (hooks only) ────────────────────────────────────────

/** Optional lifecycle metadata attached to hook-derived rules. */
export interface RuleLifecycle {
  /** Expected output file name (relative to unit dir). Used for idempotency. */
  artifact?: string;
  /** If this file is produced instead of artifact, re-run the trigger unit. */
  retry_on?: string;
  /** Max times this hook can fire for the same trigger unit. */
  max_cycles?: number;
  /** Idempotency key pattern for this hook. */
  idempotency_key?: string;
}

// ─── Unified Rule ───────────────────────────────────────────────────────────

/**
 * A single entry in the rule registry. Dispatch rules, post-unit hooks,
 * and pre-dispatch hooks all share this shape.
 */
export interface UnifiedRule {
  /** Stable human-readable identifier (existing names preserved per D005). */
  name: string;
  /** Which phase/event this rule responds to. */
  when: RulePhase;
  /** How this rule is evaluated relative to peers. */
  evaluation: RuleEvaluation;
  /**
   * Predicate/match function.
   * - Dispatch rules: async, receives DispatchContext, returns DispatchAction | null.
   * - Post-unit hooks: sync, receives (unitType, unitId, basePath).
   * - Pre-dispatch hooks: sync, receives (unitType, unitId, prompt, basePath).
   */
  where: (...args: any[]) => Promise<any> | any;
  /**
   * Action builder. May be merged with `where` for dispatch rules where
   * the match function returns the action directly.
   */
  then: (...args: any[]) => any;
  /** Optional human-readable summary for LLM inspection. */
  description?: string;
  /** Optional hook lifecycle metadata. */
  lifecycle?: RuleLifecycle;
}
