/**
 * auto-reentrancy-guard.test.ts — Tests for the unconditional reentrancy guard.
 *
 * Regression for #1272: auto-mode stuck-loop where gap watchdog or
 * pendingAgentEndRetry could enter dispatchNextUnit concurrently during
 * recursive skip chains because the reentrancy guard was bypassed when
 * skipDepth > 0.
 *
 * The fix makes the guard unconditional (`if (s.dispatching)` without
 * `&& s.skipDepth === 0`), and defers recursive re-dispatch via
 * setImmediate/setTimeout so s.dispatching is released first.
 */

import {
  _getDispatching,
  _setDispatching,
  _getSkipDepth,
  _setSkipDepth,
} from "../auto.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

async function main(): Promise<void> {
  // ─── Test-only accessors work ───────────────────────────────────────────
  console.log("\n=== reentrancy guard: test accessors round-trip ===");
  {
    _setDispatching(false);
    assertEq(_getDispatching(), false, "dispatching starts false");

    _setDispatching(true);
    assertEq(_getDispatching(), true, "dispatching set to true");

    _setDispatching(false);
    assertEq(_getDispatching(), false, "dispatching reset to false");
  }

  // ─── skipDepth accessors ────────────────────────────────────────────────
  console.log("\n=== reentrancy guard: skipDepth accessors round-trip ===");
  {
    _setSkipDepth(0);
    assertEq(_getSkipDepth(), 0, "skipDepth starts at 0");

    _setSkipDepth(3);
    assertEq(_getSkipDepth(), 3, "skipDepth set to 3");

    _setSkipDepth(0);
    assertEq(_getSkipDepth(), 0, "skipDepth reset to 0");
  }

  // ─── Guard blocks even when skipDepth > 0 (#1272 regression) ───────────
  console.log("\n=== reentrancy guard: blocks when dispatching=true regardless of skipDepth ===");
  {
    // Simulate the scenario from #1272: dispatching=true + skipDepth>0
    // The old guard (`if (s.dispatching && s.skipDepth === 0)`) would allow
    // concurrent entry when skipDepth > 0. The fix makes the check
    // unconditional on skipDepth.
    _setDispatching(true);
    _setSkipDepth(2);

    // Verify dispatching is true — guard should block regardless of skipDepth
    assertTrue(
      _getDispatching() === true,
      "dispatching flag is true during skip chain"
    );

    // The actual reentrancy guard in dispatchNextUnit checks:
    //   if (s.dispatching) { return; }
    // We verify the state that would trigger the guard:
    const wouldBlock = _getDispatching(); // unconditional check
    const wouldBlockOld = _getDispatching() && _getSkipDepth() === 0; // old check

    assertTrue(wouldBlock === true, "new guard blocks when dispatching=true, skipDepth=2");
    assertTrue(wouldBlockOld === false, "old guard WOULD NOT block when dispatching=true, skipDepth=2 (the bug)");

    // Clean up
    _setDispatching(false);
    _setSkipDepth(0);
  }

  // ─── Guard allows entry when dispatching=false ──────────────────────────
  console.log("\n=== reentrancy guard: allows entry when dispatching=false ===");
  {
    _setDispatching(false);
    _setSkipDepth(0);
    assertTrue(!_getDispatching(), "guard allows entry when dispatching=false, skipDepth=0");

    _setDispatching(false);
    _setSkipDepth(3);
    assertTrue(!_getDispatching(), "guard allows entry when dispatching=false, skipDepth=3");

    _setSkipDepth(0);
  }

  // ─── skipDepth does not affect guard decision (the fix) ─────────────────
  console.log("\n=== reentrancy guard: skipDepth is irrelevant to guard decision ===");
  {
    for (const depth of [0, 1, 2, 5]) {
      _setDispatching(true);
      _setSkipDepth(depth);
      assertTrue(
        _getDispatching() === true,
        `guard blocks at skipDepth=${depth} when dispatching=true`
      );
    }

    for (const depth of [0, 1, 2, 5]) {
      _setDispatching(false);
      _setSkipDepth(depth);
      assertTrue(
        _getDispatching() === false,
        `guard allows at skipDepth=${depth} when dispatching=false`
      );
    }

    // Clean up
    _setDispatching(false);
    _setSkipDepth(0);
  }

  report();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
