/**
 * Mobile Socket CLI Launcher
 *
 * Provides the `gsd mobile` command for self-hosting the mobile socket server.
 * Handles server lifecycle, displays pairing codes, manages devices, and setup.
 *
 * Usage:
 *   gsd mobile                    Start the mobile socket server
 *   gsd mobile --port 3001        Start on a specific port
 *   gsd mobile --tls              Enable TLS with auto-generated self-signed cert
 *   gsd mobile --tls-cert <path>  Use a custom TLS certificate
 *   gsd mobile --tls-key <path>   Use a custom TLS key
 *   gsd mobile --expose ssh --remote-host user@server.com  Expose via SSH tunnel
 *   gsd mobile --expose cloudflare                         Expose via Cloudflare
 *   gsd mobile --expose lan                                Show LAN connection info
 *   gsd mobile connect ws://remote:3001/mobile             Connect to remote server
 *   gsd mobile setup              Run interactive setup
 *   gsd mobile pair               Generate a new pairing code
 *   gsd mobile devices            List paired devices
 *   gsd mobile revoke <id>        Revoke a device
 *   gsd mobile revoke-all         Revoke all devices
 */

import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

import { MobileSocketServer, type MobileSocketServerOptions, type MobileSocketServerInfo } from "./server.ts";
import { MobileAuthManager } from "./auth.ts";
import { loadConfig, saveConfig, updatePassword, updateUsername, type ServerConfig } from "./config.ts";
import { startTunnel, detectAvailableMethods, printTunnelInstructions, type TunnelMethod, type TunnelResult } from "./tunnel.ts";
import { RemoteClient } from "./remote-client.ts";

export interface MobileCLIOptions {
  command?: "start" | "setup" | "pair" | "devices" | "revoke" | "revoke-all" | "connect";
  port?: number;
  host?: string;
  tls?: boolean;
  tlsCert?: string;
  tlsKey?: string;
  gsdConfigDir?: string;
  projectCwd?: string;
  revokeDeviceId?: string;
  /** BridgeService factory — the caller must provide this */
  createBridge: () => any;
  version?: string;
  /** Expose method for port forwarding */
  expose?: TunnelMethod;
  /** SSH remote host for --expose ssh */
  remoteHost?: string;
  /** Remote port for SSH forwarding */
  remotePort?: number;
  /** Remote server URL for "connect" command */
  connectUrl?: string;
  /** Pairing code for "connect" command */
  connectCode?: string;
}

export async function runMobileCLI(options: MobileCLIOptions): Promise<void> {
  const gsdConfigDir = options.gsdConfigDir ?? join(homedir(), ".gsd");
  const command = options.command ?? "start";

  switch (command) {
    case "setup": {
      runSetup(gsdConfigDir);
      return;
    }

    case "pair": {
      const auth = new MobileAuthManager(gsdConfigDir);
      const { code, expiresInSeconds } = auth.createPairingCode();
      printBox("Mobile Pairing Code", [
        `Code: ${formatPairingCode(code)}`,
        `Expires in: ${expiresInSeconds} seconds`,
        "",
        "Enter this code in your GSD mobile app to connect.",
      ]);
      return;
    }

    case "devices": {
      const auth = new MobileAuthManager(gsdConfigDir);
      const devices = auth.listDevices();
      if (devices.length === 0) {
        console.log("  No paired devices.");
        return;
      }

      console.log("");
      console.log("  Paired Devices");
      console.log("  ──────────────");
      for (const device of devices) {
        console.log(`  ${device.name} (${device.platform})`);
        console.log(`    ID: ${device.id}`);
        console.log(`    Paired: ${device.pairedAt}`);
        console.log(`    Last seen: ${device.lastSeenAt}`);
        console.log("");
      }
      return;
    }

    case "revoke": {
      if (!options.revokeDeviceId) {
        console.error("  Error: Device ID required. Use `gsd mobile devices` to list device IDs.");
        process.exitCode = 1;
        return;
      }
      const auth = new MobileAuthManager(gsdConfigDir);
      const revoked = auth.revokeDevice(options.revokeDeviceId);
      console.log(revoked
        ? `  Device ${options.revokeDeviceId} has been revoked.`
        : `  Device ${options.revokeDeviceId} not found.`);
      return;
    }

    case "revoke-all": {
      const auth = new MobileAuthManager(gsdConfigDir);
      auth.revokeAll();
      console.log("  All devices have been revoked.");
      return;
    }

    case "connect": {
      await connectToRemoteServer(options);
      return;
    }

    case "start": {
      await startMobileServer(options);
      return;
    }
  }
}

function runSetup(gsdConfigDir: string): void {
  const config = loadConfig();

  printBox("GSD Mobile Server Setup", [
    "Configure your self-hosted mobile socket server.",
    "",
    `Config file: ${join(gsdConfigDir, "mobile-server.json")}`,
  ]);

  console.log("");
  console.log("  Current configuration:");
  console.log(`    Server name:     ${config.serverName}`);
  console.log(`    Port:            ${config.port}`);
  console.log(`    Host:            ${config.host}`);
  console.log(`    TLS:             ${config.tls ? "enabled" : "disabled"}`);
  console.log(`    Max connections: ${config.maxConnections}`);
  console.log(`    Admin username:  ${config.admin.username}`);
  console.log(`    Setup complete:  ${config.setupComplete}`);
  console.log("");
  console.log("  Default credentials: admin / gsd-mobile");
  console.log("  Change these in the dashboard settings after starting the server.");
  console.log("");
  console.log("  To start the server:");
  console.log("    gsd mobile");
  console.log("");
  console.log("  To start with TLS:");
  console.log("    gsd mobile --tls");
  console.log("");
}

async function startMobileServer(options: MobileCLIOptions): Promise<void> {
  const gsdConfigDir = options.gsdConfigDir ?? join(homedir(), ".gsd");
  const config = loadConfig();

  // Resolve TLS options
  let tlsCert = options.tlsCert;
  let tlsKey = options.tlsKey;

  if ((options.tls || config.tls) && !tlsCert && !tlsKey) {
    const certDir = join(gsdConfigDir, "mobile-tls");
    const certPath = join(certDir, "cert.pem");
    const keyPath = join(certDir, "key.pem");

    if (!existsSync(certPath) || !existsSync(keyPath)) {
      console.log("  Generating self-signed TLS certificate...");
      generateSelfSignedCert(certDir, certPath, keyPath);
    }

    tlsCert = certPath;
    tlsKey = keyPath;
  }

  const bridge = options.createBridge();

  const serverOptions: MobileSocketServerOptions = {
    port: options.port,
    host: options.host,
    gsdConfigDir,
    projectCwd: options.projectCwd ?? process.cwd(),
    bridge,
    tlsCert,
    tlsKey,
    version: options.version,
  };

  const server = new MobileSocketServer(serverOptions);
  const info = await server.start();

  printServerBanner(info, config);

  // Start tunnel if --expose was specified
  let tunnel: TunnelResult | null = null;
  if (options.expose) {
    try {
      console.log(`  Starting ${options.expose} tunnel...`);
      tunnel = await startTunnel({
        localPort: info.port,
        method: options.expose,
        remoteHost: options.remoteHost,
        remotePort: options.remotePort,
      });
      printTunnelInstructions(tunnel, formatPairingCode(info.pairingCode));
    } catch (err) {
      console.error(`  Failed to start tunnel: ${err instanceof Error ? err.message : err}`);
      console.log("");
      console.log("  The server is still running locally. Connect via LAN or set up");
      console.log("  port forwarding manually.");
      console.log("");
    }
  }

  // Handle shutdown
  const shutdown = async () => {
    console.log("\n  Shutting down mobile socket server...");
    tunnel?.stop();
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Regenerate pairing code periodically
  setInterval(() => {
    const { code, expiresInSeconds } = server.generatePairingCode();
    console.log(`  New pairing code: ${formatPairingCode(code)} (expires in ${expiresInSeconds}s)`);
  }, 5 * 60 * 1000);

  // Keep the process alive
  await new Promise<void>(() => {});
}

async function connectToRemoteServer(options: MobileCLIOptions): Promise<void> {
  const url = options.connectUrl;
  if (!url) {
    console.error("  Error: Server URL required.");
    console.error("  Usage: gsd mobile connect ws://host:port/mobile --code 123456");
    process.exitCode = 1;
    return;
  }

  // Normalize URL
  let wsUrl = url;
  if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
    wsUrl = `ws://${wsUrl}`;
  }
  if (!wsUrl.endsWith("/mobile")) {
    wsUrl = wsUrl.replace(/\/$/, "") + "/mobile";
  }

  const gsdConfigDir = options.gsdConfigDir ?? join(homedir(), ".gsd");
  const tokenFile = join(gsdConfigDir, "mobile-remote-token.json");

  // Load saved device token if available
  let savedToken: string | undefined;
  let savedDeviceId: string | undefined;
  if (existsSync(tokenFile)) {
    try {
      const data = JSON.parse(require("node:fs").readFileSync(tokenFile, "utf-8"));
      if (data.serverUrl === wsUrl && data.deviceToken) {
        savedToken = data.deviceToken;
        savedDeviceId = data.deviceId;
      }
    } catch { /* ignore */ }
  }

  const client = new RemoteClient({
    serverUrl: wsUrl,
    deviceToken: savedToken,
    pairingCode: options.connectCode,
    deviceName: `GSD CLI (${require("node:os").hostname()})`,
    autoReconnect: true,
    maxReconnectAttempts: 10,
  });

  // Save token when we get paired
  client.on("paired", (data: { deviceToken: string; deviceId: string }) => {
    const { writeFileSync } = require("node:fs");
    writeFileSync(tokenFile, JSON.stringify({
      serverUrl: wsUrl,
      deviceToken: data.deviceToken,
      deviceId: data.deviceId,
    }, null, 2), "utf-8");
    require("node:fs").chmodSync(tokenFile, 0o600);
    console.log(`  Device paired and token saved.`);
  });

  client.on("authenticated", (data: { serverVersion: string; projectCwd: string }) => {
    console.log("");
    console.log("  ┌──────────────────────────────────────────────────┐");
    console.log("  │         Connected to Remote GSD Server           │");
    console.log("  └──────────────────────────────────────────────────┘");
    console.log("");
    console.log(`  Server:     ${wsUrl}`);
    console.log(`  Version:    ${data.serverVersion}`);
    console.log(`  Project:    ${data.projectCwd}`);
    console.log("");
    console.log("  Session is now accessible from this GSD instance.");
    console.log("  Press Ctrl+C to disconnect.");
    console.log("");
  });

  client.on("disconnected", (reason: string) => {
    console.log(`  Disconnected: ${reason}`);
  });

  client.on("error", (err: Error) => {
    console.error(`  Error: ${err.message}`);
  });

  client.on("message", (msg: Record<string, unknown>) => {
    // Log significant events
    if (msg.type === "session_changed") {
      console.log(`  Session changed: ${msg.sessionName || msg.sessionId} (by ${msg.changedBy})`);
    } else if (msg.type === "bridge_status") {
      console.log(`  Bridge: ${msg.phase}${msg.isStreaming ? " (streaming)" : ""}`);
    } else if (msg.type === "handoff_result") {
      if (msg.success) {
        console.log(`  Handoff complete: ${msg.sessionName || msg.sessionId}`);
      } else {
        console.log(`  Handoff failed: ${msg.error}`);
      }
    }
  });

  console.log(`  Connecting to ${wsUrl}...`);

  try {
    await client.connect();
  } catch (err) {
    console.error(`  Failed to connect: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  // Handle shutdown
  const shutdown = () => {
    console.log("\n  Disconnecting...");
    client.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise<void>(() => {});
}

function printServerBanner(info: MobileSocketServerInfo, config: ServerConfig): void {
  console.log("");
  console.log("  ┌──────────────────────────────────────────────────┐");
  console.log("  │             GSD Mobile Socket Server             │");
  console.log("  └──────────────────────────────────────────────────┘");
  console.log("");
  console.log(`  Status:      Running`);
  console.log(`  Socket URL:  ${info.url}`);
  console.log(`  Dashboard:   ${info.dashboardUrl}`);
  console.log(`  Port:        ${info.port}`);
  console.log(`  Secure:      ${info.secure ? "Yes (TLS)" : "No (plaintext)"}`);
  console.log("");
  console.log("  ┌──────────────────────────────────────────────────┐");
  console.log("  │  Pairing Code                                    │");
  console.log("  │                                                  │");
  console.log(`  │     ${formatPairingCode(info.pairingCode)}                                      │`);
  console.log("  │                                                  │");
  console.log(`  │  Expires in ${info.pairingExpiresInSeconds}s                                    │`);
  console.log("  └──────────────────────────────────────────────────┘");
  console.log("");
  console.log("  Admin Dashboard:");
  console.log(`    Open ${info.dashboardUrl} in your browser`);
  console.log(`    Login: ${config.admin.username} / (your password)`);
  if (!config.setupComplete) {
    console.log("    Default password: gsd-mobile");
  }
  console.log("");
  if (!info.secure) {
    console.log("  ⚠ Running without TLS. Use --tls for encrypted connections.");
    console.log("    Recommended for LAN use only without TLS.");
    console.log("");
  }
  console.log("  Press Ctrl+C to stop the server.");
  console.log("");
}

function printBox(title: string, lines: string[]): void {
  console.log("");
  console.log(`  ${title}`);
  console.log(`  ${"─".repeat(title.length)}`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

function formatPairingCode(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)}-${code.slice(3)}`;
  }
  return code;
}

function generateSelfSignedCert(certDir: string, certPath: string, keyPath: string): void {
  if (!existsSync(certDir)) {
    mkdirSync(certDir, { recursive: true, mode: 0o700 });
  }

  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
        `-days 365 -nodes -subj "/CN=gsd-mobile/O=GSD/C=US" ` +
        `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { stdio: "pipe" },
    );
    console.log("  TLS certificate generated successfully.");
  } catch {
    throw new Error(
      "Failed to generate self-signed certificate. Ensure openssl is installed, " +
        "or provide --tls-cert and --tls-key manually.",
    );
  }
}
