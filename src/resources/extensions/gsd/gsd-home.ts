/**
 * GSD home directory resolution.
 *
 * Exports gsdHome() which returns the GSD configuration directory,
 * defaulting to ~/.gsd with a GSD_HOME env var override.
 *
 * For the user's home directory, use os.homedir() directly — it handles
 * platform-specific env lookup (USERPROFILE on Windows, HOME on POSIX)
 * with appropriate fallbacks.
 *
 * @see https://github.com/gsd-build/gsd-2/issues/5015
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Resolve the GSD home directory (typically ~/.gsd).
 *
 * `GSD_HOME` env var overrides the default location.
 * Falls back to `homedir()/.gsd`.
 *
 * Always returns an absolute, normalized path — `resolve()` canonicalizes
 * any relative or non-canonical `GSD_HOME` value so downstream comparison
 * and redaction sites don't have to.
 */
export function gsdHome(): string {
  return process.env.GSD_HOME
    ? resolve(process.env.GSD_HOME)
    : join(homedir(), ".gsd");
}
