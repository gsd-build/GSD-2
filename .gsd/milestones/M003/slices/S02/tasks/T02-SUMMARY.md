---
id: T02
parent: S02
milestone: M003
provides:
  - 20 CommandSurfaceSection variants for all GSD surfaces
  - CommandSurfaceTarget { kind: "gsd" } variant for generic GSD target building
  - commandSurfaceSectionForRequest() routes all 20 gsd-* surfaces to matching sections
  - buildCommandSurfaceTarget() produces { kind: "gsd", surface, subcommand, args } for all GSD surfaces
  - IMPLEMENTED_BROWSER_COMMAND_SURFACES expanded from 12 to 32 entries
  - gsd_help local action wired in store submitInput() using GSD_HELP_TEXT constant
  - Placeholder component rendering for all gsd-* sections with data-testid attributes
key_files:
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - Single generic { kind: "gsd" } target variant instead of 20 specific kinds — keeps the type union lean; S04-S07 can refine per-surface payloads as discriminated subtypes if needed
  - startsWith("gsd-") guard in both buildCommandSurfaceTarget and renderSection avoids 20 repetitive cases for component rendering and target building
patterns_established:
  - GSD surfaces use section names that exactly match surface names (gsd-forensics section for gsd-forensics surface) — no mapping table needed
  - GSD target shape carries surface + subcommand + args — downstream consumers destructure subcommand for routing
  - Placeholder rendering uses data-testid="gsd-surface-{section}" for DOM inspection
observability_surfaces:
  - commandSurfaceSectionForRequest() returns non-null for all 20 GSD surfaces (verifiable via function call)
  - buildCommandSurfaceTarget() returns { kind: "gsd" } for all GSD surfaces (inspectable at runtime)
  - IMPLEMENTED_BROWSER_COMMAND_SURFACES gates Sheet opening — GSD surfaces open Sheet instead of terminal notice
  - /gsd help prints GSD_HELP_TEXT as a system terminal line
  - GSD section placeholders render with data-testid for DOM/accessibility inspection
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Wire contract types, store, and component stubs for GSD surfaces

**Propagated 20 GSD surface types through CommandSurfaceSection, CommandSurfaceTarget, section/target routing, store IMPLEMENTED set, gsd_help handler, and component placeholder rendering — all builds pass.**

## What Happened

Mechanical type propagation across 3 files to complete the dispatch-to-render pipeline for the 20 GSD surfaces introduced in T01:

1. Added 20 `CommandSurfaceSection` variants (`gsd-status` through `gsd-queue`) to the type union in `command-surface-contract.ts`.
2. Added `{ kind: "gsd"; surface: string; subcommand: string; args: string }` to `CommandSurfaceTarget` — a single generic variant that covers all GSD surfaces.
3. Wired `commandSurfaceSectionForRequest()` with 20 switch cases mapping each GSD surface to its matching section.
4. Wired `buildCommandSurfaceTarget()` with a `startsWith("gsd-")` guard that extracts the subcommand and builds the generic GSD target.
5. Expanded `IMPLEMENTED_BROWSER_COMMAND_SURFACES` from 12 to 32 entries. Imported `GSD_HELP_TEXT` and wired the `gsd_help` local action in `submitInput()` to print help as a system terminal line.
6. Added a generic GSD placeholder in `renderSection()` — any `gsd-*` section renders a styled div with the subcommand name and a "future update" message, with a `data-testid` for inspection.

## Verification

- `npm run build` — exit 0 (TypeScript compilation with all new types)
- `npm run build:web-host` — exit 0 (Next.js production build with new component stubs)
- Smoke test: `commandSurfaceSectionForRequest({ surface: "gsd-forensics", source: "slash" })` → `"gsd-forensics"` ✓
- Smoke test: `buildCommandSurfaceTarget({ surface: "gsd-forensics", source: "slash", args: "some args" })` → `{ kind: "gsd", surface: "gsd-forensics", subcommand: "forensics", args: "some args" }` ✓
- Parity contract test: 34/38 pass, 4 failures are expected (T01 changed GSD dispatch from passthrough to surface — T03 will update the test expectations)

## Diagnostics

- Call `commandSurfaceSectionForRequest({ surface: "gsd-<name>", source: "slash" })` — should return `"gsd-<name>"` for all 20 surfaces, null otherwise
- Call `buildCommandSurfaceTarget(...)` with any `gsd-*` surface — should return `{ kind: "gsd", ... }` with correct subcommand extraction
- Check `IMPLEMENTED_BROWSER_COMMAND_SURFACES.has("gsd-<name>")` — all 20 return true
- In browser: `/gsd help` prints help text as system terminal line; `/gsd forensics` opens Sheet with placeholder content
- DOM inspection: `[data-testid="gsd-surface-gsd-forensics"]` etc. present when GSD sections render

## Deviations

- Plan step 5 suggested checking for `outcome.helpText` field on the dispatch result, but the actual dispatch result for `gsd_help` has no such field. Used the exported `GSD_HELP_TEXT` constant from `browser-slash-command-dispatch.ts` instead — cleaner single-source-of-truth approach.
- Plan step 4 suggested changing the final fallback from `return buildSettingsTarget(section)` to `return null`. Kept the existing `buildSettingsTarget(section)` fallback since it's the current contract and changing it could break other surfaces. The GSD guard fires before the fallback anyway.

## Known Issues

- Parity contract test has 4 failures from T01's intentional behavior change — T03 will update the expected outcomes.

## Files Created/Modified

- `web/lib/command-surface-contract.ts` — added 20 CommandSurfaceSection variants, 1 CommandSurfaceTarget variant, 20 switch cases in section router, gsd-* guard in target builder
- `web/lib/gsd-workspace-store.tsx` — expanded IMPLEMENTED set to 32 entries, imported GSD_HELP_TEXT, wired gsd_help local action
- `web/components/gsd/command-surface.tsx` — added generic GSD placeholder rendering in renderSection() default case
- `.gsd/milestones/M003/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
