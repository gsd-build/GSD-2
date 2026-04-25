// GSD2 — Ollama model discovery and capability detection

/**
 * Discovers locally available Ollama models and enriches them with
 * capability metadata (context window, vision, reasoning) from the
 * known model table and /api/show responses.
 *
 * Returns models in the format expected by pi.registerProvider().
 */

import { listModels, showModel } from "./ollama-client.js";
import {
	estimateContextFromParams,
	formatModelSize,
	getModelCapabilities,
	humanizeModelName,
} from "./model-capabilities.js";
import type { OllamaChatOptions, OllamaModelInfo } from "./types.js";

/**
 * Extract context window from /api/show model_info.
 * Keys follow the pattern "{architecture}.context_length" (e.g. "llama.context_length").
 */
function extractContextFromModelInfo(modelInfo: Record<string, unknown>): number | undefined {
	for (const [key, value] of Object.entries(modelInfo)) {
		if (key.endsWith(".context_length") && typeof value === "number" && value > 0) {
			return value;
		}
	}
	return undefined;
}

type ClientDeps = {
	listModels: typeof listModels;
	showModel: typeof showModel;
};

export interface DiscoveredOllamaModel {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
	/** Raw size in bytes for display purposes */
	sizeBytes: number;
	/** Parameter size string from Ollama (e.g. "7B") */
	parameterSize: string;
	/** Ollama-specific inference options for this model */
	ollamaOptions?: OllamaChatOptions;
}

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

async function enrichModel(info: OllamaModelInfo, deps: ClientDeps): Promise<DiscoveredOllamaModel> {
	const caps = getModelCapabilities(info.name);
	const parameterSize = info.details?.parameter_size ?? "";

	// Always call /api/show — it carries two pieces of info absent from /api/tags:
	// the per-architecture context_length, and (ollama 0.4+) a `capabilities` array
	// like ["thinking", "completion", "tools"]. The capabilities array is the
	// authoritative source for reasoning detection on cloud-routed models that
	// don't appear in the static KNOWN_MODELS table.
	let showContextWindow: number | undefined;
	let showCapabilities: string[] | undefined;
	try {
		const showData = await deps.showModel(info.name);
		showContextWindow = extractContextFromModelInfo(showData.model_info);
		showCapabilities = showData.capabilities;
	} catch (err) {
		// non-fatal: fall through to table/estimate
		if (process.env.GSD_DEBUG) console.warn(`[ollama] /api/show failed for ${info.name}:`, err instanceof Error ? err.message : String(err));
	}

	// Determine context window: known table > /api/show > estimate from param size > default
	const contextWindow =
		caps.contextWindow ??
		showContextWindow ??
		(parameterSize ? estimateContextFromParams(parameterSize) : 8192);

	// Determine max tokens: known table > fraction of context > default
	const maxTokens =
		caps.maxTokens ?? Math.min(Math.floor(contextWindow / 4), 16384);

	// Detect vision: /api/show capabilities > known table > model families heuristic
	const hasVision =
		showCapabilities?.includes("vision") ??
		caps.input?.includes("image") ??
		(info.details?.families?.some((f) => f === "clip" || f === "mllama") ?? false);

	// Detect reasoning: /api/show capabilities (authoritative) > known table fallback
	const reasoning =
		showCapabilities?.includes("thinking") ??
		caps.reasoning ??
		false;

	return {
		id: info.name,
		name: humanizeModelName(info.name),
		reasoning,
		input: hasVision ? ["text", "image"] : ["text"],
		cost: ZERO_COST,
		contextWindow,
		maxTokens,
		sizeBytes: info.size,
		parameterSize,
		ollamaOptions: caps.ollamaOptions,
	};
}

/**
 * Discover all locally available Ollama models with enriched capabilities.
 */
export async function discoverModels(deps: ClientDeps = { listModels, showModel }): Promise<DiscoveredOllamaModel[]> {
	const tags = await deps.listModels();
	if (!tags.models || tags.models.length === 0) return [];

	return Promise.all(tags.models.map((m) => enrichModel(m, deps)));
}

/**
 * Format a discovered model for display in model list.
 */
export function formatModelForDisplay(model: DiscoveredOllamaModel): string {
	const parts = [model.id];

	if (model.sizeBytes > 0) {
		parts.push(`(${formatModelSize(model.sizeBytes)})`);
	}

	const flags: string[] = [];
	if (model.reasoning) flags.push("reasoning");
	if (model.input.includes("image")) flags.push("vision");

	if (flags.length > 0) {
		parts.push(`[${flags.join(", ")}]`);
	}

	return parts.join(" ");
}

