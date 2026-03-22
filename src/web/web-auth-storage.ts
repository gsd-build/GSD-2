import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { getEnvApiKey } from "../../packages/pi-ai/src/web-runtime-env-api-keys.ts";
import {
  getOAuthProvider,
  getOAuthProviders,
  type OAuthCredentials,
  type OAuthLoginCallbacks,
  type OAuthProviderInterface,
} from "../../packages/pi-ai/dist/oauth.js";

export type ApiKeyCredential = {
  type: "api_key";
  key: string;
};

export type OAuthCredential = {
  type: "oauth";
} & OAuthCredentials;

export type StoredCredential = ApiKeyCredential | OAuthCredential;
export type StoredCredentialEntry = StoredCredential | StoredCredential[];
export type StoredCredentialData = Record<string, StoredCredentialEntry>;

export interface OnboardingAuthStorage {
  reload(): void;
  set(provider: string, credential: StoredCredential): void;
  getCredentialsForProvider(provider: string): StoredCredential[];
  hasAuth(provider: string): boolean;
  getOAuthProviders(): OAuthProviderInterface[];
  login(providerId: string, callbacks: OAuthLoginCallbacks): Promise<void>;
  logout(providerId: string): void;
}

function ensureAuthFile(authPath: string): void {
  const parentDir = dirname(authPath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }
  if (!existsSync(authPath)) {
    writeFileSync(authPath, "{}", "utf-8");
    chmodSync(authPath, 0o600);
  }
}

function parseStoredCredentialData(content: string | undefined): StoredCredentialData {
  if (!content || !content.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(content) as StoredCredentialData;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export class FileOnboardingAuthStorage implements OnboardingAuthStorage {
  private data: StoredCredentialData = {};
  private readonly authPath: string;

  constructor(authPath: string) {
    this.authPath = authPath;
    this.reload();
  }

  reload(): void {
    ensureAuthFile(this.authPath);
    this.data = parseStoredCredentialData(readFileSync(this.authPath, "utf-8"));
  }

  getCredentialsForProvider(provider: string): StoredCredential[] {
    const entry = this.data[provider];
    if (!entry) return [];
    return Array.isArray(entry) ? entry : [entry];
  }

  set(provider: string, credential: StoredCredential): void {
    const existing = this.getCredentialsForProvider(provider);
    const next =
      credential.type === "api_key"
        ? this.mergeApiKeyCredentials(existing, credential)
        : this.mergeOAuthCredential(existing, credential);

    this.data[provider] = next.length === 1 ? next[0] : next;
    writeFileSync(this.authPath, JSON.stringify(this.data, null, 2), "utf-8");
    chmodSync(this.authPath, 0o600);
  }

  hasAuth(provider: string): boolean {
    if (this.getCredentialsForProvider(provider).length > 0) {
      return true;
    }
    return Boolean(getEnvApiKey(provider));
  }

  getOAuthProviders(): OAuthProviderInterface[] {
    return getOAuthProviders();
  }

  async login(providerId: string, callbacks: OAuthLoginCallbacks): Promise<void> {
    const provider = getOAuthProvider(providerId);
    if (!provider) {
      throw new Error(`Unknown OAuth provider: ${providerId}`);
    }

    const credentials = await provider.login(callbacks);
    this.set(providerId, { type: "oauth", ...credentials });
  }

  logout(providerId: string): void {
    delete this.data[providerId];
    writeFileSync(this.authPath, JSON.stringify(this.data, null, 2), "utf-8");
    chmodSync(this.authPath, 0o600);
  }

  private mergeApiKeyCredentials(existing: StoredCredential[], credential: ApiKeyCredential): StoredCredential[] {
    const alreadyStored = existing.some((entry) => entry.type === "api_key" && entry.key === credential.key);
    if (alreadyStored) {
      return existing;
    }
    return [...existing, credential];
  }

  private mergeOAuthCredential(existing: StoredCredential[], credential: OAuthCredential): StoredCredential[] {
    const apiKeys = existing.filter((entry) => entry.type === "api_key");
    return [...apiKeys, credential];
  }
}

export function createOnboardingAuthStorage(authPath: string): OnboardingAuthStorage {
  return new FileOnboardingAuthStorage(authPath);
}
