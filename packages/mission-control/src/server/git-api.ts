/**
 * Git log API for commit history and porcelain status.
 * Returns GSD-relevant commits (docs, feat, fix, refactor prefixes).
 * Also provides /api/git/status for Code Explorer git coloring.
 * Follows route dispatcher pattern from fs-api.ts.
 */

import { spawn as nodeSpawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { resolve, isAbsolute } from "node:path";

const execAsync = promisify(exec);

export interface GitCommit {
  hash: string;
  subject: string;
  date: string;
  author: string;
}

/**
 * Get git log entries from a repository.
 * Filters to GSD-relevant commit patterns (docs(), feat(), fix(), refactor()).
 */
function getGitLog(repoRoot: string, limit: number): Promise<GitCommit[]> {
  return new Promise((resolve) => {
    const args = [
      "log",
      "--oneline",
      `--format={"hash":"%h","subject":"%s","date":"%ci","author":"%an"}`,
      `-n`, `${limit}`,
    ];

    const proc = nodeSpawn("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";

    proc.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve([]);
        return;
      }

      const commits: GitCommit[] = [];
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        try {
          const commit = JSON.parse(line) as GitCommit;
          // Filter to GSD-relevant commit patterns
          if (/^(docs|feat|fix|refactor|test|chore)\(/.test(commit.subject)) {
            commits.push(commit);
          }
        } catch {
          // Skip malformed lines (e.g., subjects containing quotes)
        }
      }

      resolve(commits);
    });

    proc.on("error", (err) => {
      console.error("[git-api] Spawn error:", err.message);
      resolve([]);
    });
  });
}

export interface GitFileStatus {
  path: string;   // absolute path with forward slashes
  status: string; // 'M' modified, 'A' added/staged, '??' untracked, 'D' deleted, 'R' renamed
}

/**
 * Run git status --porcelain in the given root directory.
 * Returns [] if not a git repo or git is not available.
 */
export async function getGitStatus(root: string): Promise<GitFileStatus[]> {
  if (!root) return [];
  try {
    const resolvedRoot = resolve(root);
    const { stdout } = await execAsync("git status --porcelain -u", {
      cwd: resolvedRoot,
      timeout: 3000,
    });
    const files: GitFileStatus[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const statusCode = line.slice(0, 2).trim();
      const rawPath = line.slice(3).trim();
      // Handle renames: "R old -> new" — take the new path
      const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ")[1] : rawPath;
      // Remove quotes if present (git quotes paths with spaces)
      const cleanPath = filePath.replace(/^"|"$/g, "");
      const absPath = resolve(resolvedRoot, cleanPath).replace(/\\/g, "/");
      files.push({ path: absPath, status: statusCode });
    }
    return files;
  } catch {
    // Not a git repo, git not installed, or timeout
    return [];
  }
}

/**
 * HTTP request handler for /api/git/* routes.
 * Returns Response or null if route not matched.
 */
export async function handleGitRequest(
  req: Request,
  url: URL,
  repoRoot: string
): Promise<Response | null> {
  const { pathname, searchParams } = url;

  // GET /api/git/log
  if (pathname === "/api/git/log" && req.method === "GET") {
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const safeLimit = Math.min(Math.max(limit, 1), 500);

    const commits = await getGitLog(repoRoot, safeLimit);
    return Response.json({ commits });
  }

  // GET /api/git/status?root=<path>
  if (pathname === "/api/git/status" && req.method === "GET") {
    // SECURITY NOTE — Accepted: The `root` query parameter is not restricted to a specific
    // directory. This mirrors the /api/fs/list browsing design:
    // 1. Server binds to 127.0.0.1 only — not network-accessible
    // 2. `git status` is a read-only operation (equivalent to `ls` in terms of information exposure)
    // 3. The local-process threat model is accepted for this desktop application
    //
    // Validation: reject non-absolute paths to prevent CWD-relative probing.
    const root = searchParams.get("root") ?? repoRoot;
    const resolvedRoot = resolve(root);
    // H7: Reject relative paths — must be absolute
    if (root !== repoRoot && !isAbsolute(root)) {
      return Response.json({ error: "root must be an absolute path" }, { status: 400 });
    }
    const files = await getGitStatus(resolvedRoot);
    return Response.json({ files });
  }

  return null;
}
