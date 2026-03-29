// GSD Watch — Unit tests for renderer-entry signal handling, quit key detection, placeholder rendering, and viewport scrolling
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
  getEffectiveHeight,
  parseArrowKey,
  renderViewport,
  scrollViewport,
  resetViewportState,
  getViewportOffset,
  parseNavKey,
  resetNavigationState,
  getCursorIndex,
  getCollapsedPhases,
  isHelpOverlayVisible,
  applyCursorHighlight,
  renderHelpOverlayLines,
  ensureCursorInViewport,
} from "../watch/renderer-entry.js";
import { visibleWidth } from "@gsd/pi-tui";

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

// ─── Viewport Scrolling Tests (Tests 14–28) ───────────────────────────────────

describe("getEffectiveHeight", () => {
  test("Test 14: returns process.stdout.rows when >= 3", () => {
    const original = process.stdout.rows;
    Object.defineProperty(process.stdout, "rows", {
      value: 24,
      configurable: true,
      writable: true,
    });
    const height = getEffectiveHeight();
    assert.ok(height >= 24, `expected height >= 24, got ${height}`);
    Object.defineProperty(process.stdout, "rows", {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  test("Test 15: returns 3 (MIN_HEIGHT) when process.stdout.rows is 0 or undefined", () => {
    const original = process.stdout.rows;
    Object.defineProperty(process.stdout, "rows", {
      value: 0,
      configurable: true,
      writable: true,
    });
    const height = getEffectiveHeight();
    assert.equal(height, 3, `expected minimum height 3, got ${height}`);
    Object.defineProperty(process.stdout, "rows", {
      value: original,
      configurable: true,
      writable: true,
    });
  });
});

describe("parseArrowKey", () => {
  test("Test 16: parseArrowKey(\"\\x1b[A\") returns \"up\"", () => {
    const result = parseArrowKey("\x1b[A");
    assert.equal(result, "up", `expected "up", got ${JSON.stringify(result)}`);
  });

  test("Test 17: parseArrowKey(\"\\x1b[B\") returns \"down\"", () => {
    const result = parseArrowKey("\x1b[B");
    assert.equal(result, "down", `expected "down", got ${JSON.stringify(result)}`);
  });

  test("Test 18: parseArrowKey(\"q\") returns null (non-arrow input)", () => {
    const result = parseArrowKey("q");
    assert.equal(result, null, `expected null, got ${JSON.stringify(result)}`);
  });

  test("Test 19: parseArrowKey(\"\\x1b\") returns null (lone Esc is not an arrow key)", () => {
    const result = parseArrowKey("\x1b");
    assert.equal(result, null, `expected null for lone Esc, got ${JSON.stringify(result)}`);
  });
});

describe("renderViewport", () => {
  const makeLines = (count: number): string[] =>
    Array.from({ length: count }, (_, i) => `line ${i + 1}`);

  test("Test 20: returns all lines joined when total <= height (no status bar)", () => {
    const lines = makeLines(5);
    const output = renderViewport(lines, 0, 10, 80);
    assert.ok(!output.includes("▲"), `expected no ▲ in non-scrollable output, got: ${JSON.stringify(output)}`);
    assert.ok(!output.includes("▼"), `expected no ▼ in non-scrollable output, got: ${JSON.stringify(output)}`);
    assert.ok(output.includes("line 1"), "expected line 1 in output");
    assert.ok(output.includes("line 5"), "expected line 5 in output");
  });

  test("Test 21: slices lines to contentHeight when total > height, returns sliced output + status bar", () => {
    const lines = makeLines(20);
    const output = renderViewport(lines, 0, 10, 80);
    // With 20 lines and height=10, contentHeight=9, offset=0 → lines 1-9 visible
    assert.ok(output.includes("line 1"), "expected line 1 in sliced output");
    assert.ok(!output.includes("line 20"), "expected line 20 NOT in sliced output (out of viewport)");
    // Status bar should appear
    assert.ok(output.includes("▼"), "expected ▼ in status bar for scrollable output");
  });

  test("Test 22: status bar hides ▲ when offset=0 (replaces with space)", () => {
    const lines = makeLines(20);
    const output = renderViewport(lines, 0, 10, 80);
    // At offset=0, ▲ should NOT appear (replaced with space)
    assert.ok(!output.includes("▲"), `expected no ▲ at offset=0, got: ${JSON.stringify(output.slice(-40))}`);
    assert.ok(output.includes("▼"), "expected ▼ at offset=0 (content below)");
  });

  test("Test 23: status bar hides ▼ when at bottom (offset + contentHeight >= total)", () => {
    const lines = makeLines(12);
    // height=10, contentHeight=9, offset=3 → bottom: 3+9=12 >= 12 total
    const output = renderViewport(lines, 3, 10, 80);
    assert.ok(!output.includes("▼"), `expected no ▼ at bottom, got: ${JSON.stringify(output.slice(-40))}`);
    assert.ok(output.includes("▲"), "expected ▲ at bottom (content above)");
  });

  test("Test 24: status bar shows both ▲ and ▼ when in the middle", () => {
    const lines = makeLines(20);
    // height=10, contentHeight=9, offset=5 → not at top, not at bottom (5+9=14 < 20)
    const output = renderViewport(lines, 5, 10, 80);
    assert.ok(output.includes("▲"), `expected ▲ in middle, got: ${JSON.stringify(output.slice(-40))}`);
    assert.ok(output.includes("▼"), `expected ▼ in middle, got: ${JSON.stringify(output.slice(-40))}`);
  });
});

describe("scrollViewport", () => {
  beforeEach(() => {
    resetViewportState();
  });

  test("Test 25: clamps offset at 0 when scrolling up past top", () => {
    // viewportOffset starts at 0, scroll up (-1) → should stay at 0
    scrollViewport(-1, 20, 9);
    assert.equal(getViewportOffset(), 0, `expected offset=0 at top, got ${getViewportOffset()}`);
  });

  test("Test 26: clamps offset at max (totalLines - contentHeight) when scrolling down past bottom", () => {
    // max = 20 - 9 = 11; scroll down 100 times
    scrollViewport(100, 20, 9);
    assert.equal(getViewportOffset(), 11, `expected offset=11 at bottom, got ${getViewportOffset()}`);
  });
});

describe("resetViewportState", () => {
  test("Test 27: resetViewportState() resets viewportOffset to 0 (verified via getViewportOffset)", () => {
    // Scroll down first
    scrollViewport(5, 20, 9);
    assert.ok(getViewportOffset() > 0, "expected offset > 0 after scrolling down");
    // Now reset
    resetViewportState();
    assert.equal(getViewportOffset(), 0, `expected offset=0 after reset, got ${getViewportOffset()}`);
  });
});

describe("arrow key and quit sequence isolation", () => {
  beforeEach(() => {
    resetQuitState();
    resetViewportState();
  });

  test("Test 28: parseArrowKey does NOT interfere with parseQuitSequence — after arrow key, qq still triggers quit", () => {
    // Parse an arrow key first
    const arrowResult = parseArrowKey("\x1b[A");
    assert.equal(arrowResult, "up", "arrow key should return 'up'");

    // Simulate what the data handler does: arrow was handled, parseQuitSequence NOT called for arrow chunk
    // Now verify quit state machine is clean: two q presses should still quit
    const firstQ = parseQuitSequence("q");
    assert.equal(firstQ, false, "first q should not quit");
    const secondQ = parseQuitSequence("q");
    assert.equal(secondQ, true, "second q should quit (parseArrowKey did not corrupt quit state)");
  });
});

// ─── Navigation Tests (Tests 29–47) ──────────────────────────────────────────

describe("parseNavKey", () => {
  test("Test 29: parseNavKey(\"j\") returns \"cursor-down\"", () => {
    assert.equal(parseNavKey("j"), "cursor-down");
  });

  test("Test 30: parseNavKey(\"k\") returns \"cursor-up\"", () => {
    assert.equal(parseNavKey("k"), "cursor-up");
  });

  test("Test 31: parseNavKey(\"h\") returns \"collapse\"", () => {
    assert.equal(parseNavKey("h"), "collapse");
  });

  test("Test 32: parseNavKey(\"l\") returns \"expand\"", () => {
    assert.equal(parseNavKey("l"), "expand");
  });

  test("Test 33: parseNavKey(\"g\") returns \"jump-top\"", () => {
    assert.equal(parseNavKey("g"), "jump-top");
  });

  test("Test 34: parseNavKey(\"G\") returns \"jump-bottom\"", () => {
    assert.equal(parseNavKey("G"), "jump-bottom");
  });

  test("Test 35: parseNavKey(\"?\") returns \"help\"", () => {
    assert.equal(parseNavKey("?"), "help");
  });

  test("Test 36: parseNavKey(\"x\") returns null (non-nav key)", () => {
    assert.equal(parseNavKey("x"), null);
  });

  test("Test 37: parseNavKey(\"\\x1b[A\") returns null (arrow key is not a nav key)", () => {
    assert.equal(parseNavKey("\x1b[A"), null);
  });
});

describe("resetNavigationState", () => {
  test("Test 38: resetNavigationState() sets cursorIndex to 0, clears collapsedPhases, sets helpOverlayVisible to false", () => {
    // The state starts clean, but we call reset to ensure deterministic behavior
    resetNavigationState();
    assert.equal(getCursorIndex(), 0, "cursorIndex should be 0 after reset");
    assert.equal(getCollapsedPhases().size, 0, "collapsedPhases should be empty after reset");
    assert.equal(isHelpOverlayVisible(), false, "helpOverlayVisible should be false after reset");
  });
});

describe("applyCursorHighlight", () => {
  test("Test 39: applyCursorHighlight wraps a line in \\x1b[7m...\\x1b[0m and pads to width", () => {
    const result = applyCursorHighlight("hello", 10);
    assert.ok(result.startsWith("\x1b[7m"), "should start with reverse video escape");
    assert.ok(result.endsWith("\x1b[0m"), "should end with SGR reset escape");
  });

  test("Test 40: applyCursorHighlight pads short line (10 visible chars) to full width (40) with spaces inside reverse video", () => {
    const line = "0123456789"; // 10 visible chars
    const width = 40;
    const result = applyCursorHighlight(line, width);
    // Strip ANSI escapes to measure the visible content
    const inner = result.replace(/\x1b\[\d+m/g, "");
    const innerWidth = visibleWidth(inner);
    assert.equal(innerWidth, width, `expected padded width ${width}, got ${innerWidth}`);
  });
});

describe("renderHelpOverlayLines", () => {
  test("Test 41: renderHelpOverlayLines(60) returns array containing \"KEYBINDINGS\" header", () => {
    const lines = renderHelpOverlayLines(60);
    assert.ok(lines.some(l => l.includes("KEYBINDINGS")), "expected KEYBINDINGS header in overlay lines");
  });

  test("Test 42: renderHelpOverlayLines(60) returns array containing \"BADGE LEGEND\" header", () => {
    const lines = renderHelpOverlayLines(60);
    assert.ok(lines.some(l => l.includes("BADGE LEGEND")), "expected BADGE LEGEND header in overlay lines");
  });

  test("Test 43: renderHelpOverlayLines(60) includes \"j / k\" keybinding entry", () => {
    const lines = renderHelpOverlayLines(60);
    assert.ok(lines.some(l => l.includes("j / k")), "expected j / k keybinding entry in overlay lines");
  });

  test("Test 44: renderHelpOverlayLines(60) includes all 7 badge legend entries (CONTEXT through HUMAN-UAT)", () => {
    const lines = renderHelpOverlayLines(60);
    const combined = lines.join("\n");
    const expectedBadges = ["CONTEXT", "RESEARCH", "UI-SPEC", "PLAN", "SUMMARY", "VERIFICATION", "HUMAN-UAT"];
    for (const badge of expectedBadges) {
      assert.ok(combined.includes(badge), `expected badge legend entry: ${badge}`);
    }
  });
});

describe("ensureCursorInViewport", () => {
  beforeEach(() => {
    resetViewportState();
  });

  test("Test 45: ensureCursorInViewport adjusts viewportOffset when cursorIndex is below viewport (cursor > offset + contentHeight - 1)", () => {
    // Set viewport offset to 0, contentHeight=5, cursor=7 → cursor is below viewport (7 >= 0+5)
    ensureCursorInViewport(7, 20, 5);
    // Expected: viewportOffset = 7 - 5 + 1 = 3
    assert.equal(getViewportOffset(), 3, `expected viewportOffset=3, got ${getViewportOffset()}`);
  });

  test("Test 46: ensureCursorInViewport adjusts viewportOffset when cursorIndex is above viewport (cursor < offset)", () => {
    // First scroll down to set offset=10
    scrollViewport(10, 30, 5);
    assert.equal(getViewportOffset(), 10, "precondition: offset should be 10");
    // Now cursor=3 is above viewport (3 < 10)
    ensureCursorInViewport(3, 30, 5);
    // Expected: viewportOffset = cursor = 3
    assert.equal(getViewportOffset(), 3, `expected viewportOffset=3 (set to cursor), got ${getViewportOffset()}`);
  });

  test("Test 47: ensureCursorInViewport does NOT adjust viewportOffset when cursor is within viewport bounds", () => {
    // Set offset=2 via scrollViewport, contentHeight=5, cursor=4 → in view (2 <= 4 < 2+5=7)
    scrollViewport(2, 30, 5);
    assert.equal(getViewportOffset(), 2, "precondition: offset should be 2");
    ensureCursorInViewport(4, 30, 5);
    // Viewport offset should remain 2
    assert.equal(getViewportOffset(), 2, `expected viewportOffset unchanged at 2, got ${getViewportOffset()}`);
  });
});
