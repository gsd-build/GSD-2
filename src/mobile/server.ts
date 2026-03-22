/**
 * Mobile Socket Server
 *
 * Self-hosted, installable WebSocket server for mobile access to GSD sessions.
 * Includes a branded admin dashboard, user/pass authentication, and TLS support.
 *
 * Features:
 * - Admin dashboard branded to match www.gsd.build (monochrome dark theme)
 * - Username/password authentication with secure session tokens
 * - TLS support (self-signed or custom certs)
 * - Token-based mobile device pairing
 * - Bridges to the existing BridgeService for session management
 * - Multiple concurrent mobile connections
 * - Zero external dependencies (uses built-in Node.js APIs)
 */

import { createServer as createHttpServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import type { Socket } from "node:net";

import { readdirSync, statSync } from "node:fs";
import { upgradeToWebSocket } from "./websocket.ts";
import { MobileAuthManager } from "./auth.ts";
import { MobileConnection, type MobileConnectionConfig, type HandoffCallback } from "./connection.ts";
import type { MobileSessionChangedMessage } from "./protocol.ts";
import {
  loadConfig,
  saveConfig,
  verifyPassword,
  updatePassword,
  updateUsername,
  generateSessionToken,
  validateSessionToken,
  type ServerConfig,
} from "./config.ts";
import {
  renderLoginPage,
  renderDashboard,
  renderSettingsPage,
  type DashboardData,
  type SettingsData,
} from "./dashboard.ts";
import type { BridgeService } from "../web/bridge-service.ts";

export interface MobileSocketServerOptions {
  /** Port override (uses config if not set) */
  port?: number;
  /** Host override (uses config if not set) */
  host?: string;
  /** TLS cert path override */
  tlsCert?: string;
  /** TLS key path override */
  tlsKey?: string;
  /** GSD config directory (default: ~/.gsd) */
  gsdConfigDir?: string;
  /** Project working directory */
  projectCwd?: string;
  /** The BridgeService instance to proxy commands through */
  bridge: BridgeService;
  /** Max connections override */
  maxConnections?: number;
  /** Server version string */
  version?: string;
}

export interface MobileSocketServerInfo {
  host: string;
  port: number;
  secure: boolean;
  pairingCode: string;
  pairingExpiresInSeconds: number;
  url: string;
  dashboardUrl: string;
}

export class MobileSocketServer {
  private httpServer: HttpServer | HttpsServer | null = null;
  private readonly connections = new Map<string, MobileConnection>();
  private readonly auth: MobileAuthManager;
  private config: ServerConfig;
  private readonly gsdConfigDir: string;
  private readonly bridge: BridgeService;
  private readonly projectCwd: string;
  private readonly version: string;
  private connectionCounter = 0;
  private startedAt = Date.now();
  private unsubscribeBridgeWatch: (() => void) | null = null;
  private lastKnownSessionPath: string | null = null;

  // Effective runtime values (overrides take precedence over config)
  private readonly effectivePort: number;
  private readonly effectiveHost: string;
  private readonly effectiveMaxConnections: number;
  private readonly effectiveTlsCert?: string;
  private readonly effectiveTlsKey?: string;

  constructor(options: MobileSocketServerOptions) {
    this.gsdConfigDir = options.gsdConfigDir ?? join(process.env.HOME || "~", ".gsd");
    this.config = loadConfig();
    this.bridge = options.bridge;
    this.projectCwd = options.projectCwd ?? process.cwd();
    this.version = options.version ?? "1.0.0";
    this.auth = new MobileAuthManager(this.gsdConfigDir);

    // Apply overrides
    this.effectivePort = options.port ?? this.config.port;
    this.effectiveHost = options.host ?? this.config.host;
    this.effectiveMaxConnections = options.maxConnections ?? this.config.maxConnections;
    this.effectiveTlsCert = options.tlsCert ?? (this.config.tls ? this.config.tlsCert : undefined);
    this.effectiveTlsKey = options.tlsKey ?? (this.config.tls ? this.config.tlsKey : undefined);
  }

  async start(): Promise<MobileSocketServerInfo> {
    const secure = Boolean(this.effectiveTlsCert && this.effectiveTlsKey);

    if (secure) {
      this.httpServer = createHttpsServer({
        cert: readFileSync(this.effectiveTlsCert!),
        key: readFileSync(this.effectiveTlsKey!),
      });
    } else {
      this.httpServer = createHttpServer();
    }

    // Handle HTTP requests (dashboard + API)
    this.httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
      this.handleHttpRequest(req, res);
    });

    // Handle WebSocket upgrades
    this.httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
      this.handleUpgrade(req, socket, head);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.effectivePort, this.effectiveHost, () => resolve());
      this.httpServer!.on("error", reject);
    });

    this.startedAt = Date.now();
    this.lastKnownSessionPath = this.bridge.getSnapshot().activeSessionFile;

    // Watch bridge for desktop-initiated session changes
    this.unsubscribeBridgeWatch = this.bridge.subscribe((event) => {
      if (typeof event === "object" && event !== null && "type" in event && event.type === "bridge_status") {
        this.checkForSessionChange();
      }
    });

    const { code, expiresInSeconds } = this.auth.createPairingCode();
    const protocol = secure ? "wss" : "ws";
    const httpProtocol = secure ? "https" : "http";
    const displayHost = this.effectiveHost === "0.0.0.0" ? getLocalIP() : this.effectiveHost;

    return {
      host: this.effectiveHost,
      port: this.effectivePort,
      secure,
      pairingCode: code,
      pairingExpiresInSeconds: expiresInSeconds,
      url: `${protocol}://${displayHost}:${this.effectivePort}/mobile`,
      dashboardUrl: `${httpProtocol}://${displayHost}:${this.effectivePort}/dashboard`,
    };
  }

  async stop(): Promise<void> {
    if (this.unsubscribeBridgeWatch) {
      this.unsubscribeBridgeWatch();
      this.unsubscribeBridgeWatch = null;
    }
    for (const connection of this.connections.values()) {
      connection.disconnect("Server shutting down");
    }
    this.connections.clear();

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }

  generatePairingCode(): { code: string; expiresInSeconds: number } {
    return this.auth.createPairingCode();
  }

  getConnectedDevices(): Array<{ id: string; name: string; platform: string }> {
    const devices: Array<{ id: string; name: string; platform: string }> = [];
    for (const conn of this.connections.values()) {
      const device = conn.getDevice();
      if (device && conn.isAlive()) {
        devices.push({ id: device.id, name: device.name, platform: device.platform });
      }
    }
    return devices;
  }

  revokeDevice(deviceId: string): boolean {
    for (const [connId, conn] of this.connections) {
      if (conn.getDevice()?.id === deviceId) {
        conn.disconnect("Device revoked");
        this.connections.delete(connId);
      }
    }
    return this.auth.revokeDevice(deviceId);
  }

  // ── HTTP Request Handler ────────────────────────────────────────────────

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;
    const method = req.method || "GET";

    // Public routes
    if (path === "/health") {
      this.jsonResponse(res, 200, {
        status: "ok",
        connections: this.connections.size,
        maxConnections: this.effectiveMaxConnections,
        version: this.version,
      });
      return;
    }

    if (path === "/login" && method === "GET") {
      this.htmlResponse(res, 200, renderLoginPage());
      return;
    }

    if (path === "/login" && method === "POST") {
      this.handleLogin(req, res);
      return;
    }

    // Serve PWA static assets (public, no auth required)
    if (this.servePWAAsset(path, res)) {
      return;
    }

    // Protected routes — require admin session
    const sessionToken = this.getSessionCookie(req);
    if (!sessionToken || !validateSessionToken(sessionToken, this.config.sessionSecret)) {
      if (path === "/" || path === "/dashboard" || path === "/settings") {
        res.writeHead(302, { Location: "/login" });
        res.end();
        return;
      }
      // API endpoints return 401
      this.jsonResponse(res, 401, { error: "Unauthorized" });
      return;
    }

    // Authenticated routes
    switch (path) {
      case "/":
        res.writeHead(302, { Location: "/dashboard" });
        res.end();
        break;
      case "/dashboard":
        this.serveDashboard(res);
        break;
      case "/settings":
        if (method === "GET") {
          this.serveSettings(res);
        } else if (method === "POST") {
          this.handleSaveSettings(req, res);
        }
        break;
      case "/settings/credentials":
        if (method === "POST") {
          this.handleSaveCredentials(req, res);
        }
        break;
      case "/pair":
        if (method === "POST") {
          this.handlePairAction(res);
        }
        break;
      case "/revoke":
        if (method === "POST") {
          this.handleRevokeDevice(req, res);
        }
        break;
      case "/revoke-all":
        if (method === "POST") {
          this.handleRevokeAll(res);
        }
        break;
      case "/logout":
        if (method === "POST") {
          this.handleLogout(res);
        }
        break;
      case "/api/status":
        this.jsonResponse(res, 200, this.getStatusData());
        break;
      case "/api/devices":
        this.jsonResponse(res, 200, { devices: this.auth.listDevices() });
        break;
      case "/api/pair":
        if (method === "POST") {
          const { code, expiresInSeconds } = this.auth.createPairingCode();
          this.jsonResponse(res, 200, { code, expiresInSeconds });
        }
        break;
      default:
        res.writeHead(404);
        res.end("Not found");
    }
  }

  private async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const username = params.get("username") || "";
    const password = params.get("password") || "";

    if (
      username === this.config.admin.username &&
      verifyPassword(password, this.config.admin.passwordHash, this.config.admin.salt)
    ) {
      const token = generateSessionToken(this.config.sessionSecret);
      res.writeHead(302, {
        Location: "/dashboard",
        "Set-Cookie": `gsd_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      });
      res.end();

      // Mark setup as complete on first successful login
      if (!this.config.setupComplete) {
        this.config.setupComplete = true;
        saveConfig(this.config);
      }
    } else {
      this.htmlResponse(res, 200, renderLoginPage("Invalid username or password"));
    }
  }

  private handleLogout(res: ServerResponse): void {
    res.writeHead(302, {
      Location: "/login",
      "Set-Cookie": "gsd_session=; Path=/; HttpOnly; Max-Age=0",
    });
    res.end();
  }

  private serveDashboard(res: ServerResponse): void {
    const snapshot = this.bridge.getSnapshot();
    const { code, expiresInSeconds } = this.auth.createPairingCode();
    const displayHost = this.effectiveHost === "0.0.0.0" ? getLocalIP() : this.effectiveHost;
    const secure = Boolean(this.effectiveTlsCert && this.effectiveTlsKey);
    const protocol = secure ? "wss" : "ws";

    const data: DashboardData = {
      serverName: this.config.serverName,
      serverUrl: `${protocol}://${displayHost}:${this.effectivePort}/mobile`,
      secure,
      port: this.effectivePort,
      connections: this.connections.size,
      maxConnections: this.effectiveMaxConnections,
      devices: this.auth.listDevices().map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        pairedAt: new Date(d.pairedAt).toLocaleDateString(),
        lastSeenAt: new Date(d.lastSeenAt).toLocaleDateString(),
      })),
      pairingCode: code,
      pairingExpires: expiresInSeconds,
      uptime: formatUptime(Date.now() - this.startedAt),
      bridgePhase: snapshot.phase,
      activeSessionId: snapshot.activeSessionId,
      projectCwd: this.projectCwd,
    };

    this.htmlResponse(res, 200, renderDashboard(data));
  }

  private serveSettings(res: ServerResponse, success?: boolean, error?: string): void {
    const data: SettingsData = {
      serverName: this.config.serverName,
      port: this.config.port,
      host: this.config.host,
      tls: this.config.tls,
      maxConnections: this.config.maxConnections,
      username: this.config.admin.username,
      success,
      error,
    };
    this.htmlResponse(res, 200, renderSettingsPage(data));
  }

  private async handleSaveSettings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const params = new URLSearchParams(body);

    this.config.serverName = params.get("serverName") || this.config.serverName;
    this.config.port = parseInt(params.get("port") || String(this.config.port), 10);
    this.config.host = params.get("host") || this.config.host;
    this.config.maxConnections = parseInt(params.get("maxConnections") || String(this.config.maxConnections), 10);
    this.config.tls = params.has("tls");

    saveConfig(this.config);
    this.serveSettings(res, true);
  }

  private async handleSaveCredentials(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const params = new URLSearchParams(body);

    const currentPassword = params.get("currentPassword") || "";
    const newUsername = params.get("username") || "";
    const newPassword = params.get("newPassword") || "";

    if (!verifyPassword(currentPassword, this.config.admin.passwordHash, this.config.admin.salt)) {
      this.serveSettings(res, false, "Current password is incorrect");
      return;
    }

    if (newUsername) {
      this.config = updateUsername(this.config, newUsername);
    }
    if (newPassword) {
      this.config = updatePassword(this.config, newPassword);
    }

    saveConfig(this.config);
    this.serveSettings(res, true);
  }

  private handlePairAction(res: ServerResponse): void {
    this.auth.createPairingCode();
    res.writeHead(302, { Location: "/dashboard" });
    res.end();
  }

  private async handleRevokeDevice(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    const deviceId = params.get("deviceId");
    if (deviceId) {
      this.revokeDevice(deviceId);
    }
    res.writeHead(302, { Location: "/dashboard#devices" });
    res.end();
  }

  private handleRevokeAll(res: ServerResponse): void {
    this.auth.revokeAll();
    for (const [connId, conn] of this.connections) {
      conn.disconnect("All devices revoked");
      this.connections.delete(connId);
    }
    res.writeHead(302, { Location: "/dashboard#devices" });
    res.end();
  }

  // ── WebSocket Upgrade ───────────────────────────────────────────────────

  private handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    if (this.connections.size >= this.effectiveMaxConnections) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    const ws = upgradeToWebSocket(req, socket, head, "/mobile");
    if (!ws) return;

    const connId = `mobile-${++this.connectionCounter}`;
    const config: MobileConnectionConfig = {
      bridge: this.bridge,
      auth: this.auth,
      projectCwd: this.projectCwd,
      serverVersion: this.version,
      onHandoff: (event) => this.handleHandoffEvent(event),
      listSessions: () => this.listProjectSessions(),
    };

    const connection = new MobileConnection(connId, ws, config);
    this.connections.set(connId, connection);

    ws.on("close", () => {
      this.connections.delete(connId);
    });
  }

  // ── Session Handoff & Multi-Client Coordination ──────────────────────

  private handleHandoffEvent(event: {
    type: "session_taken" | "session_released";
    connectionId: string;
    deviceName: string;
    sessionPath: string | null;
  }): void {
    if (event.type === "session_taken" && event.sessionPath) {
      // Notify all OTHER attached connections that the session changed
      const notification: MobileSessionChangedMessage = {
        type: "session_changed",
        sessionId: this.bridge.getSnapshot().activeSessionId,
        sessionPath: event.sessionPath,
        sessionName: this.bridge.getSnapshot().sessionState?.sessionName,
        changedBy: "mobile",
        changedByDevice: event.deviceName,
      };

      for (const [id, conn] of this.connections) {
        if (id !== event.connectionId && conn.isAttached()) {
          conn.notifySessionChanged(notification);
        }
      }

      this.lastKnownSessionPath = event.sessionPath;
    }
  }

  /** Detect when the desktop (or bridge) changes the active session */
  private checkForSessionChange(): void {
    const snapshot = this.bridge.getSnapshot();
    const currentPath = snapshot.activeSessionFile;

    if (currentPath && currentPath !== this.lastKnownSessionPath) {
      // Session changed externally (desktop user switched)
      const notification: MobileSessionChangedMessage = {
        type: "session_changed",
        sessionId: snapshot.activeSessionId,
        sessionPath: currentPath,
        sessionName: snapshot.sessionState?.sessionName,
        changedBy: "desktop",
      };

      for (const conn of this.connections.values()) {
        if (conn.isAttached()) {
          conn.notifySessionChanged(notification);
        }
      }

      this.lastKnownSessionPath = currentPath;
    }
  }

  /** List all session files for the current project */
  private listProjectSessions(): Array<{
    id: string;
    path: string;
    name?: string;
    createdAt: string;
    modifiedAt: string;
    messageCount: number;
    isActive: boolean;
  }> {
    const snapshot = this.bridge.getSnapshot();
    const sessionsDir = snapshot.projectSessionsDir;

    if (!sessionsDir || !existsSync(sessionsDir)) return [];

    try {
      const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));
      const sessions: Array<{
        id: string;
        path: string;
        name?: string;
        createdAt: string;
        modifiedAt: string;
        messageCount: number;
        isActive: boolean;
      }> = [];

      for (const file of files) {
        const filePath = join(sessionsDir, file);
        try {
          const stat = statSync(filePath);
          const content = readFileSync(filePath, "utf-8");
          const lines = content.split("\n").filter(Boolean);

          let id = "";
          let name: string | undefined;
          let messageCount = 0;

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.type === "session") {
                id = entry.id || id;
              } else if (entry.type === "session_info" && entry.name) {
                name = entry.name;
              } else if (entry.type === "message") {
                messageCount++;
              }
            } catch { /* skip malformed lines */ }
          }

          if (id) {
            sessions.push({
              id,
              path: filePath,
              name,
              createdAt: stat.birthtime.toISOString(),
              modifiedAt: stat.mtime.toISOString(),
              messageCount,
              isActive: filePath === snapshot.activeSessionFile,
            });
          }
        } catch { /* skip unreadable files */ }
      }

      sessions.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      return sessions;
    } catch {
      return [];
    }
  }

  // ── PWA Static Files ─────────────────────────────────────────────────

  private servePWAAsset(path: string, res: ServerResponse): boolean {
    // Map PWA routes to static files
    const MIME_TYPES: Record<string, string> = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
    };

    // PWA app routes (serve index.html for the SPA)
    const pwaRoutes = ["/app", "/app/"];
    const pwaAssets = ["/app.css", "/app.js", "/manifest.json", "/service-worker.js"];
    const pwaIconPrefixes = ["/icons/"];

    let filePath: string | null = null;
    let contentType = "text/html";

    // Resolve the pwa directory relative to this module
    const thisDir = typeof __dirname !== "undefined"
      ? __dirname
      : fileURLToPath(new URL(".", import.meta.url));
    const pwaDir = join(thisDir, "pwa");

    if (pwaRoutes.includes(path)) {
      filePath = join(pwaDir, "index.html");
      contentType = "text/html";
    } else if (pwaAssets.includes(path)) {
      filePath = join(pwaDir, path);
      contentType = MIME_TYPES[extname(path)] || "application/octet-stream";
    } else if (path.startsWith("/icons/")) {
      filePath = join(pwaDir, path);
      contentType = MIME_TYPES[extname(path)] || "application/octet-stream";
    }

    if (!filePath || !existsSync(filePath)) return false;

    try {
      const content = readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": contentType === "text/html" ? "no-cache" : "public, max-age=86400",
      });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private getStatusData(): Record<string, unknown> {
    const snapshot = this.bridge.getSnapshot();
    return {
      status: "ok",
      serverName: this.config.serverName,
      connections: this.connections.size,
      maxConnections: this.effectiveMaxConnections,
      devices: this.auth.listDevices().length,
      bridgePhase: snapshot.phase,
      activeSessionId: snapshot.activeSessionId,
      uptime: Date.now() - this.startedAt,
      version: this.version,
    };
  }

  private getSessionCookie(req: IncomingMessage): string | null {
    const cookies = req.headers.cookie || "";
    const match = cookies.match(/gsd_session=([^;]+)/);
    return match ? match[1]! : null;
  }

  private htmlResponse(res: ServerResponse, status: number, html: string): void {
    res.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(html);
  }

  private jsonResponse(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  }
}

// ── Utility Functions ─────────────────────────────────────────────────────

function getLocalIP(): string {
  try {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {
    // Fallback
  }
  return "localhost";
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      // Limit body size to 64KB
      if (Buffer.concat(chunks).length > 65536) {
        req.destroy();
        resolve("");
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolve(""));
  });
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
