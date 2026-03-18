import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  markToolStart,
  markToolEnd,
  getOldestInFlightToolAgeMs,
  getInFlightToolCount,
  clearInFlightTools,
} from "../resources/extensions/gsd/auto-tool-tracking.js";

describe("auto-tool-tracking", () => {
  beforeEach(() => {
    clearInFlightTools();
  });

  it("tracks tool start and end", () => {
    assert.equal(getInFlightToolCount(), 0);
    markToolStart("tool-1", true);
    assert.equal(getInFlightToolCount(), 1);
    markToolEnd("tool-1");
    assert.equal(getInFlightToolCount(), 0);
  });

  it("skips tracking when not active", () => {
    markToolStart("tool-1", false);
    assert.equal(getInFlightToolCount(), 0);
  });

  it("returns 0 age when no tools in flight", () => {
    assert.equal(getOldestInFlightToolAgeMs(), 0);
  });

  it("returns positive age for in-flight tools", () => {
    markToolStart("tool-1", true);
    // Age should be very small (< 100ms)
    assert.ok(getOldestInFlightToolAgeMs() < 100);
  });

  it("clears all in-flight tools", () => {
    markToolStart("tool-1", true);
    markToolStart("tool-2", true);
    assert.equal(getInFlightToolCount(), 2);
    clearInFlightTools();
    assert.equal(getInFlightToolCount(), 0);
  });
});
