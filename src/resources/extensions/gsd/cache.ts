// GSD Extension — Unified Cache Invalidation
//
// Three module-scoped caches exist across the GSD extension:
//   1. State cache (state.ts)  — memoized deriveState() result
//   2. Path cache  (paths.ts)  — directory listing results (readdirSync)
//   3. Parse cache (files.ts)  — parsed markdown file results
//
// After any file write that changes .gsd/ contents, all three must be
// invalidated together to prevent stale reads. This module provides a
// single function that clears all three atomically.
//
// Performance: The auto-loop pre-dispatch used to call invalidateAllCaches()
// unconditionally every iteration, defeating the state cache TTL. Now it calls
// invalidateAllCachesIfDirty(), which only clears when a write path has
// previously called invalidateAllCaches() (setting _dirty = false would
// mean "clean"), but starts dirty (true) so the first iteration derives fresh.
//
// Design: invalidateAllCaches() clears all caches and sets _dirty = false
// (caches are now fresh/empty). The dirty flag starts as true and is set to
// true by markCachesDirty() for any external write path that doesn't call
// invalidateAllCaches() itself. Most write paths (post-unit, milestone
// transitions, error recovery) call invalidateAllCaches() directly, which
// is sufficient. Error recovery uses the unconditional invalidateAllCaches()
// as a safety net.

import { invalidateStateCache } from './state.js';
import { clearPathCache } from './paths.js';
import { clearParseCache } from './files.js';
import { clearArtifacts } from './gsd-db.js';
import { debugCount } from './debug-logger.js';

// Dirty flag — starts true so the first iteration always derives fresh state.
let _dirty = true;

/**
 * Mark caches as dirty so the next invalidateAllCachesIfDirty() call will
 * actually clear them. Call this on all write paths (post-unit, milestone
 * transitions, merge reconciliation, error recovery).
 */
export function markCachesDirty(): void {
  _dirty = true;
}

/**
 * Invalidate all GSD runtime caches in one call.
 *
 * Call this after file writes, milestone transitions, merge reconciliation,
 * or any operation that changes .gsd/ contents on disk. Forgetting to clear
 * any single cache causes stale reads (see #431, #793).
 */
export function invalidateAllCaches(): void {
  invalidateStateCache();
  clearPathCache();
  clearParseCache();
  clearArtifacts();
  _dirty = false;
  debugCount("cacheInvalidations");
}

/**
 * Conditionally invalidate all caches — only if a write path has called
 * markCachesDirty() since the last invalidation. Use this in the auto-loop
 * pre-dispatch to avoid destroying caches when nothing has changed.
 *
 * Returns true if caches were actually invalidated.
 */
export function invalidateAllCachesIfDirty(): boolean {
  if (!_dirty) {
    debugCount("cacheSkips");
    return false;
  }
  invalidateAllCaches();
  return true;
}
