/**
 * Custom Python module loader — discovers and loads user/project Python modules
 * into a kernel session.
 *
 * Module locations:
 * - User modules: <agentDir>/modules/*.py
 * - Project modules: <cwd>/.gsd/modules/*.py
 *
 * Project modules override user modules with the same name.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentDir } from "../../../config.js";
import type { JupyterKernel } from "./kernel.js";

interface ModuleFile {
	name: string;
	path: string;
	content: string;
}

/**
 * Discover custom module files from a directory.
 */
function discoverModules(dir: string): ModuleFile[] {
	if (!existsSync(dir)) return [];

	const modules: ModuleFile[] = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith(".py")) {
				const fullPath = join(dir, entry.name);
				try {
					modules.push({
						name: basename(entry.name, ".py"),
						path: fullPath,
						content: readFileSync(fullPath, "utf-8"),
					});
				} catch {
					// Skip unreadable files
				}
			}
		}
	} catch {
		// Directory not readable
	}
	return modules;
}

/**
 * Load all custom modules into a kernel.
 *
 * Module execution order:
 * 1. User modules from <agentDir>/modules/
 * 2. Project modules from <cwd>/.gsd/modules/ (overrides user modules with same name)
 *
 * Each module is executed silently. Errors are logged but do not prevent
 * other modules from loading.
 */
export async function loadCustomModules(
	kernel: JupyterKernel,
	cwd: string,
): Promise<{ loaded: string[]; errors: Array<{ name: string; error: string }> }> {
	const loaded: string[] = [];
	const errors: Array<{ name: string; error: string }> = [];

	// Discover modules
	const userModulesDir = join(getAgentDir(), "modules");
	const projectModulesDir = join(cwd, ".gsd", "modules");

	const userModules = discoverModules(userModulesDir);
	const projectModules = discoverModules(projectModulesDir);

	// Merge: project overrides user
	const moduleMap = new Map<string, ModuleFile>();
	for (const mod of userModules) {
		moduleMap.set(mod.name, mod);
	}
	for (const mod of projectModules) {
		moduleMap.set(mod.name, mod);
	}

	// Execute modules sequentially
	for (const mod of moduleMap.values()) {
		try {
			const result = await kernel.execute(mod.content, { silent: true, timeout: 15_000 });
			if (result.error) {
				const errOutput = result.outputs.find((o) => o.type === "error");
				const errMsg = errOutput ? `${errOutput.ename}: ${errOutput.evalue}` : "Unknown error";
				errors.push({ name: mod.name, error: errMsg });
			} else {
				loaded.push(mod.name);
			}
		} catch (err) {
			errors.push({ name: mod.name, error: err instanceof Error ? err.message : String(err) });
		}
	}

	return { loaded, errors };
}
