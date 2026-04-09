// GSD Extension — Hook Engine Facade
//
// Thin facade over RuleRegistry. All mutable state and logic lives in the
// registry instance; these exported functions delegate through getOrCreateRegistry()
// so existing call-sites and tests work without modification.
//
// Also exposes the programmatic hook registration API from the hooks library.

import type {
  HookExecutionState,
  HookDispatchResult,
  PreDispatchResult,
  HookStatusEntry,
} from "./types.js";
import { getOrCreateRegistry, resolveHookArtifactPath } from "./rule-registry.js";
import type { RegisterPostUnitHookOptions, RegisterPreDispatchHookOptions } from "./lib/hooks/hook-types.js";

// Re-export resolveHookArtifactPath so existing importers still work.
export { resolveHookArtifactPath } from "./rule-registry.js";

// Re-export hooks library types for convenience.
export type { RegisterPostUnitHookOptions, RegisterPreDispatchHookOptions } from "./lib/hooks/hook-types.js";

// ─── Post-Unit Hooks ───────────────────────────────────────────────────────

export function checkPostUnitHooks(
  completedUnitType: string,
  completedUnitId: string,
  basePath: string,
): HookDispatchResult | null {
  return getOrCreateRegistry().evaluatePostUnit(completedUnitType, completedUnitId, basePath);
}

export function getActiveHook(): HookExecutionState | null {
  return getOrCreateRegistry().getActiveHook();
}

export function isRetryPending(): boolean {
  return getOrCreateRegistry().isRetryPending();
}

export function consumeRetryTrigger(): { unitType: string; unitId: string; retryArtifact: string } | null {
  return getOrCreateRegistry().consumeRetryTrigger();
}

export function resetHookState(): void {
  getOrCreateRegistry().resetState();
}

// ─── Pre-Dispatch Hooks ────────────────────────────────────────────────────

export function runPreDispatchHooks(
  unitType: string,
  unitId: string,
  prompt: string,
  basePath: string,
): PreDispatchResult {
  return getOrCreateRegistry().evaluatePreDispatch(unitType, unitId, prompt, basePath);
}

// ─── State Persistence ─────────────────────────────────────────────────────

export function persistHookState(basePath: string): void {
  getOrCreateRegistry().persistState(basePath);
}

export function restoreHookState(basePath: string): void {
  getOrCreateRegistry().restoreState(basePath);
}

export function clearPersistedHookState(basePath: string): void {
  getOrCreateRegistry().clearPersistedState(basePath);
}

// ─── Status & Manual Trigger ───────────────────────────────────────────────

export function getHookStatus(): HookStatusEntry[] {
  return getOrCreateRegistry().getHookStatus();
}

export function triggerHookManually(
  hookName: string,
  unitType: string,
  unitId: string,
  basePath: string,
): HookDispatchResult | null {
  return getOrCreateRegistry().triggerHookManually(hookName, unitType, unitId, basePath);
}

export function formatHookStatus(): string {
  return getOrCreateRegistry().formatHookStatus();
}

// ─── Programmatic Hook Registration API ───────────────────────────────────

/**
 * Register a post-unit hook programmatically.
 * The hook will be merged with YAML-configured hooks at evaluation time.
 * Registering with an existing name replaces the previous registration.
 *
 * @throws TypeError if options fail validation (empty name, empty after[], etc.)
 */
export function registerPostUnitHook(options: RegisterPostUnitHookOptions): void {
  getOrCreateRegistry().getProgrammaticStore().registerPostUnit(options);
}

/**
 * Register a pre-dispatch hook programmatically.
 * The hook will be merged with YAML-configured hooks at evaluation time.
 * Registering with an existing name replaces the previous registration.
 *
 * @throws TypeError if options fail validation (empty name, invalid action, etc.)
 */
export function registerPreDispatchHook(options: RegisterPreDispatchHookOptions): void {
  getOrCreateRegistry().getProgrammaticStore().registerPreDispatch(options);
}

/**
 * Remove a programmatically registered hook by name.
 * Does not affect YAML-configured hooks.
 *
 * @returns true if a hook was found and removed
 */
export function deregisterHook(name: string): boolean {
  return getOrCreateRegistry().getProgrammaticStore().deregister(name);
}
