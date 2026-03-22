/**
 * Remote Connection Client
 *
 * Allows a GSD app instance to connect OUTBOUND to a remote mobile socket
 * server. This enables two scenarios:
 *
 * 1. "Connect to remote" — GSD on machine A connects to a mobile server
 *    running on machine B, exposing its local session to the remote server.
 *
 * 2. "Expose for PWA" — GSD starts a local mobile server AND opens a
 *    tunnel/port forward so the PWA can connect from anywhere.
 *
 * The client bridges the local BridgeService to the remote server by
 * forwarding session events outbound and proxying inbound commands.
 */

import { createConnection, type Socket } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";

export interface RemoteClientOptions {
  /** Remote server URL (ws:// or wss://) */
  serverUrl: string;
  /** Device token for authentication (from prior pairing) */
  deviceToken?: string;
  /** Pairing code for first-time connection */
  pairingCode?: string;
  /** Device name to register as */
  deviceName?: string;
  /** Reconnect on disconnect */
  autoReconnect?: boolean;
  /** Max reconnect attempts */
  maxReconnectAttempts?: number;
}

export interface RemoteClientEvents {
  connected: () => void;
  authenticated: (data: { serverVersion: string; projectCwd: string }) => void;
  paired: (data: { deviceToken: string; deviceId: string }) => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  message: (msg: Record<string, unknown>) => void;
}

type RemoteClientState = "disconnected" | "connecting" | "connected" | "authenticated";

export class RemoteClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private state: RemoteClientState = "disconnected";
  private options: RemoteClientOptions;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private requestCounter = 0;

  constructor(options: RemoteClientOptions) {
    super();
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.state !== "disconnected") {
      throw new Error(`Cannot connect: already ${this.state}`);
    }

    this.state = "connecting";

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.serverUrl);
      } catch (err) {
        this.state = "disconnected";
        reject(new Error(`Invalid server URL: ${this.options.serverUrl}`));
        return;
      }

      const timeout = setTimeout(() => {
        if (this.state === "connecting") {
          this.ws?.close();
          this.state = "disconnected";
          reject(new Error("Connection timed out"));
        }
      }, 15000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.state = "connected";
        this.reconnectAttempts = 0;
        this.emit("connected");
        this.startPing();

        // Authenticate
        this.ws!.send(JSON.stringify({
          type: "auth",
          token: this.options.pairingCode || this.options.deviceToken || "",
          deviceName: this.options.deviceName || `GSD ${process.platform}`,
          platform: "web",
        }));

        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
          this.handleMessage(msg);
        } catch { /* skip malformed */ }
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this.cleanup();
        this.emit("disconnected", "Connection closed");

        if (this.options.autoReconnect && this.state !== "disconnected") {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        if (this.state === "connecting") {
          this.state = "disconnected";
          reject(new Error("Connection failed"));
        }
        this.emit("error", new Error("WebSocket error"));
      };
    });
  }

  disconnect(): void {
    this.options.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
    this.state = "disconnected";
  }

  send(msg: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    this.ws.send(JSON.stringify(msg));
  }

  sendRequest(type: string, data: Record<string, unknown> = {}): string {
    const id = `rc-${++this.requestCounter}`;
    this.send({ type, id, ...data });
    return id;
  }

  /** Request handoff of the active session */
  requestHandoff(sessionPath?: string): string {
    return this.sendRequest("handoff_request", sessionPath ? { sessionPath } : {});
  }

  /** Browse available sessions */
  browseSessions(query?: string): string {
    return this.sendRequest("browse_sessions", query ? { query } : {});
  }

  /** Send a prompt */
  sendPrompt(message: string): string {
    return this.sendRequest("prompt", { message });
  }

  /** Abort current operation */
  sendAbort(): string {
    return this.sendRequest("abort");
  }

  getState(): RemoteClientState {
    return this.state;
  }

  isAuthenticated(): boolean {
    return this.state === "authenticated";
  }

  // ── Internal ────────────────────────────────────────────

  private handleMessage(msg: Record<string, unknown>): void {
    if (msg.type === "auth_result") {
      if (msg.success) {
        this.state = "authenticated";
        this.emit("authenticated", {
          serverVersion: msg.serverVersion,
          projectCwd: msg.projectCwd,
        });
      } else {
        this.emit("error", new Error(String(msg.error || "Authentication failed")));
        this.disconnect();
      }
    }

    if (msg.type === "response" && msg.id === "pairing" && msg.success) {
      const data = msg.data as { deviceToken: string; deviceId: string };
      this.options.deviceToken = data.deviceToken;
      this.emit("paired", data);
    }

    if (msg.type === "pong") return;

    this.emit("message", msg);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanup(): void {
    this.stopPing();
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private attemptReconnect(): void {
    const max = this.options.maxReconnectAttempts ?? 5;
    if (this.reconnectAttempts >= max) {
      this.state = "disconnected";
      this.emit("disconnected", "Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = 2000 * Math.pow(2, this.reconnectAttempts - 1);
    this.reconnectTimer = setTimeout(() => {
      this.state = "disconnected";
      this.connect().catch(() => {});
    }, delay);
  }
}
