import { collectCleanupData, executeCleanup } from "../../../../src/web/cleanup-service.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  try {
    const payload = await collectCleanupData()
    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let branches: string[] = []
    let snapshots: string[] = []
    try {
      const body = await request.json()
      branches = Array.isArray(body?.branches) ? body.branches : []
      snapshots = Array.isArray(body?.snapshots) ? body.snapshots : []
    } catch {
      // No body or invalid JSON — empty arrays
    }

    const payload = await executeCleanup(branches, snapshots)
    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  }
}
