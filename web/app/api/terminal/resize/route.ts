/**
 * POST endpoint to resize a PTY session.
 *
 * POST /api/terminal/resize
 * Body: { id: string, cols: number, rows: number }
 */

import { resizeSession } from "../../../../lib/pty-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: { id?: string; cols?: number; rows?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = body.id || "default";
  const cols = body.cols;
  const rows = body.rows;

  if (typeof cols !== "number" || typeof rows !== "number" || cols < 1 || rows < 1) {
    return Response.json(
      { error: "cols and rows must be positive numbers" },
      { status: 400 },
    );
  }

  const ok = resizeSession(sessionId, Math.floor(cols), Math.floor(rows));
  if (!ok) {
    return Response.json(
      { error: "Session not found or dead" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
