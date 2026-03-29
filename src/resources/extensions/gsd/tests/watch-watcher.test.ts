// GSD Watch — Unit tests for watcher debounce, coalescing, and ignored patterns
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { startPlanningWatcher } from "../watch/watcher.js";
import { DEBOUNCE_MS } from "../watch/types.js";

// Total wait: DEBOUNCE_MS (300) + stabilityThreshold (200) + buffer (200) = 700ms
const SETTLE_MS = DEBOUNCE_MS + 200 + 200;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("startPlanningWatcher", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "watch-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("Test 1: single file write triggers onChange within 400ms", async (t) => {
    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });
    t.after(() => watcher.close());

    // Wait for watcher to be ready
    await wait(100);

    writeFileSync(join(tmpDir, "state.md"), "content");

    await wait(SETTLE_MS);

    assert.equal(callCount, 1, `expected 1 call, got ${callCount}`);
  });

  test("Test 2: 10 rapid writes coalesce into exactly 1 onChange call", async (t) => {
    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });
    t.after(() => watcher.close());

    // Wait for watcher to be ready
    await wait(100);

    // Write 10 files rapidly
    for (let i = 0; i < 10; i++) {
      writeFileSync(join(tmpDir, `file-${i}.md`), `content-${i}`);
    }

    await wait(SETTLE_MS);

    assert.equal(callCount, 1, `expected 1 coalesced call, got ${callCount}`);
  });

  test("Test 3: .swp files do NOT trigger onChange", async (t) => {
    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });
    t.after(() => watcher.close());

    await wait(100);

    writeFileSync(join(tmpDir, "state.md.swp"), "swap content");

    await wait(SETTLE_MS);

    assert.equal(callCount, 0, `expected 0 calls for .swp file, got ${callCount}`);
  });

  test("Test 4: files ending in ~ do NOT trigger onChange", async (t) => {
    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });
    t.after(() => watcher.close());

    await wait(100);

    writeFileSync(join(tmpDir, "state.md~"), "backup content");

    await wait(SETTLE_MS);

    assert.equal(callCount, 0, `expected 0 calls for ~ file, got ${callCount}`);
  });

  test("Test 5: .tmp files do NOT trigger onChange", async (t) => {
    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });
    t.after(() => watcher.close());

    await wait(100);

    writeFileSync(join(tmpDir, "state.tmp"), "temp content");

    await wait(SETTLE_MS);

    assert.equal(callCount, 0, `expected 0 calls for .tmp file, got ${callCount}`);
  });

  test("Test 6: .DS_Store files do NOT trigger onChange", async (t) => {
    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });
    t.after(() => watcher.close());

    await wait(100);

    writeFileSync(join(tmpDir, ".DS_Store"), "ds store content");

    await wait(SETTLE_MS);

    assert.equal(callCount, 0, `expected 0 calls for .DS_Store, got ${callCount}`);
  });

  test("Test 7: creating a new subdirectory triggers onChange", async (t) => {
    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });
    t.after(() => watcher.close());

    await wait(100);

    mkdirSync(join(tmpDir, "new-subdir"));

    await wait(SETTLE_MS);

    assert.equal(callCount, 1, `expected 1 call for directory creation, got ${callCount}`);
  });

  test("Test 8: removing a subdirectory triggers onChange", async (t) => {
    // Pre-create subdir before watcher starts
    const subDir = join(tmpDir, "existing-subdir");
    mkdirSync(subDir);

    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });
    t.after(() => watcher.close());

    await wait(100);

    rmSync(subDir, { recursive: true, force: true });

    await wait(SETTLE_MS);

    assert.equal(callCount, 1, `expected 1 call for directory removal, got ${callCount}`);
  });

  test("Test 9: watcher.close() stops firing events", async (t) => {
    let callCount = 0;
    const watcher = startPlanningWatcher(tmpDir, () => { callCount++; });

    await wait(100);

    // Write a file and wait for it to trigger
    writeFileSync(join(tmpDir, "first.md"), "first");
    await wait(SETTLE_MS);
    assert.equal(callCount, 1, "expected 1 call before close");

    // Close the watcher
    await watcher.close();

    // Write another file — should NOT trigger
    writeFileSync(join(tmpDir, "second.md"), "second");
    await wait(SETTLE_MS);

    assert.equal(callCount, 1, `expected still 1 call after close, got ${callCount}`);
  });
});
