/**
 * Minimal type stubs for @gsd/pi-coding-agent.
 *
 * The full package builds its own dist/ only during release. These stubs give
 * the TypeScript checker enough information to type-check mission-control
 * without requiring a full monorepo build in CI.
 */
declare module "@gsd/pi-coding-agent" {
  export type OAuthProviderId = string;

  export interface OAuthAuthInfo {
    url: string;
    instructions?: string;
  }

  export interface OAuthPrompt {
    message: string;
    placeholder?: string;
    allowEmpty?: boolean;
  }

  export type AuthCredential =
    | { type: "oauth"; access_token: string; refresh_token?: string; [key: string]: unknown }
    | { type: "api_key"; key: string; [key: string]: unknown };

  export interface OAuthLoginCallbacks {
    onAuth: (info: OAuthAuthInfo) => void;
    onPrompt: (prompt: OAuthPrompt) => Promise<string>;
    onProgress?: (message: string) => void;
    onManualCodeInput?: () => Promise<string>;
    signal?: AbortSignal;
  }

  export class AuthStorage {
    static create(filePath: string): AuthStorage;
    static inMemory(data?: Record<string, AuthCredential | AuthCredential[]>): AuthStorage;
    reload(): void;
    list(): OAuthProviderId[];
    login(providerId: OAuthProviderId, callbacks: OAuthLoginCallbacks): Promise<void>;
    logout(providerId: OAuthProviderId): void;
    set(providerId: string, credential: AuthCredential): void;
    getAll(): Record<string, AuthCredential | AuthCredential[]>;
  }
}
