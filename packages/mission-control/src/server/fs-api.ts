/**
 * File system API for directory browsing and GSD project detection.
 * Security: all paths validated against traversal attacks.
 */

import { readdir, access, mkdir as fsMkdir } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { homedir } from "node:os";
import type { FileSystemEntry } from "./fs-types";

/** Directories to hide from listings */
const HIDDEN_DIRS = new Set([
  "node_modules",
  ".git",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

/**
 * Validate a requested path is safe (no traversal).
 * Throws if path contains ".." segments or resolves outside allowedRoot.
 */
export function validatePath(requestedPath: string, allowedRoot?: string): string {
  const normalized = normalize(requestedPath);

  // Check for .. segments in the original or normalized path
  if (requestedPath.includes("..") || normalized.includes("..")) {
    throw new Error("Path traversal not allowed");
  }

  const resolved = resolve(requestedPath);

  if (allowedRoot) {
    const resolvedRoot = resolve(allowedRoot);
    // Case-insensitive comparison on Windows (paths may differ in case)
    const resolvedLower = resolved.toLowerCase();
    const rootLower = resolvedRoot.toLowerCase();
    if (!resolvedLower.startsWith(rootLower)) {
      throw new Error("Path traversal not allowed");
    }
  }

  return resolved;
}

/**
 * List directory entries with GSD project detection.
 * Returns sorted FileSystemEntry[] (dirs first, then alphabetical).
 * On error returns { error, code } object for HTTP handler.
 */
export async function listDirectory(
  dirPath: string
): Promise<FileSystemEntry[] | { error: string; code: number }> {
  let resolvedPath: string;
  try {
    resolvedPath = resolve(dirPath);
  } catch {
    return { error: "Invalid path", code: 400 };
  }

  let dirents: import("node:fs").Dirent<string>[];
  try {
    dirents = await readdir(resolvedPath, { withFileTypes: true, encoding: "utf8" }) as import("node:fs").Dirent<string>[];
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { error: "Directory not found", code: 404 };
    }
    if (err.code === "EACCES" || err.code === "EPERM") {
      return { error: "Permission denied", code: 403 };
    }
    return { error: err.message || "Unknown error", code: 500 };
  }

  const entries: FileSystemEntry[] = [];

  for (const dirent of dirents) {
    const name = dirent.name;

    // Skip hidden files/dirs (starting with .) except .gsd and .planning
    // which are first-class GSD project directories that must be visible.
    if (name.startsWith(".") && name !== ".gsd" && name !== ".planning") continue;

    // Skip noise directories
    if (HIDDEN_DIRS.has(name)) continue;

    const fullPath = join(resolvedPath, name).replace(/\\/g, "/");
    const isDir = dirent.isDirectory();

    let isGsdProject = false;
    if (isDir) {
      try {
        await access(join(resolvedPath, name, ".gsd"));
        isGsdProject = true;
      } catch {
        // No .gsd directory
      }
    }

    entries.push({
      name,
      path: fullPath,
      isDirectory: isDir,
      isGsdProject,
    });
  }

  // Sort: directories first, then alphabetical within each group
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return entries;
}

/**
 * Detect whether a directory is a GSD project.
 */
export async function detectProject(
  dirPath: string
): Promise<{ isGsdProject: boolean; path: string }> {
  const resolved = resolve(dirPath);
  let isGsdProject = false;
  try {
    await access(join(resolved, ".gsd"));
    isGsdProject = true;
  } catch {
    // Not a GSD project
  }
  return {
    isGsdProject,
    path: resolved.replace(/\\/g, "/"),
  };
}

/**
 * Create a directory (recursive).
 */
export async function createDirectory(
  dirPath: string
): Promise<{ success: boolean; path: string; error?: string }> {
  try {
    const resolved = resolve(dirPath);
    await fsMkdir(resolved, { recursive: true });
    return { success: true, path: resolved.replace(/\\/g, "/") };
  } catch (err: any) {
    return { success: false, path: dirPath, error: err.message };
  }
}

/**
 * HTTP request handler for /api/fs/* routes.
 * Returns Response or null if route not matched.
 */
export async function handleFsRequest(
  req: Request,
  url: URL,
  allowedRoot?: string
): Promise<Response | null> {
  const { pathname, searchParams } = url;

  // GET /api/fs/list?path=X
  if (pathname === "/api/fs/list" && req.method === "GET") {
    const dirPath = searchParams.get("path") || homedir();

    try {
      validatePath(dirPath);
    } catch {
      return Response.json({ error: "Invalid path: traversal not allowed" }, { status: 400 });
    }

    const result = await listDirectory(dirPath);

    if (!Array.isArray(result)) {
      return Response.json({ error: result.error }, { status: result.code });
    }

    return Response.json(result);
  }

  // GET /api/fs/detect-project?path=X
  if (pathname === "/api/fs/detect-project" && req.method === "GET") {
    const dirPath = searchParams.get("path");
    if (!dirPath) {
      return Response.json({ error: "path parameter required" }, { status: 400 });
    }

    try {
      validatePath(dirPath);
    } catch {
      return Response.json({ error: "Invalid path: traversal not allowed" }, { status: 400 });
    }

    const result = await detectProject(dirPath);
    return Response.json(result);
  }

  // POST /api/fs/mkdir
  if (pathname === "/api/fs/mkdir" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.path) {
      return Response.json({ error: "path field required" }, { status: 400 });
    }

    try {
      validatePath(body.path);
    } catch {
      return Response.json({ error: "Invalid path: traversal not allowed" }, { status: 400 });
    }

    const result = await createDirectory(body.path);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }
    return Response.json(result);
  }

  // GET /api/fs/read?path=X — read file content
  if (pathname === "/api/fs/read" && req.method === "GET") {
    const filePath = searchParams.get("path");
    if (!filePath) {
      return Response.json({ error: "path parameter required" }, { status: 400 });
    }

    try {
      validatePath(filePath, allowedRoot);
    } catch {
      return Response.json({ error: "Path not allowed" }, { status: 403 });
    }

    try {
      const content = await Bun.file(filePath).text();
      return Response.json({ content, path: filePath });
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return Response.json({ error: "File not found" }, { status: 404 });
      }
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // POST /api/fs/write — write file content
  if (pathname === "/api/fs/write" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.path || typeof body.content !== "string") {
      return Response.json({ error: "path and content fields required" }, { status: 400 });
    }

    try {
      validatePath(body.path, allowedRoot);
    } catch {
      return Response.json({ error: "Path not allowed" }, { status: 403 });
    }

    try {
      await Bun.write(body.path, body.content);
      return Response.json({ success: true, path: body.path });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return null;
}
