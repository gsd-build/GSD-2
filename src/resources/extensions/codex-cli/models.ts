import { getModels, type Api, type Model } from "@gsd/pi-ai";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export const CODEX_CLI_MODELS: Model<Api>[] = getModels("openai-codex").map((model) => ({
	...model,
	provider: "codex-cli",
	baseUrl: "local://codex-cli",
	name: `${model.name} (via Codex CLI)`,
	input: ["text"],
	cost: { ...ZERO_COST },
}));
