// GSD-2 Single-Writer State Architecture — Sync lock tests

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acquireSyncLock, releaseSyncLock } from "../sync-lock.ts";

describe("sync-lock", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gsd-sync-lock-test-"));
    mkdirSync(join(tempDir, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("acquires lock when none held", () => {
    const result = acquireSyncLock(tempDir);
    assert.equal(result.acquired, true);

    const lockPath = join(tempDir, ".gsd", "sync.lock");
    assert.ok(existsSync(lockPath), "sync.lock must exist after acquire");

    const data = JSON.parse(readFileSync(lockPath, "utf-8"));
    assert.ok(data.pid, "lock file must contain pid");
    assert.ok(data.acquired_at, "lock file must contain acquired_at");
  });

  it("release removes lock file", () => {
    acquireSyncLock(tempDir);
    const lockPath = join(tempDir, ".gsd", "sync.lock");
    assert.ok(existsSync(lockPath), "lock must exist before release");

    releaseSyncLock(tempDir);
    assert.ok(!existsSync(lockPath), "lock must be removed after release");
  });

  it("release is no-op when no lock", () => {
    // Should not throw when called without prior acquire
    assert.doesNotThrow(() => releaseSyncLock(tempDir));
  });

  it("returns false when lock held and not stale", () => {
    // Write a fresh lock file manually (simulating another process)
    const lockPath = join(tempDir, ".gsd", "sync.lock");
    writeFileSync(lockPath, JSON.stringify({
      pid: 999999,
      acquired_at: new Date().toISOString(),
    }));

    // Use short timeout to keep test fast
    const result = acquireSyncLock(tempDir, 100);
    assert.equal(result.acquired, false);
  });

  it("overrides stale lock (mtime > 60s)", () => {
    const lockPath = join(tempDir, ".gsd", "sync.lock");
    writeFileSync(lockPath, JSON.stringify({
      pid: 999999,
      acquired_at: new Date(Date.now() - 120_000).toISOString(),
    }));

    // Set mtime to 120 seconds in the past
    const past = new Date(Date.now() - 120_000);
    utimesSync(lockPath, past, past);

    const result = acquireSyncLock(tempDir);
    assert.equal(result.acquired, true);
  });

  it("lock file contains pid and acquired_at", () => {
    acquireSyncLock(tempDir);

    const lockPath = join(tempDir, ".gsd", "sync.lock");
    const data = JSON.parse(readFileSync(lockPath, "utf-8"));

    assert.equal(data.pid, process.pid);
    assert.ok(typeof data.acquired_at === "string");
    // Verify it's a valid ISO date
    assert.ok(new Date(data.acquired_at).getTime() > 0, "acquired_at must be valid ISO string");
  });
});
