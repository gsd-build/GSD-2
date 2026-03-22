/**
 * Tunnel / Port Forwarding for GSD Mobile
 *
 * Provides mechanisms for exposing the local mobile socket server to
 * the internet so the PWA can connect from anywhere. Supports:
 *
 * 1. SSH remote port forwarding (built-in, no dependencies)
 * 2. Cloudflare Tunnel (if cloudflared is installed)
 * 3. Manual instructions for ngrok, tailscale, etc.
 *
 * Usage from CLI:
 *   gsd mobile --expose ssh --remote-host user@server.com
 *   gsd mobile --expose cloudflare
 *   gsd mobile --expose manual
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { networkInterfaces } from "node:os";

export type TunnelMethod = "ssh" | "cloudflare" | "manual" | "lan";

export interface TunnelOptions {
  /** Local port the mobile server is listening on */
  localPort: number;
  /** Tunnel method */
  method: TunnelMethod;
  /** For SSH: remote host (user@host) */
  remoteHost?: string;
  /** For SSH: remote port to bind on the server */
  remotePort?: number;
  /** For Cloudflare: custom hostname */
  hostname?: string;
}

export interface TunnelResult {
  method: TunnelMethod;
  /** The public URL the PWA can connect to */
  publicUrl: string;
  /** The WebSocket URL */
  wsUrl: string;
  /** Cleanup function to shut down the tunnel */
  stop: () => void;
  /** Child process (if applicable) */
  process?: ChildProcess;
}

/**
 * Start a tunnel to expose the local mobile server
 */
export async function startTunnel(options: TunnelOptions): Promise<TunnelResult> {
  switch (options.method) {
    case "ssh":
      return startSSHTunnel(options);
    case "cloudflare":
      return startCloudflareTunnel(options);
    case "lan":
      return getLANInfo(options);
    case "manual":
      return getManualInstructions(options);
    default:
      throw new Error(`Unknown tunnel method: ${options.method}`);
  }
}

/**
 * Detect available tunnel methods on this system
 */
export function detectAvailableMethods(): TunnelMethod[] {
  const methods: TunnelMethod[] = ["lan", "manual"];

  // Check for SSH
  try {
    execSync("ssh -V", { stdio: "pipe" });
    methods.unshift("ssh");
  } catch { /* ssh not available */ }

  // Check for cloudflared
  try {
    execSync("cloudflared --version", { stdio: "pipe" });
    methods.unshift("cloudflare");
  } catch { /* cloudflared not installed */ }

  return methods;
}

// ── SSH Remote Port Forwarding ──────────────────────────────────────────

async function startSSHTunnel(options: TunnelOptions): Promise<TunnelResult> {
  if (!options.remoteHost) {
    throw new Error("SSH tunnel requires --remote-host (e.g., user@server.com)");
  }

  const remotePort = options.remotePort || options.localPort;
  const remoteHost = options.remoteHost;

  // ssh -R remotePort:localhost:localPort -N -o ExitOnForwardFailure=yes user@host
  const child = spawn("ssh", [
    "-R", `${remotePort}:localhost:${options.localPort}`,
    "-N",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    remoteHost,
  ], {
    stdio: "pipe",
  });

  // Wait for the connection to establish (or fail)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("SSH tunnel timed out after 15 seconds"));
    }, 15000);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`SSH tunnel failed: ${err.message}`));
    });

    child.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      // SSH prints errors to stderr; if we see "remote forwarding" it's working
      if (msg.includes("Warning") || msg.includes("Allocated")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    // Give SSH a moment to establish, then assume success if no error
    setTimeout(() => {
      clearTimeout(timeout);
      if (child.exitCode === null) {
        resolve(); // Still running = probably connected
      }
    }, 3000);
  });

  const hostPart = remoteHost.includes("@") ? remoteHost.split("@")[1] : remoteHost;
  const publicUrl = `http://${hostPart}:${remotePort}`;

  return {
    method: "ssh",
    publicUrl,
    wsUrl: `ws://${hostPart}:${remotePort}/mobile`,
    stop: () => { child.kill(); },
    process: child,
  };
}

// ── Cloudflare Tunnel ───────────────────────────────────────────────────

async function startCloudflareTunnel(options: TunnelOptions): Promise<TunnelResult> {
  // cloudflared tunnel --url http://localhost:PORT
  const child = spawn("cloudflared", [
    "tunnel",
    "--url", `http://localhost:${options.localPort}`,
    ...(options.hostname ? ["--hostname", options.hostname] : []),
  ], {
    stdio: "pipe",
  });

  // Parse the public URL from cloudflared output
  const publicUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Cloudflare tunnel timed out after 30 seconds"));
    }, 30000);

    let output = "";

    child.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
      // cloudflared prints the URL to stderr
      const match = output.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]!);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Cloudflare tunnel failed: ${err.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });
  });

  const wsUrl = publicUrl.replace("https://", "wss://") + "/mobile";

  return {
    method: "cloudflare",
    publicUrl,
    wsUrl,
    stop: () => { child.kill(); },
    process: child,
  };
}

// ── LAN Info ────────────────────────────────────────────────────────────

function getLANInfo(options: TunnelOptions): TunnelResult {
  const ip = getLocalIP();
  return {
    method: "lan",
    publicUrl: `http://${ip}:${options.localPort}`,
    wsUrl: `ws://${ip}:${options.localPort}/mobile`,
    stop: () => {},
  };
}

// ── Manual Instructions ─────────────────────────────────────────────────

function getManualInstructions(options: TunnelOptions): TunnelResult {
  const ip = getLocalIP();
  return {
    method: "manual",
    publicUrl: `http://${ip}:${options.localPort}`,
    wsUrl: `ws://${ip}:${options.localPort}/mobile`,
    stop: () => {},
  };
}

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
  } catch { /* fallback */ }
  return "localhost";
}

/**
 * Print tunnel instructions to the console
 */
export function printTunnelInstructions(result: TunnelResult, pairingCode: string): void {
  console.log("");

  switch (result.method) {
    case "ssh":
      console.log("  ┌──────────────────────────────────────────────────┐");
      console.log("  │           SSH Remote Port Forward Active         │");
      console.log("  └──────────────────────────────────────────────────┘");
      console.log("");
      console.log(`  Public URL:    ${result.publicUrl}`);
      console.log(`  WebSocket:     ${result.wsUrl}`);
      console.log(`  Dashboard:     ${result.publicUrl}/dashboard`);
      console.log(`  Mobile App:    ${result.publicUrl}/app`);
      console.log(`  Pairing Code:  ${pairingCode}`);
      break;

    case "cloudflare":
      console.log("  ┌──────────────────────────────────────────────────┐");
      console.log("  │         Cloudflare Tunnel Active                 │");
      console.log("  └──────────────────────────────────────────────────┘");
      console.log("");
      console.log(`  Public URL:    ${result.publicUrl}`);
      console.log(`  WebSocket:     ${result.wsUrl}`);
      console.log(`  Mobile App:    ${result.publicUrl}/app`);
      console.log(`  Pairing Code:  ${pairingCode}`);
      console.log("");
      console.log("  This URL is accessible from anywhere on the internet.");
      break;

    case "lan":
      console.log("  ┌──────────────────────────────────────────────────┐");
      console.log("  │              LAN Access                          │");
      console.log("  └──────────────────────────────────────────────────┘");
      console.log("");
      console.log(`  Local URL:     ${result.publicUrl}`);
      console.log(`  WebSocket:     ${result.wsUrl}`);
      console.log(`  Mobile App:    ${result.publicUrl}/app`);
      console.log(`  Pairing Code:  ${pairingCode}`);
      console.log("");
      console.log("  Your phone must be on the same WiFi network.");
      break;

    case "manual":
      console.log("  ┌──────────────────────────────────────────────────┐");
      console.log("  │         Manual Port Forwarding                   │");
      console.log("  └──────────────────────────────────────────────────┘");
      console.log("");
      console.log("  Forward your local port to a public server using one of:");
      console.log("");
      console.log("  SSH:");
      console.log(`    ssh -R 3001:localhost:${result.publicUrl.split(":").pop()} user@your-server.com -N`);
      console.log("");
      console.log("  ngrok:");
      console.log(`    ngrok http ${result.publicUrl.split(":").pop()}`);
      console.log("");
      console.log("  Tailscale:");
      console.log(`    tailscale funnel ${result.publicUrl.split(":").pop()}`);
      console.log("");
      console.log("  Then open the public URL + /app on your phone.");
      console.log(`  Pairing Code: ${pairingCode}`);
      break;
  }

  console.log("");
}
