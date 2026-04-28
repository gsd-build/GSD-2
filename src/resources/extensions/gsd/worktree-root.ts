import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { findNearestGsdProjectRoot } from "./project-boundary.js";

export interface WorktreeSegment {
  gsdIdx: number;
  afterWorktrees: number;
}

export function normalizeWorktreePathForCompare(path: string): string {
  let normalized: string;
  try {
    normalized = realpathSync(path);
  } catch {
    normalized = resolve(path);
  }
  const slashed = normalized.replaceAll("\\", "/");
  const trimmed = slashed.replace(/\/+$/, "");
  return process.platform === "win32" ? (trimmed || "/").toLowerCase() : (trimmed || "/");
}

/**
 * Find the GSD worktree segment in both direct project layout and the
 * symlink-resolved external-state layout used by ~/.gsd/projects/<hash>.
 */
export function findWorktreeSegment(normalizedPath: string): WorktreeSegment | null {
  const directMarker = "/.gsd/worktrees/";
  const directIdx = normalizedPath.indexOf(directMarker);
  if (directIdx !== -1) {
    return { gsdIdx: directIdx, afterWorktrees: directIdx + directMarker.length };
  }

  const externalRe = /\/\.gsd\/projects\/[^/]+\/worktrees\//;
  const externalMatch = normalizedPath.match(externalRe);
  if (externalMatch && externalMatch.index !== undefined) {
    return {
      gsdIdx: externalMatch.index,
      afterWorktrees: externalMatch.index + externalMatch[0].length,
    };
  }

  return null;
}

export function isGsdWorktreePath(path: string): boolean {
  return findWorktreeSegment(path.replaceAll("\\", "/")) !== null;
}

/**
 * Resolve the canonical project root for worktree operations.
 *
 * `originalBasePath` wins when available because session state already knows the
 * root. `GSD_PROJECT_ROOT` is the next strongest signal for worker processes.
 * Otherwise, derive the root from direct `.gsd/worktrees` paths, or recover it
 * from the worktree `.git` file for symlink-resolved ~/.gsd/project paths.
 */
export function resolveWorktreeProjectRoot(
  basePath: string,
  originalBasePath?: string | null,
): string {
  const preferred =
    originalBasePath?.trim() ||
    process.env.GSD_PROJECT_ROOT?.trim() ||
    basePath;

  return resolveProjectRootFromPath(preferred);
}

function resolveProjectRootFromPath(path: string): string {
  const normalizedPath = path.replaceAll("\\", "/");
  const segment = findWorktreeSegment(normalizedPath);
  if (!segment) {
    return findNearestGsdProjectRoot(path) ?? resolveGitWorkingTreeRoot(path) ?? path;
  }

  const sepChar = path.includes("\\") ? "\\" : "/";
  const gsdMarker = `${sepChar}.gsd${sepChar}`;
  const markerIdx = path.indexOf(gsdMarker);
  const candidate = markerIdx !== -1
    ? path.slice(0, markerIdx)
    : path.slice(0, segment.gsdIdx);

  const gsdHome = normalizeWorktreePathForCompare(process.env.GSD_HOME || join(homedir(), ".gsd"));
  const candidateGsdPath = normalizeWorktreePathForCompare(join(candidate, ".gsd"));

  if (candidateGsdPath === gsdHome || candidateGsdPath.startsWith(`${gsdHome}/`)) {
    const realRoot = resolveProjectRootFromGitFile(path);
    return realRoot ?? path;
  }

  return candidate;
}

function resolveGitWorkingTreeRoot(path: string): string | null {
  try {
    let dir = existsSync(path) && !statSync(path).isDirectory()
      ? resolve(path, "..")
      : path;

    for (let i = 0; i < 30; i++) {
      const gitPath = join(dir, ".git");
      if (existsSync(gitPath)) return dir;

      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Non-fatal: callers either keep the original path or fail closed.
  }
  return null;
}

function resolveProjectRootFromGitFile(worktreePath: string): string | null {
  try {
    let dir = worktreePath;
    for (let i = 0; i < 30; i++) {
      const gitPath = join(dir, ".git");
      if (existsSync(gitPath)) {
        const content = readFileSync(gitPath, "utf8").trim();
        if (content.startsWith("gitdir: ")) {
          const gitDir = resolve(dir, content.slice(8));
          const dotGitDir = resolve(gitDir, "..", "..");
          if (dotGitDir.endsWith(".git") || dotGitDir.endsWith(".git/") || dotGitDir.endsWith(".git\\")) {
            return resolve(dotGitDir, "..");
          }

          const commonDirPath = join(gitDir, "commondir");
          if (existsSync(commonDirPath)) {
            const commonDir = readFileSync(commonDirPath, "utf8").trim();
            const resolvedCommonDir = resolve(gitDir, commonDir);
            return resolve(resolvedCommonDir, "..");
          }
        }
        break;
      }

      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Non-fatal: callers either keep the original path or fail closed.
  }
  return null;
}
