/**
 * auth-api.ts — fetch-based auth API (talks to Bun server at /api/auth/*).
 *
 * Uses a session+polling approach instead of SSE to avoid Bun streaming
 * compatibility issues on Windows WebView2.
 *
 * Flow:
 *   1. startDeviceCodeFlow() → POST /api/auth/login → gets { sessionId, events }
 *   2. Events are processed (url → open browser, prompt → show code input)
 *   3. Client polls GET /api/auth/events for subsequent events
 *   4. submitDeviceCode() → POST /api/auth/code → resolves server-side prompt
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
  | { type: "prompt"; message: string; placeholder?: string; allowEmpty?: boolean }
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
// OAuth device-code / manual-code flow (polling-based, no SSE)
// ---------------------------------------------------------------------------

/**
 * Start an OAuth login flow. Calls onEvent for each server-emitted event
 * ({ type: "url" | "prompt" | "progress" | "done" | "error" }).
 *
 * Uses a session+polling approach: the initial request returns the first batch
 * of events synchronously, then subsequent events are polled via long-poll.
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
      // ── Step 1: Start login, get initial events ──
      const startRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
        signal: abort.signal,
      });

      if (!startRes.ok) {
        const data = (await startRes.json().catch(() => ({}))) as { error?: string };
        onEvent({ type: "error", message: data.error ?? "Failed to start login" });
        return;
      }

      const startData = (await startRes.json()) as {
        sessionId: string;
        events: AuthEvent[];
      };
      const { sessionId, events: initialEvents } = startData;

      // ── Step 2: Process initial events ──
      let eventIndex = 0;
      for (const event of initialEvents) {
        if (abort.signal.aborted) return;
        onEvent(event);
        eventIndex++;
        if (event.type === "done" || event.type === "error") return;
      }

      // ── Step 3: Poll for subsequent events until done/error ──
      while (!abort.signal.aborted) {
        const pollRes = await fetch(
          `/api/auth/events?session=${encodeURIComponent(sessionId)}&after=${eventIndex}`,
          { signal: abort.signal },
        );

        if (!pollRes.ok) {
          // Session expired or not found — treat as error
          if (pollRes.status === 404) {
            onEvent({ type: "error", message: "Auth session expired" });
          }
          return;
        }

        const pollData = (await pollRes.json()) as {
          events: AuthEvent[];
          done: boolean;
        };

        for (const event of pollData.events) {
          if (abort.signal.aborted) return;
          onEvent(event);
          eventIndex++;
          if (event.type === "done" || event.type === "error") return;
        }

        if (pollData.done) return;
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
 * Submit the device code / authorization code entered by the user
 * to the pending server-side prompt.
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
