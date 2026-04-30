// @gsd-build/mcp-server — Environment variable write utilities
//
// Shared helpers for writing env vars to .env files, detecting project
// destinations, and checking existing keys. Used by secure_env_collect
// MCP tool. No TUI dependencies — pure filesystem + process.env operations.

import { open, readFile, rename, rm } from "node:fs/promises";
import { constants, existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

// ---------------------------------------------------------------------------
// checkExistingEnvKeys
// ---------------------------------------------------------------------------

/**
 * Check which keys already exist in a .env file or process.env.
 * Returns the subset of `keys` that are already set.
 */
export async function checkExistingEnvKeys(keys: string[], envFilePath: string): Promise<string[]> {
  let fileContent = "";
  try {
    fileContent = await readFile(envFilePath, "utf8");
  } catch {
    // ENOENT or other read error — proceed with empty content
  }

  const existing: string[] = [];
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped}\\s*=`, "m");
    if (regex.test(fileContent) || key in process.env) {
      existing.push(key);
    }
  }
  return existing;
}

// ---------------------------------------------------------------------------
// detectDestination
// ---------------------------------------------------------------------------

/**
 * Detect the write destination based on project files in basePath.
 * Priority: vercel.json → convex/ dir → fallback "dotenv".
 */
export function detectDestination(basePath: string): "dotenv" | "vercel" | "convex" {
  if (existsSync(resolve(basePath, "vercel.json"))) {
    return "vercel";
  }
  const convexPath = resolve(basePath, "convex");
  try {
    if (existsSync(convexPath) && statSync(convexPath).isDirectory()) {
      return "convex";
    }
  } catch {
    // stat error — treat as not found
  }
  return "dotenv";
}

// ---------------------------------------------------------------------------
// writeEnvKey
// ---------------------------------------------------------------------------

/**
 * Write a single key=value pair to a .env file.
 * Updates existing keys in-place, appends new ones at the end.
 */
export async function writeEnvKey(filePath: string, key: string, value: string): Promise<void> {
  if (typeof value !== "string") {
    throw new TypeError(`writeEnvKey expects a string value for key "${key}", got ${typeof value}`);
  }
  assertWritableEnvFileTarget(filePath);
  let content = "";
  try {
    const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      content = await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    content = "";
  }
  const escaped = value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "");
  const line = `${key}=${escaped}`;
  const regex = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += `${line}\n`;
  }
  const tempPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    await handle.writeFile(content, "utf8");
    await handle.close();
    handle = undefined;
    assertWritableEnvFileTarget(filePath);
    await rename(tempPath, filePath);
  } catch (err) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Best-effort cleanup.
      }
    }
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

function assertWritableEnvFileTarget(filePath: string): void {
  try {
    if (lstatSync(filePath).isSymbolicLink()) {
      throw new Error("Refusing to write symlinked env file");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function isSafeEnvVarKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Keys that influence the MCP server's own runtime — module loading, project
 * sandbox, CLI resolution. Allowing the LLM to set these via secure_env_collect
 * would let a misbehaving caller swap the workflow executor module mid-session
 * (RCE chain) or escape the project sandbox. We refuse to write or hydrate
 * these keys even when isSafeEnvVarKey() would otherwise accept them.
 */
const SECURITY_SENSITIVE_KEYS = new Set<string>([
  "GSD_WORKFLOW_EXECUTORS_MODULE",
  "GSD_WORKFLOW_WRITE_GATE_MODULE",
  "GSD_WORKFLOW_PROJECT_ROOT",
  "GSD_CLI_PATH",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PATH",
  "LD_PRELOAD",
  "DYLD_INSERT_LIBRARIES",
]);

export function isSecuritySensitiveEnvKey(key: string): boolean {
  return SECURITY_SENSITIVE_KEYS.has(key.toUpperCase());
}

export function isSupportedDeploymentEnvironment(env: string): boolean {
  return env === "development" || env === "preview" || env === "production";
}

function isWithinProjectRoot(projectRoot: string, candidatePath: string): boolean {
  const rel = relative(projectRoot, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveProjectEnvFilePath(projectDir: string, envFilePath = ".env"): string {
  const projectRoot = realpathSync.native(resolve(projectDir));
  const candidate = resolve(projectRoot, envFilePath);
  if (!isWithinProjectRoot(projectRoot, candidate)) {
    throw new Error("envFilePath must resolve inside the project directory");
  }
  if (existsSync(candidate)) {
    const targetRealPath = realpathSync.native(candidate);
    if (isWithinProjectRoot(projectRoot, targetRealPath)) {
      return candidate;
    }
    throw new Error("envFilePath must resolve inside the project directory");
  }
  const candidateParent = dirname(candidate);
  const parentRealPath = realpathSync.native(candidateParent);
  if (isWithinProjectRoot(projectRoot, parentRealPath)) {
    return candidate;
  }
  throw new Error("envFilePath must resolve inside the project directory");
}

// ---------------------------------------------------------------------------
// Shell helpers (for vercel/convex CLI)
// ---------------------------------------------------------------------------

export function shellEscapeSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// ---------------------------------------------------------------------------
// applySecrets
// ---------------------------------------------------------------------------

interface ApplyResult {
  applied: string[];
  errors: string[];
}

interface ExecOptions {
  stdin?: string;
}

/**
 * Apply collected secrets to the target destination.
 * Dotenv writes are handled directly; vercel/convex shell out via execFn.
 */
export async function applySecrets(
  provided: Array<{ key: string; value: string }>,
  destination: "dotenv" | "vercel" | "convex",
  opts: {
    envFilePath: string;
    environment?: string;
    execFn?: (cmd: string, args: string[], opts?: ExecOptions) => Promise<{ code: number; stderr: string }>;
  },
): Promise<ApplyResult> {
  const applied: string[] = [];
  const errors: string[] = [];

  if (destination === "dotenv") {
    for (const { key, value } of provided) {
      if (!isSafeEnvVarKey(key)) {
        errors.push(`${key}: invalid environment variable name`);
        continue;
      }
      if (isSecuritySensitiveEnvKey(key)) {
        errors.push(`${key}: refusing to set MCP server runtime variable via secure_env_collect`);
        continue;
      }
      try {
        await writeEnvKey(opts.envFilePath, key, value);
        applied.push(key);
        // Hydrate process.env so the current session sees the new value.
        // Sensitive keys are excluded above so a malicious caller cannot
        // swap our module-loading or sandbox configuration mid-session.
        process.env[key] = value;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${key}: ${msg}`);
      }
    }
  }

  if ((destination === "vercel" || destination === "convex") && opts.execFn) {
    const env = opts.environment ?? "development";
    if (!isSupportedDeploymentEnvironment(env)) {
      errors.push(`environment: unsupported target environment "${env}"`);
      return { applied, errors };
    }
    for (const { key, value } of provided) {
      if (!isSafeEnvVarKey(key)) {
        errors.push(`${key}: invalid environment variable name`);
        continue;
      }
      if (isSecuritySensitiveEnvKey(key)) {
        errors.push(`${key}: refusing to set MCP server runtime variable via secure_env_collect`);
        continue;
      }
      try {
        const result = destination === "vercel"
          ? await opts.execFn("vercel", ["env", "add", key, env], { stdin: value })
          : await opts.execFn("npx", ["convex", "env", "set", key], { stdin: value });
        if (result.code !== 0) {
          errors.push(`${key}: ${result.stderr.slice(0, 200)}`);
        } else {
          applied.push(key);
          // Do NOT hydrate process.env after pushing to a remote destination:
          // no in-process reader needs a freshly-pushed remote secret, and
          // every spawned child would inherit the plaintext value.
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${key}: ${msg}`);
      }
    }
  }

  return { applied, errors };
}
