/**
 * auth-api.ts — fetch-based auth API (talks to Bun server at /api/auth/*).
 *
 * Works in browser dev mode AND Tauri — no Tauri invoke required.
 * AuthStorage on the Bun server handles OAuth device-code flow, API key
 * storage, and token refresh transparently.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderStatus {
  active_provider: string | null;
  last_refreshed: string | null;
  expires_at: string | null;
  is_expired: boolean;
  expires_soon: boolean;
}

export interface RefreshResult {
  needs_reauth: boolean;
  refreshed: boolean;
  provider: string | null;
}

export type AuthEvent =
  | { type: "url"; url: string; instructions?: string }
  | { type: "prompt"; message: string }
  | { type: "progress"; message: string }
  | { type: "done"; provider: string }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Status queries
// ---------------------------------------------------------------------------

/**
 * Returns the active provider name, or null when no credentials are stored.
 */
export async function getActiveProvider(): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/status");
    const data = (await r.json()) as { authenticated: boolean; provider: string | null };
    return data.provider;
  } catch {
    return null;
  }
}

/**
 * Returns provider status in the shape SettingsView expects.
 * AuthStorage handles token refresh silently, so expiry fields are always benign.
 */
export async function getProviderStatus(): Promise<ProviderStatus> {
  try {
    const r = await fetch("/api/auth/status");
    const data = (await r.json()) as { authenticated: boolean; provider: string | null };
    return {
      active_provider: data.provider,
      last_refreshed: null,
      expires_at: null,
      is_expired: false,
      expires_soon: false,
    };
  } catch {
    return { active_provider: null, last_refreshed: null, expires_at: null, is_expired: false, expires_soon: false };
  }
}

/**
 * Checks auth status. AuthStorage handles silent token refresh internally,
 * so we only flag needs_reauth when no provider is configured at all.
 */
export async function checkAndRefreshToken(): Promise<RefreshResult> {
  try {
    const r = await fetch("/api/auth/status");
    const data = (await r.json()) as { authenticated: boolean; provider: string | null };
    return { needs_reauth: false, refreshed: false, provider: data.provider };
  } catch {
    return { needs_reauth: false, refreshed: false, provider: null };
  }
}

// ---------------------------------------------------------------------------
// OAuth device-code flow
// ---------------------------------------------------------------------------

/**
 * Start a device-code OAuth login via SSE. Calls onEvent for each server-sent
 * event ({ type: "url" | "prompt" | "progress" | "done" | "error" }).
 *
 * Returns an AbortController — call abort() to cancel the flow.
 */
export function startDeviceCodeFlow(
  provider: string,
  onEvent: (e: AuthEvent) => void,
): AbortController {
  const abort = new AbortController();

  (async () => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        onEvent({ type: "error", message: "Failed to start login" });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              onEvent(JSON.parse(line.slice(6)) as AuthEvent);
            } catch {
              // ignore malformed SSE line
            }
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        onEvent({ type: "error", message: e.message ?? "Login failed" });
      }
    }
  })();

  return abort;
}

/**
 * Submit the device code entered by the user to the pending server-side prompt.
 */
export async function submitDeviceCode(provider: string, code: string): Promise<void> {
  await fetch("/api/auth/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, code }),
  });
}

// ---------------------------------------------------------------------------
// API key login
// ---------------------------------------------------------------------------

/**
 * Save a raw API key for a provider.
 */
export async function saveApiKey(provider: string, key: string): Promise<boolean> {
  try {
    const r = await fetch("/api/auth/login-api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Logout / provider change
// ---------------------------------------------------------------------------

/**
 * Remove credentials for a provider (or all providers when omitted).
 */
export async function changeProvider(provider?: string): Promise<boolean> {
  try {
    const r = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider ? { provider } : {}),
    });
    return r.ok;
  } catch {
    return false;
  }
}
