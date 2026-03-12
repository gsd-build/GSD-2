# S01: Custom Provider Onboarding and Auth

**Goal:** A user can configure a custom/local model provider through GSD's onboarding wizard, have the API key stored correctly, and see the custom model available in the model selector on next launch.
**Demo:** Run `gsd config`, choose "Custom/Local provider", select a preset (Ollama/LM Studio/Generic), get a `models.json` template written to `~/.gsd/agent/`, enter an API key that gets stored in `auth.json`, and see the custom model listed in the model selector on next launch.

## Must-Haves

- "Custom/Local provider" option in the LLM provider selector in onboarding wizard
- Provider preset selection (Ollama, LM Studio, vLLM, Generic OpenAI-compatible)
- `models.json` template generation with correct schema for each preset
- Guard against overwriting existing `models.json` (offer to open existing file instead)
- API key collection via `p.password()` stored in `auth.json` under the provider name from the template
- Allow skipping API key for local providers (Ollama, LM Studio) that don't need one
- `$EDITOR`/`$VISUAL` opening of the generated template (with fallback to printing the path)
- `shouldRunOnboarding()` updated to not re-trigger for users who only have custom provider auth
- Clear messaging that GSD restart is needed to pick up the new models

## Proof Level

- This slice proves: **integration** — the wizard writes real files (`models.json`, `auth.json`) that the Pi SDK's `ModelRegistry` reads on next launch
- Real runtime required: **yes** — `authStorage.set()` writes to `auth.json`, template writes to disk, `ModelRegistry` reads on boot
- Human/UAT required: **yes** — the wizard UX flow needs human evaluation for clarity and usability

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts`
- Tests cover: template generation for each preset, `shouldRunOnboarding()` with custom-only auth, no-overwrite guard, API key storage under correct provider ID

## Observability / Diagnostics

- Runtime signals: clack log messages during wizard (success/warning/info) visible in terminal stderr
- Inspection surfaces: `~/.gsd/agent/models.json` (template file), `~/.gsd/agent/auth.json` (stored credentials — key names only, not values)
- Failure visibility: wizard step failures logged via `p.log.warn()` with error message; template write failures surface as clack error messages
- Redaction constraints: API keys never logged or echoed; only provider names and success/failure status shown

## Integration Closure

- Upstream surfaces consumed: Pi SDK `AuthStorage` (`.set()`, `.has()`, `.list()`), `@clack/prompts`, `~/.gsd/agent/` path from `app-paths.ts`
- New wiring introduced in this slice: custom provider wizard step in `onboarding.ts`, `shouldRunOnboarding()` extended to check for `models.json` existence
- What remains before the milestone is truly usable end-to-end: S02 (startup validation, fallback model selection, auto-mode custom model resolution), S03 (documentation)

## Tasks

- [x] **T01: Add custom provider test file and template generation logic** `est:1h`
  - Why: Establishes the test contract for this slice and builds the core template generation function that the wizard step will call. Tests first so remaining tasks have a verification target.
  - Files: `src/tests/custom-provider.test.ts`, `src/onboarding.ts`
  - Do: Create test file with assertions for template generation (4 presets produce valid JSON with correct baseUrl/api/apiKey), `shouldRunOnboarding()` behavior with custom-only auth, and no-overwrite guard. Implement `generateModelsTemplate(preset)` function and `CUSTOM_PROVIDER_PRESETS` constant in `onboarding.ts`. Tests for template generation should pass; tests for wizard integration and `shouldRunOnboarding()` changes should initially fail.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — template generation tests pass
  - Done when: Template generation function returns valid `models.json` JSON for all 4 presets with correct `baseUrl`, `api`, `apiKey` fields; test file exists with both passing and initially-failing tests

- [x] **T02: Wire custom provider wizard step into onboarding** `est:1h`
  - Why: Connects the template generation to the interactive wizard flow — the user-facing surface. This is where the clack prompts, file writing, API key collection, `$EDITOR` opening, and the no-overwrite guard come together.
  - Files: `src/onboarding.ts`
  - Do: Add "Custom/Local provider" option to the LLM provider select in `runLlmStep()`. Implement `runCustomProviderFlow()` that: (1) shows preset selector, (2) checks for existing `models.json` and offers to open it, (3) writes template to `~/.gsd/agent/models.json`, (4) collects API key via `p.password()` (skippable for Ollama/LM Studio presets), (5) stores key in `auth.json` via `authStorage.set()` using the provider name from the template, (6) opens template in `$EDITOR`/`$VISUAL` with fallback, (7) shows summary with restart-needed message. Wire the flow into the existing `runLlmStep()` dispatch.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — wizard integration tests pass
  - Done when: The full custom provider flow is callable from the onboarding wizard; template files are written correctly; API key is stored under the right provider ID; `$EDITOR` opening works with fallback

- [x] **T03: Fix shouldRunOnboarding for custom-only users and final verification** `est:45m`
  - Why: Without this fix, users who only configure a custom provider see the wizard on every launch because their provider ID isn't in `LLM_PROVIDER_IDS`. This task closes that gap and runs final end-to-end verification.
  - Files: `src/onboarding.ts`, `src/tests/custom-provider.test.ts`
  - Do: Extend `shouldRunOnboarding()` to also check for `models.json` existence at `~/.gsd/agent/models.json` — if the file exists, the user has configured a custom provider and shouldn't see the wizard. Import `existsSync` from `node:fs` and `agentDir` from `app-paths.ts` (or compute path inline). Update the `shouldRunOnboarding()` test to verify this behavior. Run the full test suite to ensure no regressions.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — all tests pass including `shouldRunOnboarding` with models.json check. Also run `npm test` for full suite.
  - Done when: `shouldRunOnboarding()` returns `false` when `models.json` exists even if no LLM provider ID is in auth; all custom provider tests pass; full test suite passes

## Files Likely Touched

- `src/onboarding.ts`
- `src/tests/custom-provider.test.ts`
- `src/app-paths.ts` (may import `agentDir` from here)
