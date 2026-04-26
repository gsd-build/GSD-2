// GSD Extension — sync-lock unit tests
// Tests acquireSyncLock() and releaseSyncLock().

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { acquireSyncLock, releaseSyncLock } from '../sync-lock.ts';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-sync-lock-'));
}

function cleanupDir(dirPath: string): void {
  try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ─── acquireSyncLock ─────────────────────────────────────────────────────

test('sync-lock: acquireSyncLock returns { acquired: true } when no lock exists', () => {
  const base = tempDir();
  fs.mkdirSync(path.join(base, '.gsd'), { recursive: true });
  try {
    const result = acquireSyncLock(base);
    assert.strictEqual(result.acquired, true);
  } finally {
    cleanupDir(base);
  }
});

test('sync-lock: acquireSyncLock creates lock file at .gsd/sync.lock', () => {
  const base = tempDir();
  fs.mkdirSync(path.join(base, '.gsd'), { recursive: true });
  try {
    acquireSyncLock(base);
    const lockPath = path.join(base, '.gsd', 'sync.lock');
    assert.ok(fs.existsSync(lockPath), 'sync.lock should exist after acquire');
  } finally {
    cleanupDir(base);
  }
});

test('sync-lock: lock file contains pid and acquired_at fields', () => {
  const base = tempDir();
  fs.mkdirSync(path.join(base, '.gsd'), { recursive: true });
  try {
    acquireSyncLock(base);
    const lockPath = path.join(base, '.gsd', 'sync.lock');
    const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    assert.strictEqual(typeof content.pid, 'number');
    assert.strictEqual(typeof content.acquired_at, 'string');
  } finally {
    cleanupDir(base);
  }
});

// ─── releaseSyncLock ─────────────────────────────────────────────────────

test('sync-lock: releaseSyncLock removes lock file', () => {
  const base = tempDir();
  fs.mkdirSync(path.join(base, '.gsd'), { recursive: true });
  try {
    acquireSyncLock(base);
    const lockPath = path.join(base, '.gsd', 'sync.lock');
    assert.ok(fs.existsSync(lockPath), 'lock file should exist before release');
    releaseSyncLock(base);
    assert.ok(!fs.existsSync(lockPath), 'lock file should not exist after release');
  } finally {
    cleanupDir(base);
  }
});

test('sync-lock: releaseSyncLock is a no-op when no lock file exists', () => {
  const base = tempDir();
  fs.mkdirSync(path.join(base, '.gsd'), { recursive: true });
  try {
    // Should not throw
    releaseSyncLock(base);
  } finally {
    cleanupDir(base);
  }
});

// ─── acquire → release → re-acquire round-trip ───────────────────────────

test('sync-lock: can re-acquire after release', () => {
  const base = tempDir();
  fs.mkdirSync(path.join(base, '.gsd'), { recursive: true });
  try {
    const r1 = acquireSyncLock(base);
    assert.strictEqual(r1.acquired, true, 'first acquire should succeed');
    releaseSyncLock(base);
    const r2 = acquireSyncLock(base);
    assert.strictEqual(r2.acquired, true, 're-acquire after release should succeed');
    releaseSyncLock(base);
  } finally {
    cleanupDir(base);
  }
});

// ─── stale lock override ─────────────────────────────────────────────────

test('sync-lock: overrides stale lock file (mtime backdated)', (t) => {
  const base = tempDir();
  fs.mkdirSync(path.join(base, '.gsd'), { recursive: true });
  const lockPath = path.join(base, '.gsd', 'sync.lock');
  try {
    // Write a lock file with a very old mtime (simulating staleness)
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999, acquired_at: new Date(0).toISOString() }));
    // Backdate mtime by 2 minutes
    const staleTime = new Date(Date.now() - 120_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    // Should override stale lock and acquire
    const result = acquireSyncLock(base, 500);
    assert.strictEqual(result.acquired, true, 'should acquire over stale lock');
    releaseSyncLock(base);
  } finally {
    cleanupDir(base);
  }
});

test('sync-lock: EPERM from live owner PID prevents stale lock stealing', () => {
  const base = tempDir();
  fs.mkdirSync(path.join(base, '.gsd'), { recursive: true });
  const lockPath = path.join(base, '.gsd', 'sync.lock');
  const fakePid = process.pid + 100_000;
  const originalKill = process.kill;

  try {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: fakePid, acquired_at: new Date(0).toISOString() }));
    const staleTime = new Date(Date.now() - 120_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === fakePid && signal === 0) {
        const err = new Error('operation not permitted') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      }
      return originalKill(pid, signal);
    }) as typeof process.kill;

    const result = acquireSyncLock(base, 100);
    assert.strictEqual(result.acquired, false, 'EPERM owner should be treated as live');
    const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    assert.strictEqual(content.pid, fakePid, 'lock file should not be overwritten');
  } finally {
    process.kill = originalKill;
    cleanupDir(base);
  }
});
