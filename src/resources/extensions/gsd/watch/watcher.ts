// GSD Watch — Chokidar wrapper with single coalescing debounce for .planning/ watching
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";
import { basename } from "node:path";
import { DEBOUNCE_MS } from "./types.js";

/**
 * Start watching the given directory (typically .planning/) for any file or
 * directory changes. Uses a single coalescing debounce so that rapid sequential
 * writes (e.g. during GSD orchestrator execution) produce exactly one callback.
 *
 * @param planningDir - Absolute path to the directory to watch.
 * @param onChanged   - Callback invoked after the debounce period elapses.
 * @returns The chokidar FSWatcher instance — call .close() to stop watching.
 */
export function startPlanningWatcher(
  planningDir: string,
  onChanged: () => void,
): FSWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleRefresh(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChanged();
    }, DEBOUNCE_MS);
  }

  // chokidar v5 changed glob-based `ignored` pattern matching behavior;
  // a function predicate is the reliable approach for all versions.
  // Mirrors the IGNORED_PATTERNS constants defined in types.ts.
  function isIgnored(filePath: string): boolean {
    const base = basename(filePath);
    return (
      base === ".DS_Store" ||
      base === ".gsd-watch.lock" ||
      base.endsWith(".swp") ||
      base.endsWith(".tmp") ||
      base.endsWith("~")
    );
  }

  const watcher = watch(planningDir, {
    ignoreInitial: true,
    ignored: isIgnored,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50,
    },
  });

  watcher.on("add", scheduleRefresh);
  watcher.on("change", scheduleRefresh);
  watcher.on("unlink", scheduleRefresh);
  watcher.on("addDir", scheduleRefresh);
  watcher.on("unlinkDir", scheduleRefresh);

  return watcher;
}
