---
estimated_steps: 5
estimated_files: 1
---

# T01: Add GSD subcommand dispatch function with surface union expansion

**Slice:** S02 — Browser slash-command dispatch for all upstream commands
**Milestone:** M003

## Description

Add a `dispatchGSDSubcommand()` function to `browser-slash-command-dispatch.ts` that intercepts `/gsd *` input before it falls through to the generic prompt path. This is the architectural foundation for S04–S07 — every browser-native GSD surface depends on this dispatch layer existing.

Currently, when a user types `/gsd status` in the browser, `parseSlashCommand` returns `{ name: "gsd", args: "status" }`. Since `"gsd"` is not in `SURFACE_COMMANDS`, the dispatch falls through to `kind: "prompt"`. After this task, the dispatch function checks `parsed.name === "gsd"` and calls `dispatchGSDSubcommand()` which classifies the subcommand.

**Relevant skill:** `test` — for verifying dispatch outputs.

## Steps

1. **Expand the `BrowserSlashCommandSurface` union type** in `web/lib/browser-slash-command-dispatch.ts`. Add these 20 new members after the existing 12:
   ```
   "gsd-status" | "gsd-visualize" | "gsd-forensics" | "gsd-doctor" | "gsd-skill-health"
   | "gsd-knowledge" | "gsd-capture" | "gsd-triage" | "gsd-quick" | "gsd-history"
   | "gsd-undo" | "gsd-inspect" | "gsd-prefs" | "gsd-config" | "gsd-hooks"
   | "gsd-mode" | "gsd-steer" | "gsd-export" | "gsd-cleanup" | "gsd-queue"
   ```

2. **Add `GSD_SURFACE_SUBCOMMANDS` map** (below `SURFACE_COMMANDS`): a `Map<string, BrowserSlashCommandSurface>` mapping each GSD subcommand name to its surface. Include these 20 entries:
   - `"status"` → `"gsd-status"`, `"visualize"` → `"gsd-visualize"`, `"forensics"` → `"gsd-forensics"`, `"doctor"` → `"gsd-doctor"`, `"skill-health"` → `"gsd-skill-health"`
   - `"knowledge"` → `"gsd-knowledge"`, `"capture"` → `"gsd-capture"`, `"triage"` → `"gsd-triage"`, `"quick"` → `"gsd-quick"`, `"history"` → `"gsd-history"`
   - `"undo"` → `"gsd-undo"`, `"inspect"` → `"gsd-inspect"`, `"prefs"` → `"gsd-prefs"`, `"config"` → `"gsd-config"`, `"hooks"` → `"gsd-hooks"`
   - `"mode"` → `"gsd-mode"`, `"steer"` → `"gsd-steer"`, `"export"` → `"gsd-export"`, `"cleanup"` → `"gsd-cleanup"`, `"queue"` → `"gsd-queue"`

3. **Add `GSD_PASSTHROUGH_SUBCOMMANDS` set**: a `Set<string>` for subcommands that work fine via bridge passthrough: `"auto"`, `"next"`, `"stop"`, `"pause"`, `"skip"`, `"discuss"`, `"run-hook"`, `"migrate"`, `"remote"`.

4. **Add `GSD_HELP_TEXT` constant**: a string with a concise help message listing available `/gsd` subcommands, grouped by category (workflow, diagnostics, project context, settings, advanced). This is rendered inline when the user types `/gsd help`.

5. **Add `dispatchGSDSubcommand()` function** with this signature:
   ```typescript
   function dispatchGSDSubcommand(
     input: string,
     args: string,
     options: BrowserSlashCommandDispatchOptions,
   ): BrowserSlashCommandDispatchResult
   ```
   
   Logic:
   - Parse the first word of `args` as the subcommand name (trim, split on whitespace). The remainder is `subArgs`.
   - If subcommand is empty (bare `/gsd`), return `kind: "prompt"` passthrough — this is equivalent to `/gsd next` and should reach the bridge.
   - If subcommand is `"help"`, return `kind: "local"` with a new `BrowserSlashCommandLocalAction` value `"gsd_help"`. Add `"gsd_help"` to the `BrowserSlashCommandLocalAction` union type.
   - If subcommand is in `GSD_SURFACE_SUBCOMMANDS`, return `kind: "surface"` with the mapped surface name, `commandName: "gsd"`, and `args: subArgs` (the remaining text after the subcommand).
   - If subcommand is in `GSD_PASSTHROUGH_SUBCOMMANDS`, return `kind: "prompt"` passthrough with the full original input — let the bridge handle it.
   - Otherwise (unknown subcommand), return `kind: "prompt"` passthrough — the extension handler will show "Unknown: /gsd xyz".

6. **Wire into `dispatchBrowserSlashCommand()`**: In the main dispatch function, after the `parseSlashCommand()` call succeeds and before the `BUILTIN_COMMAND_NAMES` check, add:
   ```typescript
   if (parsed.name === "gsd") {
     return dispatchGSDSubcommand(trimmed, parsed.args, options)
   }
   ```
   This must go AFTER the `/new` check (which handles `parsed.name === "new"`) and BEFORE `SURFACE_COMMANDS.get(parsed.name)`.

## Must-Haves

- [ ] 20 new `BrowserSlashCommandSurface` union members with `gsd-` prefix
- [ ] `GSD_SURFACE_SUBCOMMANDS` map with 20 entries
- [ ] `GSD_PASSTHROUGH_SUBCOMMANDS` set with 9 entries  
- [ ] `dispatchGSDSubcommand()` returns correct kind for every classified subcommand
- [ ] Bare `/gsd` returns `kind: "prompt"` passthrough
- [ ] `/gsd help` returns `kind: "local"` with `action: "gsd_help"`
- [ ] Unknown `/gsd xyz` returns `kind: "prompt"` passthrough
- [ ] `/export` (built-in session export) still routes to `"export"` surface (not `"gsd-export"`)
- [ ] `/gsd export` routes to `"gsd-export"` surface
- [ ] Existing dispatch behavior for all non-GSD commands unchanged

## Verification

- `npx tsx -e "import { dispatchBrowserSlashCommand } from './web/lib/browser-slash-command-dispatch.ts'; const tests = ['/gsd forensics', '/gsd auto', '/gsd help', '/gsd', '/gsd unknown', '/export', '/gsd export']; for (const t of tests) { const r = dispatchBrowserSlashCommand(t); console.log(t, '->', r.kind, 'surface' in r ? r.surface : '', 'action' in r ? r.action : '') }"` — verify each input produces the expected kind/surface/action
- `npx tsc --noEmit` on the single file — no TypeScript errors (note: full build will fail until T02 wires the contract types, which is expected)

## Inputs

- `web/lib/browser-slash-command-dispatch.ts` — the existing dispatch file (179 lines, read in full above during research). Contains the `BrowserSlashCommandSurface` union, `SURFACE_COMMANDS` map, `parseSlashCommand()`, and `dispatchBrowserSlashCommand()`.
- S01 summary: upstream's `commands.ts` registers these subcommands: `help, next, auto, stop, pause, status, visualize, queue, quick, discuss, capture, triage, history, undo, skip, export, cleanup, mode, prefs, config, hooks, run-hook, skill-health, doctor, forensics, migrate, remote, steer, inspect, knowledge`.
- Research classification: 20 subcommands → surfaces, 9 → bridge passthrough, 1 → inline help, bare `/gsd` → passthrough.

## Expected Output

- `web/lib/browser-slash-command-dispatch.ts` — expanded with 20 new union members, GSD dispatch maps, `dispatchGSDSubcommand()` function, wired into main dispatch. File grows from ~179 lines to ~280-300 lines.
