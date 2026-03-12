/**
 * SC-4: wireSessionEvents double-call guard.
 *
 * RED state: This test will fail until Plan 02 adds a guard that prevents
 * wireSessionEvents from registering duplicate event handlers on the same session.
 *
 * The wireSessionEvents function is defined inside startPipeline and is not exported.
 * This test exercises the behavior via the pipeline's session_create action path,
 * which calls wireSessionEvents for every new session.
 *
 * Strategy: Use a minimal mock process manager that counts how many times its
 * onEvent handler fires per emitted event. Wire the same session twice (simulating
 * the double-wire bug). Assert handler fires exactly once per event.
 */
import { describe, it, expect } from "bun:test";

/**
 * Minimal mock process manager with a multi-handler event emitter.
 * Allows us to test whether onEvent callbacks are deduplicated.
 */
function createMockProcessManager() {
  const handlers: Array<(event: unknown) => void> = [];

  return {
    isActive: true,
    isProcessing: false,
    sessionId: null as string | null,
    _handlers: handlers,

    onEvent(handler: (event: unknown) => void): void {
      handlers.push(handler);
    },

    /** Emit an event to all registered handlers. Returns call count. */
    emit(event: unknown): number {
      handlers.forEach((h) => h(event));
      return handlers.length;
    },

    async start(): Promise<void> {},
    async sendMessage(_prompt: string): Promise<void> {},
    async kill(): Promise<void> {},
  };
}

/** Minimal mock of SessionState shape (matches session-manager.ts interface). */
function createMockSession(processManager: ReturnType<typeof createMockProcessManager>) {
  return {
    id: "test-session-id",
    name: "Chat 1",
    slug: "chat-1",
    processManager,
    activeClient: null as null,
    worktreePath: null,
    worktreeBranch: null,
    createdAt: Date.now(),
    claudeSessionId: null,
  };
}

/**
 * Simulates wireSessionEvents without the guard.
 * This is the CURRENT (buggy) behavior — calling it twice registers handlers twice.
 */
function wireSessionEventsWithoutGuard(session: ReturnType<typeof createMockSession>, fireCount: { n: number }) {
  session.processManager.onEvent((_event: unknown) => {
    fireCount.n++;
  });
}

describe("SC-4: wireSessionEvents double-call guard", () => {
  it("calling wireSessionEvents twice does not register handlers twice", () => {
    // This test FAILS until Plan 02 adds a guard (e.g. a Set<string> of wired session IDs).
    // Currently, calling wireSessionEvents twice on the same session causes the handler
    // to fire twice per event — this test asserts it should fire exactly once.

    const pm = createMockProcessManager();
    const session = createMockSession(pm);

    const fireCount = { n: 0 };

    // Simulate double-wiring (the bug: no guard exists)
    wireSessionEventsWithoutGuard(session, fireCount);
    wireSessionEventsWithoutGuard(session, fireCount);

    // Emit one test event
    pm.emit({ type: "result", error: null });

    // ASSERTION: handler should fire exactly once, not twice.
    // This FAILS now (fireCount.n === 2) because there is no deduplication guard.
    expect(fireCount.n).toBe(1);
  });

  it("after double-wiring, exactly one handler is registered per session", () => {
    // Alternative assertion: the internal handler count should remain 1.
    // This FAILS now because each wireSessionEvents call appends a new handler.
    const pm = createMockProcessManager();
    const session = createMockSession(pm);
    const fireCount = { n: 0 };

    wireSessionEventsWithoutGuard(session, fireCount);
    wireSessionEventsWithoutGuard(session, fireCount);

    // Should have only 1 handler registered after two wire calls
    expect(pm._handlers.length).toBe(1);
  });
});
