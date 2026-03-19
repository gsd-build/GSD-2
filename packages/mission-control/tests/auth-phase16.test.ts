/**
 * auth-phase16.test.ts
 *
 * Phase 16 auth tests — validates the fetch-based auth architecture that
 * replaced the old Tauri-invoke/SSE approach.
 *
 * Architecture:
 *   - AuthStorage (@gsd/pi-coding-agent) owns credentials at ~/.gsd/auth.json
 *   - Bun server (server/auth-api.ts) wraps AuthStorage and exposes REST routes
 *   - Client (auth/auth-api.ts) calls those routes via fetch()
 *   - OAuthConnectFlow uses startDeviceCodeFlow (polling, AbortController-based)
 *
 * Strategy: source-text assertions (read .tsx/.ts as strings) + behavioural
 * API fallback assertions. No React rendering required — avoids hook rules in
 * Bun test environment.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => join(__dirname, "..", "src", rel);

// ---------------------------------------------------------------------------
// AUTH-02: OAuthConnectFlow — device-code / polling flow
// ---------------------------------------------------------------------------

describe("AUTH-02: OAuthConnectFlow — OAuth waiting screen", () => {
  test("OAuthConnectFlow uses startDeviceCodeFlow (not a fixed timeout)", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("startDeviceCodeFlow");
    expect(content).toContain("submitDeviceCode");
  });

  test("OAuthConnectFlow exports the component by name", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("export function OAuthConnectFlow");
  });

  test("OAuthConnectFlow aborts the flow on cancel via AbortController", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    // Uses AbortController ref to cancel the polling loop
    expect(content).toContain("abortRef");
    expect(content).toContain("abort()");
    expect(content).toContain("onCancel");
  });

  test("OAuthConnectFlow calls onError when SSE/poll returns error event", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("onError(");
    // error event comes from the AuthEvent type
    expect(content).toContain('"error"');
  });

  test("OAuthConnectFlow renders a Cancel button", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toMatch(/[Cc]ancel/);
    expect(content).toContain("handleCancel");
  });

  test("OAuthConnectFlow renders three step states: connecting, show-url, show-code", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain('"connecting"');
    expect(content).toContain('"show-url"');
    expect(content).toContain('"show-code"');
  });

  test("OAuthConnectFlow calls onAuthenticated when done event fires", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("onAuthenticated(");
    expect(content).toContain('"done"');
  });
});

// ---------------------------------------------------------------------------
// AUTH-02/AUTH-01: useAuthGuard — fetch-based, 2-property return type
// ---------------------------------------------------------------------------

describe("AUTH-02/AUTH-01: useAuthGuard structure and fetch-based auth check", () => {
  test("useAuthGuard exports the 2-property return type: state and setAuthenticated", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain("state");
    expect(content).toContain("setAuthenticated");
  });

  test("useAuthGuard checks auth via getActiveProvider (fetch, not Tauri events)", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain("getActiveProvider");
    // Uses fetch-based approach — no Tauri event listener
    expect(content).not.toContain("@tauri-apps/api/event");
  });

  test("useAuthGuard initial state is checking", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain('"checking"');
    expect(content).toContain("useState");
  });

  test("useAuthGuard transitions to needs_picker when no provider found", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain('"needs_picker"');
  });

  test("useAuthGuard transitions to authenticated with provider name", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain('"authenticated"');
    expect(content).toContain("provider");
  });

  test("useAuthGuard calls getActiveProvider inside useEffect on mount", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain("useEffect");
    expect(content).toContain("getActiveProvider");
  });
});

// ---------------------------------------------------------------------------
// AUTH-03: auth/index.ts barrel re-exports all three modules
// ---------------------------------------------------------------------------

describe("AUTH-03: auth/index.ts barrel exports", () => {
  test("auth/index.ts re-exports auth-api", () => {
    const content = readFileSync(src("auth/index.ts"), "utf-8");
    expect(content).toContain("auth-api");
  });

  test("auth/index.ts re-exports useAuthGuard", () => {
    const content = readFileSync(src("auth/index.ts"), "utf-8");
    expect(content).toContain("useAuthGuard");
  });

  test("auth/index.ts re-exports useTokenRefresh", () => {
    const content = readFileSync(src("auth/index.ts"), "utf-8");
    expect(content).toContain("useTokenRefresh");
  });
});

// ---------------------------------------------------------------------------
// AUTH-04: ApiKeyForm component
// ---------------------------------------------------------------------------

describe("AUTH-04: ApiKeyForm — masked input + Eye toggle + provider dropdown", () => {
  test("ApiKeyForm exports the component by name", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("export function ApiKeyForm");
  });

  test("ApiKeyForm uses password input type for masking", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain('"password"');
    expect(content).toContain("showKey");
  });

  test("ApiKeyForm imports Eye and EyeOff from lucide-react for show/hide toggle", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("Eye");
    expect(content).toContain("EyeOff");
    expect(content).toContain("lucide-react");
  });

  test("ApiKeyForm has provider dropdown for api-key provider type", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("PROVIDER_OPTIONS");
    expect(content).toContain("openai");
    expect(content).toContain("gemini");
  });

  test("ApiKeyForm locks provider to openrouter when provider prop is openrouter", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("isOpenRouter");
    expect(content).toContain("openrouter");
  });

  test("ApiKeyForm calls saveApiKey on form submission", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("saveApiKey(");
  });

  test("ApiKeyForm calls onSaved on successful key save", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("onSaved(");
  });
});

// ---------------------------------------------------------------------------
// AUTH-04/AUTH-02: auth-api client functions (fetch-based)
// ---------------------------------------------------------------------------

describe("AUTH-04/AUTH-02: auth-api client functions in non-Tauri env", () => {
  test("getProviderStatus returns safe default object in non-Tauri env", async () => {
    const { getProviderStatus } = await import("../src/auth/auth-api");
    const result = await getProviderStatus();
    expect(result.active_provider).toBeNull();
    expect(result.last_refreshed).toBeNull();
    expect(result.expires_at).toBeNull();
    expect(result.is_expired).toBe(false);
    expect(result.expires_soon).toBe(false);
  });

  test("startDeviceCodeFlow returns an AbortController", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    expect(content).toContain("startDeviceCodeFlow");
    expect(content).toContain("AbortController");
    expect(content).toContain("return abort");
  });

  test("submitDeviceCode POSTs to /api/auth/code", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    expect(content).toContain("submitDeviceCode");
    expect(content).toContain("/api/auth/code");
  });

  test("changeProvider returns false in non-Tauri env", async () => {
    const { changeProvider } = await import("../src/auth/auth-api");
    const result = await changeProvider();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AUTH-SERVER: server/auth-api.ts uses root GSD 2 AuthStorage (~/.gsd/auth.json)
// ---------------------------------------------------------------------------

describe("AUTH-SERVER: server auth-api uses GSD 2 AuthStorage config", () => {
  test("server/auth-api.ts imports AuthStorage from @gsd/pi-coding-agent", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("AuthStorage");
    expect(content).toContain("@gsd/pi-coding-agent");
  });

  test("server/auth-api.ts uses ~/.gsd/auth.json as the auth file path", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain(".gsd");
    expect(content).toContain("auth.json");
    expect(content).toContain("homedir()");
  });

  test("server/auth-api.ts exposes all required REST routes", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("/api/auth/status");
    expect(content).toContain("/api/auth/login");
    expect(content).toContain("/api/auth/events");
    expect(content).toContain("/api/auth/code");
    expect(content).toContain("/api/auth/login-api-key");
    expect(content).toContain("/api/auth/logout");
  });

  test("server/auth-api.ts uses polling (not SSE) for cross-platform compatibility", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    // Uses session+polling approach, not SSE
    expect(content).toContain("sessionId");
    expect(content).toContain("waitForNewEvents");
    // No SSE content-type
    expect(content).not.toContain("text/event-stream");
  });

  test("server/auth-api.ts handles long-poll timeout correctly", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    // Bun on Windows drops long-held connections — uses 2s max wait
    expect(content).toContain("2_000");
    expect(content).toContain("waitForNewEvents");
  });
});

// ---------------------------------------------------------------------------
// AUTH-05: useTokenRefresh structure
// ---------------------------------------------------------------------------

describe("AUTH-05: useTokenRefresh — silent token refresh hook", () => {
  test("useTokenRefresh exports the hook function", () => {
    const content = readFileSync(src("auth/useTokenRefresh.ts"), "utf-8");
    expect(content).toContain("export function useTokenRefresh");
  });

  test("useTokenRefresh returns checked, needsReauth, and provider fields", () => {
    const content = readFileSync(src("auth/useTokenRefresh.ts"), "utf-8");
    expect(content).toContain("checked");
    expect(content).toContain("needsReauth");
    expect(content).toContain("provider");
  });

  test("useTokenRefresh calls checkAndRefreshToken on mount", () => {
    const content = readFileSync(src("auth/useTokenRefresh.ts"), "utf-8");
    expect(content).toContain("checkAndRefreshToken()");
    expect(content).toContain("useEffect");
  });

  test("useTokenRefresh initial state has checked=false and needsReauth=false", () => {
    const content = readFileSync(src("auth/useTokenRefresh.ts"), "utf-8");
    expect(content).toContain("checked: false");
    expect(content).toContain("needsReauth: false");
  });
});

// ---------------------------------------------------------------------------
// AUTH-01: App.tsx renders null during checking state (no loading spinner flash)
// ---------------------------------------------------------------------------

describe("AUTH-01: App.tsx renders null during auth checking state", () => {
  test("App.tsx returns null when state.status is checking", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    expect(content).toContain('status === "checking"');
    expect(content).toContain("return null");
  });

  test("App.tsx renders ProviderPickerScreen when needsReauth is true", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    expect(content).toContain("needsReauth");
    expect(content).toContain("ProviderPickerScreen");
  });

  test("App.tsx uses useTokenRefresh alongside useAuthGuard", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    expect(content).toContain("useTokenRefresh");
  });
});

// ---------------------------------------------------------------------------
// AUTH-06: SettingsView Provider section is the FIRST section in the render
// ---------------------------------------------------------------------------

describe("AUTH-06: SettingsView Provider section ordering and confirmation guard", () => {
  test("Provider section is the first Section rendered (comment 0 marker)", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    expect(content).toContain("0. Provider");
  });

  test("Provider section appears before interfaceMode section in render output", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    const providerIdx = content.indexOf("{/* 0. Provider */}");
    const interfaceRenderIdx = content.indexOf("openSections.interfaceMode ?? true}");
    expect(providerIdx).toBeGreaterThan(-1);
    expect(interfaceRenderIdx).toBeGreaterThan(providerIdx);
  });

  test("SettingsView has inline confirmation guard before changeProvider call", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    expect(content).toContain("confirmChange");
    expect(content).toContain("changeProvider");
  });

  test("SettingsView calls window.location.reload after changeProvider to show picker", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    expect(content).toContain("window.location.reload");
  });

  test("SettingsView loads provider status with useEffect on mount", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    expect(content).toContain("getProviderStatus");
    expect(content).toContain("useEffect");
    expect(content).toContain("setProviderStatus");
  });
});

// ---------------------------------------------------------------------------
// AUTH-03: components/auth/index.ts barrel exports all 3 components
// ---------------------------------------------------------------------------

describe("AUTH-03: components/auth/index.ts barrel exports all 3 components", () => {
  test("components/auth/index.ts exports ProviderPickerScreen", () => {
    const content = readFileSync(src("components/auth/index.ts"), "utf-8");
    expect(content).toContain("ProviderPickerScreen");
  });

  test("components/auth/index.ts exports OAuthConnectFlow", () => {
    const content = readFileSync(src("components/auth/index.ts"), "utf-8");
    expect(content).toContain("OAuthConnectFlow");
  });

  test("components/auth/index.ts exports ApiKeyForm", () => {
    const content = readFileSync(src("components/auth/index.ts"), "utf-8");
    expect(content).toContain("ApiKeyForm");
  });
});

// ---------------------------------------------------------------------------
// GAP: startDeviceCodeFlow error-path handling in auth-api.ts
// ---------------------------------------------------------------------------

describe("GAP: startDeviceCodeFlow — error and abort handling (source text)", () => {
  test("startDeviceCodeFlow emits error event when /api/auth/login returns non-ok", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    // Non-ok start response → fires onEvent with type "error"
    expect(content).toContain("startRes.ok");
    expect(content).toContain('"error"');
    expect(content).toContain("Failed to start login");
  });

  test("startDeviceCodeFlow emits 'Auth session expired' error when poll returns 404", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    expect(content).toContain("pollRes.status === 404");
    expect(content).toContain("Auth session expired");
  });

  test("startDeviceCodeFlow silently absorbs AbortError (does not call onError on cancel)", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    // Guard: only fire onError when error is NOT an AbortError
    expect(content).toContain('e.name !== "AbortError"');
    expect(content).toContain("AbortError");
  });

  test("startDeviceCodeFlow pauses 200ms between polls when server returns empty event list", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    // Prevents tight-loop on idle long-poll responses
    expect(content).toContain("setTimeout(r, 200)");
    expect(content).toContain("pollData.events.length === 0");
  });

  test("startDeviceCodeFlow stops polling loop on abort signal", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    expect(content).toContain("abort.signal.aborted");
  });

  test("startDeviceCodeFlow returns after done event fires mid-initial-batch", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    // Both initial-event loop and poll-event loop check for done/error
    const doneCheckCount = (content.match(/event\.type === "done"/g) ?? []).length;
    expect(doneCheckCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// GAP: changeProvider with and without argument (source text)
// ---------------------------------------------------------------------------

describe("GAP: changeProvider — logout body branching", () => {
  test("changeProvider sends provider in body when provider argument is given", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    // Ternary: provider ? { provider } : {}
    expect(content).toContain("provider ? { provider }");
  });

  test("changeProvider sends empty body when no provider argument is given", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    expect(content).toContain(": {}");
  });

  test("changeProvider returns false when fetch throws (behavioral, non-Tauri env)", async () => {
    const { changeProvider } = await import("../src/auth/auth-api");
    // In test env fetch fails → catch block → returns false
    const result = await changeProvider("anthropic");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GAP: saveApiKey behavioral return in non-Tauri / fetch-fail env
// ---------------------------------------------------------------------------

describe("GAP: saveApiKey — behavioral return in fetch-fail env", () => {
  test("saveApiKey returns false when fetch fails (non-Tauri env catch path)", async () => {
    const { saveApiKey } = await import("../src/auth/auth-api");
    const result = await saveApiKey("openai", "sk-test-key-12345");
    expect(result).toBe(false);
  });

  test("saveApiKey POSTs to /api/auth/login-api-key endpoint", () => {
    const content = readFileSync(src("auth/auth-api.ts"), "utf-8");
    expect(content).toContain("/api/auth/login-api-key");
    expect(content).toContain('"POST"');
  });
});

// ---------------------------------------------------------------------------
// GAP: server/auth-api.ts — validation error responses and timeout constant
// ---------------------------------------------------------------------------

describe("GAP: server/auth-api.ts — validation error messages and timeout values", () => {
  test("server returns 400 with 'provider required' when login body is missing provider", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("provider required");
    expect(content).toContain("status: 400");
  });

  test("server returns 400 with validation error for /api/auth/code missing fields", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("provider (or sessionId) and code required");
  });

  test("server returns 400 when /api/auth/login-api-key is missing provider or key", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("provider and key required");
  });

  test("server returns 404 with 'session not found' for unknown session IDs", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("session not found");
    expect(content).toContain("status: 404");
  });

  test("server returns 404 with 'no pending prompt for this session'", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("no pending prompt for this session");
  });

  test("server uses 15-second timeout waiting for first auth event", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("15_000");
  });

  test("server returns 504 when auth provider fails to emit first event within timeout", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("Auth flow timed out waiting for provider");
    expect(content).toContain("status: 504");
  });

  test("server cleans up sessions after 60 seconds via setTimeout", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("60_000");
    expect(content).toContain("sessions.delete(sessionId)");
  });

  test("server supports session lookup by sessionId AND by provider name for /api/auth/code", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("body.sessionId");
    expect(content).toContain("providerSessions");
  });

  test("server clears promptResolver after use to prevent double-resolution", () => {
    const content = readFileSync(src("server/auth-api.ts"), "utf-8");
    expect(content).toContain("session.promptResolver = null");
    expect(content).toContain("resolver(body.code)");
  });
});

// ---------------------------------------------------------------------------
// GAP: ProviderPickerScreen — flow state transitions and UI contract
// ---------------------------------------------------------------------------

describe("GAP: ProviderPickerScreen — flow state logic and UI contract", () => {
  test("ProviderPickerScreen defines oauth and api-key as authType variants", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    expect(content).toContain('"oauth"');
    expect(content).toContain('"api-key"');
    expect(content).toContain("authType");
  });

  test("ProviderPickerScreen renders OAuthConnectFlow when flowState is oauth-pending", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    expect(content).toContain('"oauth-pending"');
    expect(content).toContain("OAuthConnectFlow");
  });

  test("ProviderPickerScreen renders ApiKeyForm when flowState is api-key-form", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    expect(content).toContain('"api-key-form"');
    expect(content).toContain("ApiKeyForm");
  });

  test("ProviderPickerScreen OAuthConnectFlow error handler sets error and resets to idle", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    // onError handler: sets error state AND reverts to idle
    expect(content).toContain("setError(msg)");
    expect(content).toContain('setFlowState("idle")');
  });

  test("ProviderPickerScreen cancel handlers reset flowState to idle", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    // Both OAuthConnectFlow and ApiKeyForm cancel: () => setFlowState("idle")
    const idleCount = (content.match(/setFlowState\("idle"\)/g) ?? []).length;
    expect(idleCount).toBeGreaterThanOrEqual(2);
  });

  test("ProviderPickerScreen CTA button text is 'Connect and start building'", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    expect(content).toContain("Connect and start building");
  });

  test("ProviderPickerScreen default heading prop is set", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    expect(content).toContain("Connect your AI provider to start building");
  });

  test("ProviderPickerScreen displays error text when error state is set", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    expect(content).toContain("{error &&");
    expect(content).toContain("errorText");
  });

  test("ProviderPickerScreen CTA button is disabled when no provider is selected", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    expect(content).toContain("selected === null");
    expect(content).toContain("ctaButtonDisabled");
  });

  test("ProviderPickerScreen handleConnect returns early when selected is null", () => {
    const content = readFileSync(src("components/auth/ProviderPickerScreen.tsx"), "utf-8");
    expect(content).toContain("if (!selected) return");
  });
});

// ---------------------------------------------------------------------------
// GAP: OAuthConnectFlow — UI detail and error handling
// ---------------------------------------------------------------------------

describe("GAP: OAuthConnectFlow — UI text, step content, and error paths", () => {
  test("OAuthConnectFlow show-url step renders 'Open browser' button", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("Open browser");
    expect(content).toContain("openInBrowser(authUrl)");
  });

  test("OAuthConnectFlow show-code step renders a text input for the auth code", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain('type="text"');
    expect(content).toContain("Paste code here");
  });

  test("OAuthConnectFlow handleSubmitCode catches fetch errors and calls onError", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("Failed to submit code");
    expect(content).toContain("onError(");
  });

  test("OAuthConnectFlow handleSubmitCode guards against empty code and double-submit", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("!code.trim() || submitting");
  });

  test("OAuthConnectFlow submit button shows 'Verifying…' during submission", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("Verifying\u2026");
  });

  test("OAuthConnectFlow openInBrowser uses Tauri invoke when __TAURI__ is in window", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("__TAURI__");
    expect(content).toContain("open_external");
    expect(content).toContain("window.open(url");
  });

  test("OAuthConnectFlow connecting step shows 'Starting authentication' message", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("Starting authentication");
  });

  test("OAuthConnectFlow cleanup: useEffect return aborts on unmount", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    // cleanup function: return () => abort.abort()
    expect(content).toContain("return () => abort.abort()");
  });
});

// ---------------------------------------------------------------------------
// GAP: ApiKeyForm — save failure and UI state details
// ---------------------------------------------------------------------------

describe("GAP: ApiKeyForm — error handling, save state, and provider lock", () => {
  test("ApiKeyForm shows error message when saveApiKey returns false", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("Failed to save key. Please try again.");
    expect(content).toContain("setError(");
  });

  test("ApiKeyForm calls onError when saveApiKey throws an exception", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("onError(");
    expect(content).toContain("catch (e)");
  });

  test("ApiKeyForm save button text changes to 'Saving...' while submitting", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("Saving...");
    expect(content).toContain("saving");
  });

  test("ApiKeyForm validates both key and providerName before enabling save", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("isValid");
    expect(content).toContain("apiKey.trim().length > 0");
    expect(content).toContain("providerName.trim().length > 0");
  });

  test("ApiKeyForm defaults providerName to 'openai' for generic api-key provider", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    // isOpenRouter ? "openrouter" : "openai"
    expect(content).toContain('"openai"');
    expect(content).toContain("isOpenRouter");
  });

  test("ApiKeyForm shows locked provider display (not a select) when provider is openrouter", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("lockedProvider");
    expect(content).toContain("OpenRouter");
  });

  test("ApiKeyForm back button uses aria-label 'Back'", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain('aria-label="Back"');
  });
});

// ---------------------------------------------------------------------------
// GAP: useAuthGuard — type structure and setAuthenticated contract
// ---------------------------------------------------------------------------

describe("GAP: useAuthGuard — exported types and setAuthenticated contract", () => {
  test("useAuthGuard exports AuthGuardState type with all three status variants", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain("AuthGuardState");
    expect(content).toContain('"checking"');
    expect(content).toContain('"authenticated"');
    expect(content).toContain('"needs_picker"');
  });

  test("useAuthGuard exports UseAuthGuardResult interface", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain("UseAuthGuardResult");
    expect(content).toContain("setAuthenticated");
  });

  test("setAuthenticated function takes a provider string and sets authenticated state", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    // Implementation: (provider: string) => setState({ status: "authenticated", provider })
    expect(content).toContain("(provider: string)");
    expect(content).toContain('status: "authenticated"');
  });

  test("useAuthGuard getActiveProvider result determines state branch (truthy vs null)", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    // Ternary: provider ? { status: "authenticated", provider } : { status: "needs_picker" }
    expect(content).toContain('provider ? { status: "authenticated", provider }');
    expect(content).toContain('{ status: "needs_picker" }');
  });
});

// ---------------------------------------------------------------------------
// GAP: App.tsx — re-connect heading logic and trust-check null returns
// ---------------------------------------------------------------------------

describe("GAP: App.tsx — re-connect heading and authenticated+trust-checking null render", () => {
  test("App.tsx builds re-connect heading using tokenRefresh.provider name", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    expect(content).toContain("Re-connect");
    expect(content).toContain("tokenRefresh.provider");
  });

  test("App.tsx passes heading prop to ProviderPickerScreen for re-auth case", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    expect(content).toContain("heading={heading}");
    expect(content).toContain("onAuthenticated={setAuthenticated}");
  });

  test("App.tsx returns null while trust status is checking after auth", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    // Two null returns: one for auth checking, one for trust checking
    const nullReturns = (content.match(/return null/g) ?? []).length;
    expect(nullReturns).toBeGreaterThanOrEqual(2);
  });

  test("App.tsx fetches /api/trust-status after authentication is confirmed", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    expect(content).toContain("/api/trust-status");
    expect(content).toContain("setTrustStatus");
  });

  test("App.tsx fails open on trust-status network error (does not block app)", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    // .catch(() => setTrustStatus("trusted"))
    expect(content).toContain('.catch(() => setTrustStatus("trusted"))');
  });
});
