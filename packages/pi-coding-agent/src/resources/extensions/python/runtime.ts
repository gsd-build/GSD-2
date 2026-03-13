/**
 * Python runtime resolution — finds the best Python executable for kernel use.
 *
 * Resolution order:
 * 1. Virtual environment in cwd: .venv/bin/python, venv/bin/python
 * 2. PATH: python3, python
 *
 * Requires Python >= 3.8 for kernel_gateway compatibility.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/** Minimum Python version required for kernel_gateway */
const MIN_PYTHON_VERSION = [3, 8] as const;

/** Environment variable names filtered from kernel subprocess environment */
const SENSITIVE_ENV_KEYS = new Set([
	"OPENAI_API_KEY",
	"ANTHROPIC_API_KEY",
	"GSD_API_KEY",
	"PI_API_KEY",
	"AWS_SECRET_ACCESS_KEY",
	"GOOGLE_API_KEY",
	"AZURE_OPENAI_API_KEY",
]);

export interface PythonRuntime {
	/** Absolute path to the Python executable */
	pythonPath: string;
	/** Python version string (e.g., "3.11.4") */
	version: string;
	/** Whether this Python comes from a virtual environment */
	isVenv: boolean;
}

/**
 * Try to execute a Python binary and extract its version.
 * Returns null if the binary is not found or unusable.
 */
function probePython(pythonPath: string): { version: string; major: number; minor: number } | null {
	try {
		const output = execFileSync(pythonPath, ["--version"], {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();

		// "Python 3.11.4" → "3.11.4"
		const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
		if (!match) return null;

		return {
			version: `${match[1]}.${match[2]}.${match[3]}`,
			major: parseInt(match[1]!, 10),
			minor: parseInt(match[2]!, 10),
		};
	} catch {
		return null;
	}
}

/**
 * Check whether a Python binary has kernel_gateway installed.
 */
export function hasKernelGateway(pythonPath: string): boolean {
	try {
		execFileSync(pythonPath, ["-c", "import kernel_gateway"], {
			encoding: "utf-8",
			timeout: 10000,
			stdio: ["ignore", "pipe", "pipe"],
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolve the best Python runtime for the given working directory.
 * Returns null if no suitable Python is found.
 */
export function resolvePythonRuntime(cwd: string): PythonRuntime | null {
	const candidates: Array<{ path: string; isVenv: boolean }> = [];

	// 1. Check virtual environments in cwd
	const venvDirs = [".venv", "venv"];
	const binDir = process.platform === "win32" ? "Scripts" : "bin";
	const pythonBin = process.platform === "win32" ? "python.exe" : "python";

	for (const venv of venvDirs) {
		const venvPython = join(cwd, venv, binDir, pythonBin);
		if (existsSync(venvPython)) {
			candidates.push({ path: venvPython, isVenv: true });
		}
	}

	// 2. Check PATH
	const pathNames = process.platform === "win32" ? ["python"] : ["python3", "python"];
	for (const name of pathNames) {
		try {
			const resolved = execFileSync("which", [name], {
				encoding: "utf-8",
				timeout: 3000,
				stdio: ["ignore", "pipe", "pipe"],
			}).trim();
			if (resolved && existsSync(resolved)) {
				candidates.push({ path: resolved, isVenv: false });
			}
		} catch {
			// not found
		}
	}

	// Evaluate candidates
	for (const candidate of candidates) {
		const info = probePython(candidate.path);
		if (!info) continue;
		if (info.major < MIN_PYTHON_VERSION[0]) continue;
		if (info.major === MIN_PYTHON_VERSION[0] && info.minor < MIN_PYTHON_VERSION[1]) continue;

		return {
			pythonPath: candidate.path,
			version: info.version,
			isVenv: candidate.isVenv,
		};
	}

	return null;
}

/**
 * Build a filtered environment for the kernel subprocess.
 * Strips sensitive API keys and tokens.
 */
export function buildKernelEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (!SENSITIVE_ENV_KEYS.has(key)) {
			env[key] = value;
		}
	}
	return env;
}
