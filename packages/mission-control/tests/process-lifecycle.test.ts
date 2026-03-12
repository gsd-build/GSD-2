/**
 * Process lifecycle tests — interrupt, crash event emission, killAll, cwd passthrough.
 *
 * TDD: These tests drive the new interrupt(), process_crashed event, and killAll() features.
 * Uses the same makeMockSpawn() pattern from claude-process-gsd.test.ts.
 */
import { describe, it, expect } from "bun:test";
import { ClaudeProcessManager } from "../src/server/claude-process";
import { SessionManager } from "../src/server/session-manager";
import type { IProcessManager } from "../src/server/session-manager";

// ──────────────────────────────────────────────
// Mock helpers
// ──────────────────────────────────────────────

interface MockProc {
  stdout: import("node:events").EventEmitter;
  stderr: import("node:events").EventEmitter;
  killedWith: string | null;
  exitCode?: number | null;
  /** Simulate the process closing with a given exit code. */
  simulateClose(code: number | null): void;
  /** Simulate a chunk of stdout data arriving. */
  simulateStdout(text: string): void;
  /** EventEmitter interface for proc.on("close",...) */
  on(event: string, listener: (...args: unknown[]) => void): MockProc;
  emit(event: string, ...args: unknown[]): boolean;
}

function makeMockSpawn(): {
  captured: { binary: string; args: string[]; options: Record<string, unknown> } | null;
  proc: MockProc | null;
  fn: typeof import("node:child_process").spawn;
} {
  const EventEmitter = require("node:events") as typeof import("node:events");

  let capturedProc: MockProc | null = null;
  let capturedCall: { binary: string; args: string[]; options: Record<string, unknown> } | null = null;

  const mockFn = (binary: string, args: string[], options: Record<string, unknown>) => {
    capturedCall = { binary, args, options };

    const stub = new EventEmitter() as unknown as MockProc;
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    (stub as any).stdout = stdout;
    (stub as any).stderr = stderr;

    let killedWith: string | null = null;
    (stub as any).killedWith = null;
    (stub as any).kill = (signal?: string) => {
      (stub as any).killedWith = signal ?? "SIGTERM";
    };

    (stub as any).simulateClose = (code: number | null) => {
      stub.emit("close", code);
    };

    (stub as any).simulateStdout = (text: string) => {
      stdout.emit("data", Buffer.from(text));
    };

    capturedProc = stub;
    return stub as unknown as ReturnType<typeof import("node:child_process").spawn>;
  };

  return {
    get captured() { return capturedCall; },
    get proc() { return capturedProc; },
    fn: mockFn as unknown as typeof import("node:child_process").spawn,
  };
}

// ──────────────────────────────────────────────
// Task 1 tests: interrupt() + crash event emission
// ──────────────────────────────────────────────

describe("ClaudeProcessManager.interrupt()", () => {
  it("sends SIGINT to the active process", async () => {
    const mock = makeMockSpawn();
    const manager = new ClaudeProcessManager("/tmp/test-cwd");
    manager._spawnFn = mock.fn;

    // Start a message (spawns process)
    manager.sendMessage("hello").catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    expect(mock.proc).not.toBeNull();

    manager.interrupt();

    expect((mock.proc as any).killedWith).toBe("SIGINT");
  });

  it("is a no-op when no active process (does not throw)", () => {
    const manager = new ClaudeProcessManager("/tmp/test-cwd");
    // No process started — must not throw
    expect(() => manager.interrupt()).not.toThrow();
  });
});

describe("ClaudeProcessManager process_crashed event", () => {
  it("emits process_crashed when process exits non-zero AFTER producing output", async () => {
    const mock = makeMockSpawn();
    const manager = new ClaudeProcessManager("/tmp/test-cwd");
    manager._spawnFn = mock.fn;

    const events: unknown[] = [];
    manager.onEvent((e) => events.push(e));

    manager.sendMessage("hello").catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    // Simulate some output first (chunkCount > 0)
    mock.proc!.simulateStdout("some output chunk\n");
    await new Promise((r) => setTimeout(r, 10));

    // Then process exits non-zero
    mock.proc!.simulateClose(1);
    await new Promise((r) => setTimeout(r, 10));

    const crashEvent = events.find((e: any) => e.type === "process_crashed");
    expect(crashEvent).toBeDefined();
    expect((crashEvent as any).exitCode).toBe(1);
  });

  it("emits result error (NOT process_crashed) when process exits non-zero with NO prior output", async () => {
    const mock = makeMockSpawn();
    const manager = new ClaudeProcessManager("/tmp/test-cwd");
    manager._spawnFn = mock.fn;

    const events: unknown[] = [];
    manager.onEvent((e) => events.push(e));

    manager.sendMessage("hello").catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    // No stdout — exit non-zero immediately (chunkCount === 0)
    mock.proc!.simulateClose(1);
    await new Promise((r) => setTimeout(r, 10));

    const crashEvent = events.find((e: any) => e.type === "process_crashed");
    const resultEvent = events.find((e: any) => e.type === "result");

    expect(crashEvent).toBeUndefined();
    expect(resultEvent).toBeDefined();
    expect((resultEvent as any).error).toBeDefined();
  });
});

describe("ClaudeProcessOptions.cwd passthrough", () => {
  it("uses cwd option as the spawn cwd", async () => {
    const mock = makeMockSpawn();
    const expectedCwd = "/my/project/dir";
    const manager = new ClaudeProcessManager(expectedCwd);
    manager._spawnFn = mock.fn;

    manager.sendMessage("hello").catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    expect(mock.captured).not.toBeNull();
    expect(mock.captured!.options.cwd).toBe(expectedCwd);
  });
});

// ──────────────────────────────────────────────
// Task 2 tests: SessionManager.killAll()
// ──────────────────────────────────────────────

describe("SessionManager.killAll()", () => {
  it("calls kill() on every session process manager", async () => {
    const killCalls: string[] = [];

    function makeStubPM(id: string): IProcessManager {
      return {
        isActive: false,
        isProcessing: false,
        sessionId: null,
        onEvent: () => {},
        start: async () => {},
        sendMessage: async () => {},
        kill: async () => { killCalls.push(id); },
        interrupt: () => {},
      };
    }

    const sm = new SessionManager("/tmp/test-planning", {
      processFactory: (cwd) => makeStubPM(cwd),
    });

    // Create two sessions with distinct cwds so we can track them
    sm.createSession("/cwd-a");
    sm.createSession("/cwd-b");

    await sm.killAll();

    expect(killCalls).toHaveLength(2);
    expect(killCalls).toContain("/cwd-a");
    expect(killCalls).toContain("/cwd-b");
  });

  it("is a no-op with zero sessions (does not throw)", async () => {
    const sm = new SessionManager("/tmp/test-planning");
    await expect(sm.killAll()).resolves.toBeUndefined();
  });
});
