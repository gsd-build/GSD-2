// GSD2 — Ollama Extension: First-class local LLM support
/**
 * Ollama Extension
 *
 * Auto-detects a running Ollama instance, discovers locally pulled models,
 * and registers them as a first-class provider. No configuration required —
 * if Ollama is running, models appear automatically.
 *
 * Features:
 * - Auto-discovery of local models via /api/tags
 * - Capability detection (vision, reasoning, context window)
 * - /ollama slash commands for model management
 * - ollama_manage tool for LLM-driven model operations
 * - Zero-cost model registration (local inference)
 *
 * Respects OLLAMA_HOST env var for non-default endpoints.
 */

import { importExtensionModule, type ExtensionAPI, type ExtensionContext } from "@gsd/pi-coding-agent";
import * as client from "./ollama-client.js";
import { discoverModels } from "./ollama-discovery.js";
import { registerOllamaCommands } from "./ollama-commands.js";
import { streamOllamaChat } from "./ollama-chat-provider.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

let toolsPromise: Promise<void> | null = null;

async function registerOllamaTools(pi: ExtensionAPI): Promise<void> {
	if (!toolsPromise) {
		toolsPromise = (async () => {
			const { registerOllamaTool } = await importExtensionModule<
				typeof import("./ollama-tool.js")
			>(import.meta.url, "./ollama-tool.js");
			registerOllamaTool(pi);
		})().catch((error) => {
			toolsPromise = null;
			throw error;
		});
	}
	return toolsPromise;
}

/** Track whether we've registered models so we can clean up on shutdown */
let providerRegistered = false;

/**
 * Read the user's configured default provider/model from settings.
 *
 * Reads both global and project-scoped settings, merging them to match
 * the behavior of SettingsManager.getDefaultProvider/getDefaultModel.
 * This ensures the extension sees the same effective value as the startup
 * validation logic.
 */
function readOllamaSettings(): { provider: string; model: string } | null {
	try {
		const gsdHome = process.env.GSD_HOME || join(homedir(), ".gsd")
		let provider: string | undefined
		let model: string | undefined

		// Read global settings
		try {
			const globalRaw = readFileSync(join(gsdHome, "agent", "settings.json"), "utf-8")
			const globalData: Record<string, unknown> = JSON.parse(globalRaw)
			if (typeof globalData.defaultProvider === "string") provider = globalData.defaultProvider
			if (typeof globalData.defaultModel === "string") model = globalData.defaultModel
		} catch {
			// No global settings file — not an error
		}

		// Read project-scoped settings (override global if present)
		try {
			const projectPath = join(process.cwd(), ".gsd", "settings.json")
			const projectRaw = readFileSync(projectPath, "utf-8")
			const projectData: Record<string, unknown> = JSON.parse(projectRaw)
			// Project settings override global for non-global-only keys
			if (typeof projectData.defaultProvider === "string") provider = projectData.defaultProvider
			if (typeof projectData.defaultModel === "string") model = projectData.defaultModel
		} catch {
			// No project settings — use global values
		}

		if (provider || model) return { provider: provider ?? "", model: model ?? "" }
		return null
	} catch {
		return null
	}
}

/**
 * Probe Ollama and register discovered models.
 * Safe to call multiple times — re-discovers and re-registers.
 */
async function probeAndRegister(pi: ExtensionAPI): Promise<boolean> {
	const running = await client.isRunning();
	if (!running) {
		if (providerRegistered) {
			pi.unregisterProvider("ollama");
			providerRegistered = false;
		}
		return false;
	}

	const models = await discoverModels();
	if (models.length === 0) {
		// No local models means there's nothing usable to register in GSD.
		// Keep the footer/status clean instead of advertising Ollama availability.
		if (providerRegistered) {
			pi.unregisterProvider("ollama");
			providerRegistered = false;
		}
		return false;
	}

	const baseUrl = client.getOllamaHost();

	// Use authMode "apiKey" (#3440). Local Ollama ignores the Authorization header,
	// so the "ollama" fallback is harmless. For cloud endpoints (OLLAMA_HOST pointing
	// to ollama.com or a remote instance), OLLAMA_API_KEY is picked up here.
	pi.registerProvider("ollama", {
		authMode: "apiKey",
		apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
		baseUrl,
		api: "ollama-chat",
		streamSimple: streamOllamaChat,
		isReady: () => true,
		models: models.map((m) => ({
			id: m.id,
			name: m.name,
			reasoning: m.reasoning,
			input: m.input,
			cost: m.cost,
			contextWindow: m.contextWindow,
			maxTokens: m.maxTokens,
			providerOptions: (m.ollamaOptions ?? {}) as Record<string, unknown>,
		})),
	});

	providerRegistered = true;
	return true;
}

export default function ollama(pi: ExtensionAPI) {
	// Register slash commands immediately (they check Ollama availability themselves)
	registerOllamaCommands(pi);

	pi.on("session_start", async (_event, ctx) => {
		// Register tool (deferred to avoid blocking startup)
		if (ctx.hasUI) {
			void registerOllamaTools(pi).catch((error) => {
				ctx.ui.notify(
					`Ollama tool failed to load: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
			});
		} else {
			await registerOllamaTools(pi);
		}

		// Always await the probe so that ollama models are registered in the
		// model registry before the session tries to use a fallback model.
		// Previously, in interactive mode, the probe was fire-and-forget,
		// causing a race condition: findInitialModel() couldn't find ollama
		// models (not yet discovered) and fell back to a different provider,
		// which was then saved to settings.json, permanently overwriting the
		// user's choice (#3531, #3534 follow-up).
		try {
			const found = await probeAndRegister(pi);
			if (ctx.hasUI) {
				ctx.ui.setStatus("ollama", found ? "Ollama" : undefined);
			}

			// If the user's configured model is ollama/* but the session fell
			// back to a different provider (because ollama wasn't discovered
			// yet at startup), switch back to the user's chosen ollama model.
			if (found) {
				const configured = readOllamaSettings();
				if (configured?.provider === "ollama" && configured?.model) {
					const currentModel = ctx.model;
					if (currentModel?.provider !== "ollama") {
						const target = ctx.modelRegistry.find("ollama", configured.model);
						if (target) {
							try {
								await pi.setModel(target, { persist: false });
							} catch {
								// Non-fatal — session stays on current model
							}
						}
					}
				}
			}
		} catch {
			if (ctx.hasUI) {
				ctx.ui.setStatus("ollama", undefined);
			}
		}
	});

	pi.on("session_shutdown", async () => {
		if (providerRegistered) {
			pi.unregisterProvider("ollama");
			providerRegistered = false;
		}
		toolsPromise = null;
	});
}
