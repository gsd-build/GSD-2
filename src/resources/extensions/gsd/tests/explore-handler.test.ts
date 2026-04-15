/**
 * Behavioral tests for handleExplore — verifies the handler's guard logic
 * without requiring a running CLI or LLM session.
 *
 * Covers manual test plan items:
 * - /gsd explore (no topic) → Usage warning, no dispatch
 * - /gsd explore !!!@@@ (all special chars) → letter/number warning, no dispatch
 * - /gsd explore distributed systems → pi.sendMessage called with correct args
 */

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleExplore } from "../commands-handlers.js";

type NotifyCall = { message: string; severity: string };
type SendMessageCall = { payload: Record<string, unknown>; opts: Record<string, unknown> };

function makeCtx() {
  const calls: NotifyCall[] = [];
  return {
    calls,
    ui: {
      notify(message: string, severity: string) {
        calls.push({ message, severity });
      },
    },
  };
}

function makePi() {
  const calls: SendMessageCall[] = [];
  return {
    calls,
    sendMessage(payload: Record<string, unknown>, opts: Record<string, unknown>) {
      calls.push({ payload, opts });
    },
  };
}

describe("handleExplore — guard logic", () => {
  test("empty topic: shows Usage warning and does not dispatch", async () => {
    const ctx = makeCtx();
    const pi = makePi();

    await handleExplore("", ctx as never, pi as never);

    assert.strictEqual(ctx.calls.length, 1, "exactly one notify call");
    assert.ok(ctx.calls[0].message.includes("Usage"), "message should contain 'Usage'");
    assert.strictEqual(ctx.calls[0].severity, "warning");
    assert.strictEqual(pi.calls.length, 0, "sendMessage must not be called");
  });

  test("whitespace-only topic: shows Usage warning and does not dispatch", async () => {
    const ctx = makeCtx();
    const pi = makePi();

    await handleExplore("   ", ctx as never, pi as never);

    assert.strictEqual(ctx.calls[0].severity, "warning");
    assert.strictEqual(pi.calls.length, 0, "sendMessage must not be called");
  });

  test("all-special-chars topic: shows letter/number warning and does not dispatch", async () => {
    const ctx = makeCtx();
    const pi = makePi();

    await handleExplore("!!!@@@###", ctx as never, pi as never);

    assert.strictEqual(ctx.calls.length, 1);
    assert.ok(
      ctx.calls[0].message.includes("letter or number"),
      `expected 'letter or number' in: "${ctx.calls[0].message}"`,
    );
    assert.strictEqual(ctx.calls[0].severity, "warning");
    assert.strictEqual(pi.calls.length, 0, "sendMessage must not be called");
  });

  test("valid topic: fires info notify and dispatches via pi.sendMessage", async () => {
    const ctx = makeCtx();
    const pi = makePi();

    await handleExplore("distributed systems", ctx as never, pi as never);

    assert.strictEqual(ctx.calls.length, 1);
    assert.strictEqual(ctx.calls[0].severity, "info");
    assert.ok(ctx.calls[0].message.includes("distributed systems"));

    assert.strictEqual(pi.calls.length, 1, "sendMessage called exactly once");
    const { payload, opts } = pi.calls[0];
    assert.strictEqual((payload as { customType: string }).customType, "gsd-explore");
    assert.ok(
      typeof (payload as { content: string }).content === "string" &&
        (payload as { content: string }).content.length > 0,
      "content should be a non-empty prompt string",
    );
    assert.strictEqual((opts as { triggerTurn: boolean }).triggerTurn, true);
  });

  test("valid topic: prompt content includes the topic", async () => {
    const ctx = makeCtx();
    const pi = makePi();

    await handleExplore("auth strategy", ctx as never, pi as never);

    const content = (pi.calls[0].payload as { content: string }).content;
    assert.ok(content.includes("auth strategy"), "prompt should include the topic verbatim");
  });
});
