import { scheduleShutdown } from "../../../lib/shutdown-gate";

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(): Promise<Response> {
  // Schedule a deferred shutdown instead of exiting immediately.
  // This gives the client a window to cancel the exit on page refresh —
  // the boot route calls cancelShutdown() when it receives the next request.
  scheduleShutdown();

  return Response.json({ ok: true })
}
