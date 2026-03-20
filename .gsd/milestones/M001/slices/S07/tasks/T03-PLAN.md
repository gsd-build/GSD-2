---
estimated_steps: 3
estimated_files: 1
---

# T03: Create LLM builder prompt template for `/gsd workflow new`

**Slice:** S07 — LLM-Assisted Builder + CLI Commands
**Milestone:** M001

## Description

Create the `workflow-builder.md` prompt template that powers `/gsd workflow new`. This prompt structures a conversation where the LLM guides the user through describing their workflow, asks clarifying questions about steps, dependencies, artifacts, and verification needs, then generates valid YAML conforming to the V1 schema and saves it to `workflow-defs/`.

The prompt is the key UX deliverable for R012. It must embed enough schema knowledge that the LLM consistently produces valid definitions without users needing to learn the YAML format. It uses `{{defsDir}}` and `{{schemaVersion}}` as template variables resolved by `loadPrompt()`.

**Relevant skills:** None — this is prompt authoring, not code.

## Steps

1. **Create `src/resources/extensions/gsd/prompts/workflow-builder.md`.**
   The prompt must include these sections:
   - **Role statement**: You are building a YAML workflow definition for GSD's custom workflow engine.
   - **Conversation flow**: (a) Ask the user what the workflow should accomplish and what its name should be. (b) Ask about the steps — what happens in each step, what order, what depends on what. (c) Ask about artifacts — what does each step produce? (d) Ask about verification — should any steps be verified? Which policy? (e) Ask about parameterization — are there variables that should change per run? (f) Ask about iteration — does any step need to fan out over items from a prior artifact?
   - **V1 Schema rules** (embed inline so the LLM has them):
     - `version: 1` (required, always 1)
     - `name:` (required, short slug-like name)
     - `description:` (optional)
     - `params:` (optional map of `key: default_value` for `{{key}}` substitution in prompts)
     - `steps:` (required non-empty array)
     - Each step: `id` (unique string), `name` (human label), `prompt` (the instruction), `requires` (list of step IDs that must complete first, can use `depends_on` alias), `produces` (list of artifact paths relative to run dir), `context_from` (list of step IDs whose artifacts to inject as context), `verify` (optional verification policy object), `iterate` (optional fan-out config)
     - Verification policies: `{ policy: "content-heuristic" }`, `{ policy: "shell-command", command: "..." }`, `{ policy: "prompt-verify", prompt: "..." }`, `{ policy: "human-review" }`
     - Iterate config: `{ source: "artifact-path", pattern: "regex-with-capture-group" }`
     - Produces paths must not contain `..`
   - **Complete example YAML** — a realistic 3-4 step workflow (e.g., "blog-post-pipeline" with research → outline → draft → review steps, showing requires chains, produces declarations, context_from usage, and one verification policy)
   - **Output instructions**: After gathering all information, generate the complete YAML. Validate it mentally against the schema rules. Write it to `{{defsDir}}/<name>.yaml`. Inform the user they can run it with `/gsd workflow run <name>`.
   - **Artifact path guidance** (D018): Instruct that all artifact paths in `produces` are relative to the run directory. When writing the step prompt, tell the agent to write output files to the run's working directory.
   - Template variables: `{{defsDir}}`, `{{schemaVersion}}`

2. **Verify prompt loads correctly via `loadPrompt()`.**
   - The prompt uses `{{defsDir}}` and `{{schemaVersion}}` as template variables
   - `loadPrompt("workflow-builder", { defsDir: "/path/to/defs", schemaVersion: "1" })` must return without error
   - Verify by running a quick Node.js one-liner using the project's module system:
     ```
     node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs -e "
       import { loadPrompt } from './src/resources/extensions/gsd/prompt-loader.ts';
       const result = loadPrompt('workflow-builder', { defsDir: '/tmp/test-defs', schemaVersion: '1' });
       console.log('Prompt loaded:', result.length, 'chars');
       console.log('Contains example:', result.includes('version: 1'));
       console.log('Contains defsDir:', result.includes('/tmp/test-defs'));
     "
     ```
   - Verify the prompt contains no unresolved `{{...}}` patterns after substitution

3. **Verify prompt quality via structural checks.**
   - Confirm the prompt file contains:
     - The string `version: 1` (schema rule)
     - The string `produces` (artifact declarations)
     - The string `requires` or `depends_on` (dependency declarations)
     - The string `context_from` (context continuity)
     - The string `verify` (verification policies)
     - The string `iterate` (fan-out)
     - The string `{{defsDir}}` (before substitution — template variable)
     - At least one complete YAML example block (``` yaml ... ```)

## Must-Haves

- [ ] `src/resources/extensions/gsd/prompts/workflow-builder.md` exists
- [ ] Prompt embeds V1 schema rules (version, name, steps, produces, requires, verify, iterate)
- [ ] Prompt includes a complete realistic YAML example
- [ ] Prompt uses `{{defsDir}}` and `{{schemaVersion}}` template variables
- [ ] Prompt loads via `loadPrompt("workflow-builder", { defsDir, schemaVersion })` without errors
- [ ] Prompt instructs the LLM to validate the definition before saving
- [ ] Prompt instructs artifact paths relative to run directory (D018)

## Verification

- `test -f src/resources/extensions/gsd/prompts/workflow-builder.md` — file exists
- `grep -q "version: 1" src/resources/extensions/gsd/prompts/workflow-builder.md` — contains schema version rule
- `grep -q "{{defsDir}}" src/resources/extensions/gsd/prompts/workflow-builder.md` — contains template variable
- `grep -c "^\`\`\`" src/resources/extensions/gsd/prompts/workflow-builder.md` returns >= 2 (at least one fenced code block pair)
- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors (no code changes, but confirm nothing broke)

## Inputs

- `src/resources/extensions/gsd/prompt-loader.ts` — `loadPrompt(name, vars)` reads from `prompts/<name>.md`, caches, substitutes `{{key}}` vars. Throws if a declared `{{key}}` has no value.
- `src/resources/extensions/gsd/definition-loader.ts` — `WorkflowDefinition` type and `validateDefinition()` — the schema rules the prompt must encode.
- `src/resources/extensions/gsd/commands-workflow.ts` (from T02) — the `new` subcommand calls `loadPrompt("workflow-builder", { defsDir, schemaVersion })` and dispatches via `pi.sendMessage()`.
- D018: artifact paths resolve relative to runDir.
- Existing prompts in `src/resources/extensions/gsd/prompts/` — reference for style and structure.

## Expected Output

- `src/resources/extensions/gsd/prompts/workflow-builder.md` — new: LLM builder conversation prompt (~150-250 lines of structured markdown)
