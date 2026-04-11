/**
 * Regression tests for wrapTextWithAnsi JS fallback (#3212).
 *
 * These tests import from the TypeScript wrapper (packages/native/src/text/index.ts)
 * rather than the raw native addon, so the try/catch fallback path is exercised
 * even on platforms where the native addon is unavailable (e.g., linux-arm64
 * devcontainers).
 *
 * Run with:
 *   node --import tsx/esm --test packages/native/src/__tests__/text-fallback.test.mjs
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import the TS wrapper — tsx resolves the .ts source at test time.
// On platforms with native available, the native path runs.
// On platforms without native (linux-arm64 devcontainers), the JS fallback runs.
// Either way, the function must return string[] without throwing.
import { wrapTextWithAnsi } from "../text/index.ts";

// ── wrapTextWithAnsi JS fallback ────────────────────────────────────────────

describe("wrapTextWithAnsi — JS fallback", () => {
  test("returns an array of strings without throwing", () => {
    const result = wrapTextWithAnsi("hello world", 5);
    assert.ok(Array.isArray(result), "must return array");
    assert.ok(result.length > 0, "must have at least one line");
    assert.ok(
      result.every((l) => typeof l === "string"),
      "all lines must be strings",
    );
  });

  test("each returned line fits within the specified width", () => {
    const result = wrapTextWithAnsi(
      "the quick brown fox jumps over the lazy dog",
      10,
    );
    for (const line of result) {
      assert.ok(line.length <= 10, `line "${line}" exceeds width 10`);
    }
  });

  test("empty string does not throw", () => {
    assert.doesNotThrow(() => wrapTextWithAnsi("", 80));
  });

  test("width=1 does not throw and returns single-char lines", () => {
    const result = wrapTextWithAnsi("hi", 1);
    assert.ok(Array.isArray(result));
    assert.ok(result.length >= 2);
  });
});
