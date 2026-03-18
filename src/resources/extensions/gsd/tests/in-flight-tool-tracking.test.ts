import test from "node:test";
import assert from "node:assert/strict";
import { markToolStart, markToolEnd, isAutoActive, getOldestInFlightToolAgeMs } from "../auto.ts";

test("markToolStart/markToolEnd are no-ops when auto-mode is inactive", () => {
  assert.ok(!isAutoActive());
  markToolStart("tool-1");
  markToolEnd("tool-1");
  // No error means the guard works
});

test("markToolEnd handles unknown and duplicate IDs gracefully", () => {
  markToolEnd("nonexistent-tool-call-id");
  markToolEnd("some-id");
  markToolEnd("some-id");
  // No error
});

test("auto.ts exports tool tracking functions", () => {
  assert.equal(typeof markToolStart, "function");
  assert.equal(typeof markToolEnd, "function");
  assert.equal(typeof getOldestInFlightToolAgeMs, "function");
});

test("getOldestInFlightToolAgeMs returns 0 when no tools in-flight", () => {
  assert.equal(getOldestInFlightToolAgeMs(), 0);
});

test("markToolStart/markToolEnd accept string toolCallIds without throwing", () => {
  assert.doesNotThrow(() => markToolStart("toolu_01ABC123"));
  assert.doesNotThrow(() => markToolEnd("toolu_01ABC123"));
});
