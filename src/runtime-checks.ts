// Runtime dependency checks — pure helpers used by loader.ts.
// Extracted so they can be unit-tested without spawning the full loader.

/**
 * Minimum supported Node.js major version. Kept in sync with
 * `engines.node` in package.json — see test
 * `loader MIN_NODE_MAJOR matches package.json engines field`.
 */
export const MIN_NODE_MAJOR = 22

/**
 * Parse a Node version string (e.g. "22.5.1") and return whether the major
 * version meets the required minimum.
 *
 * Returns `{ ok: true }` when supported, or `{ ok: false, actualMajor }`
 * when below the minimum. Throws if the version string is malformed —
 * callers should treat that as a fatal precondition violation.
 */
export function checkNodeVersion(
  versionString: string,
  min: number = MIN_NODE_MAJOR,
): { ok: true } | { ok: false; actualMajor: number } {
  const major = parseInt(versionString.split('.')[0], 10)
  if (!Number.isFinite(major)) {
    throw new Error(`checkNodeVersion: cannot parse major from "${versionString}"`)
  }
  return major < min ? { ok: false, actualMajor: major } : { ok: true }
}

/**
 * Probe whether `git` is available by invoking the supplied exec function.
 * Returns true on success, false if the exec throws (any reason). The
 * function is injected so tests can substitute a stub without spawning a
 * real subprocess.
 */
export function requireGit(
  execFn: (cmd: string, args: ReadonlyArray<string>) => unknown,
): boolean {
  try {
    execFn('git', ['--version'])
    return true
  } catch {
    return false
  }
}
