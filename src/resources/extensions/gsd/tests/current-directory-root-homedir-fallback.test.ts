/**
 * Regression test — currentDirectoryRoot() uses os.homedir() as fallback
 * when process.cwd() throws (e.g. worktree teardown deletes the cwd).
 *
 * Before the fix, the catch block used `process.env.HOME ?? "/"`. On
 * Windows, HOME is typically unset so this resolved to "/", an invalid
 * path. After the fix, os.homedir() is used — it checks USERPROFILE,
 * HOMEDRIVE+HOMEPATH, etc., returning a valid path on all platforms.
 *
 * The test monkey-patches process.cwd() to throw ENOENT, simulating a
 * deleted cwd. currentDirectoryRoot() must NOT propagate the raw error;
 * instead it falls back to homedir(), which validateDirectory correctly
 * rejects as "blocked", yielding GSDNoProjectError — the same controlled
 * error path handlers already know how to catch.
 *
 * The error message is also asserted to match validateDirectory(homedir()),
 * confirming the fallback resolved to homedir() specifically (not "/" or
 * any other path).
 */
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";

import { currentDirectoryRoot, GSDNoProjectError } from "../commands/context.ts";
import { validateDirectory } from "../validate-directory.ts";

describe("currentDirectoryRoot() homedir() fallback on deleted cwd", () => {
  const originalCwd = process.cwd.bind(process);

  beforeEach(() => {
    process.cwd = () => {
      const err = new Error("ENOENT: no such file or directory, uv_cwd");
      (err as NodeJS.ErrnoException).code = "ENOENT";
      throw err;
    };
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  test("does not propagate ENOENT — throws GSDNoProjectError via homedir() fallback", () => {
    const expected = validateDirectory(homedir());
    assert.equal(expected.severity, "blocked", "homedir() itself should be blocked");

    assert.throws(
      () => currentDirectoryRoot(),
      (err: unknown) => {
        assert.ok(
          err instanceof GSDNoProjectError,
          `expected GSDNoProjectError, got: ${err}`,
        );
        assert.equal(
          (err as Error).message,
          expected.reason ?? "GSD must be run inside a project directory.",
          "error message must match validateDirectory(homedir()), confirming homedir() was the fallback",
        );
        return true;
      },
      "should throw GSDNoProjectError (homedir fallback validated), not raw ENOENT",
    );
  });
});
