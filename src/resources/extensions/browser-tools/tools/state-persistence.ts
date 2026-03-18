import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * State persistence tools — save/restore cookies, localStorage, sessionStorage.
 */

const STATE_DIR = ".gsd/browser-state";

export function registerStatePersistenceTools(pi: ExtensionAPI, deps: ToolDeps): void {
	// -------------------------------------------------------------------------
	// browser_save_state
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_save_state",
		label: "Browser Save State",
		description:
			"Save cookies, localStorage, and sessionStorage to disk so authenticated sessions survive browser restarts. " +
			"State files are written to .gsd/browser-state/ and should be gitignored (may contain auth tokens). " +
			"Never displays secret values in output.",
		parameters: Type.Object({
			name: Type.Optional(
				Type.String({ description: "Name for the state file (default: 'default'). Used as the filename stem." }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { context: ctx, page: p } = await deps.ensureBrowser();
				const name = deps.sanitizeArtifactName(params.name ?? "default", "default");

				const { mkdir, writeFile } = await import("node:fs/promises");
				const path = await import("node:path");
				const stateDir = path.resolve(process.cwd(), STATE_DIR);
				await mkdir(stateDir, { recursive: true });

				// 1. Playwright storageState: cookies + localStorage
				const storageState = await ctx.storageState();

				// 2. sessionStorage: must be extracted per-origin via page.evaluate
				const sessionStorageData: Record<string, Record<string, string>> = {};
				try {
					const origin = new URL(p.url()).origin;
					const ssData = await p.evaluate(() => {
						const data: Record<string, string> = {};
						for (let i = 0; i < sessionStorage.length; i++) {
							const key = sessionStorage.key(i);
							if (key) data[key] = sessionStorage.getItem(key) ?? "";
						}
						return data;
					});
					if (Object.keys(ssData).length > 0) {
						sessionStorageData[origin] = ssData;
					}
				} catch {
					// Page may not have a valid origin (about:blank, etc.)
				}

				const combined = {
					storageState,
					sessionStorage: sessionStorageData,
					savedAt: new Date().toISOString(),
					url: p.url(),
				};

				const filePath = path.join(stateDir, `${name}.json`);
				await writeFile(filePath, JSON.stringify(combined, null, 2));

				// Ensure .gitignore covers the state dir
				const gitignorePath = path.resolve(process.cwd(), STATE_DIR, ".gitignore");
				await writeFile(gitignorePath, "*\n!.gitignore\n").catch(() => { /* best-effort — .gitignore may already exist or dir may be read-only */ });

				const cookieCount = storageState.cookies?.length ?? 0;
				const localStorageOrigins = storageState.origins?.length ?? 0;
				const sessionStorageOrigins = Object.keys(sessionStorageData).length;

				return {
					content: [{
						type: "text",
						text: `State saved: ${filePath}\nCookies: ${cookieCount}\nlocalStorage origins: ${localStorageOrigins}\nsessionStorage origins: ${sessionStorageOrigins}`,
					}],
					details: {
						path: filePath,
						cookieCount,
						localStorageOrigins,
						sessionStorageOrigins,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Save state failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});

	// -------------------------------------------------------------------------
	// browser_restore_state
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_restore_state",
		label: "Browser Restore State",
		description:
			"Restore cookies, localStorage, and sessionStorage from a previously saved state file. " +
			"Injects cookies via context.addCookies() and storage via page.evaluate(). " +
			"For full fidelity, restore before navigating to the target site.",
		parameters: Type.Object({
			name: Type.Optional(
				Type.String({ description: "Name of the state file to restore (default: 'default')." }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { context: ctx, page: p } = await deps.ensureBrowser();
				const name = deps.sanitizeArtifactName(params.name ?? "default", "default");

				const { readFile } = await import("node:fs/promises");
				const path = await import("node:path");
				const filePath = path.join(process.cwd(), STATE_DIR, `${name}.json`);

				let raw: string;
				try {
					raw = await readFile(filePath, "utf-8");
				} catch {
					return {
						content: [{ type: "text", text: `State file not found: ${filePath}` }],
						details: { error: "file_not_found", path: filePath },
						isError: true,
					};
				}

				const combined = JSON.parse(raw);
				const storageState = combined.storageState;
				const sessionStorageData: Record<string, Record<string, string>> = combined.sessionStorage ?? {};

				// 1. Restore cookies
				let cookieCount = 0;
				if (storageState?.cookies?.length) {
					await ctx.addCookies(storageState.cookies);
					cookieCount = storageState.cookies.length;
				}

				// 2. Restore localStorage via page.evaluate
				let localStorageOrigins = 0;
				if (storageState?.origins?.length) {
					for (const origin of storageState.origins) {
						try {
							await p.evaluate((items: Array<{ name: string; value: string }>) => {
								for (const { name, value } of items) {
									localStorage.setItem(name, value);
								}
							}, origin.localStorage ?? []);
							localStorageOrigins++;
						} catch {
							// Origin mismatch — localStorage can only be set on matching origin
						}
					}
				}

				// 3. Restore sessionStorage via page.evaluate
				let sessionStorageOrigins = 0;
				for (const [_origin, data] of Object.entries(sessionStorageData)) {
					try {
						await p.evaluate((items: Record<string, string>) => {
							for (const [key, value] of Object.entries(items)) {
								sessionStorage.setItem(key, value);
							}
						}, data);
						sessionStorageOrigins++;
					} catch {
						// Origin mismatch
					}
				}

				return {
					content: [{
						type: "text",
						text: `State restored from: ${filePath}\nCookies: ${cookieCount}\nlocalStorage origins: ${localStorageOrigins}\nsessionStorage origins: ${sessionStorageOrigins}\nSaved at: ${combined.savedAt ?? "unknown"}`,
					}],
					details: {
						path: filePath,
						cookieCount,
						localStorageOrigins,
						sessionStorageOrigins,
						savedAt: combined.savedAt,
						savedUrl: combined.url,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Restore state failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}
