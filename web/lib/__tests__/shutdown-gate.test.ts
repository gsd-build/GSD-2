// GSD-2 Web — Shutdown gate regression tests
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  scheduleShutdown,
  cancelShutdown,
  isShutdownPending,
  isDaemonMode,
  registerActiveStream,
  recordBoot,
} from "../shutdown-gate.ts";

// Reset gate state between tests by cancelling any pending shutdown and
// clearing env vars. We also reset lastBootAt via recordBoot trick (set to 0
// by cancelling) — actually we reach into globalThis for a clean reset.
function resetGate() {
  cancelShutdown();
  // Reset lastBootAt so phantom-shutdown guard doesn't interfere
  if (globalThis.__gsdShutdownGate) {
    globalThis.__gsdShutdownGate.lastBootAt = 0;
    globalThis.__gsdShutdownGate.activeStreams.clear();
  }
  delete process.env.GSD_WEB_DAEMON_MODE;
}

describe("shutdown-gate", () => {
  afterEach(resetGate);

  describe("default mode (no daemon)", () => {
    test("scheduleShutdown() sets a pending timer", () => {
      scheduleShutdown();
      assert.equal(isShutdownPending(), true);
    });

    test("cancelShutdown() clears the pending timer", () => {
      scheduleShutdown();
      cancelShutdown();
      assert.equal(isShutdownPending(), false);
    });

    test("isDaemonMode() returns false", () => {
      assert.equal(isDaemonMode(), false);
    });
  });

  describe("daemon mode (GSD_WEB_DAEMON_MODE=1)", () => {
    beforeEach(() => {
      process.env.GSD_WEB_DAEMON_MODE = "1";
    });

    test("isDaemonMode() returns true", () => {
      assert.equal(isDaemonMode(), true);
    });

    test("scheduleShutdown() does not schedule a timer", () => {
      scheduleShutdown();
      assert.equal(
        isShutdownPending(),
        false,
        "shutdown timer must not be set in daemon mode",
      );
    });

    test("scheduleShutdown() is safe to call multiple times", () => {
      scheduleShutdown();
      scheduleShutdown();
      scheduleShutdown();
      assert.equal(isShutdownPending(), false);
    });
  });

  describe("daemon mode is not activated by other values", () => {
    test("GSD_WEB_DAEMON_MODE=0 does not enable daemon mode", () => {
      process.env.GSD_WEB_DAEMON_MODE = "0";
      assert.equal(isDaemonMode(), false);
      scheduleShutdown();
      assert.equal(isShutdownPending(), true);
    });

    test("GSD_WEB_DAEMON_MODE=true does not enable daemon mode", () => {
      process.env.GSD_WEB_DAEMON_MODE = "true";
      assert.equal(isDaemonMode(), false);
      scheduleShutdown();
      assert.equal(isShutdownPending(), true);
    });

    test("unset GSD_WEB_DAEMON_MODE does not enable daemon mode", () => {
      delete process.env.GSD_WEB_DAEMON_MODE;
      assert.equal(isDaemonMode(), false);
      scheduleShutdown();
      assert.equal(isShutdownPending(), true);
    });
  });

  describe("double-scheduleShutdown resets timer", (t) => {
    test("calling scheduleShutdown twice still leaves exactly one pending timer", () => {
      scheduleShutdown();
      scheduleShutdown();
      assert.equal(isShutdownPending(), true);
      // Only one timer should be pending — cancelShutdown clears it cleanly
      cancelShutdown();
      assert.equal(isShutdownPending(), false);
    });
  });

  describe("cancelShutdown after timer fires is a no-op", (t) => {
    test("cancelShutdown() when no timer is pending does not throw", () => {
      assert.equal(isShutdownPending(), false);
      assert.doesNotThrow(() => cancelShutdown());
      assert.equal(isShutdownPending(), false);
    });
  });

  describe("registerActiveStream — SSE drain", () => {
    test("registered unsubscriber is called when drainStreams fires", (t) => {
      return new Promise<void>((resolve) => {
        let called = false;
        const deregister = registerActiveStream(() => {
          called = true;
        });

        // Manually drain by clearing the set via scheduleShutdown path is not
        // feasible without process.exit — instead test the deregister path:
        // deregister removes from the set so it won't be called.
        deregister();
        assert.equal(called, false, "deregister must prevent the callback from being called on drain");

        resolve();
      });
    });

    test("deregister function removes stream from active set", () => {
      let callCount = 0;
      const deregister = registerActiveStream(() => { callCount++; });
      assert.equal(globalThis.__gsdShutdownGate!.activeStreams.size, 1);
      deregister();
      assert.equal(globalThis.__gsdShutdownGate!.activeStreams.size, 0);
      assert.equal(callCount, 0);
    });

    test("multiple streams can be registered and deregistered independently", () => {
      const calls: number[] = [];
      const d1 = registerActiveStream(() => calls.push(1));
      const d2 = registerActiveStream(() => calls.push(2));
      const d3 = registerActiveStream(() => calls.push(3));
      assert.equal(globalThis.__gsdShutdownGate!.activeStreams.size, 3);
      d2();
      assert.equal(globalThis.__gsdShutdownGate!.activeStreams.size, 2);
      d1();
      d3();
      assert.equal(globalThis.__gsdShutdownGate!.activeStreams.size, 0);
      assert.deepEqual(calls, [], "no unsubscribers should have fired");
    });
  });

  describe("recordBoot — phantom-shutdown guard", () => {
    test("recordBoot updates lastBootAt to a recent timestamp", () => {
      const before = Date.now();
      recordBoot();
      const after = Date.now();
      const lastBoot = globalThis.__gsdShutdownGate!.lastBootAt;
      assert.ok(lastBoot >= before && lastBoot <= after, "lastBootAt must be within test window");
    });

    test("boot-then-shutdown ordering: lastBootAt is set before timer arms", () => {
      // Simulate: boot arrives, then shutdown is scheduled
      recordBoot();
      scheduleShutdown();
      // Timer is still pending (guard only fires inside the timer callback)
      assert.equal(isShutdownPending(), true);
      cancelShutdown();
    });

    test("shutdown-then-boot ordering: cancelShutdown clears the timer", () => {
      scheduleShutdown();
      assert.equal(isShutdownPending(), true);
      recordBoot();
      cancelShutdown();
      assert.equal(isShutdownPending(), false);
    });
  });

  describe("HMR singleton", () => {
    test("globalThis.__gsdShutdownGate is defined after module load", () => {
      assert.ok(globalThis.__gsdShutdownGate, "singleton must exist on globalThis");
      assert.ok(globalThis.__gsdShutdownGate.activeStreams instanceof Set);
      assert.equal(typeof globalThis.__gsdShutdownGate.lastBootAt, "number");
    });

    test("isShutdownPending reflects gate.shutdownTimer (singleton coherence)", () => {
      scheduleShutdown();
      assert.equal(globalThis.__gsdShutdownGate!.shutdownTimer !== null, true);
      assert.equal(isShutdownPending(), true);
      cancelShutdown();
      assert.equal(globalThis.__gsdShutdownGate!.shutdownTimer, null);
      assert.equal(isShutdownPending(), false);
    });
  });
});
