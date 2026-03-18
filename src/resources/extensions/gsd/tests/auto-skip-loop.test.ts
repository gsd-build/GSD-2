/**
 * auto-skip-loop.test.ts — Tests for the consecutive-skip loop breaker.
 *
 * Regression for #728: auto-mode infinite skip loop on previously completed
 * plan-slice units when deriveState keeps returning the same unit.
 *
 * The skip paths in dispatchNextUnit track consecutive skips per unit via
 * unitConsecutiveSkips. When the same unit is skipped > MAX_CONSECUTIVE_SKIPS
 * times without a real dispatch in between, the completion record is evicted
 * so deriveState can reconcile.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  _getUnitConsecutiveSkips,
  _resetUnitConsecutiveSkips,
} from "../auto.ts";
import { MAX_CONSECUTIVE_SKIPS } from "../auto/session.ts";
import { persistCompletedKey, removePersistedKey, loadPersistedKeys } from "../auto-recovery.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function makeTmpBase(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-skip-loop-test-"));
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  return dir;
}

async function main(): Promise<void> {
  // ─── Counter starts at zero ────────────────────────────────────────────
  console.log("\n=== skip loop counter: initial state ===");
  {
    _resetUnitConsecutiveSkips();
    const map = _getUnitConsecutiveSkips();
    assertEq(map.size, 0, "counter map starts empty after reset");
  }

  // ─── Counter increments correctly ────────────────────────────────────
  console.log("\n=== skip loop counter: increments on repeated calls ===");
  {
    _resetUnitConsecutiveSkips();
    const map = _getUnitConsecutiveSkips();
    const key = "plan-slice/M001/S04";

    for (let i = 1; i <= MAX_CONSECUTIVE_SKIPS; i++) {
      const prev = map.get(key) ?? 0;
      map.set(key, prev + 1);
    }

    assertEq(map.get(key), MAX_CONSECUTIVE_SKIPS, `counter reaches MAX_CONSECUTIVE_SKIPS (${MAX_CONSECUTIVE_SKIPS})`);
  }

  // ─── Threshold constant is sane ──────────────────────────────────────
  console.log("\n=== skip loop counter: threshold is reasonable ===");
  {
    assertTrue(MAX_CONSECUTIVE_SKIPS >= 3, "threshold allows a few legitimate skips");
    assertTrue(MAX_CONSECUTIVE_SKIPS <= 10, "threshold catches loops quickly");
  }

  // ─── Reset clears all keys ────────────────────────────────────────────
  console.log("\n=== skip loop counter: reset clears all keys ===");
  {
    _resetUnitConsecutiveSkips();
    const map = _getUnitConsecutiveSkips();
    map.set("plan-slice/M001/S01", 2);
    map.set("plan-slice/M001/S02", 1);
    assertEq(map.size, 2, "map has 2 entries before reset");

    _resetUnitConsecutiveSkips();
    assertEq(_getUnitConsecutiveSkips().size, 0, "map empty after reset");
  }

  // ─── Eviction path: persistCompletedKey + removePersistedKey round-trip
  //     (simulates what the loop-breaker does) ───────────────────────────
  console.log("\n=== skip loop counter: eviction removes persisted key ===");
  {
    _resetUnitConsecutiveSkips();
    const base = makeTmpBase();
    try {
      const key = "plan-slice/M001/S04";
      const keySet = new Set<string>();

      persistCompletedKey(base, key);
      loadPersistedKeys(base, keySet);
      assertTrue(keySet.has(key), "key persisted before eviction");

      // Simulate loop-breaker eviction
      keySet.delete(key);
      removePersistedKey(base, key);
      const keySet2 = new Set<string>();
      loadPersistedKeys(base, keySet2);
      assertTrue(!keySet2.has(key), "key absent after eviction");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }

  // ─── Counter resets per-key, not globally ─────────────────────────────
  console.log("\n=== skip loop counter: per-key isolation ===");
  {
    _resetUnitConsecutiveSkips();
    const map = _getUnitConsecutiveSkips();
    map.set("plan-slice/M001/S04", MAX_CONSECUTIVE_SKIPS + 1);
    map.set("plan-slice/M001/S05", 1);

    // Deleting S04 (eviction) should not affect S05
    map.delete("plan-slice/M001/S04");
    assertTrue(!map.has("plan-slice/M001/S04"), "S04 evicted");
    assertEq(map.get("plan-slice/M001/S05"), 1, "S05 counter unaffected");
  }

  _resetUnitConsecutiveSkips();
  report();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
