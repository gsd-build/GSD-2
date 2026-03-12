/**
 * Tests for reconnecting WebSocket pure functions:
 * - Exponential backoff delay calculation
 * - Sequence-based message filtering
 * - State update application (full replace / diff merge)
 * - Reconnect detection (isReconnect)
 */
import { describe, test, expect } from "bun:test";
import {
  calculateBackoffDelay,
  shouldProcessMessage,
  applyStateUpdate,
  isReconnect,
} from "../src/hooks/useReconnectingWebSocket";
import type { PlanningState, StateDiff } from "../src/server/types";

// -- Reconnect detection --

describe("onReconnect callback", () => {
  test("isReconnect(0) returns false — first connection, not a reconnect", () => {
    expect(isReconnect(0)).toBe(false);
  });

  test("isReconnect(1) returns true — reconnect after first failure", () => {
    expect(isReconnect(1)).toBe(true);
  });
});

// -- Backoff delay calculation --

describe("calculateBackoffDelay", () => {
  test("attempt 0 gives 1s base delay", () => {
    const delay = calculateBackoffDelay(0);
    // Without jitter, base is 1000ms
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(1100); // max 10% jitter
  });

  test("attempt 1 gives 2s base delay", () => {
    const delay = calculateBackoffDelay(1);
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(2200);
  });

  test("attempt 2 gives 4s base delay", () => {
    const delay = calculateBackoffDelay(2);
    expect(delay).toBeGreaterThanOrEqual(4000);
    expect(delay).toBeLessThanOrEqual(4400);
  });

  test("caps at 30s regardless of attempt count", () => {
    const delay = calculateBackoffDelay(20);
    expect(delay).toBeLessThanOrEqual(33000); // 30s + 10% jitter
    expect(delay).toBeGreaterThanOrEqual(30000);
  });

  test("jitter adds 0-10% random delay on top of base", () => {
    // Run multiple times to verify jitter range
    const delays = Array.from({ length: 100 }, () => calculateBackoffDelay(0));
    const min = Math.min(...delays);
    const max = Math.max(...delays);
    // Base is 1000, jitter adds 0-100
    expect(min).toBeGreaterThanOrEqual(1000);
    expect(max).toBeLessThanOrEqual(1100);
  });
});

// -- Sequence filtering --

describe("shouldProcessMessage", () => {
  test("accepts message with sequence > lastProcessed", () => {
    expect(shouldProcessMessage(5, 4)).toBe(true);
  });

  test("rejects message with sequence === lastProcessed", () => {
    expect(shouldProcessMessage(4, 4)).toBe(false);
  });

  test("rejects message with sequence < lastProcessed", () => {
    expect(shouldProcessMessage(3, 4)).toBe(false);
  });

  test("accepts first message (lastProcessed = 0, sequence = 1)", () => {
    expect(shouldProcessMessage(1, 0)).toBe(true);
  });
});

// -- State update application --

const mockState: PlanningState = {
  roadmap: { phases: [{ completed: false, number: 1, name: "Setup", description: "Initial" }] },
  state: {
    milestone: "v1.0",
    milestone_name: "milestone",
    status: "in_progress",
    stopped_at: "",
    last_updated: "",
    last_activity: "",
    progress: { total_phases: 10, completed_phases: 1, total_plans: 5, completed_plans: 2, percent: 40 },
  },
  config: {
    model_profile: "balanced",
    commit_docs: false,
    search_gitignored: false,
    branching_strategy: "none",
    phase_branch_template: "",
    milestone_branch_template: "",
    workflow: { research: true, plan_check: true, verifier: true, nyquist_validation: true, _auto_chain_active: false },
    parallelization: true,
    brave_search: false,
    mode: "yolo",
    granularity: "fine",
  },
  phases: [],
  requirements: [],
};

describe("applyStateUpdate", () => {
  test('"full" message replaces entire state', () => {
    const newState: PlanningState = {
      ...mockState,
      state: { ...mockState.state, status: "complete" },
    };
    const msg: StateDiff = {
      type: "full",
      changes: newState,
      timestamp: Date.now(),
      sequence: 1,
    };

    const result = applyStateUpdate(null, msg);
    expect(result).not.toBeNull();
    expect(result!.state.status).toBe("complete");
  });

  test('"full" message replaces previous state entirely', () => {
    const newState: PlanningState = {
      ...mockState,
      requirements: [{ id: "REQ-01", description: "test", completed: true }],
    };
    const msg: StateDiff = {
      type: "full",
      changes: newState,
      timestamp: Date.now(),
      sequence: 2,
    };

    const result = applyStateUpdate(mockState, msg);
    expect(result!.requirements).toHaveLength(1);
    expect(result!.requirements[0].id).toBe("REQ-01");
  });

  test('"diff" message merges changes into existing state', () => {
    const msg: StateDiff = {
      type: "diff",
      changes: {
        state: { ...mockState.state, status: "complete", stopped_at: "Done" },
      },
      timestamp: Date.now(),
      sequence: 3,
    };

    const result = applyStateUpdate(mockState, msg);
    expect(result!.state.status).toBe("complete");
    expect(result!.state.stopped_at).toBe("Done");
    // Other fields preserved
    expect(result!.roadmap).toEqual(mockState.roadmap);
    expect(result!.config).toEqual(mockState.config);
  });

  test('"diff" on null state returns null (cannot diff without base)', () => {
    const msg: StateDiff = {
      type: "diff",
      changes: { state: mockState.state },
      timestamp: Date.now(),
      sequence: 1,
    };

    const result = applyStateUpdate(null, msg);
    expect(result).toBeNull();
  });
});
