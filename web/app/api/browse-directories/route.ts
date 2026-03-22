import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve the configured dev root from web preferences.
 * Returns the devRoot path if set, otherwise the user's home directory.
 */
function getDevRoot(): string {
  try {
    const prefsPath = join(homedir(), ".gsd", "web-preferences.json");
    if (existsSync(prefsPath)) {
      const prefs = JSON.parse(readFileSync(prefsPath, "utf-8")) as Record<string, unknown>;
      if (typeof prefs.devRoot === "string" && prefs.devRoot) {
        return resolve(prefs.devRoot);
      }
    }
  } catch {
    // Fall through to default
  }
  return homedir();
}

/**
 * GET /api/browse-directories?path=/some/path
 *
 * Returns the directory listing for the given path.
 * Defaults to the configured devRoot (or home directory) if no path is given.
 * Only returns directories (no files) for the folder picker use case.
 *
 * Security: Paths are restricted to the devRoot and its children. Requests
 * for paths outside devRoot are rejected with 403 to prevent full filesystem
 * enumeration.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const rawPath = url.searchParams.get("path");
    const devRoot = getDevRoot();
    const targetPath = rawPath ? resolve(rawPath) : devRoot;

    // Restrict browsing to devRoot and its subtree, or the home directory
    // if no devRoot is configured. Navigating to the parent of devRoot is
    // allowed (one level up) so the UI can show the devRoot in context,
    // but nothing further.
    const devRootParent = dirname(devRoot);
    if (!targetPath.startsWith(devRoot) && targetPath !== devRootParent) {
      return Response.json(
        { error: "Path outside allowed scope" },
        { status: 403 },
      );
    }

    if (!existsSync(targetPath)) {
      return Response.json(
        { error: `Path does not exist: ${targetPath}` },
        { status: 404 },
      );
    }

    const stat = statSync(targetPath);
    if (!stat.isDirectory()) {
      return Response.json(
        { error: `Not a directory: ${targetPath}` },
        { status: 400 },
      );
    }

    const parentPath = dirname(targetPath);
    // Only offer the parent navigation if it's within the allowed scope
    const parentAllowed = parentPath.startsWith(devRootParent) && parentPath !== targetPath;
    const entries: Array<{ name: string; path: string }> = [];

    try {
      const items = readdirSync(targetPath, { withFileTypes: true });
      for (const item of items) {
        // Only directories, skip dotfiles and common non-project dirs
        if (!item.isDirectory()) continue;
        if (item.name.startsWith(".")) continue;
        if (item.name === "node_modules") continue;

        entries.push({
          name: item.name,
          path: resolve(targetPath, item.name),
        });
      }
    } catch {
      // Permission denied or other read error — return empty entries
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({
      current: targetPath,
      parent: parentAllowed ? parentPath : null,
      entries,
    });
  } catch (err) {
    return Response.json(
      { error: `Browse failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
