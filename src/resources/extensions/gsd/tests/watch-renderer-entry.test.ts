// GSD Watch — Unit tests for renderer-entry signal handling, quit key detection, and placeholder rendering
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  CLEANUP_SIGNALS,
  parseQuitSequence,
  resetQuitState,
  getEffectiveWidth,
  renderPlaceholder,
  renderTree,
} from "../watch/renderer-entry.js";

describe("CLEANUP_SIGNALS", () => {
  test("Test 1: CLEANUP_SIGNALS contains exactly SIGTERM, SIGHUP, SIGINT", () => {
    assert.deepEqual(CLEANUP_SIGNALS, ["SIGTERM", "SIGHUP", "SIGINT"]);
  });
});

describe("parseQuitSequence", () => {
  beforeEach(() => {
    resetQuitState();
  });

  test("Test 2: detects 'qq' as a quit signal (two q presses)", () => {
    const first = parseQuitSequence("q");
    assert.equal(first, false, "first q should not quit");
    const second = parseQuitSequence("q");
    assert.equal(second, true, "second q should quit");
  });

  test("Test 3: detects double-Esc (\\x1b\\x1b) as a quit signal", () => {
    const first = parseQuitSequence("\x1b");
    assert.equal(first, false, "first Esc should not quit");
    const second = parseQuitSequence("\x1b");
    assert.equal(second, true, "second Esc should quit");
  });

  test("Test 4: single 'q' does NOT quit", () => {
    const result = parseQuitSequence("q");
    assert.equal(result, false);
  });

  test("Test 5: single Esc does NOT quit", () => {
    const result = parseQuitSequence("\x1b");
    assert.equal(result, false);
  });

  test("Test 6: resets q state after 500ms timeout", async () => {
    const first = parseQuitSequence("q");
    assert.equal(first, false, "first q should not quit");

    // Wait 600ms to exceed the QUIT_TIMEOUT_MS of 500ms
    await new Promise((resolve) => setTimeout(resolve, 600));

    const second = parseQuitSequence("q");
    assert.equal(second, false, "second q after timeout should NOT quit (state was reset)");
  });
});

describe("getEffectiveWidth", () => {
  test("Test 7: returns process.stdout.columns when >= 40", () => {
    const original = process.stdout.columns;
    // Temporarily override columns
    Object.defineProperty(process.stdout, "columns", {
      value: 80,
      configurable: true,
      writable: true,
    });
    const width = getEffectiveWidth();
    assert.ok(width >= 80, `expected width >= 80, got ${width}`);
    Object.defineProperty(process.stdout, "columns", {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  test("Test 8: returns 40 when process.stdout.columns is 0 or undefined", () => {
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", {
      value: 0,
      configurable: true,
      writable: true,
    });
    const width = getEffectiveWidth();
    assert.equal(width, 40, `expected minimum width 40, got ${width}`);
    Object.defineProperty(process.stdout, "columns", {
      value: original,
      configurable: true,
      writable: true,
    });
  });
});

describe("renderTree", () => {
  let tmpDir: string;
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "renderer-entry-tree-test-"));
    // Create a minimal .planning/phases/ directory structure with one phase
    const planningDir = join(tmpDir, ".planning");
    mkdirSync(join(planningDir, "phases", "02-foundation"), { recursive: true });
    writeFileSync(join(planningDir, "phases", "02-foundation", "02-CONTEXT.md"), "# Context\n");
    writeFileSync(join(planningDir, "phases", "02-foundation", "02-01-PLAN.md"), "# Plan\n");
    originalWrite = process.stdout.write.bind(process.stdout);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = originalWrite;
  });

  test("Test 11: renderTree output contains screen clear sequence", () => {
    const chunks: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      chunks.push(chunk);
      return true;
    };

    renderTree(tmpDir);

    const output = chunks.join("");
    assert.ok(
      output.includes("\x1b[2J\x1b[H"),
      `Expected screen clear sequence in output, got: ${JSON.stringify(output.slice(0, 100))}`
    );
  });

  test("Test 12: renderTree output contains tree drawing characters (not placeholder)", () => {
    const chunks: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      chunks.push(chunk);
      return true;
    };

    renderTree(tmpDir);

    const output = chunks.join("");
    const hasTreeChars = output.includes("├──") || output.includes("└──");
    assert.ok(
      hasTreeChars,
      `Expected tree drawing chars (├── or └──) in output, got: ${JSON.stringify(output.slice(0, 200))}`
    );
  });

  test("Test 13: renderTree output is non-empty beyond the clear sequence", () => {
    const chunks: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      chunks.push(chunk);
      return true;
    };

    renderTree(tmpDir);

    const output = chunks.join("");
    // Strip the clear sequence — remaining content should be non-empty
    const withoutClear = output.replace("\x1b[2J\x1b[H", "");
    assert.ok(
      withoutClear.trim().length > 0,
      "Expected non-empty content beyond the clear sequence"
    );
  });
});

describe("renderPlaceholder", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "renderer-entry-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("Test 9: outputs 'Loading project...' text when .planning/ exists", () => {
    // Create a minimal .planning/ directory
    const planningDir = join(tmpDir, ".planning");
    mkdirSync(planningDir, { recursive: true });

    // Capture stdout
    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      chunks.push(chunk);
      return true;
    };

    try {
      renderPlaceholder(tmpDir);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = originalWrite;
    }

    const output = chunks.join("");
    assert.ok(output.includes("Loading project..."), `expected 'Loading project...' in output, got: ${output}`);
  });

  test("Test 10: outputs project name when PROJECT.md is readable", () => {
    // Create .planning/ with a PROJECT.md containing a heading
    const planningDir = join(tmpDir, ".planning");
    mkdirSync(planningDir, { recursive: true });
    writeFileSync(
      join(planningDir, "PROJECT.md"),
      [
        "# My Test Project",
        "",
        "Some description here.",
      ].join("\n")
    );

    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as any).write = (chunk: string) => {
      chunks.push(chunk);
      return true;
    };

    try {
      renderPlaceholder(tmpDir);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout as any).write = originalWrite;
    }

    const output = chunks.join("");
    assert.ok(
      output.includes("My Test Project"),
      `expected project name 'My Test Project' in output, got: ${output}`
    );
    assert.ok(
      output.includes("Loading project..."),
      `expected 'Loading project...' in output, got: ${output}`
    );
  });
});
