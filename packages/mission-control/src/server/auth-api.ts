/**
 * auth-api.ts — Bun server auth handler.
 *
 * Wraps AuthStorage from @gsd/pi-coding-agent to provide a
 * fetch-based auth API that works in both browser dev mode and Tauri.
 *
 * Routes:
 *   GET  /api/auth/status         → { authenticated, provider }
 *   POST /api/auth/login          → starts login, waits for initial events,
 *                                    returns { sessionId, events: AuthEvent[] }
 *   GET  /api/auth/events         → long-poll: ?session=<id>&after=<n>
 *   POST /api/auth/code           → submit device code to pending prompt
 *   POST /api/auth/login-api-key  → save an API key credential
 *   POST /api/auth/logout         → remove provider credentials
 */

import { AuthStorage } from "@gsd/pi-coding-agent";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthEvent =
  | { type: "url"; url: string; instructions?: string }
  | { type: "prompt"; message: string; placeholder?: string; allowEmpty?: boolean }
  | { type: "progress"; message: string }
  | { type: "done"; provider: string }
  | { type: "error"; message: string };

interface AuthSession {
  provider: string;
  events: AuthEvent[];
  promptResolver: ((code: string) => void) | null;
  eventWaiters: ((newEvents: AuthEvent[]) => void)[];
  done: boolean;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const authFilePath = join(homedir(), ".gsd", "auth.json");
const authStorage = AuthStorage.create(authFilePath);

// Active login sessions: sessionId → session
const sessions = new Map<string, AuthSession>();

// Also map provider → sessionId for submitDeviceCode (backward compat)
const providerSessions = new Map<string, string>();

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function pushEvent(session: AuthSession, event: AuthEvent): void {
  session.events.push(event);
  if (event.type === "done" || event.type === "error") {
    session.done = true;
  }
  // Notify long-poll waiters
  const waiters = session.eventWaiters.splice(0);
  for (const waiter of waiters) {
    waiter(session.events);
  }
}

function waitForNewEvents(
  session: AuthSession,
  afterIndex: number,
  timeoutMs: number,
): Promise<AuthEvent[]> {
  // Already have new events
  if (session.events.length > afterIndex || session.done) {
    return Promise.resolve(session.events.slice(afterIndex));
  }
  return new Promise<AuthEvent[]>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const idx = session.eventWaiters.indexOf(waiter);
      if (idx >= 0) session.eventWaiters.splice(idx, 1);
      resolve(session.events.slice(afterIndex));
    }, timeoutMs);

    const waiter = (allEvents: AuthEvent[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(allEvents.slice(afterIndex));
    };
    session.eventWaiters.push(waiter);
  });
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export async function handleAuthRequest(req: Request, url: URL): Promise<Response | null> {
  const { pathname } = url;

  // ---------------------------------------------------------------------------
  // GET /api/auth/status
  // ---------------------------------------------------------------------------
  if (pathname === "/api/auth/status" && req.method === "GET") {
    authStorage.reload();
    const providers = authStorage.list();
    const provider = providers[0] ?? null;
    return Response.json({ authenticated: provider !== null, provider });
  }

  // ---------------------------------------------------------------------------
  // POST /api/auth/login — start OAuth login, return initial events as JSON
  //
  // Replaces SSE approach with a reliable polling-based flow:
  //   1. Start authStorage.login() in the background
  //   2. Wait for the first batch of events (url+prompt fire synchronously for Anthropic)
  //   3. Return { sessionId, events } immediately
  //   4. Client polls GET /api/auth/events for subsequent events
  // ---------------------------------------------------------------------------
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = (await req.json()) as { provider?: string };
    if (!body.provider) {
      return Response.json({ error: "provider required" }, { status: 400 });
    }
    const provider = body.provider;
    const sessionId = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    const session: AuthSession = {
      provider,
      events: [],
      promptResolver: null,
      eventWaiters: [],
      done: false,
    };
    sessions.set(sessionId, session);
    providerSessions.set(provider, sessionId);

    // Promise that resolves when the first event fires
    let resolveFirstEvent!: () => void;
    const firstEventReady = new Promise<void>((r) => { resolveFirstEvent = r; });
    let firstEventFired = false;

    function addEvent(event: AuthEvent) {
      pushEvent(session, event);
      if (!firstEventFired) {
        firstEventFired = true;
        resolveFirstEvent();
      }
    }

    // Start login in background — do NOT await
    authStorage
      .login(provider as Parameters<typeof authStorage.login>[0], {
        onAuth: ({ url: authUrl, instructions }) => {
          addEvent({ type: "url", url: authUrl, instructions });
        },
        onPrompt: (prompt) => {
          addEvent({
            type: "prompt",
            message: prompt.message,
            placeholder: (prompt as { placeholder?: string }).placeholder,
            allowEmpty: (prompt as { allowEmpty?: boolean }).allowEmpty,
          });
          return new Promise<string>((resolve) => {
            session.promptResolver = resolve;
          });
        },
        onProgress: (message) => {
          addEvent({ type: "progress", message });
        },
      })
      .then(() => {
        addEvent({ type: "done", provider });
        providerSessions.delete(provider);
        // Clean up session after a delay
        setTimeout(() => sessions.delete(sessionId), 60_000);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Login failed";
        console.error(`[auth] Login error for ${provider}:`, message);
        addEvent({ type: "error", message });
        providerSessions.delete(provider);
        setTimeout(() => sessions.delete(sessionId), 60_000);
      });

    // Wait for the first event (up to 15 seconds)
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Auth start timeout")), 15_000)
    );
    try {
      await Promise.race([firstEventReady, timeout]);
    } catch {
      sessions.delete(sessionId);
      providerSessions.delete(provider);
      return Response.json({ error: "Auth flow timed out waiting for provider" }, { status: 504 });
    }

    // After the first event fires, any synchronously co-fired events
    // (e.g. Anthropic fires url+prompt in the same tick) are already in session.events.
    // Yield to the microtask queue once to ensure all sync callbacks have run.
    await Promise.resolve();

    return Response.json({ sessionId, events: session.events });
  }

  // ---------------------------------------------------------------------------
  // GET /api/auth/events — long-poll for new events
  // Query params: session=<sessionId>, after=<index>
  // ---------------------------------------------------------------------------
  if (pathname === "/api/auth/events" && req.method === "GET") {
    const sessionId = url.searchParams.get("session");
    const afterStr = url.searchParams.get("after") ?? "0";
    const after = parseInt(afterStr, 10) || 0;

    if (!sessionId) {
      return Response.json({ error: "session required" }, { status: 400 });
    }
    const session = sessions.get(sessionId);
    if (!session) {
      return Response.json({ error: "session not found", done: true, events: [] }, { status: 404 });
    }

    // Short-poll: wait up to 2 seconds for new events.
    // Bun on Windows drops long-held HTTP connections, so we use short polling
    // (2s max wait per request). The client loops immediately on empty responses.
    const newEvents = await waitForNewEvents(session, after, 2_000);
    return Response.json({ events: newEvents, done: session.done });
  }

  // ---------------------------------------------------------------------------
  // POST /api/auth/code — submit device code to the pending prompt resolver
  // ---------------------------------------------------------------------------
  if (pathname === "/api/auth/code" && req.method === "POST") {
    const body = (await req.json()) as { provider?: string; code?: string; sessionId?: string };
    if ((!body.provider && !body.sessionId) || body.code === undefined) {
      return Response.json({ error: "provider (or sessionId) and code required" }, { status: 400 });
    }

    // Resolve session: prefer sessionId, fall back to provider
    let session: AuthSession | undefined;
    if (body.sessionId) {
      session = sessions.get(body.sessionId);
    } else if (body.provider) {
      const sid = providerSessions.get(body.provider);
      session = sid ? sessions.get(sid) : undefined;
    }

    if (!session || !session.promptResolver) {
      return Response.json({ error: "no pending prompt for this session" }, { status: 404 });
    }

    const resolver = session.promptResolver;
    session.promptResolver = null;
    resolver(body.code);
    return Response.json({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // POST /api/auth/login-api-key — save a raw API key
  // ---------------------------------------------------------------------------
  if (pathname === "/api/auth/login-api-key" && req.method === "POST") {
    const body = (await req.json()) as { provider?: string; key?: string };
    if (!body.provider || !body.key) {
      return Response.json({ error: "provider and key required" }, { status: 400 });
    }
    authStorage.set(body.provider, { type: "api_key", key: body.key });
    return Response.json({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // POST /api/auth/logout — remove credentials for one or all providers
  // ---------------------------------------------------------------------------
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { provider?: string };
    const toLogout = body.provider ? [body.provider] : authStorage.list();
    for (const p of toLogout) {
      authStorage.logout(p);
    }
    return Response.json({ ok: true });
  }

  return null;
}
