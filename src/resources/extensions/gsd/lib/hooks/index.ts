// GSD Extension — Hooks Library Public API

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  HookSource,
  PrioritizedRule,
  RegisterPostUnitHookOptions,
  RegisterPreDispatchHookOptions,
  HookDescriptor,
  HookPackageManifest,
  CommunityLoadResult,
} from "./hook-types.js";

export { HOOK_MANIFEST_VERSION } from "./hook-types.js";

// ─── Core ─────────────────────────────────────────────────────────────────────

export { ProgrammaticHookStore } from "./programmatic-store.js";
export { sortByPriority } from "./priority-sort.js";
export { composePreDispatchMiddleware } from "./middleware.js";
export type { SubstitutionContext } from "./middleware.js";

// ─── Community ────────────────────────────────────────────────────────────────

export { loadCommunityHooks } from "./community-loader.js";

// ─── Discovery ────────────────────────────────────────────────────────────────

export { discoverHooks, formatDiscoveredHooks } from "./hook-discovery.js";
