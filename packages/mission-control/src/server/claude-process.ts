/**
 * GSD process manager.
 *
 * Spawns gsd binary per user message using:
 *   gsd -p "<prompt>" --output-format stream-json --verbose
 *
 * Each message gets a fresh process.
 * Uses Node's child_process.spawn for reliable stdin/stdout on Windows
 * (Bun.spawn has known issues with stream handling on Windows).
 *
 * TODO(Phase-13): update args for Pi SDK interface (full arg mapping).
 * CRITICAL: CLAUDECODE env var is stripped to avoid "nested session" rejection.
 */

import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { StreamEvent } from "./chat-types";
import { createNdjsonParser } from "./ndjson-parser";

export interface ClaudeProcessOptions {
  allowedTools?: string[];
  model?: string;
  /**
   * Control --dangerously-skip-permissions flag.
   * - undefined (default): flag IS added (skip permissions ON)
   * - true: flag IS added (explicit skip permissions ON)
   * - false: flag is NOT added (permissions prompts enabled)
   */
  skipPermissions?: boolean;
}

/**
 * Manages gsd child processes.
 * Spawns a new process per message for reliability.
 * TODO(Phase-13): implement gsd session continuity (replaces --resume).
 */
export class ClaudeProcessManager {
  private activeProcess: ChildProcess | null = null;
  private _sessionId: string | null = null;
  private _isProcessing = false;
  private eventHandlers: Array<(event: StreamEvent) => void> = [];
  private cwd: string;
  private options: ClaudeProcessOptions;
  /** Injectable spawn function for testing. Defaults to node:child_process.spawn. */
  _spawnFn: typeof nodeSpawn = nodeSpawn;

  constructor(cwd: string, options: ClaudeProcessOptions = {}) {
    this.cwd = cwd;
    this.options = options;
  }

  get isActive(): boolean {
    return this.activeProcess !== null;
  }

  get isProcessing(): boolean {
    return this._isProcessing;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  /**
   * Register an event handler for streaming events from Claude.
   */
  onEvent(handler: (event: StreamEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  /**
   * No-op for compatibility — process is spawned per message.
   */
  async start(): Promise<void> {
    console.log("[claude-process] Ready (per-message spawn mode)");
  }

  /**
   * Send a user message by spawning a gsd process.
   * TODO(Phase-13): add gsd session continuity args.
   */
  async sendMessage(prompt: string): Promise<void> {
    if (this._isProcessing) {
      throw new Error("Claude is already processing a request. Please wait.");
    }

    this._isProcessing = true;

    const args = [
      "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
    ];

    if (this.options.allowedTools) {
      args.push("--allowedTools", this.options.allowedTools.join(","));
    }

    if (this.options.model) {
      args.push("--model", this.options.model);
    }

    // Add --dangerously-skip-permissions unless explicitly disabled
    if (this.options.skipPermissions !== false) {
      args.push("--dangerously-skip-permissions");
    }

    // Strip CLAUDECODE env var to avoid "nested session" rejection
    const env = { ...process.env };
    delete env.CLAUDECODE;

    console.log(`[claude-process] Spawning: gsd ${args.slice(0, 6).join(" ")}...`);
    console.log(`[claude-process] CWD: ${this.cwd}`);

    // Use Node's spawn for reliable stream handling on Windows
    const proc = this._spawnFn("gsd", args, {
      cwd: this.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    this.activeProcess = proc;
    let chunkCount = 0;
    let stderrText = "";

    const parser = createNdjsonParser((event) => {
      // Capture session_id from result messages
      if (event.type === "result" && event.session_id) {
        this._sessionId = event.session_id;
        console.log(`[claude-process] Session ID: ${this._sessionId}`);
      }

      // Result event means the turn is complete
      if (event.type === "result") {
        this._isProcessing = false;
      }

      for (const handler of this.eventHandlers) {
        handler(event);
      }
    });

    proc.stdout!.on("data", (chunk: Buffer) => {
      chunkCount++;
      const text = chunk.toString();
      if (chunkCount <= 5) {
        console.log(`[claude-process] stdout #${chunkCount}: ${text.slice(0, 200)}`);
      }
      parser.push(text);
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrText += text;
      console.error(`[claude-process] stderr: ${text.trim().slice(0, 300)}`);
    });

    proc.on("close", (code) => {
      console.log(`[claude-process] Exited with code ${code}. Chunks: ${chunkCount}`);
      parser.flush();
      this.activeProcess = null;

      // If process failed with no stream events, emit error
      if (code !== 0 && chunkCount === 0) {
        const errMsg = stderrText.trim() || `Claude exited with code ${code}`;
        for (const handler of this.eventHandlers) {
          handler({
            type: "result",
            error: errMsg,
          } as StreamEvent);
        }
        this._isProcessing = false;
      } else if (code !== 0 && chunkCount > 0) {
        // Process produced output but crashed — emit process_crashed event
        this._isProcessing = false;
        for (const handler of this.eventHandlers) {
          handler({
            type: "process_crashed",
            exitCode: code,
            stderr: stderrText.trim(),
          } as unknown as StreamEvent);
        }
      } else if (this._isProcessing) {
        // Safety: ensure isProcessing is cleared even if no result event
        this._isProcessing = false;
        for (const handler of this.eventHandlers) {
          handler({ type: "result" } as StreamEvent);
        }
      }
    });

    proc.on("error", (err) => {
      console.error(`[claude-process] Spawn error:`, err.message);
      this.activeProcess = null;
      this._isProcessing = false;
      for (const handler of this.eventHandlers) {
        handler({
          type: "result",
          error: `Failed to start Claude: ${err.message}`,
        } as StreamEvent);
      }
    });
  }

  /**
   * Interrupt the active process by sending SIGINT.
   * No-op if no process is currently active.
   */
  interrupt(): void {
    if (!this.activeProcess) return;
    this.activeProcess.kill("SIGINT");
  }

  /**
   * Kill the active process.
   */
  async kill(): Promise<void> {
    if (!this.activeProcess) return;
    this.activeProcess.kill();
    this.activeProcess = null;
    this._isProcessing = false;
  }
}
