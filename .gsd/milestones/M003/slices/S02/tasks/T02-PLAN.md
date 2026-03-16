---
estimated_steps: 5
estimated_files: 3
---

# T02: Wire contract types, store, and component stubs for GSD surfaces

**Slice:** S02 — Browser slash-command dispatch for all upstream commands
**Milestone:** M003

## Description

T01 added the dispatch logic that classifies `/gsd *` commands into surface, passthrough, or help outcomes. But the surface outcomes reference `BrowserSlashCommandSurface` members like `"gsd-forensics"` that don't yet have matching `CommandSurfaceSection` variants, `CommandSurfaceTarget` kinds, store IMPLEMENTED entries, or component rendering cases. Without this wiring, dispatching `/gsd forensics` would open the command surface Sheet but show nothing — or crash due to null section.

This task propagates the 20 new surface types through the three remaining files so GSD surfaces open with placeholder content. Real surface content is S04-S07 scope.

**Relevant skill:** none — this is mechanical type propagation.

## Steps

1. **Add `CommandSurfaceSection` variants** in `web/lib/command-surface-contract.ts`. The current `CommandSurfaceSection` type (line ~14) has 14 members. Add 20 new members matching the `gsd-` prefix pattern used for the `BrowserSlashCommandSurface` union:
   ```
   "gsd-status" | "gsd-visualize" | "gsd-forensics" | "gsd-doctor" | "gsd-skill-health"
   | "gsd-knowledge" | "gsd-capture" | "gsd-triage" | "gsd-quick" | "gsd-history"
   | "gsd-undo" | "gsd-inspect" | "gsd-prefs" | "gsd-config" | "gsd-hooks"
   | "gsd-mode" | "gsd-steer" | "gsd-export" | "gsd-cleanup" | "gsd-queue"
   ```

2. **Add `CommandSurfaceTarget` variants** in `web/lib/command-surface-contract.ts`. The current type (line ~302) has 9 members. Add a single GSD target variant that covers all GSD surfaces:
   ```typescript
   | { kind: "gsd"; surface: string; subcommand: string; args: string }
   ```
   This generic shape works for all GSD surfaces — specific payload refinement happens in S04-S07 when each surface builds real content. The `surface` field carries the full surface name (e.g., `"gsd-forensics"`), `subcommand` carries the parsed subcommand (e.g., `"forensics"`), and `args` carries any remaining arguments.

3. **Wire `commandSurfaceSectionForRequest()`** in `web/lib/command-surface-contract.ts` (line ~510). Add a case for each new `BrowserSlashCommandSurface` member in the switch statement, returning the matching section. Since the section names match the surface names, this is a straightforward mapping. Add cases in a block:
   ```typescript
   case "gsd-status": return "gsd-status"
   case "gsd-visualize": return "gsd-visualize"
   // ... etc for all 20
   ```
   **Important:** The `default: return null` must remain as the fallback.

4. **Wire `buildCommandSurfaceTarget()`** in `web/lib/command-surface-contract.ts`. Find the function (it dispatches on `request.surface` to call the appropriate build function). Add a default handler for all `gsd-*` surfaces:
   ```typescript
   if (request.surface?.startsWith("gsd-")) {
     const subcommand = request.surface.slice(4) // "gsd-forensics" -> "forensics"
     return { kind: "gsd", surface: request.surface, subcommand, args: request.args ?? "" }
   }
   ```
   This goes before the final `return null` fallback in the function.

5. **Add all 20 new surfaces to `IMPLEMENTED_BROWSER_COMMAND_SURFACES`** in `web/lib/gsd-workspace-store.tsx` (line ~519). The current set has 12 entries. Add the 20 `gsd-*` members:
   ```typescript
   "gsd-status",
   "gsd-visualize",
   "gsd-forensics",
   // ... etc
   ```
   Also update the `submitInput()` method's surface case (line ~3504): no changes needed to the logic because it already checks `IMPLEMENTED_BROWSER_COMMAND_SURFACES.has(outcome.surface)` and calls `this.openCommandSurface(outcome.surface, ...)`. The existing code path works for the new surfaces.
   
   Additionally, wire the `"gsd_help"` local action in `submitInput()`. Find the `case "local":` block (line ~3496) and add handling for `"gsd_help"`:
   ```typescript
   if (outcome.action === "gsd_help") {
     this.patchState({
       terminalLines: withTerminalLine(
         withTerminalLine(this.state.terminalLines, createTerminalLine("input", trimmed)),
         createTerminalLine("system", outcome.helpText ?? "Available /gsd commands: status, auto, next, stop, pause, visualize, forensics, doctor, skill-health, knowledge, capture, triage, quick, history, undo, inspect, prefs, config, hooks, mode, steer, export, cleanup, queue, skip, discuss, run-hook, migrate, remote, help")
       ),
     })
     return outcome
   }
   ```
   
   Note: The `outcome` for `"gsd_help"` is `kind: "local"` with `action: "gsd_help"`. The dispatch result type from T01 may not include a `helpText` field — check the actual shape. If the help text is in a constant in `browser-slash-command-dispatch.ts`, import it. If it's embedded in the result, use it. If neither, use a hardcoded help string in the store.

6. **Add placeholder section rendering in `command-surface.tsx`** (web/components/gsd/command-surface.tsx, ~1948 lines). The component renders different content based on `commandSurface.section`. Find the section rendering logic (around line 2031 where `section ===` comparisons happen) and add a GSD section group. Add a minimal placeholder for each GSD section — a simple div with the section name and a "coming soon" message:
   ```tsx
   {commandSurface.section?.startsWith("gsd-") && (
     <div className="p-4 text-sm text-muted-foreground">
       <p className="font-medium">/gsd {commandSurface.section.slice(4)}</p>
       <p>This surface will be implemented in a future update.</p>
     </div>
   )}
   ```
   This is a single block that handles all 20 GSD sections. No need for 20 separate cases — a generic stub is appropriate since S04-S07 replace it with real content.

## Must-Haves

- [ ] 20 new `CommandSurfaceSection` variants added to the type union
- [ ] `CommandSurfaceTarget` includes a `{ kind: "gsd"; ... }` variant
- [ ] `commandSurfaceSectionForRequest()` returns the correct section for all 20 GSD surfaces
- [ ] `buildCommandSurfaceTarget()` produces a valid target for all GSD surfaces
- [ ] All 20 GSD surfaces in `IMPLEMENTED_BROWSER_COMMAND_SURFACES` set
- [ ] `gsd_help` local action handled in store's `submitInput()`
- [ ] Component shows placeholder content for GSD sections (no crash, no blank)
- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build` — exit 0 (TypeScript compilation with all new types)
- `npm run build:web-host` — exit 0 (Next.js build with new component code)
- Quick smoke: `npx tsx -e "import { commandSurfaceSectionForRequest } from './web/lib/command-surface-contract.ts'; console.log(commandSurfaceSectionForRequest({ surface: 'gsd-forensics', source: 'slash' }))"` — prints `gsd-forensics`

## Inputs

- `web/lib/browser-slash-command-dispatch.ts` — from T01, with the expanded `BrowserSlashCommandSurface` union (20 new `gsd-*` members) and `BrowserSlashCommandLocalAction` union (new `"gsd_help"` member)
- `web/lib/command-surface-contract.ts` — existing file (~935 lines). Key locations: `CommandSurfaceSection` type at line ~14, `CommandSurfaceTarget` type at line ~302, `commandSurfaceSectionForRequest()` at line ~510, `buildCommandSurfaceTarget()` (search for the function definition)
- `web/lib/gsd-workspace-store.tsx` — existing file (~4600 lines). Key locations: `IMPLEMENTED_BROWSER_COMMAND_SURFACES` at line ~519, `submitInput()` surface case at line ~3504, local action handling at line ~3496
- `web/components/gsd/command-surface.tsx` — existing file (~1948 lines). Section rendering around line ~2031

## Expected Output

- `web/lib/command-surface-contract.ts` — expanded with 20 new `CommandSurfaceSection` members, 1 new `CommandSurfaceTarget` variant, updated routing functions
- `web/lib/gsd-workspace-store.tsx` — `IMPLEMENTED_BROWSER_COMMAND_SURFACES` has 32 entries (12 existing + 20 new), `gsd_help` local action handled
- `web/components/gsd/command-surface.tsx` — generic GSD section placeholder renders for all `gsd-*` sections

## Observability Impact

- **Section routing**: `commandSurfaceSectionForRequest()` now returns a non-null `CommandSurfaceSection` for all 20 `gsd-*` surfaces. A future agent can verify coverage by calling the function with each surface name and checking the return value is not null.
- **Target building**: `buildCommandSurfaceTarget()` returns `{ kind: "gsd", surface, subcommand, args }` for all GSD surfaces. The `kind` field is inspectable at runtime to confirm GSD dispatch paths are wired.
- **Implemented set**: `IMPLEMENTED_BROWSER_COMMAND_SURFACES` gates whether a surface command opens the Sheet or falls through to a terminal notice. All 20 GSD surfaces are in the set — dispatching `/gsd <subcmd>` opens the Sheet instead of printing a "not implemented" notice.
- **Help action**: `/gsd help` now emits a `system` terminal line with `GSD_HELP_TEXT` content — visible in the browser terminal output.
- **Placeholder rendering**: GSD sections render a `data-testid="gsd-surface-{section}"` div — inspectable via DOM or accessibility tree. A blank render for a GSD section indicates a wiring gap.
- **Failure visibility**: If a new GSD surface is added to `BrowserSlashCommandSurface` but not to `CommandSurfaceSection`, TypeScript will error at the switch cases. If added to the section type but not to `IMPLEMENTED_BROWSER_COMMAND_SURFACES`, the surface will fall through to a terminal notice instead of opening the Sheet.
