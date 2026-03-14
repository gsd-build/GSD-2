/**
 * trust-api.ts — read/write .gsd/.mission-control-trust flag + REST routes.
 *
 * isTrusted(gsdDir)  — returns true if .mission-control-trust exists in gsdDir
 * writeTrustFlag(gsdDir) — creates the trust flag file (mkdir -p first)
 * registerTrustRoutes — HTTP handler for GET/POST /api/trust
 */
import { access, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const TRUST_FILE_NAME = ".mission-control-trust";

/**
 * Returns true if .gsd/.mission-control-trust exists, false otherwise.
 * Never throws — ENOENT and all other errors return false.
 */
export async function isTrusted(gsdDir: string): Promise<boolean> {
  try {
    await access(join(gsdDir, TRUST_FILE_NAME));
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates .gsd/.mission-control-trust (mkdir -p on gsdDir first).
 */
export async function writeTrustFlag(gsdDir: string): Promise<void> {
  await mkdir(gsdDir, { recursive: true });
  await writeFile(join(gsdDir, TRUST_FILE_NAME), "", { flag: "w" });
}

/**
 * HTTP request handler for /api/trust routes.
 * GET  /api/trust?dir={gsdDir} → { trusted: boolean }
 * POST /api/trust  body: { dir: string } → { ok: true }
 * Returns null if pathname !== "/api/trust".
 */
export async function registerTrustRoutes(
  url: URL,
  method: string,
  body: unknown,
): Promise<Response | null> {
  if (url.pathname !== "/api/trust") {
    return null;
  }

  if (method === "GET") {
    const dir = url.searchParams.get("dir") ?? "";
    const trusted = await isTrusted(dir);
    return Response.json({ trusted });
  }

  if (method === "POST") {
    const dir = (body as { dir?: string })?.dir ?? "";
    await writeTrustFlag(dir);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
