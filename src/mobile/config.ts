/**
 * Mobile Socket Server Configuration
 *
 * Manages server configuration stored in ~/.gsd/mobile-server.json.
 * Handles first-run setup, credential management, and TLS config.
 */

import { randomBytes, createHash, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface ServerConfig {
  /** Server port (default: 3001) */
  port: number;
  /** Bind host (default: 0.0.0.0) */
  host: string;
  /** Enable TLS */
  tls: boolean;
  /** TLS cert path (auto-generated if tls=true and not set) */
  tlsCert?: string;
  /** TLS key path (auto-generated if tls=true and not set) */
  tlsKey?: string;
  /** Max concurrent mobile connections */
  maxConnections: number;
  /** Admin credentials */
  admin: {
    username: string;
    /** scrypt hash of the password */
    passwordHash: string;
    /** Salt used for hashing */
    salt: string;
  };
  /** Secret for signing session tokens */
  sessionSecret: string;
  /** Whether setup has been completed */
  setupComplete: boolean;
  /** Server display name */
  serverName: string;
}

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_MAX_CONNECTIONS = 5;
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "gsd-mobile";
const SCRYPT_KEYLEN = 64;

function getConfigDir(): string {
  return join(homedir(), ".gsd");
}

function getConfigPath(): string {
  return join(getConfigDir(), "mobile-server.json");
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt || randomBytes(16).toString("hex");
  const hash = scryptSync(password, useSalt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt: useSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: computed } = hashPassword(password, salt);
  // Constant-time comparison
  if (computed.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

export function createDefaultConfig(): ServerConfig {
  const { hash, salt } = hashPassword(DEFAULT_PASSWORD);
  return {
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    tls: false,
    maxConnections: DEFAULT_MAX_CONNECTIONS,
    admin: {
      username: DEFAULT_USERNAME,
      passwordHash: hash,
      salt,
    },
    sessionSecret: randomBytes(32).toString("hex"),
    setupComplete: false,
    serverName: `${homedir().split("/").pop()}'s GSD Server`,
  };
}

export function loadConfig(): ServerConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    const config = createDefaultConfig();
    saveConfig(config);
    return config;
  }

  try {
    const data = readFileSync(configPath, "utf-8");
    return JSON.parse(data) as ServerConfig;
  } catch {
    const config = createDefaultConfig();
    saveConfig(config);
    return config;
  }
}

export function saveConfig(config: ServerConfig): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  chmodSync(configPath, 0o600);
}

export function updatePassword(config: ServerConfig, newPassword: string): ServerConfig {
  const { hash, salt } = hashPassword(newPassword);
  return {
    ...config,
    admin: {
      ...config.admin,
      passwordHash: hash,
      salt,
    },
  };
}

export function updateUsername(config: ServerConfig, newUsername: string): ServerConfig {
  return {
    ...config,
    admin: {
      ...config.admin,
      username: newUsername,
    },
  };
}

export function generateSessionToken(secret: string): string {
  const payload = randomBytes(32).toString("hex");
  const timestamp = Date.now().toString(36);
  const data = `${payload}.${timestamp}`;
  const sig = createHash("sha256").update(data + secret).digest("hex").slice(0, 16);
  return `${data}.${sig}`;
}

export function validateSessionToken(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [payload, timestamp, sig] = parts;
  const data = `${payload}.${timestamp}`;
  const expectedSig = createHash("sha256").update(data + secret).digest("hex").slice(0, 16);
  if (sig !== expectedSig) return false;

  // Token valid for 24 hours
  const ts = parseInt(timestamp!, 36);
  if (isNaN(ts)) return false;
  const age = Date.now() - ts;
  return age < 24 * 60 * 60 * 1000;
}
