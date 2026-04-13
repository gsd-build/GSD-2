/**
 * Codex CLI Provider Extension
 *
 * Registers a model provider that delegates inference to the user's
 * locally-installed Codex CLI via the official TypeScript SDK.
 *
 * Users can keep the existing openai-codex OAuth provider and opt into this
 * separate local CLI route when they prefer Codex's native agent loop.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { CODEX_CLI_MODELS } from "./models.js";
import { isCodexCliReady } from "./readiness.js";
import { streamViaCodexCli } from "./stream-adapter.js";

export default function codexCli(pi: ExtensionAPI) {
	pi.registerProvider("codex-cli", {
		authMode: "externalCli",
		api: "openai-codex-responses",
		baseUrl: "local://codex-cli",
		isReady: isCodexCliReady,
		streamSimple: streamViaCodexCli,
		models: CODEX_CLI_MODELS,
	});
}
