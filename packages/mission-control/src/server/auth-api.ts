/**
 * auth-api.ts — Bun server auth handler.
 *
 * Wraps AuthStorage from @mariozechner/pi-coding-agent to provide a
 * fetch-based auth API that works in both browser dev mode and Tauri.
 *
 * Routes:
 *   GET  /api/auth/status         → { authenticated, provider }
 *   POST /api/auth/login          → SSE stream (device code flow)
 *   POST /api/auth/code           → submit device code to pending prompt
 *   POST /api/auth/login-api-key  → save an API key credential
 *   POST /api/auth/logout         → remove provider credentials
 */

import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { homedir } from "node:os";

const authFilePath = join(homedir(), ".gsd", "auth.json");
const authStorage = AuthStorage.create(authFilePath);

// Pending code submissions from the device-code prompt step.
// provider → resolve(code)
const pendingCodes = new Map<string, (code: string) => void>();

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
  // POST /api/auth/login — device-code OAuth via SSE
  // ---------------------------------------------------------------------------
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = (await req.json()) as { provider?: string };
    if (!body.provider) {
      return Response.json({ error: "provider required" }, { status: 400 });
    }
    const provider = body.provider;

    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;

    function send(data: object) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    }

    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        controller = ctrl;

        authStorage
          .login(provider as Parameters<typeof authStorage.login>[0], {
            onAuth: ({ url: authUrl, instructions }) => {
              send({ type: "url", url: authUrl, instructions });
            },
            onPrompt: (prompt) => {
              send({ type: "prompt", message: prompt.message });
              return new Promise<string>((resolve) => {
                pendingCodes.set(provider, resolve);
              });
            },
            onProgress: (message) => {
              send({ type: "progress", message });
            },
          })
          .then(() => {
            send({ type: "done", provider });
            controller.close();
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : "Login failed";
            send({ type: "error", message });
            controller.close();
          })
          .finally(() => {
            pendingCodes.delete(provider);
          });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // POST /api/auth/code — submit device code to the pending prompt resolver
  // ---------------------------------------------------------------------------
  if (pathname === "/api/auth/code" && req.method === "POST") {
    const body = (await req.json()) as { provider?: string; code?: string };
    if (!body.provider || body.code === undefined) {
      return Response.json({ error: "provider and code required" }, { status: 400 });
    }
    const resolve = pendingCodes.get(body.provider);
    if (!resolve) {
      return Response.json({ error: "no pending prompt for provider" }, { status: 404 });
    }
    resolve(body.code);
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
