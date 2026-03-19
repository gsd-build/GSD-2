#!/usr/bin/env node
/**
 * Generate OpenRouter model entries for models.generated.ts
 *
 * Fetches the full model list from OpenRouter's API and generates
 * TypeScript model entries matching the existing registry format.
 *
 * Usage: node scripts/generate-openrouter-models.mjs > /tmp/openrouter-models.ts
 *
 * The output is a partial TypeScript object that can be merged into
 * packages/pi-ai/src/models.generated.ts under the "openrouter" key.
 */

const API_URL = "https://openrouter.ai/api/v1/models";

async function fetchModels() {
  const resp = await fetch(API_URL);
  if (!resp.ok) throw new Error(`API returned ${resp.status}`);
  const data = await resp.json();
  return data.data || [];
}

function inferApi(model) {
  // Models that support the responses API
  if (model.id.startsWith("openai/") || model.id.startsWith("anthropic/")) {
    return "openai-completions";
  }
  return "openai-completions";
}

function inferReasoning(model) {
  const id = model.id.toLowerCase();
  return id.includes("o1") || id.includes("o3") || id.includes("o4") ||
    id.includes("reasoning") || id.includes("think");
}

function inferInput(model) {
  const arch = model.architecture || {};
  const modality = (arch.input_modalities || []).join(",").toLowerCase();
  if (modality.includes("image")) return '["text", "image"]';
  return '["text"]';
}

function formatCost(pricing) {
  if (!pricing) return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  // OpenRouter pricing is per-token in dollars; our format is per-million-tokens
  const toPerMillion = (v) => Math.round(parseFloat(v || "0") * 1_000_000 * 100) / 100;
  return {
    input: toPerMillion(pricing.prompt),
    output: toPerMillion(pricing.completion),
    cacheRead: 0,
    cacheWrite: 0,
  };
}

async function main() {
  const models = await fetchModels();

  console.log('\t"openrouter": {');

  for (const m of models.sort((a, b) => a.id.localeCompare(b.id))) {
    const cost = formatCost(m.pricing);
    const contextWindow = m.context_length || 128000;
    const maxOutput = m.top_provider?.max_completion_tokens || Math.min(contextWindow, 16384);
    const reasoning = inferReasoning(m);
    const input = inferInput(m);

    console.log(`\t\t"${m.id}": {`);
    console.log(`\t\t\tid: "${m.id}",`);
    console.log(`\t\t\tname: ${JSON.stringify(m.name || m.id)},`);
    console.log(`\t\t\tapi: "${inferApi(m)}",`);
    console.log(`\t\t\tprovider: "openrouter",`);
    console.log(`\t\t\tbaseUrl: "https://openrouter.ai/api/v1",`);
    console.log(`\t\t\treasoning: ${reasoning},`);
    console.log(`\t\t\tinput: ${input},`);
    console.log(`\t\t\tcost: {`);
    console.log(`\t\t\t\tinput: ${cost.input},`);
    console.log(`\t\t\t\toutput: ${cost.output},`);
    console.log(`\t\t\t\tcacheRead: ${cost.cacheRead},`);
    console.log(`\t\t\t\tcacheWrite: ${cost.cacheWrite},`);
    console.log(`\t\t\t},`);
    console.log(`\t\t\tcontextWindow: ${contextWindow},`);
    console.log(`\t\t\tmaxOutput: ${maxOutput},`);
    console.log(`\t\t},`);
  }

  console.log("\t},");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
