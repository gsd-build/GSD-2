import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	importExtensionModule,
	loadExtensions,
	type PostInstallContext,
	type PostInstallHandler,
	type PostInstallScope,
} from "./extensions/index.js";
import type { DefaultPackageManager } from "./package-manager.js";

interface ExtensionManifest {
	dependencies?: {
		runtime?: string[];
	};
}

export interface PostInstallHooksOptions {
	source: string;
	local: boolean;
	cwd: string;
	agentDir: string;
	appName: string;
	packageManager: DefaultPackageManager;
	stdout: NodeJS.WriteStream;
	stderr: NodeJS.WriteStream;
}

export interface PostInstallHooksResult {
	hooksRun: number;
	hookErrors: number;
	legacyHooksRun: number;
	entryPathCount: number;
}

function toScope(local: boolean): PostInstallScope {
	return local ? "project" : "user";
}

function readManifestRuntimeDeps(dir: string): string[] {
	const manifestPath = join(dir, "extension-manifest.json");
	if (!existsSync(manifestPath)) return [];
	try {
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as ExtensionManifest;
		return manifest.dependencies?.runtime?.filter((dep): dep is string => typeof dep === "string") ?? [];
	} catch {
		return [];
	}
}

function collectRuntimeDependencies(installedPath: string, entryPaths: string[]): string[] {
	const deps = new Set<string>();
	const candidateDirs = new Set<string>([installedPath, ...entryPaths.map((entryPath) => dirname(entryPath))]);
	for (const dir of candidateDirs) {
		for (const dep of readManifestRuntimeDeps(dir)) {
			deps.add(dep);
		}
	}
	return Array.from(deps);
}

function verifyRuntimeDependencies(runtimeDeps: string[], source: string, appName: string): void {
	const missing: string[] = [];
	for (const dep of runtimeDeps) {
		const result = spawnSync(dep, ["--version"], { encoding: "utf-8", timeout: 5000 });
		if (result.error || result.status !== 0) {
			missing.push(dep);
		}
	}
	if (missing.length === 0) return;
	throw new Error(
		`Missing runtime dependencies: ${missing.join(", ")}.\n` +
			`Install them and retry: ${appName} install ${source}`,
	);
}

async function runHookSafe(
	hook: PostInstallHandler,
	context: PostInstallContext,
	stderr: NodeJS.WriteStream,
): Promise<boolean> {
	try {
		await hook(context);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		stderr.write(`[post-install] Hook failed: ${message}\n`);
		return false;
	}
}

async function runLegacyExportPostInstall(entryPath: string, context: PostInstallContext): Promise<PostInstallHandler | null> {
	try {
		const module = await importExtensionModule<Record<string, unknown>>(import.meta.url, pathToFileURL(entryPath).href);
		const candidate = module.postInstall;
		return typeof candidate === "function" ? (candidate as PostInstallHandler) : null;
	} catch {
		return null;
	}
}

export async function runPostInstallHooks(options: PostInstallHooksOptions): Promise<PostInstallHooksResult> {
	const scope = toScope(options.local);
	const installedPath = options.packageManager.getInstalledPath(options.source, scope);
	if (!installedPath) {
		throw new Error(`Install completed but package path could not be resolved for ${options.source}`);
	}

	const resolved = await options.packageManager.resolveExtensionSources([options.source], { local: options.local });
	const entryPaths = resolved.extensions.filter((resource) => resource.enabled).map((resource) => resource.path);
	if (entryPaths.length === 0) {
		options.stdout.write("Installed package exposes no extensions. No post-install hooks to run.\n");
		return { hooksRun: 0, hookErrors: 0, legacyHooksRun: 0, entryPathCount: 0 };
	}

	const runtimeDeps = collectRuntimeDependencies(installedPath, entryPaths);
	verifyRuntimeDependencies(runtimeDeps, options.source, options.appName);

	const loaded = await loadExtensions(entryPaths, options.cwd);
	for (const { path, error } of loaded.errors) {
		options.stderr.write(`[post-install] Failed to load extension "${path}": ${error}\n`);
	}

	let hooksRun = 0;
	let hookErrors = 0;
	let legacyHooksRun = 0;
	const hooksByPath = new Map<string, PostInstallHandler[]>();
	for (const extension of loaded.extensions) {
		hooksByPath.set(extension.path, extension.postInstallHandlers);
	}

	const context: PostInstallContext = {
		source: options.source,
		installedPath,
		scope,
		cwd: options.cwd,
		interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
		log: (message) => options.stdout.write(`${message}\n`),
		warn: (message) => options.stderr.write(`${message}\n`),
		error: (message) => options.stderr.write(`${message}\n`),
	};

	for (const entryPath of entryPaths) {
		const registeredHooks = hooksByPath.get(entryPath) ?? [];
		if (registeredHooks.length > 0) {
			for (const hook of registeredHooks) {
				hooksRun += 1;
				const ok = await runHookSafe(hook, context, options.stderr);
				if (!ok) hookErrors += 1;
			}
			continue;
		}

		const legacyHook = await runLegacyExportPostInstall(entryPath, context);
		if (!legacyHook) continue;

		legacyHooksRun += 1;
		const ok = await runHookSafe(legacyHook, context, options.stderr);
		if (!ok) hookErrors += 1;
	}

	if (hooksRun === 0 && legacyHooksRun === 0) {
		options.stdout.write("No post-install hooks declared. Install completed.\n");
	}

	return {
		hooksRun,
		hookErrors,
		legacyHooksRun,
		entryPathCount: entryPaths.length,
	};
}
