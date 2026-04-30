// GSD MCP Server — .gsd/ directory resolution

import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------
//
// Read-only MCP tools (gsd_progress, gsd_roadmap, gsd_doctor, …) hammer the
// filesystem on every call: gsd_roadmap alone resolves milestone directories
// 5–6× per milestone, and resolveGsdRoot can spawn `git rev-parse` for
// non-direct .gsd/ layouts. Without caching, an MCP host pipelining several
// tool calls blocks the event loop on dozens of redundant readdir/stat
// syscalls per request.
//
// Two layers:
//   * resolveGsdRoot — short TTL (the result depends on a possibly-expensive
//     git subprocess; projectDir is stable for the life of an MCP session).
//   * readdir-backed lookups — keyed on the directory's mtime, so any add/
//     remove/rename invalidates the cache automatically.

const GSD_ROOT_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 256;
const gsdRootCache = new Map<string, { value: string; expiresAt: number }>();

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, value: V): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function cachedGsdRoot(projectDir: string): string | null {
  const hit = gsdRootCache.get(projectDir);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    gsdRootCache.delete(projectDir);
    return null;
  }
  setBoundedCache(gsdRootCache, projectDir, hit);
  return hit.value;
}

function rememberGsdRoot(projectDir: string, value: string): void {
  setBoundedCache(gsdRootCache, projectDir, { value, expiresAt: Date.now() + GSD_ROOT_TTL_MS });
}

interface MtimeEntry<V> { mtimeMs: number; value: V }

/**
 * Read-through cache keyed on a directory path's mtime. Returns the cached
 * value if the directory's mtime is unchanged since the last write; otherwise
 * runs `compute` and stores the new result. Misses on read errors (ENOENT,
 * EACCES) are cached via `compute`'s own return value, but the cache entry
 * is dropped if the directory disappears later.
 */
function readWithMtimeCache<V>(
  cache: Map<string, MtimeEntry<V>>,
  cacheKey: string,
  dir: string,
  compute: () => V,
  cloneForStore: (value: V) => V = (value) => value,
  cloneForReturn: (value: V) => V = (value) => value,
): V {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(dir).mtimeMs;
  } catch {
    cache.delete(cacheKey);
    return compute();
  }
  const hit = cache.get(cacheKey);
  if (hit && hit.mtimeMs === mtimeMs) {
    setBoundedCache(cache, cacheKey, hit);
    return cloneForReturn(hit.value);
  }
  const value = cloneForStore(compute());
  setBoundedCache(cache, cacheKey, { mtimeMs, value });
  return cloneForReturn(value);
}

const milestoneIdsCache = new Map<string, MtimeEntry<string[]>>();
const milestoneDirCache = new Map<string, MtimeEntry<string | null>>();
const sliceIdsCache = new Map<string, MtimeEntry<string[]>>();
const sliceDirCache = new Map<string, MtimeEntry<string | null>>();
const taskFilesCache = new Map<string, MtimeEntry<Array<{ id: string; hasPlan: boolean; hasSummary: boolean }>>>();

function cloneStringArray(value: string[]): string[] {
  return Array.from(value);
}

function cloneTaskFiles(
  value: Array<{ id: string; hasPlan: boolean; hasSummary: boolean }>,
): Array<{ id: string; hasPlan: boolean; hasSummary: boolean }> {
  return value.map((task) => ({ ...task }));
}

/** @internal — exported for testing only */
export function _resetReaderCaches(): void {
  gsdRootCache.clear();
  milestoneIdsCache.clear();
  milestoneDirCache.clear();
  sliceIdsCache.clear();
  sliceDirCache.clear();
  taskFilesCache.clear();
}

/**
 * Resolve the .gsd/ root directory for a project.
 *
 * Probes in order:
 *   1. projectDir/.gsd (fast path)
 *   2. git repo root/.gsd
 *   3. Walk up from projectDir
 *   4. Fallback: projectDir/.gsd (even if missing — for init)
 */
export function resolveGsdRoot(projectDir: string): string {
  const resolved = resolve(projectDir);

  const cached = cachedGsdRoot(resolved);
  if (cached) return cached;

  // Fast path: .gsd/ in the given directory
  const direct = join(resolved, '.gsd');
  if (existsSync(direct) && statSync(direct).isDirectory()) {
    rememberGsdRoot(resolved, direct);
    return direct;
  }

  // Try git repo root
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: resolved,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const gitGsd = join(gitRoot, '.gsd');
    if (existsSync(gitGsd) && statSync(gitGsd).isDirectory()) {
      rememberGsdRoot(resolved, gitGsd);
      return gitGsd;
    }
  } catch {
    // Not a git repo or git not available
  }

  // Walk up from projectDir
  let dir = resolved;
  while (dir !== dirname(dir)) {
    const candidate = join(dir, '.gsd');
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      rememberGsdRoot(resolved, candidate);
      return candidate;
    }
    dir = dirname(dir);
  }

  // Fallback — don't cache so that an init() call right after this is seen.
  return direct;
}

/** Resolve path to a .gsd/ root file (STATE.md, KNOWLEDGE.md, etc.) */
export function resolveRootFile(gsdRoot: string, name: string): string {
  return join(gsdRoot, name);
}

/** Resolve path to milestones directory */
export function milestonesDir(gsdRoot: string): string {
  return join(gsdRoot, 'milestones');
}

/**
 * Find all milestone directory IDs (M001, M002, etc.).
 * Handles both bare (M001/) and descriptor (M001-FLIGHT-SIM/) naming.
 */
export function findMilestoneIds(gsdRoot: string): string[] {
  const dir = milestonesDir(gsdRoot);
  if (!existsSync(dir)) return [];

  return readWithMtimeCache(milestoneIdsCache, dir, dir, () => {
    const entries = readdirSync(dir, { withFileTypes: true });
    const ids: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^(M\d+)/);
      if (match) ids.push(match[1]);
    }
    return ids.sort();
  }, cloneStringArray, cloneStringArray);
}

/**
 * Resolve the actual directory name for a milestone ID.
 * M001 might live in M001/ or M001-SOME-DESCRIPTOR/.
 */
export function resolveMilestoneDir(gsdRoot: string, milestoneId: string): string | null {
  const dir = milestonesDir(gsdRoot);
  if (!existsSync(dir)) return null;

  return readWithMtimeCache(milestoneDirCache, `${dir} ${milestoneId}`, dir, () => {
    // Fast path: exact match
    const exact = join(dir, milestoneId);
    if (existsSync(exact) && statSync(exact).isDirectory()) return exact;

    // Prefix match
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(milestoneId)) {
        return join(dir, entry.name);
      }
    }

    return null;
  });
}

/**
 * Resolve a milestone-level file (M001-ROADMAP.md, M001-CONTEXT.md, etc.).
 * Handles various naming conventions.
 */
export function resolveMilestoneFile(gsdRoot: string, milestoneId: string, suffix: string): string | null {
  const mDir = resolveMilestoneDir(gsdRoot, milestoneId);
  if (!mDir) return null;

  const dirName = basename(mDir);

  // Try: M001-ROADMAP.md, then DIRNAME-ROADMAP.md
  const candidates = [
    join(mDir, `${milestoneId}-${suffix}.md`),
    join(mDir, `${dirName}-${suffix}.md`),
    join(mDir, `${suffix}.md`),
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Find all slice IDs within a milestone (S01, S02, etc.) */
export function findSliceIds(gsdRoot: string, milestoneId: string): string[] {
  const mDir = resolveMilestoneDir(gsdRoot, milestoneId);
  if (!mDir) return [];

  const slicesDir = join(mDir, 'slices');
  if (!existsSync(slicesDir)) return [];

  return readWithMtimeCache(sliceIdsCache, slicesDir, slicesDir, () => {
    const entries = readdirSync(slicesDir, { withFileTypes: true });
    const ids: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^(S\d+)/);
      if (match) ids.push(match[1]);
    }
    return ids.sort();
  }, cloneStringArray, cloneStringArray);
}

/** Resolve the actual directory for a slice */
export function resolveSliceDir(gsdRoot: string, milestoneId: string, sliceId: string): string | null {
  const mDir = resolveMilestoneDir(gsdRoot, milestoneId);
  if (!mDir) return null;

  const slicesDir = join(mDir, 'slices');
  if (!existsSync(slicesDir)) return null;

  return readWithMtimeCache(sliceDirCache, `${slicesDir} ${sliceId}`, slicesDir, () => {
    const exact = join(slicesDir, sliceId);
    if (existsSync(exact) && statSync(exact).isDirectory()) return exact;

    const entries = readdirSync(slicesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(sliceId)) {
        return join(slicesDir, entry.name);
      }
    }
    return null;
  });
}

/** Resolve a slice-level file (S01-PLAN.md, etc.) */
export function resolveSliceFile(
  gsdRoot: string, milestoneId: string, sliceId: string, suffix: string,
): string | null {
  const sDir = resolveSliceDir(gsdRoot, milestoneId, sliceId);
  if (!sDir) return null;

  const dirName = basename(sDir);
  const candidates = [
    join(sDir, `${sliceId}-${suffix}.md`),
    join(sDir, `${dirName}-${suffix}.md`),
    join(sDir, `${suffix}.md`),
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Find all task files in a slice's tasks/ directory */
export function findTaskFiles(
  gsdRoot: string, milestoneId: string, sliceId: string,
): Array<{ id: string; hasPlan: boolean; hasSummary: boolean }> {
  const sDir = resolveSliceDir(gsdRoot, milestoneId, sliceId);
  if (!sDir) return [];

  const tasksDir = join(sDir, 'tasks');
  if (!existsSync(tasksDir)) return [];

  return readWithMtimeCache(taskFilesCache, tasksDir, tasksDir, () => {
    const files = readdirSync(tasksDir);
    const taskMap = new Map<string, { hasPlan: boolean; hasSummary: boolean }>();

    for (const f of files) {
      const match = f.match(/^(T\d+).*-(PLAN|SUMMARY)\.md$/i);
      if (!match) continue;
      const [, id, type] = match;
      const existing = taskMap.get(id) ?? { hasPlan: false, hasSummary: false };
      if (type.toUpperCase() === 'PLAN') existing.hasPlan = true;
      if (type.toUpperCase() === 'SUMMARY') existing.hasSummary = true;
      taskMap.set(id, existing);
    }

    return Array.from(taskMap.entries())
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, cloneTaskFiles, cloneTaskFiles);
}
