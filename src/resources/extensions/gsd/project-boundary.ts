import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { canonicalizeExistingPath } from "./path-utils.js";

/**
 * Normalize a path for equality checks across platforms and trailing slashes.
 */
function normalizedForCompare(path: string): string {
  const resolved = canonicalizeExistingPath(path).replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * Return true when `gsdPath` resolves to the configured global GSD home.
 */
function isGlobalGsdHome(gsdPath: string): boolean {
  const currentGsdHome = process.env.GSD_HOME || join(homedir(), ".gsd");
  const normalizedGsdPath = normalizedForCompare(gsdPath);
  const normalizedGsdHome = normalizedForCompare(currentGsdHome);
  return normalizedGsdPath === normalizedGsdHome;
}

/**
 * Return true when `gsdPath` is a project-local GSD boundary.
 *
 * The global user state directory (`~/.gsd` or `GSD_HOME`) is not a project
 * boundary even when a user's home directory is itself inside a Git repository.
 */
export function isProjectGsdBoundary(gsdPath: string): boolean {
  if (!existsSync(gsdPath)) return false;
  try {
    if (isGlobalGsdHome(gsdPath)) return false;
    return statSync(gsdPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Convert a file path to its containing directory before ancestor searches.
 */
function normalizeStartPath(path: string): string {
  try {
    if (existsSync(path) && !statSync(path).isDirectory()) {
      return resolve(path, "..");
    }
  } catch {
    // Non-fatal: fall back to the input path.
  }
  return path;
}

/**
 * Resolve the containing Git toplevel for `basePath`, or null outside Git.
 */
function resolveGitToplevel(basePath: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: basePath,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
    return out ? canonicalizeExistingPath(out) : null;
  } catch {
    return null;
  }
}

/**
 * Find the nearest ancestor, including `basePath`, that owns a project-local
 * `.gsd/` directory. The search is bounded by the containing Git toplevel when
 * one exists, so unrelated parent directories cannot accidentally capture a
 * project running outside a repository.
 */
export function findNearestGsdProjectRoot(basePath: string): string | null {
  let dir = canonicalizeExistingPath(normalizeStartPath(basePath));
  const gitRoot = resolveGitToplevel(dir);
  const stopAt = gitRoot ? normalizedForCompare(gitRoot) : null;

  for (let i = 0; i < 100; i++) {
    if (isProjectGsdBoundary(join(dir, ".gsd"))) return dir;
    if (stopAt && normalizedForCompare(dir) === stopAt) break;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Compute a path that is stable inside a Git repository and useful for
 * distinguishing explicit subprojects that share the same remote URL.
 */
export function gitRelativeProjectPath(projectRoot: string, gitRoot: string): string {
  const rel = relative(canonicalizeExistingPath(gitRoot), canonicalizeExistingPath(projectRoot));
  return rel === "" ? "." : rel.replaceAll("\\", "/");
}
