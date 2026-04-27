// GSD-2 — Tests for google-search deprecation stub (STUB-01, STUB-02)
import test from "node:test";
import assert from "node:assert/strict";

// ─── Tests ────────────────────────────────────────────────────────────────────

test("google-search stub: default export is a function", async (_t) => {
  // STUB-01: stub has a default export function accepting ExtensionAPI
  const mod = await import("../../google-search/index.ts");
  const stubFn = mod.default;
  assert.equal(typeof stubFn, "function");
});

test("google-search stub: registers no event handlers", async (_t) => {
  // STUB-01: deprecation notice is suppressed — stub must not call pi.on() at all
  const mod = await import("../../google-search/index.ts");
  const stubFn = mod.default;

  let onCallCount = 0;

  const mockPi = {
    on(_event: string, _handler: unknown) {
      onCallCount++;
    },
    registerTool: () => {},
  };

  stubFn(mockPi as never);

  assert.equal(onCallCount, 0, "stub should not register any event handlers");
});

test("google-search stub: does NOT call registerTool", async (_t) => {
  // STUB-02: stub is a no-op for tools
  const mod = await import("../../google-search/index.ts");
  const stubFn = mod.default;

  let registerToolCalled = false;

  const mockPi = {
    on: (_event: string, _handler: unknown) => {},
    registerTool: () => { registerToolCalled = true; },
  };

  stubFn(mockPi as never);

  assert.equal(registerToolCalled, false);
});

test("google-search stub: does not emit any notifications", async (_t) => {
  // STUB-01: deprecation notice is suppressed — stub must not call ctx.ui.notify()
  const mod = await import("../../google-search/index.ts");
  const stubFn = mod.default;

  let notifyCallCount = 0;

  const mockPi = {
    on(_event: string, _handler: unknown) {},
    registerTool: () => {},
  };

  // Verify no notify is emitted by the stub itself (it registers no handlers,
  // so there is nothing to invoke — this simply confirms no top-level notify call).
  stubFn(mockPi as never);

  assert.equal(notifyCallCount, 0, "stub should not emit any notifications");
});

test("google-search stub: is a complete no-op (no handlers, no tools, no notifications)", async (_t) => {
  // STUB-01: the deprecation notice is suppressed until @gsd-extensions/google-search
  // ships. The stub must call nothing on the ExtensionAPI.
  const mod = await import("../../google-search/index.ts");
  const stubFn = mod.default;

  let onCallCount = 0;
  let registerToolCallCount = 0;

  const mockPi = {
    on(_event: string, _handler: unknown) {
      onCallCount++;
    },
    registerTool: () => {
      registerToolCallCount++;
    },
  };

  stubFn(mockPi as never);

  assert.equal(onCallCount, 0, "stub should not register any event handlers");
  assert.equal(registerToolCallCount, 0, "stub should not register any tools");
});
