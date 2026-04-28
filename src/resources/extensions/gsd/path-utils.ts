import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve an existing path through the filesystem, falling back to `resolve()`.
 */
export function canonicalizeExistingPath(path: string): string {
  try {
    // Use native realpath on Windows to resolve 8.3 short paths (e.g. RUNNER~1).
    return process.platform === "win32" ? realpathSync.native(path) : realpathSync(path);
  } catch {
    return resolve(path);
  }
}
