---
estimated_steps: 5
estimated_files: 6
---

# T02: Create `commands-workflow.ts` with all CLI subcommands and wire into `commands.ts`

**Slice:** S07 — LLM-Assisted Builder + CLI Commands
**Milestone:** M001

## Description

Build the entire CLI surface for custom workflows. This is the primary user-facing deliverable — `/gsd workflow run|list|validate|pause|resume|new`. Create `commands-workflow.ts` following the pattern of `commands-workflow-templates.ts`, add `setActiveEngineId()` to `auto.ts`, extend `createRun()` to accept params, and wire routing into `commands.ts`.

The `new` subcommand loads the `workflow-builder` prompt template (created in T03) via `loadPrompt()` and dispatches it with `pi.sendMessage({ triggerTurn: true })`. If the prompt file doesn't exist yet (T03 not done), `loadPrompt()` will throw — that's expected and acceptable for T02 testing, since T02's tests focus on `run`, `list`, `validate`, `pause`, and `resume`.

**Relevant skills:** None needed — standard command handler pattern already established in the codebase.

## Steps

1. **Add `setActiveEngineId()` to `auto.ts`.**
   - Add at the bottom with the other test-exposed helpers (near `_setDispatching`):
     ```typescript
     export function setActiveEngineId(id: string | null): void { s.activeEngineId = id; }
     ```
   - Also add a `getActiveEngineId()` getter for the resume logic:
     ```typescript
     export function getActiveEngineId(): string | null { return s.activeEngineId; }
     ```
   - These follow the existing pattern of thin accessors for the module-level `s` session.

2. **Extend `createRun()` in `run-manager.ts` to accept optional params.**
   - Add `params?: Record<string, string>` to `createRun()` signature
   - After creating the run directory and snapshotting DEFINITION.yaml, if `params` is provided and non-empty, write `PARAMS.json` to the run directory: `writeFileSync(join(runDir, "PARAMS.json"), JSON.stringify(params, null, 2) + "\n")`
   - Import `writeFileSync` (already imported as part of `copyFileSync` import group)
   - This keeps the definition snapshot byte-exact (R007) while persisting CLI overrides for dispatch-time substitution

3. **Create `commands-workflow.ts` with `handleWorkflow()` and all six subcommands.**
   - File header: import types from `@gsd/pi-coding-agent`, import `createRun`, `listRuns` from `run-manager.ts`, import `loadDefinition`, `validateDefinition` from `definition-loader.ts`, import `startAuto`, `pauseAuto`, `isAutoActive`, `isAutoPaused`, `setActiveEngineId`, `getActiveEngineId` from `auto.ts`, import `loadPrompt` from `prompt-loader.ts`, import `gsdRoot` from `paths.ts`, import `readGraph` from `graph.ts`, import `readFileSync`, `readdirSync`, `existsSync` from `node:fs`, import `join` from `node:path`, import `parse` from `yaml`
   - Export `async function handleWorkflow(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void>`
   - Export `function getWorkflowCompletions(prefix: string): Array<{ value: string; label: string; description: string }>`
   - Parse `args` to determine subcommand: split on first space, first token is subcommand, rest is sub-args
   - **`new`**: guard `isAutoActive()`, load prompt via `loadPrompt("workflow-builder", { defsDir: join(gsdRoot(projectRoot()), "workflow-defs"), schemaVersion: "1" })`, dispatch via `pi.sendMessage({ customType: "gsd-workflow-builder", content: prompt, display: false }, { triggerTurn: true })`
   - **`run <name> [--param key=value ...]`**: guard `isAutoActive()`. Parse `<name>` as the first non-flag token. Parse `--param key=value` flags into a `Record<string, string>`. Call `createRun(gsdRoot(basePath), name, undefined, params)`. Call `setActiveEngineId("custom:" + runDir)`. Call `await startAuto(ctx, pi, basePath, false)`. Catch and display errors via `ctx.ui.notify(msg, "error")`.
   - **`list`**: Call `listRuns(gsdRoot(basePath))` for active runs. Scan `join(gsdRoot(basePath), "workflow-defs")` for `.yaml` files as available definitions. For each run, read `GRAPH.yaml` to determine completion status (how many steps done vs total). Format output with definitions section and runs section. Display via `ctx.ui.notify()`.
   - **`pause`**: guard `!isAutoActive() && !isAutoPaused()` → "No active workflow to pause". Otherwise delegate to `pauseAuto(ctx, pi)`.
   - **`resume`**: If `isAutoPaused()` and `getActiveEngineId()?.startsWith("custom:")`, just call `await startAuto(ctx, pi, basePath, false)`. If paused but no custom engine ID, try to re-derive: scan `workflow-runs/` for the most recent incomplete run, set its engine ID, then start. If not paused and not active, show error.
   - **`validate <name>`**: Read `<name>` as a path or definition name. If it ends with `.yaml`, treat as a file path and read directly. Otherwise look in `workflow-defs/<name>.yaml`. Parse YAML, call `validateDefinition()`, display `{ valid, errors }` via `ctx.ui.notify()`.
   - **Completions**: return subcommand completions (`new`, `run`, `list`, `pause`, `resume`, `validate`) filtered by prefix. For `run` and `validate`, list `.yaml` files from `workflow-defs/`.
   - Import `projectRoot` from `commands.ts` or use the `basePath` pattern from other command handlers (check how `handleStart` gets the base path — it uses `process.cwd()`)

4. **Wire routing in `commands.ts`.**
   - Add import: `import { handleWorkflow, getWorkflowCompletions } from "./commands-workflow.js";`
   - In `getArgumentCompletions`, add `workflow` subcommand completions block (pattern: `if (parts[0] === "workflow") { ... return getWorkflowCompletions(subPrefix); }`)
   - In the command handler `execute` function, add routing block before the catch-all:
     ```typescript
     if (trimmed === "workflow" || trimmed.startsWith("workflow ")) {
       await handleWorkflow(trimmed.replace(/^workflow\s*/, "").trim(), ctx, pi);
       return;
     }
     ```
   - In `showHelp()`, add workflow commands under a new "CUSTOM WORKFLOWS" section:
     ```
     "CUSTOM WORKFLOWS",
     "  /gsd workflow new        Build a workflow definition via LLM conversation",
     "  /gsd workflow run <name> Start a workflow run  [--param key=value]",
     "  /gsd workflow list       Show definitions and active runs",
     "  /gsd workflow validate   Check a YAML definition against the schema",
     "  /gsd workflow pause      Pause the active workflow run",
     "  /gsd workflow resume     Resume a paused workflow run",
     ```
   - Add `{ cmd: "workflow", desc: "Custom workflow lifecycle (new, run, list, pause, resume, validate)" }` to the main completions array
   - Update the command description string to include `workflow`

5. **Write integration tests in `commands-workflow.test.ts`.**
   - Test `validate` subcommand: write a valid YAML file to temp dir, call validation logic, assert success. Write an invalid YAML (missing steps), assert errors returned.
   - Test `list` subcommand logic: create temp dirs with workflow-defs and workflow-runs, verify formatting includes both sections.
   - Test `run` flow: mock `setActiveEngineId` and `startAuto`. Call the run handler with a valid definition name. Assert `createRun` was called, `setActiveEngineId` was called with `custom:<runDir>`, and `startAuto` was invoked. (Note: full mock of auto.ts may be complex — test the param parsing and createRun integration directly instead.)
   - Test `run --param` parsing: verify params are extracted correctly from args and passed to `createRun`.
   - Test auto-mode conflict guard: set `isAutoActive()` to return true (via `_setDispatching(true)` or similar), verify `run` shows error.
   - Use `import test from "node:test"` and `import assert from "node:assert/strict"`
   - Run with: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/commands-workflow.test.ts`

## Must-Haves

- [ ] `setActiveEngineId()` and `getActiveEngineId()` exported from `auto.ts`
- [ ] `createRun()` in `run-manager.ts` accepts optional `params` and writes `PARAMS.json`
- [ ] `commands-workflow.ts` exports `handleWorkflow()` with all six subcommands
- [ ] `commands-workflow.ts` exports `getWorkflowCompletions()`
- [ ] Auto-mode conflict guard on `run` and `new`
- [ ] `resume` re-derives engine ID from most recent incomplete run when needed
- [ ] Routing wired in `commands.ts` (handler, completions, help text)
- [ ] Integration tests cover validate, list, run param parsing, and conflict guard
- [ ] `npx tsc --noEmit --project tsconfig.extensions.json` — 0 type errors

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/commands-workflow.test.ts` — all pass
- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-run-integration.test.ts` — 4/4 pass (no regression)
- `grep -q "workflow" src/resources/extensions/gsd/commands.ts` — routing is wired

## Inputs

- `src/resources/extensions/gsd/auto.ts` — module-level `const s = new AutoSession()` with `s.activeEngineId` property. Follow `_setDispatching` pattern for thin setter.
- `src/resources/extensions/gsd/run-manager.ts` — `createRun(basePath, definitionName, defsDir?)` returns `{ runId, runDir }`. Extend with `params?` parameter.
- `src/resources/extensions/gsd/commands-workflow-templates.ts` — reference implementation for command handler patterns: `handleStart(args, ctx, pi)`, auto-mode guard, `pi.sendMessage({ customType, content, display: false }, { triggerTurn: true })`, `loadPrompt()` usage.
- `src/resources/extensions/gsd/commands.ts` — routing structure: `if (trimmed === "X" || trimmed.startsWith("X "))` pattern, `showHelp()` string array, `getArgumentCompletions` switch.
- `src/resources/extensions/gsd/engine-resolver.ts` — `resolveEngine(session)` reads `session.activeEngineId` — value format is `"custom:" + runDir`.
- `src/resources/extensions/gsd/auto/session.ts` — `AutoSession.reset()` clears `activeEngineId` to null. `pauseAuto` does NOT clear it. `stopAuto` does NOT clear it either (manual field resets skip it).
- T01 output: `substituteParams()` in `definition-loader.ts`, `PARAMS.json` read in `resolveDispatch()`
- Research: `resume` gap — `activeEngineId` is in-memory only. After process restart, scan `workflow-runs/` for most recent incomplete run to re-derive.

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — modified: `setActiveEngineId()` and `getActiveEngineId()` exports (~2 lines)
- `src/resources/extensions/gsd/run-manager.ts` — modified: `createRun()` accepts `params`, writes `PARAMS.json` (~5 lines added)
- `src/resources/extensions/gsd/commands-workflow.ts` — new: full command handler (~250-300 lines)
- `src/resources/extensions/gsd/commands.ts` — modified: routing, completions, help text (~25 lines added)
- `src/resources/extensions/gsd/tests/commands-workflow.test.ts` — new: integration tests (~200 lines)
