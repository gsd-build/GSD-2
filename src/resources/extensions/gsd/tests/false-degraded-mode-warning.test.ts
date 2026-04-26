/**
 * Behavioural regression tests for #3922.
 *
 * Before this fix, deriveState() logged "DB unavailable — degraded mode"
 * even when the DB had not been opened yet (e.g. during
 * before_agent_start context injection). The fix introduced
 * wasDbOpenAttempted() so the warning fires only after a real open attempt.
 *
 * The earlier tests source-grepped state.ts for the warning string and the
 * preceding line (POSITIONAL/SOURCE_GREP per #4826/#4829). They are
 * replaced here with direct calls to the wasDbOpenAttempted flag.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  openDatabase,
  closeDatabase,
  wasDbOpenAttempted,
} from "../gsd-db.ts";

describe("wasDbOpenAttempted (#3922)", () => {
  beforeEach(() => { closeDatabase(); });
  afterEach(() => { closeDatabase(); });

  test("returns true after a successful openDatabase call", () => {
    openDatabase(":memory:");
    assert.strictEqual(
      wasDbOpenAttempted(),
      true,
      "wasDbOpenAttempted should report true after openDatabase succeeds",
    );
  });

  test("remains true after a failed open attempt — the attempt is what matters", () => {
    try { openDatabase("/nonexistent/path/that/will/fail.db"); } catch { /* expected */ }
    assert.strictEqual(
      wasDbOpenAttempted(),
      true,
      "wasDbOpenAttempted should be true even when openDatabase throws — the warning gate keys on the attempt, not the outcome",
    );
  });
});
