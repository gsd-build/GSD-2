# S02: Browser slash-command dispatch for all upstream commands

**Goal:** Every `/gsd` subcommand typed in the browser terminal dispatches to a defined outcome — surface, bridge passthrough, or inline help — with no silent fallthrough.
**Demo:** Type `/gsd forensics` in the browser terminal → command surface opens to a GSD forensics stub section. Type `/gsd auto` → passes through to bridge. Type `/gsd unknown` → passes through to bridge (extension handler shows "Unknown"). Every subcommand tested.

## Must-Haves

- `dispatchGSDSubcommand()` function in `browser-slash-command-dispatch.ts` that intercepts `/gsd *` input and classifies every upstream subcommand
- 20 new `BrowserSlashCommandSurface` union members (prefixed `gsd-`) for commands needing browser-native surfaces
- 10 bridge-passthrough commands continue reaching the bridge as `kind: "prompt"`
- `/gsd help` renders inline, bare `/gsd` passes through as `/gsd next`
- `/export` (built-in session export) and `/gsd export` (milestone export) remain distinct
- New `CommandSurfaceSection` variants and `CommandSurfaceTarget` kinds for each GSD surface
- `IMPLEMENTED_BROWSER_COMMAND_SURFACES` updated in the store for all new surfaces
- Placeholder section rendering in `command-surface.tsx` so surfaces open without crash
- Updated `web-command-parity-contract.test.ts` with exhaustive GSD dispatch assertions
- `npm run build` and `npm run build:web-host` succeed

## Proof Level

- This slice proves: contract — every subcommand dispatches to a defined outcome; surface stubs open without error
- Real runtime required: no — dispatch is pure-function logic, verified by unit test
- Human/UAT required: no

## Verification

- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — all existing + new GSD dispatch tests pass
- `npm run build` — TypeScript compilation succeeds with all new types
- `npm run build:web-host` — Next.js production build succeeds with new component stubs
- Diagnostic check: dispatching an unknown subcommand (`/gsd xyznotreal`) returns `kind: "prompt"` with the full original input preserved — confirms no silent swallowing. Dispatching a surface subcommand (`/gsd forensics`) returns `kind: "surface"` with `surface: "gsd-forensics"` — confirms classification is inspectable. `getBrowserSlashCommandTerminalNotice()` returns a system notice for surface outcomes and null for passthrough — confirms failure/success visibility in browser terminal.

## Observability / Diagnostics

- Runtime signals: `getBrowserSlashCommandTerminalNotice()` produces system/error messages for each dispatch outcome — visible in browser terminal
- Inspection surfaces: the parity contract test is the primary diagnostic; it enumerates every subcommand and its expected outcome
- Failure visibility: a silent fallthrough shows as `kind: "prompt"` in the test where a surface or specific outcome was expected
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `src/resources/extensions/gsd/commands.ts` — authoritative subcommand list (read-only)
- New wiring introduced in this slice: `dispatchGSDSubcommand()` in dispatch.ts, GSD-prefixed surface members, section routing in contract.ts, store IMPLEMENTED set, component stubs
- What remains before the milestone is truly usable end-to-end: S03 (visualizer page), S04 (diagnostics panels), S05 (knowledge/captures page), S06 (settings extensions), S07 (remaining command surfaces) must build real content behind each stub

## Tasks

- [x] **T01: Add GSD subcommand dispatch function with surface union expansion** `est:45m`
  - Why: The core dispatch logic — without this, every `/gsd *` command falls through to prompt. This is the architectural foundation S04-S07 depend on.
  - Files: `web/lib/browser-slash-command-dispatch.ts`
  - Do: Add `dispatchGSDSubcommand()` function that parses the subcommand from args and returns the appropriate dispatch result. Expand `BrowserSlashCommandSurface` union with 20 `gsd-`-prefixed members. Add `GSD_SURFACE_SUBCOMMANDS` map and `GSD_PASSTHROUGH_SUBCOMMANDS` set. Handle edge cases: bare `/gsd` → passthrough, `/gsd help` → local with help text, unknown subcommands → passthrough. Wire into `dispatchBrowserSlashCommand()` when `parsed.name === "gsd"`.
  - Verify: `npx tsx -e "import { dispatchBrowserSlashCommand } from './web/lib/browser-slash-command-dispatch.ts'; const r = dispatchBrowserSlashCommand('/gsd forensics'); console.log(r.kind, r.surface)"` prints `surface gsd-forensics`
  - Done when: every GSD subcommand dispatches to the correct kind (surface, prompt, or local) and the file has no TypeScript errors per `npx tsc --noEmit`

- [x] **T02: Wire contract types, store, and component stubs for GSD surfaces** `est:45m`
  - Why: The dispatch function produces surface results, but without section/target routing, store entries, and component cases, opening a GSD surface crashes or shows nothing. This task completes the end-to-end wiring.
  - Files: `web/lib/command-surface-contract.ts`, `web/lib/gsd-workspace-store.tsx`, `web/components/gsd/command-surface.tsx`
  - Do: Add `CommandSurfaceSection` variants for each GSD surface (e.g., `"gsd-forensics"`, `"gsd-doctor"`, etc.). Add `CommandSurfaceTarget` variants with appropriate payload shapes. Wire `commandSurfaceSectionForRequest()` and `buildCommandSurfaceTarget()` for all new surfaces. Add all 20 new surfaces to `IMPLEMENTED_BROWSER_COMMAND_SURFACES`. Add placeholder section rendering in `command-surface.tsx` for each GSD section.
  - Verify: `npm run build && npm run build:web-host` — both exit 0
  - Done when: both builds succeed, every new `BrowserSlashCommandSurface` member has a corresponding section, target, store entry, and component stub

- [ ] **T03: Update parity contract test with exhaustive GSD dispatch coverage** `est:30m`
  - Why: The acceptance gate — the parity test must prove every GSD subcommand dispatches correctly with no silent fallthrough. This is what S04-S07 rely on.
  - Files: `src/tests/web-command-parity-contract.test.ts`
  - Do: Add test that collects all registered GSD subcommands from `commands.ts` and asserts each dispatches to a defined outcome. Add `EXPECTED_GSD_OUTCOMES` map classifying every subcommand as `"surface"`, `"prompt"` (bridge passthrough), or `"local"` (help). Assert surface outcomes produce correct surface names. Assert passthrough outcomes preserve the exact input text. Assert `/gsd help` produces inline help. Assert bare `/gsd` passes through. Assert `/export` (built-in) and `/gsd export` remain distinct. Assert unknown `/gsd xyz` passes through.
  - Verify: `npx tsx --test src/tests/web-command-parity-contract.test.ts` — all tests pass
  - Done when: parity test passes with 100% GSD subcommand coverage, no subcommand is unclassified

## Files Likely Touched

- `web/lib/browser-slash-command-dispatch.ts`
- `web/lib/command-surface-contract.ts`
- `web/lib/gsd-workspace-store.tsx`
- `web/components/gsd/command-surface.tsx`
- `src/tests/web-command-parity-contract.test.ts`
