/**
 * consecutive-complete-bootstraps.test.ts — Behavioral tests for the Map-keyed counter.
 *
 * _consecutiveCompleteBootstraps must be a Map<string, number> keyed by normalized
 * basePath rather than a single module-level numeric counter. A plain `let` counter
 * is a global singleton that clobbers counters across concurrent sessions for different
 * projects.
 *
 * These tests exercise the actual counter logic via exported test-seams, so they fail
 * if someone reverts the Map to a scalar — regardless of what the source text looks like.
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  _getConsecutiveCompleteCount,
  _resetConsecutiveCompleteBootstraps,
  _incrementConsecutiveCompleteCount,
} from "../auto-start.ts";

// ─── Cleanup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Wipe all keys so tests don't bleed into each other
  _resetConsecutiveCompleteBootstraps();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("_consecutiveCompleteBootstraps counter isolation", () => {

  test("fresh basePath starts at zero", () => {
    assert.strictEqual(
      _getConsecutiveCompleteCount("/projects/alpha"),
      0,
      "unseen basePath should return 0",
    );
  });

  test("increment accumulates for the same basePath", () => {
    const key = "/projects/alpha";
    assert.strictEqual(_incrementConsecutiveCompleteCount(key), 1);
    assert.strictEqual(_incrementConsecutiveCompleteCount(key), 2);
    assert.strictEqual(_incrementConsecutiveCompleteCount(key), 3);
    assert.strictEqual(_getConsecutiveCompleteCount(key), 3);
  });

  test("two different basePaths maintain independent counters", () => {
    const alpha = "/projects/alpha";
    const beta = "/projects/beta";

    _incrementConsecutiveCompleteCount(alpha);
    _incrementConsecutiveCompleteCount(alpha);
    _incrementConsecutiveCompleteCount(beta);

    assert.strictEqual(
      _getConsecutiveCompleteCount(alpha),
      2,
      "alpha counter must not be affected by beta increments",
    );
    assert.strictEqual(
      _getConsecutiveCompleteCount(beta),
      1,
      "beta counter must not be affected by alpha increments",
    );
  });

  test("resetting one basePath does not affect another", () => {
    const alpha = "/projects/alpha";
    const beta = "/projects/beta";

    _incrementConsecutiveCompleteCount(alpha);
    _incrementConsecutiveCompleteCount(alpha);
    _incrementConsecutiveCompleteCount(beta);

    _resetConsecutiveCompleteBootstraps(alpha);

    assert.strictEqual(
      _getConsecutiveCompleteCount(alpha),
      0,
      "alpha counter should be zero after per-key reset",
    );
    assert.strictEqual(
      _getConsecutiveCompleteCount(beta),
      1,
      "beta counter must survive an alpha reset",
    );
  });

  test("global reset clears all keys", () => {
    _incrementConsecutiveCompleteCount("/projects/alpha");
    _incrementConsecutiveCompleteCount("/projects/beta");
    _incrementConsecutiveCompleteCount("/projects/gamma");

    _resetConsecutiveCompleteBootstraps();

    assert.strictEqual(_getConsecutiveCompleteCount("/projects/alpha"), 0);
    assert.strictEqual(_getConsecutiveCompleteCount("/projects/beta"), 0);
    assert.strictEqual(_getConsecutiveCompleteCount("/projects/gamma"), 0);
  });

  test("a scalar counter would fail: incrementing alpha must not change beta", () => {
    // This test is the critical regression guard. If _consecutiveCompleteBootstraps
    // were replaced with `let counter = 0`, then _incrementConsecutiveCompleteCount
    // would increment the same variable for all callers and
    // _getConsecutiveCompleteCount would return the same value regardless of key.
    // Both assertions below would then report the same number, failing the test.
    const alpha = "/projects/alpha";
    const beta = "/projects/beta";

    _incrementConsecutiveCompleteCount(alpha);
    _incrementConsecutiveCompleteCount(alpha);

    assert.strictEqual(
      _getConsecutiveCompleteCount(beta),
      0,
      "beta must be unaffected after incrementing alpha — a shared scalar would return 2 here",
    );
    assert.notStrictEqual(
      _getConsecutiveCompleteCount(alpha),
      _getConsecutiveCompleteCount(beta),
      "alpha and beta counters must diverge — they would be identical with a scalar",
    );
  });
});
