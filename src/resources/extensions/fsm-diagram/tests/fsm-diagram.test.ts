// GSD Extension — FSM Diagram Generator Tests
// Tests for the Mermaid diagram generation tool.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("FSM Diagram Generator Tool", () => {
  let executeFn: any;

  test("setup — capture execute function via mock registerTool", async () => {
    const mockPi = {
      registerTool: (tool: any) => {
        executeFn = tool.execute;
      }
    };

    const extension = (await import("../../fsm-diagram.ts")).default;
    extension(mockPi as any);
    assert.ok(executeFn, "executeFn should be captured from registerTool");
  });

  test("generate simple diagram", async () => {
    const params = {
      states: ["start", "end"],
      transitions: [{ from: "start", to: "end", event: "finish" }],
      initial_state: "start",
      final_states: ["end"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("```mermaid"));
    assert(content.includes("stateDiagram-v2"));
    assert(content.includes("[*] --> start"));
    assert(content.includes("start --> end : finish"));
    assert(content.includes("end --> [*]"));
    assert(content.includes("```"));
  });

  test("generate diagram with title and direction", async () => {
    const params = {
      states: ["A", "B"],
      transitions: [{ from: "A", to: "B" }],
      initial_state: "A",
      final_states: ["B"],
      title: "Test FSM",
      direction: "LR"
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("title: Test FSM"));
    assert(content.includes("direction LR"));
  });

  test("handle invalid initial state", async () => {
    const params = {
      states: ["A", "B"],
      transitions: [{ from: "A", to: "B" }],
      initial_state: "invalid",
      final_states: ["B"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Initial state 'invalid' not in states list"));
  });

  test("format state names with special characters", async () => {
    const params = {
      states: ["state with spaces", "state-with-dashes"],
      transitions: [{ from: "state with spaces", to: "state-with-dashes" }],
      initial_state: "state with spaces",
      final_states: ["state-with-dashes"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("state_with_spaces"));
    assert(content.includes("state_with_dashes"));
  });

  test("signal aborted returns cancellation message", async () => {
    const params = {
      states: ["A", "B"],
      transitions: [{ from: "A", to: "B" }],
      initial_state: "A",
      final_states: ["B"]
    };

    const signal = { aborted: true };
    const result = await executeFn("test-id", params, signal, null, {});

    assert.strictEqual(result.content[0].text, "FSM diagram generation cancelled");
  });

  test("invalid final states are reported", async () => {
    const params = {
      states: ["A", "B"],
      transitions: [{ from: "A", to: "B" }],
      initial_state: "A",
      final_states: ["nonexistent"]
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("Invalid final states: nonexistent"));
  });

  test("default direction is TB when not specified", async () => {
    const params = {
      states: ["A", "B"],
      transitions: [{ from: "A", to: "B" }],
      initial_state: "A",
    };

    const result = await executeFn("test-id", params, null, null, {});
    const content = result.content[0].text;

    assert(content.includes("direction TB"));
  });
});