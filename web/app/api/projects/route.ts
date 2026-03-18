import { discoverProjects } from "../../../../src/web/project-discovery-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const root = url.searchParams.get("root");

  if (!root) {
    return Response.json(
      { error: "Missing ?root= parameter" },
      { status: 400 },
    );
  }

  const detail = url.searchParams.get("detail") === "true";

  const projects = discoverProjects(root, detail);
  return Response.json(projects, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
