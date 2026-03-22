/**
 * POST endpoint to send input to a PTY session.
 *
 * POST /api/terminal/input
 * Body: { id: string, data: string }
 */

import { writeToSession } from "../../../../lib/pty-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: { id?: string; data?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = body.id || "default";
  const data = body.data;

  if (typeof data !== "string") {
    return Response.json(
      { error: "data must be a string" },
      { status: 400 },
    );
  }

  const ok = writeToSession(sessionId, data);
  if (!ok) {
    return Response.json(
      { error: "Session not found or dead" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
