/**
 * Tests for applyGSD2Event pure helper function.
 *
 * Tests state transitions for auto mode indicators:
 * - auto_mode_announcement start/stop → isAutoMode flag
 * - process_crashed → isCrashed flag
 * - phase_transition → message insert with role="phase_transition"
 * - tool_use → message insert with role="tool_use"
 */
import { describe, test, expect } from "bun:test";
import { applyGSD2Event } from "../src/hooks/useSessionManager";
import type { GSD2StreamEvent } from "../src/server/chat-types";

// Base state helper
function baseState(overrides?: { isAutoMode?: boolean; isCrashed?: boolean }) {
  return { isAutoMode: false, isCrashed: false, ...overrides };
}

// -- auto_mode_announcement --

describe("applyGSD2Event - auto_mode_announcement", () => {
  test("mode=start sets isAutoMode to true", () => {
    const event: GSD2StreamEvent = { kind: "auto_mode_announcement", mode: "start" };
    const result = applyGSD2Event(event, baseState());
    expect(result.isAutoMode).toBe(true);
    expect(result.isCrashed).toBe(false);
    expect(result.messageInsert).toBeUndefined();
  });

  test("mode=stop sets isAutoMode to false", () => {
    const event: GSD2StreamEvent = { kind: "auto_mode_announcement", mode: "stop" };
    const result = applyGSD2Event(event, baseState({ isAutoMode: true }));
    expect(result.isAutoMode).toBe(false);
    expect(result.isCrashed).toBe(false);
    expect(result.messageInsert).toBeUndefined();
  });
});

// -- phase_transition --

describe("applyGSD2Event - phase_transition", () => {
  test("phase_transition inserts message with role='phase_transition'", () => {
    const event: GSD2StreamEvent = { kind: "phase_transition", phase: "Planning" };
    const result = applyGSD2Event(event, baseState());
    expect(result.messageInsert).toBeDefined();
    expect(result.messageInsert!.role).toBe("phase_transition");
    expect(result.messageInsert!.content).toBe("Planning");
    expect(result.messageInsert!.streaming).toBe(false);
    expect(result.messageInsert!.phaseTransition?.phase).toBe("Planning");
  });
});

// -- tool_use --

describe("applyGSD2Event - tool_use", () => {
  test("tool_use inserts message with role='tool_use' and toolName set", () => {
    const event: GSD2StreamEvent = { kind: "tool_use", name: "bash", input: { command: "ls" } };
    const result = applyGSD2Event(event, baseState());
    expect(result.messageInsert).toBeDefined();
    expect(result.messageInsert!.role).toBe("tool_use");
    expect(result.messageInsert!.toolName).toBe("bash");
    expect(result.messageInsert!.toolInput).toEqual({ command: "ls" });
    expect(result.messageInsert!.streaming).toBe(true);
  });
});

// -- process_crashed (raw event) --

describe("applyGSD2Event - isCrashed passthrough", () => {
  test("state with isCrashed=true is preserved through unrelated events", () => {
    const event: GSD2StreamEvent = { kind: "auto_mode_announcement", mode: "stop" };
    // process_crashed sets isCrashed via separate path in hook
    // applyGSD2Event auto_mode_announcement stop does NOT reset isCrashed (only hook does)
    const result = applyGSD2Event(event, baseState({ isCrashed: true }));
    expect(result.isAutoMode).toBe(false);
    // isCrashed is NOT touched by applyGSD2Event for auto_mode events
    expect(result.isCrashed).toBe(true);
  });
});
