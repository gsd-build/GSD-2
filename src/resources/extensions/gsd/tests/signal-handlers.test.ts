import test from "node:test";
import assert from "node:assert/strict";
import {
  registerSigtermHandler,
  deregisterSigtermHandler,
} from "../auto-supervisor.ts";

/**
 * Tests for signal handler registration (SIGTERM, SIGHUP, SIGINT).
 *
 * Validates that registerSigtermHandler installs handlers on all three
 * signals and deregisterSigtermHandler removes them from all three.
 * Fixes #1797 — stranded lock files on VSCode crash due to missing
 * SIGHUP and SIGINT handlers.
 */

test("registerSigtermHandler installs handlers on SIGTERM, SIGHUP, and SIGINT", () => {
  const before = {
    SIGTERM: process.listenerCount("SIGTERM"),
    SIGHUP: process.listenerCount("SIGHUP"),
    SIGINT: process.listenerCount("SIGINT"),
  };

  const handler = registerSigtermHandler("/tmp/test-signal-handlers", null);

  assert.equal(
    process.listenerCount("SIGTERM"),
    before.SIGTERM + 1,
    "SIGTERM listener should be added",
  );
  assert.equal(
    process.listenerCount("SIGHUP"),
    before.SIGHUP + 1,
    "SIGHUP listener should be added",
  );
  assert.equal(
    process.listenerCount("SIGINT"),
    before.SIGINT + 1,
    "SIGINT listener should be added",
  );

  // Clean up
  deregisterSigtermHandler(handler);
});

test("deregisterSigtermHandler removes handlers from all three signals", () => {
  const handler = registerSigtermHandler("/tmp/test-signal-handlers", null);

  const during = {
    SIGTERM: process.listenerCount("SIGTERM"),
    SIGHUP: process.listenerCount("SIGHUP"),
    SIGINT: process.listenerCount("SIGINT"),
  };

  deregisterSigtermHandler(handler);

  assert.equal(
    process.listenerCount("SIGTERM"),
    during.SIGTERM - 1,
    "SIGTERM listener should be removed",
  );
  assert.equal(
    process.listenerCount("SIGHUP"),
    during.SIGHUP - 1,
    "SIGHUP listener should be removed",
  );
  assert.equal(
    process.listenerCount("SIGINT"),
    during.SIGINT - 1,
    "SIGINT listener should be removed",
  );
});

test("registerSigtermHandler deregisters previous handler from all signals", () => {
  const before = {
    SIGTERM: process.listenerCount("SIGTERM"),
    SIGHUP: process.listenerCount("SIGHUP"),
    SIGINT: process.listenerCount("SIGINT"),
  };

  const handler1 = registerSigtermHandler("/tmp/test-signal-handlers", null);
  const handler2 = registerSigtermHandler("/tmp/test-signal-handlers-2", handler1);

  // Should still only have one extra listener per signal (old one removed, new one added)
  assert.equal(
    process.listenerCount("SIGTERM"),
    before.SIGTERM + 1,
    "SIGTERM should have exactly one handler after re-registration",
  );
  assert.equal(
    process.listenerCount("SIGHUP"),
    before.SIGHUP + 1,
    "SIGHUP should have exactly one handler after re-registration",
  );
  assert.equal(
    process.listenerCount("SIGINT"),
    before.SIGINT + 1,
    "SIGINT should have exactly one handler after re-registration",
  );

  // Clean up
  deregisterSigtermHandler(handler2);
});
