import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { KnownProvider } from "./types.js";

let cachedVertexAdcCredentialsExists: boolean | null = null;

function hasVertexAdcCredentials(): boolean {
  if (cachedVertexAdcCredentialsExists !== null) {
    return cachedVertexAdcCredentialsExists;
  }

  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  cachedVertexAdcCredentialsExists = gacPath
    ? existsSync(gacPath)
    : existsSync(join(homedir(), ".config", "gcloud", "application_default_credentials.json"));

  return cachedVertexAdcCredentialsExists;
}

/**
 * Node-only env-key lookup for the standalone web host.
 *
 * This intentionally avoids the browser-safe dynamic-import pattern from the
 * shared pi-ai runtime because the packaged Next standalone server turns that
 * pattern into a failing "Cannot find module as expression is too dynamic"
 * runtime branch.
 */
export function getEnvApiKey(provider: KnownProvider): string | undefined;
export function getEnvApiKey(provider: string): string | undefined;
export function getEnvApiKey(provider: string): string | undefined {
  if (provider === "github-copilot") {
    return process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  }

  if (provider === "google-vertex") {
    const hasCredentials = hasVertexAdcCredentials();
    const hasProject = !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT);
    const hasLocation = !!process.env.GOOGLE_CLOUD_LOCATION;
    if (hasCredentials && hasProject && hasLocation) {
      return "<authenticated>";
    }
  }

  if (
    provider === "amazon-bedrock" &&
    (
      process.env.AWS_PROFILE ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      process.env.AWS_BEARER_TOKEN_BEDROCK ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE
    )
  ) {
    return "<authenticated>";
  }

  const envMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    "azure-openai-responses": "AZURE_OPENAI_API_KEY",
    google: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    cerebras: "CEREBRAS_API_KEY",
    xai: "XAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
    zai: "ZAI_API_KEY",
    mistral: "MISTRAL_API_KEY",
    minimax: "MINIMAX_API_KEY",
    "minimax-cn": "MINIMAX_CN_API_KEY",
    huggingface: "HF_TOKEN",
    opencode: "OPENCODE_API_KEY",
    "opencode-go": "OPENCODE_API_KEY",
    "kimi-coding": "KIMI_API_KEY",
    "alibaba-coding-plan": "ALIBABA_API_KEY",
  };

  const envVar = envMap[provider];
  return envVar ? process.env[envVar] : undefined;
}
