---
estimated_steps: 5
estimated_files: 2
---

# T01: Add custom provider test file and template generation logic

**Slice:** S01 — Custom provider onboarding and auth
**Milestone:** M003

## Description

Create the test contract for this slice and implement the core template generation function. The tests define what "done" looks like for the entire slice. Template generation is the pure-logic core — no interactive prompts, no file I/O — just producing the correct `models.json` JSON for each provider preset.

## Steps

1. Create `src/tests/custom-provider.test.ts` with test groups:
   - Template generation: verify `generateModelsTemplate('ollama')`, `generateModelsTemplate('lm-studio')`, `generateModelsTemplate('vllm')`, `generateModelsTemplate('generic')` each return valid JSON with correct `baseUrl`, `api`, `apiKey`, and at least one model entry
   - `shouldRunOnboarding()` with custom-only auth: stub test that initially fails (asserts `shouldRunOnboarding()` returns `false` when `models.json` exists but no LLM provider is authed — this will be implemented in T03)
   - No-overwrite guard: test that `generateModelsTemplate()` includes metadata (provider name, preset type) so the wizard can check for existing files

2. Define `CUSTOM_PROVIDER_PRESETS` in `src/onboarding.ts`:
   - `ollama`: `baseUrl: "http://localhost:11434/v1"`, `api: "openai-completions"`, `apiKey: "ollama"`, example model `llama3.1:8b`, `needsApiKey: false`
   - `lm-studio`: `baseUrl: "http://localhost:1234/v1"`, `api: "openai-completions"`, `apiKey: "lm-studio"`, example model `loaded-model`, `needsApiKey: false`
   - `vllm`: `baseUrl: "http://localhost:8000/v1"`, `api: "openai-completions"`, `apiKey: "VLLM_API_KEY"`, example model `meta-llama/Llama-3.1-8B`, `needsApiKey: true`
   - `generic`: `baseUrl: "https://api.example.com/v1"`, `api: "openai-completions"`, `apiKey: "YOUR_API_KEY"`, example model `model-name`, `needsApiKey: true`

3. Implement `generateModelsTemplate(preset: string): { json: string; providerName: string; needsApiKey: boolean }` in `src/onboarding.ts` — exported for testing. Returns stringified JSON (pretty-printed), the provider key name (for auth.json storage), and whether the preset needs an API key.

4. Verify each preset generates valid JSON that parses correctly and contains the required `providers` → `{name}` → `baseUrl`, `api`, `apiKey`, `models` structure.

5. Run the test file — template generation tests should pass; `shouldRunOnboarding` tests should fail (expected — T03 implements the fix).

## Must-Haves

- [ ] `CUSTOM_PROVIDER_PRESETS` constant with all 4 presets and correct default values per Pi SDK `models.md` docs
- [ ] `generateModelsTemplate()` exported from `onboarding.ts` returning valid JSON, provider name, and needsApiKey flag
- [ ] Test file with template generation assertions for all 4 presets
- [ ] Test file with placeholder test for `shouldRunOnboarding()` with custom-only auth (initially failing is OK)
- [ ] Each preset's JSON passes `JSON.parse()` and contains required fields per Pi SDK schema

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts 2>&1 | grep -E 'pass|fail|ok|not ok'`
- Template generation tests pass (4 presets × field validation)
- `shouldRunOnboarding` tests may fail — this is expected and correct at this stage

## Observability Impact

- Signals added/changed: None — pure function, no runtime signals
- How a future agent inspects this: Run the test file to verify template correctness
- Failure state exposed: Test assertions with descriptive messages for each preset field

## Inputs

- Pi SDK `models.md` docs — for correct `baseUrl`, `api` values per provider
- `src/onboarding.ts` — existing module to extend with new exports
- `src/tests/app-smoke.test.ts` — existing test pattern to follow (node:test, assert)

## Expected Output

- `src/tests/custom-provider.test.ts` — test file with template generation tests and placeholder shouldRunOnboarding test
- `src/onboarding.ts` — extended with `CUSTOM_PROVIDER_PRESETS`, `generateModelsTemplate()` export
