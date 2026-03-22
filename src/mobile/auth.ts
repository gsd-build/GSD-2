/**
 * Mobile Socket Authentication
 *
 * Token-based pairing system for mobile clients. Generates a one-time
 * pairing code that the user enters on their mobile device to establish
 * a trusted connection. After pairing, a persistent device token is issued.
 *
 * Tokens and paired devices are stored in ~/.gsd/mobile-auth.json.
 */

import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";

export interface PairedDevice {
  id: string;
  name: string;
  platform: "ios" | "android" | "web" | "unknown";
  tokenHash: string;
  pairedAt: string;
  lastSeenAt: string;
}

interface PairingCode {
  code: string;
  expiresAt: number;
  createdAt: string;
}

interface MobileAuthStore {
  devices: PairedDevice[];
  activePairingCode: PairingCode | null;
}

const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEVICE_TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generatePairingCode(): string {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(PAIRING_CODE_LENGTH, "0");
}

function generateDeviceToken(): string {
  return randomBytes(DEVICE_TOKEN_BYTES).toString("hex");
}

function generateDeviceId(): string {
  return randomBytes(8).toString("hex");
}

export class MobileAuthManager {
  private store: MobileAuthStore;
  private readonly storePath: string;

  constructor(gsdConfigDir: string) {
    this.storePath = join(gsdConfigDir, "mobile-auth.json");
    this.store = this.load();
  }

  private load(): MobileAuthStore {
    if (!existsSync(this.storePath)) {
      return { devices: [], activePairingCode: null };
    }

    try {
      const data = readFileSync(this.storePath, "utf-8");
      return JSON.parse(data) as MobileAuthStore;
    } catch {
      return { devices: [], activePairingCode: null };
    }
  }

  private save(): void {
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), "utf-8");
    chmodSync(this.storePath, 0o600);
  }

  /**
   * Generate a new pairing code for display to the user.
   * Only one active pairing code exists at a time.
   */
  createPairingCode(): { code: string; expiresInSeconds: number } {
    const code = generatePairingCode();
    this.store.activePairingCode = {
      code,
      expiresAt: Date.now() + PAIRING_CODE_TTL_MS,
      createdAt: new Date().toISOString(),
    };
    this.save();
    return { code, expiresInSeconds: PAIRING_CODE_TTL_MS / 1000 };
  }

  /**
   * Attempt to authenticate with a pairing code.
   * Returns a device token on success, null on failure.
   */
  redeemPairingCode(
    code: string,
    deviceName: string,
    platform: "ios" | "android" | "web" | "unknown" = "unknown",
  ): { token: string; deviceId: string } | null {
    const active = this.store.activePairingCode;

    if (!active || active.code !== code || Date.now() > active.expiresAt) {
      return null;
    }

    // Consume the pairing code
    this.store.activePairingCode = null;

    // Issue a device token
    const token = generateDeviceToken();
    const deviceId = generateDeviceId();
    const device: PairedDevice = {
      id: deviceId,
      name: deviceName || "Unknown Device",
      platform,
      tokenHash: hashToken(token),
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    this.store.devices.push(device);
    this.save();

    return { token, deviceId };
  }

  /**
   * Validate a device token.
   * Returns the device info if valid, null otherwise.
   */
  validateToken(token: string): PairedDevice | null {
    const hash = hashToken(token);
    const device = this.store.devices.find((d) => d.tokenHash === hash);

    if (!device) {
      return null;
    }

    // Update last seen
    device.lastSeenAt = new Date().toISOString();
    this.save();

    return device;
  }

  /**
   * Revoke a specific device's access.
   */
  revokeDevice(deviceId: string): boolean {
    const index = this.store.devices.findIndex((d) => d.id === deviceId);
    if (index === -1) return false;

    this.store.devices.splice(index, 1);
    this.save();
    return true;
  }

  /**
   * Revoke all paired devices.
   */
  revokeAll(): void {
    this.store.devices = [];
    this.store.activePairingCode = null;
    this.save();
  }

  /**
   * List all paired devices.
   */
  listDevices(): PairedDevice[] {
    return [...this.store.devices];
  }
}
