// GSD Extension — Programmatic Hook Registration Store

import type { PostUnitHookConfig, PreDispatchHookConfig } from "../../types.js";
import type {
  RegisterPostUnitHookOptions,
  RegisterPreDispatchHookOptions,
  HookSource,
  PrioritizedRule,
  HookDescriptor,
} from "./hook-types.js";

// ─── Validation ───────────────────────────────────────────────────────────────

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Hook registration: "${field}" must be a non-empty string`);
  }
}

function assertNonEmptyArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`Hook registration: "${field}" must be a non-empty array`);
  }
}

const VALID_PRE_DISPATCH_ACTIONS = new Set(["modify", "skip", "replace"]);

// ─── ProgrammaticHookStore ────────────────────────────────────────────────────

/**
 * In-memory store for programmatically registered hooks.
 * Hooks registered here are merged with YAML-configured hooks at evaluation time.
 *
 * Name-keyed: registering a hook with an existing name replaces the previous one.
 * This follows the same override-by-name contract as YAML preference merging.
 */
export class ProgrammaticHookStore {
  private readonly postUnitHooks: Map<string, { config: PostUnitHookConfig; priority: number; source: HookSource; packageId?: string }> = new Map();
  private readonly preDispatchHooks: Map<string, { config: PreDispatchHookConfig; priority: number; source: HookSource; packageId?: string }> = new Map();

  // ── Post-Unit Hook Registration ─────────────────────────────────────

  /**
   * Register a post-unit hook. Replaces any existing hook with the same name.
   * Throws TypeError on invalid options.
   */
  registerPostUnit(options: RegisterPostUnitHookOptions, source: HookSource = "programmatic"): void {
    assertNonEmptyString(options.name, "name");
    assertNonEmptyArray(options.after, "after");
    assertNonEmptyString(options.prompt, "prompt");

    const config: PostUnitHookConfig = {
      name: options.name,
      after: options.after,
      prompt: options.prompt,
      max_cycles: options.max_cycles,
      model: options.model,
      artifact: options.artifact,
      retry_on: options.retry_on,
      agent: options.agent,
      enabled: options.enabled,
    };

    this.postUnitHooks.set(options.name, {
      config,
      priority: options.priority ?? 0,
      source,
      packageId: options.packageId,
    });
  }

  // ── Pre-Dispatch Hook Registration ──────────────────────────────────

  /**
   * Register a pre-dispatch hook. Replaces any existing hook with the same name.
   * Throws TypeError on invalid options.
   */
  registerPreDispatch(options: RegisterPreDispatchHookOptions, source: HookSource = "programmatic"): void {
    assertNonEmptyString(options.name, "name");
    assertNonEmptyArray(options.before, "before");
    if (!VALID_PRE_DISPATCH_ACTIONS.has(options.action)) {
      throw new TypeError(`Hook registration: "action" must be one of: modify, skip, replace`);
    }
    if (options.action === "replace" && (!options.prompt || options.prompt.trim().length === 0)) {
      throw new TypeError(`Hook registration: "prompt" is required when action is "replace"`);
    }

    const config: PreDispatchHookConfig = {
      name: options.name,
      before: options.before,
      action: options.action,
      prepend: options.prepend,
      append: options.append,
      prompt: options.prompt,
      unit_type: options.unit_type,
      skip_if: options.skip_if,
      model: options.model,
      enabled: options.enabled,
    };

    this.preDispatchHooks.set(options.name, {
      config,
      priority: options.priority ?? 0,
      source,
      packageId: options.packageId,
    });
  }

  // ── Deregistration ──────────────────────────────────────────────────

  /**
   * Remove a hook by name. Returns true if a hook was found and removed.
   * Checks both post-unit and pre-dispatch stores.
   */
  deregister(name: string): boolean {
    const removedPost = this.postUnitHooks.delete(name);
    const removedPre = this.preDispatchHooks.delete(name);
    return removedPost || removedPre;
  }

  /** Remove all programmatically registered hooks. */
  clear(): void {
    this.postUnitHooks.clear();
    this.preDispatchHooks.clear();
  }

  // ── Accessors ───────────────────────────────────────────────────────

  /**
   * Get all enabled post-unit hook configs, sorted by priority.
   * YAML hooks are not included — the caller merges these with YAML hooks.
   */
  getPostUnitHooks(): PostUnitHookConfig[] {
    return [...this.postUnitHooks.values()]
      .filter(entry => entry.config.enabled !== false)
      .sort((a, b) => a.priority - b.priority)
      .map(entry => entry.config);
  }

  /**
   * Get all enabled pre-dispatch hook configs, sorted by priority.
   * YAML hooks are not included — the caller merges these with YAML hooks.
   */
  getPreDispatchHooks(): PreDispatchHookConfig[] {
    return [...this.preDispatchHooks.values()]
      .filter(entry => entry.config.enabled !== false)
      .sort((a, b) => a.priority - b.priority)
      .map(entry => entry.config);
  }

  /**
   * Get descriptors for all registered hooks (for discovery/status reporting).
   */
  listDescriptors(): HookDescriptor[] {
    const descriptors: HookDescriptor[] = [];

    for (const entry of this.postUnitHooks.values()) {
      descriptors.push({
        name: entry.config.name,
        phase: "post-unit",
        source: entry.source,
        packageId: entry.packageId,
        priority: entry.priority,
        enabled: entry.config.enabled !== false,
        targets: entry.config.after,
      });
    }

    for (const entry of this.preDispatchHooks.values()) {
      descriptors.push({
        name: entry.config.name,
        phase: "pre-dispatch",
        source: entry.source,
        packageId: entry.packageId,
        priority: entry.priority,
        enabled: entry.config.enabled !== false,
        targets: entry.config.before,
      });
    }

    return descriptors;
  }

  /** Convert all registered hooks to PrioritizedRule[] for RuleRegistry.listRules(). */
  listRules(): PrioritizedRule[] {
    const rules: PrioritizedRule[] = [];

    for (const entry of this.postUnitHooks.values()) {
      if (entry.config.enabled === false) continue;
      const hook = entry.config;
      rules.push({
        name: hook.name,
        when: "post-unit",
        evaluation: "all-matching",
        where: (unitType: string) => hook.after.includes(unitType),
        then: () => hook,
        description: `Post-unit hook: fires after ${hook.after.join(", ")}`,
        lifecycle: {
          artifact: hook.artifact,
          retry_on: hook.retry_on,
          max_cycles: hook.max_cycles,
        },
        priority: entry.priority,
        source: entry.source,
        packageId: entry.packageId,
      });
    }

    for (const entry of this.preDispatchHooks.values()) {
      if (entry.config.enabled === false) continue;
      const hook = entry.config;
      rules.push({
        name: hook.name,
        when: "pre-dispatch",
        evaluation: "all-matching",
        where: (unitType: string) => hook.before.includes(unitType),
        then: () => hook,
        description: `Pre-dispatch hook: fires before ${hook.before.join(", ")}`,
        priority: entry.priority,
        source: entry.source,
        packageId: entry.packageId,
      });
    }

    return rules;
  }

  /** Number of registered hooks (both types). */
  get size(): number {
    return this.postUnitHooks.size + this.preDispatchHooks.size;
  }
}
