import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, rmSync, statSync, symlinkSync, unlinkSync } from "node:fs";
import { delimiter, join } from "node:path";

type ManagedTool = "fd" | "rg";

interface ToolSpec {
  targetName: string;
  candidates: string[];
}

const TOOL_SPECS: Record<ManagedTool, ToolSpec> = {
  fd: {
    targetName: process.platform === "win32" ? "fd.exe" : "fd",
    candidates: process.platform === "win32" ? ["fd.exe", "fd", "fdfind.exe", "fdfind"] : ["fd", "fdfind"],
  },
  rg: {
    targetName: process.platform === "win32" ? "rg.exe" : "rg",
    candidates: process.platform === "win32" ? ["rg.exe", "rg"] : ["rg"],
  },
};

function splitPath(pathValue: string | undefined): string[] {
  if (!pathValue) return [];
  return pathValue.split(delimiter).map((segment) => segment.trim()).filter(Boolean);
}

function getCandidateNames(name: string): string[] {
  if (process.platform !== "win32") return [name];
  const lower = name.toLowerCase();
  if (lower.endsWith(".exe") || lower.endsWith(".cmd") || lower.endsWith(".bat")) return [name];
  return [name, `${name}.exe`, `${name}.cmd`, `${name}.bat`];
}

function isRegularFile(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isFile() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function pathExistsIncludingBrokenSymlink(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isBrokenSymlink(path: string): boolean {
  try {
    const stat = lstatSync(path);
    if (!stat.isSymbolicLink()) return false;
    try {
      statSync(path);
      return false;
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

function removeTargetPath(path: string): void {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      unlinkSync(path);
      return;
    }
    rmSync(path, { force: true });
  } catch {
    // Path already absent.
  }
}

export function resolveToolFromPath(tool: ManagedTool, pathValue: string | undefined = process.env.PATH): string | null {
  const spec = TOOL_SPECS[tool];
  for (const dir of splitPath(pathValue)) {
    for (const candidate of spec.candidates) {
      for (const name of getCandidateNames(candidate)) {
        const fullPath = join(dir, name);
        if (existsSync(fullPath) && isRegularFile(fullPath)) {
          return fullPath;
        }
      }
    }
  }
  return null;
}

function provisionTool(targetDir: string, tool: ManagedTool, sourcePath: string): string {
  const targetPath = join(targetDir, TOOL_SPECS[tool].targetName);
  const brokenTarget = isBrokenSymlink(targetPath);
  if (pathExistsIncludingBrokenSymlink(targetPath)) {
    if (!brokenTarget) return targetPath;
    removeTargetPath(targetPath);
  }

  mkdirSync(targetDir, { recursive: true });

  if (!brokenTarget) {
    try {
      symlinkSync(sourcePath, targetPath);
      return targetPath;
    } catch {
      // Fall back to copying below.
    }
  }

  removeTargetPath(targetPath);
  copyFileSync(sourcePath, targetPath);
  chmodSync(targetPath, 0o755);

  return targetPath;
}

/**
 * Check whether a file path looks like a pixi/conda trampoline shim.
 * These are small PE32+ executables (~436KB) that delegate to a real binary
 * via a sibling `trampoline_configuration/<name>.json` file. Copying the
 * shim alone breaks it because the configuration directory is left behind.
 */
function isPixiTrampolineShim(filePath: string): boolean {
  if (process.platform !== "win32") return false;
  try {
    const stat = lstatSync(filePath);
    // Pixi trampoline shims are ~436KB. Real ripgrep/fd binaries are >2MB.
    // Use a generous upper bound to catch variations without false positives.
    if (stat.size > 100 && stat.size < 1_500_000) {
      const dir = join(filePath, "..", "trampoline_configuration");
      return existsSync(dir);
    }
  } catch {
    // Ignore stat errors
  }
  return false;
}

export function ensureManagedTools(targetDir: string, pathValue: string | undefined = process.env.PATH): string[] {
  const provisioned: string[] = [];

  for (const tool of Object.keys(TOOL_SPECS) as ManagedTool[]) {
    const targetPath = join(targetDir, TOOL_SPECS[tool].targetName);
    if (pathExistsIncludingBrokenSymlink(targetPath) && !isBrokenSymlink(targetPath)) continue;
    const sourcePath = resolveToolFromPath(tool, pathValue);
    if (!sourcePath) continue;

    // On Windows, pixi/conda package managers use trampoline shims that
    // require a sibling trampoline_configuration/ directory. Copying or
    // symlinking just the shim breaks it. Since resolveToolFromPath()
    // already proved the tool works on PATH, skip provisioning — the
    // managed bin dir's PATH entry (from getShellEnv) will find it anyway.
    if (isPixiTrampolineShim(sourcePath)) continue;

    provisioned.push(provisionTool(targetDir, tool, sourcePath));
  }

  return provisioned;
}
