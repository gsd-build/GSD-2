// GSD-FSM Extension — Tool Registration Tests
// Verifies all three tools register correctly via the extension entry point.

import { describe, test, before } from "node:test";
import assert from "node:assert/strict";

describe("gsd-fsm extension", () => {
  const registeredTools: any[] = [];

  before(async () => {
    const mockPi = {
      registerTool: (tool: any) => {
        registeredTools.push(tool);
      },
    };

    const extension = (await import("../index.ts")).default;
    extension(mockPi as any);
  });

  test("registers exactly 3 tools", () => {
    assert.equal(registeredTools.length, 3);
  });

  test("registers fsm_gsd_status", () => {
    const tool = registeredTools.find((t) => t.name === "fsm_gsd_status");
    assert.ok(tool, "fsm_gsd_status should be registered");
    assert.ok(tool.description.includes("state machine status"));
  });

  test("registers fsm_gsd_verify", () => {
    const tool = registeredTools.find((t) => t.name === "fsm_gsd_verify");
    assert.ok(tool, "fsm_gsd_verify should be registered");
    assert.ok(tool.description.includes("integrity"));
  });

  test("registers fsm_gsd_history", () => {
    const tool = registeredTools.find((t) => t.name === "fsm_gsd_history");
    assert.ok(tool, "fsm_gsd_history should be registered");
    assert.ok(tool.description.includes("history"));
  });

  test("all tools have execute functions", () => {
    for (const tool of registeredTools) {
      assert.equal(typeof tool.execute, "function", `${tool.name} should have execute`);
    }
  });

  test("all tools handle abort signal", async () => {
    for (const tool of registeredTools) {
      const signal = { aborted: true };
      const result = await tool.execute("test-id", {}, signal);
      assert.ok(
        result.content[0].text.includes("cancelled"),
        `${tool.name} should return cancelled message on abort`,
      );
    }
  });
});
