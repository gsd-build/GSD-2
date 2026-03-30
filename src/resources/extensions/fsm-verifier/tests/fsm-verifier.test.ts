// GSD Extension — FSM Verifier Tests
// Tests for the FSM verification tool extension.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("FSM Verifier Tool", () => {
  let executeFn: any;

  test("setup — capture execute function via mock registerTool", async () => {
    const mockPi = {
      registerTool: (tool: any) => {
        executeFn = tool.execute;
      }
    };

    const extension = (await import("../../fsm-verifier.ts")).default;
    extension(mockPi as any);
    assert.ok(executeFn, "executeFn should be captured from registerTool");
  });

  test("valid FSM with simple transitions", async () => {
    const params = {
      states: ["start", "middle", "end"],
      transitions: [
        { from: "start", to: "middle" },
        { from: "middle", to: "end" }
      ],
      initial_state: "start",
      final_states: ["end"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("FSM Verification Complete"));
    assert(content.includes("Failed: 0"));
    assert(!content.includes("Errors"));
  });

  test("FSM with unreachable states", async () => {
    const params = {
      states: ["start", "middle", "end", "unreachable"],
      transitions: [
        { from: "start", to: "middle" },
        { from: "middle", to: "end" }
      ],
      initial_state: "start",
      final_states: ["end"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Unreachable states: unreachable"));
  });

  test("FSM with invalid initial state", async () => {
    const params = {
      states: ["start", "middle", "end"],
      transitions: [
        { from: "start", to: "middle" },
        { from: "middle", to: "end" }
      ],
      initial_state: "invalid",
      final_states: ["end"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Initial state 'invalid' not in states list"));
  });

  test("FSM with dead end at a reachable non-final state", async () => {
    const params = {
      states: ["start", "dead"],
      transitions: [
        { from: "start", to: "dead" }
        // dead has no outgoing transitions and is not final
      ],
      initial_state: "start",
      final_states: []
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Failed: 100"));
    assert(content.includes("Errors"));
    assert(content.includes("Dead end"));
  });

  test("signal aborted returns cancellation message", async () => {
    const params = {
      states: ["start", "end"],
      transitions: [{ from: "start", to: "end" }],
      initial_state: "start",
      final_states: ["end"]
    };

    const signal = { aborted: true };
    const result = await executeFn("test-id", params, signal, null, {});

    assert.strictEqual(result.content[0].text, "FSM verification cancelled");
  });

  test("invalid final states are reported", async () => {
    const params = {
      states: ["start", "end"],
      transitions: [{ from: "start", to: "end" }],
      initial_state: "start",
      final_states: ["nonexistent"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Invalid final states: nonexistent"));
  });
});
