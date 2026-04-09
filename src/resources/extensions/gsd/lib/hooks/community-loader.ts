// GSD Extension — Community Hook Package Loader

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { logWarning } from "../../workflow-logger.js";
import type { ProgrammaticHookStore } from "./programmatic-store.js";
import type { HookPackageManifest, CommunityLoadResult } from "./hook-types.js";
import { HOOK_MANIFEST_VERSION } from "./hook-types.js";

const MANIFEST_FILE = "hooks-manifest.json";

// ─── Manifest Validation ──────────────────────────────────────────────────────

/**
 * Validate a raw parsed object against the HookPackageManifest schema.
 * Returns null if valid, or an error message describing the first validation failure.
 */
function validateManifest(raw: unknown, filePath: string): string | null {
  if (!raw || typeof raw !== "object") {
    return `${filePath}: manifest must be a JSON object`;
  }

  const manifest = raw as Record<string, unknown>;

  if (manifest.version !== HOOK_MANIFEST_VERSION) {
    return `${filePath}: unsupported manifest version ${manifest.version} (expected ${HOOK_MANIFEST_VERSION})`;
  }

  if (typeof manifest.id !== "string" || manifest.id.trim().length === 0) {
    return `${filePath}: "id" must be a non-empty string`;
  }

  if (typeof manifest.name !== "string" || manifest.name.trim().length === 0) {
    return `${filePath}: "name" must be a non-empty string`;
  }

  if (typeof manifest.packageVersion !== "string") {
    return `${filePath}: "packageVersion" must be a string`;
  }

  // Validate hook arrays if present
  if (manifest.postUnitHooks !== undefined && !Array.isArray(manifest.postUnitHooks)) {
    return `${filePath}: "postUnitHooks" must be an array`;
  }

  if (manifest.preDispatchHooks !== undefined && !Array.isArray(manifest.preDispatchHooks)) {
    return `${filePath}: "preDispatchHooks" must be an array`;
  }

  return null;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Discover hook package directories containing hooks-manifest.json.
 * Scans immediate subdirectories of the given search paths.
 *
 * Security: resolved paths are verified to stay within the search root
 * to prevent directory traversal via malicious package IDs.
 */
function discoverManifestPaths(searchPaths: string[]): string[] {
  const found: string[] = [];

  for (const searchRoot of searchPaths) {
    if (!existsSync(searchRoot)) continue;

    let entries: string[];
    try {
      entries = readdirSync(searchRoot, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch {
      continue;
    }

    const resolvedRoot = realpathSync(searchRoot);

    for (const dirName of entries) {
      const packageDir = resolve(searchRoot, dirName);
      // Security: ensure resolved path stays within search root (follows symlinks)
      try {
        const realPackageDir = realpathSync(packageDir);
        if (!realPackageDir.startsWith(resolvedRoot + sep)) continue;
      } catch {
        continue; // broken symlink or permission error
      }

      const manifestPath = join(packageDir, MANIFEST_FILE);
      if (existsSync(manifestPath)) {
        found.push(manifestPath);
      }
    }
  }

  return found;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load community hook packages and register their hooks into the store.
 *
 * Scans for hooks-manifest.json in:
 * - ~/.gsd/extensions/   (user-installed packages)
 * - <basePath>/.gsd/hooks/  (project-local packages)
 *
 * Each package directory must contain a hooks-manifest.json conforming to
 * HookPackageManifest. Individual package failures are logged and collected
 * as errors — they never crash the loader.
 *
 * @param store - The programmatic hook store to register hooks into
 * @param basePath - Project root for resolving project-local hooks
 */
export function loadCommunityHooks(store: ProgrammaticHookStore, basePath: string): CommunityLoadResult {
  const homedir = process.env.HOME ?? process.env.USERPROFILE ?? "";

  // User-installed packages (~/.gsd/extensions/) are always trusted.
  // Project-local packages (<basePath>/.gsd/hooks/) require explicit opt-in
  // via GSD_ENABLE_PROJECT_HOOKS=true to prevent untrusted repos from
  // injecting hooks into the dispatch flow.
  const searchPaths = [
    join(homedir, ".gsd", "extensions"),
  ];

  if (process.env.GSD_ENABLE_PROJECT_HOOKS === "true") {
    searchPaths.push(join(basePath, ".gsd", "hooks"));
  }

  const result: CommunityLoadResult = {
    loaded: 0,
    hooksRegistered: 0,
    errors: [],
  };

  const manifestPaths = discoverManifestPaths(searchPaths);

  for (const manifestPath of manifestPaths) {
    try {
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));

      const validationError = validateManifest(raw, manifestPath);
      if (validationError) {
        result.errors.push({ packagePath: manifestPath, error: validationError });
        logWarning("registry", validationError);
        continue;
      }

      const manifest = raw as HookPackageManifest;
      let hookCount = 0;

      // Register post-unit hooks
      if (manifest.postUnitHooks) {
        for (const hookOpts of manifest.postUnitHooks) {
          try {
            store.registerPostUnit(
              { ...hookOpts, packageId: manifest.id },
              "community",
            );
            hookCount++;
          } catch (e) {
            const msg = `${manifestPath}: failed to register post-unit hook "${hookOpts.name}": ${(e as Error).message}`;
            result.errors.push({ packagePath: manifestPath, error: msg });
            logWarning("registry", msg);
          }
        }
      }

      // Register pre-dispatch hooks
      if (manifest.preDispatchHooks) {
        for (const hookOpts of manifest.preDispatchHooks) {
          try {
            store.registerPreDispatch(
              { ...hookOpts, packageId: manifest.id },
              "community",
            );
            hookCount++;
          } catch (e) {
            const msg = `${manifestPath}: failed to register pre-dispatch hook "${hookOpts.name}": ${(e as Error).message}`;
            result.errors.push({ packagePath: manifestPath, error: msg });
            logWarning("registry", msg);
          }
        }
      }

      result.loaded++;
      result.hooksRegistered += hookCount;
    } catch (e) {
      const msg = `${manifestPath}: failed to load manifest: ${(e as Error).message}`;
      result.errors.push({ packagePath: manifestPath, error: msg });
      logWarning("registry", msg);
    }
  }

  return result;
}
