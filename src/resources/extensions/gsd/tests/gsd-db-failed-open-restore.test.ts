// GSD-2 + gsd-db failed-open restore: previous workspace connection survives a failed openDatabaseByWorkspace

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  openDatabase,
  openDatabaseByWorkspace,
  closeDatabase,
  isDbAvailable,
  getDbPath,
  _getDbCache,
} from "../gsd-db.ts";
import { createWorkspace } from "../workspace.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(base: string): string {
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("openDatabaseByWorkspace: restores previous connection on failure", () => {
  let tmpA: string;
  let tmpB: string;

  beforeEach(() => {
    tmpA = mkdtempSync(join(tmpdir(), "gsd-db-restore-a-"));
    tmpB = mkdtempSync(join(tmpdir(), "gsd-db-restore-b-"));
    makeProjectDir(tmpA);
    makeProjectDir(tmpB);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmpA, { recursive: true, force: true });
    rmSync(tmpB, { recursive: true, force: true });
  });

  test("previous workspace connection stays active after failed switch to non-existent path", () => {
    // Open workspace A successfully
    const wsA = createWorkspace(tmpA);
    const openedA = openDatabaseByWorkspace(wsA);
    assert.ok(openedA, "opening workspace A should succeed");
    assert.ok(isDbAvailable(), "DB should be available after opening A");

    const pathAfterA = getDbPath();
    assert.ok(pathAfterA, "should have a DB path after opening A");

    // Attempt to open a workspace pointing to a completely non-existent directory
    // ("/does-not-exist-gsd-test" cannot be created), which will cause openDatabase to throw.
    const fakeWs = {
      identityKey: "fake-key-that-does-not-exist",
      projectRoot: "/does-not-exist-gsd-test-ws-restore",
      worktreeRoot: null,
      mode: "project" as const,
      contract: {
        projectRoot: "/does-not-exist-gsd-test-ws-restore",
        projectGsd: "/does-not-exist-gsd-test-ws-restore/.gsd",
        projectDb: "/does-not-exist-gsd-test-ws-restore/.gsd/does-not-exist.db",
        worktreeRoot: null,
        worktreeGsd: null,
      },
      lockRoot: "/does-not-exist-gsd-test-ws-restore",
    };

    // This should throw because the path is invalid
    assert.throws(
      () => openDatabaseByWorkspace(fakeWs),
      (err: Error) => err instanceof Error,
    );

    // After the failure, the previous workspace A connection must be restored
    assert.ok(isDbAvailable(), "DB must still be available (workspace A connection restored)");
    const pathAfterFailure = getDbPath();
    assert.equal(pathAfterFailure, pathAfterA, "DB path must match workspace A's path after failed switch");
  });

  test("cache still contains workspace A entry after failed switch", () => {
    const wsA = createWorkspace(tmpA);
    openDatabaseByWorkspace(wsA);

    const fakeWs = {
      identityKey: "fake-key-cache-test",
      projectRoot: "/does-not-exist-gsd-cache-test",
      worktreeRoot: null,
      mode: "project" as const,
      contract: {
        projectRoot: "/does-not-exist-gsd-cache-test",
        projectGsd: "/does-not-exist-gsd-cache-test/.gsd",
        projectDb: "/does-not-exist-gsd-cache-test/.gsd/no.db",
        worktreeRoot: null,
        worktreeGsd: null,
      },
      lockRoot: "/does-not-exist-gsd-cache-test",
    };

    assert.throws(() => openDatabaseByWorkspace(fakeWs));

    // Workspace A's connection is back as the active connection; switching back
    // should succeed from cache (cache hit path) without re-opening.
    const reopened = openDatabaseByWorkspace(wsA);
    assert.ok(reopened, "switching back to workspace A should succeed from cache");
    assert.ok(isDbAvailable(), "DB should be available after re-activating A");
  });
});
