---
estimated_steps: 5
estimated_files: 1
---

# T02: Wire custom provider wizard step into onboarding

**Slice:** S01 — Custom provider onboarding and auth
**Milestone:** M003

## Description

Connect the template generation from T01 to the interactive onboarding wizard. This is the user-facing surface: clack prompts for preset selection, file writing with overwrite guard, API key collection, `$EDITOR` opening, and integration into the existing `runLlmStep()` dispatch.

## Steps

1. Add "Custom/Local provider" option to the `p.select()` call in `runLlmStep()`, after the existing "Other provider (API key)" option and before "Skip for now". Value: `'custom-provider'`. Label: `'Custom/Local provider (Ollama, LM Studio, etc.)'`. Hint: `'bring your own models.json'`.

2. Add dispatch case in `runLlmStep()`: when `choice === 'custom-provider'`, call `runCustomProviderFlow(p, pc, authStorage)`.

3. Implement `runCustomProviderFlow(p, pc, authStorage)`:
   - Show preset selector via `p.select()` with options from `CUSTOM_PROVIDER_PRESETS` (Ollama, LM Studio, vLLM, Generic OpenAI-compatible)
   - Check if `~/.gsd/agent/models.json` already exists (`existsSync`)
     - If yes: `p.confirm()` asking "models.json already exists — open it in your editor?" If yes, open in editor and return. If no, return false.
   - Call `generateModelsTemplate(preset)` to get the JSON content, provider name, and needsApiKey flag
   - Write the template to `~/.gsd/agent/models.json` via `writeFileSync` (ensure directory exists via `mkdirSync` with `recursive: true`)
   - If `needsApiKey` is true: collect API key via `p.password()` with message referencing the provider name, store via `authStorage.set(providerName, { type: 'api_key', key: trimmed })`
   - If `needsApiKey` is false: show `p.log.info()` explaining no API key is needed for this local provider
   - Attempt to open `models.json` in `$VISUAL` or `$EDITOR` (fallback to `vi`). If none available, print the file path via `p.note()`.
   - Show success message via `p.log.success()` including: provider name configured, file path, and "Restart GSD to use your custom models" instruction

4. Import `existsSync`, `writeFileSync`, `mkdirSync` from `node:fs` and `join` from `node:path` at the top of `onboarding.ts`. Import `agentDir` from `./app-paths.js`.

5. Add a test case in `src/tests/custom-provider.test.ts` verifying the template file write: call `generateModelsTemplate()`, write the output to a temp directory, read it back, parse it, and verify it matches the expected schema structure.

## Must-Haves

- [ ] "Custom/Local provider" option visible in the LLM provider selector
- [ ] Preset selection with all 4 options (Ollama, LM Studio, vLLM, Generic)
- [ ] Overwrite guard: existing `models.json` is not clobbered
- [ ] Template written to `~/.gsd/agent/models.json` with correct content
- [ ] API key collected and stored in `auth.json` under the correct provider name (matching `models.json` provider key)
- [ ] API key step skippable for local providers (Ollama, LM Studio)
- [ ] `$EDITOR`/`$VISUAL` opening attempted with graceful fallback
- [ ] Clear "restart needed" messaging after setup

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — file write round-trip test passes
- Manual: read `src/onboarding.ts` and confirm the dispatch is wired, `runCustomProviderFlow` handles all branches (cancel, existing file, each preset, API key skip)

## Observability Impact

- Signals added/changed: clack log messages (success/warning/info) during wizard for each step
- How a future agent inspects this: inspect the `runCustomProviderFlow` function in `onboarding.ts`; check for `models.json` and `auth.json` on disk after running `gsd config`
- Failure state exposed: file write errors surface as clack warnings; `$EDITOR` launch failures are caught and replaced with file path display

## Inputs

- `src/onboarding.ts` — with `generateModelsTemplate()` and `CUSTOM_PROVIDER_PRESETS` from T01
- `src/app-paths.ts` — for `agentDir` path
- `src/tests/custom-provider.test.ts` — from T01, to extend with file write tests

## Expected Output

- `src/onboarding.ts` — extended with `runCustomProviderFlow()`, new option in `runLlmStep()`, file I/O imports
- `src/tests/custom-provider.test.ts` — extended with file write round-trip test
