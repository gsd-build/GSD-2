---
id: T01
parent: S02
milestone: M003
provides:
  - dispatchGSDSubcommand() function classifying all 30 upstream /gsd subcommands
  - 20 new BrowserSlashCommandSurface union members with gsd- prefix
  - GSD_SURFACE_SUBCOMMANDS map (20 entries), GSD_PASSTHROUGH_SUBCOMMANDS set (9 entries)
  - gsd_help local action type and GSD_HELP_TEXT constant
key_files:
  - web/lib/browser-slash-command-dispatch.ts
key_decisions:
  - GSD dispatch intercepts before SURFACE_COMMANDS lookup — prevents /gsd export colliding with /export
patterns_established:
  - GSD subcommand classification: surface (20) / passthrough (9) / local help (1) / bare passthrough
observability_surfaces:
  - dispatchBrowserSlashCommand() return value is inspectable — .kind, .surface, .action fields
  - getBrowserSlashCommandTerminalNotice() emits system notices for surface-routed GSD commands
  - Unknown subcommands preserve slashCommandName:"gsd" for downstream error reporting
duration: 12m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Add GSD subcommand dispatch function with surface union expansion

**Added `dispatchGSDSubcommand()` with 20 surface routes, 9 passthrough routes, and inline help — every `/gsd *` input now classifies instead of falling through to prompt.**

## What Happened

Expanded `BrowserSlashCommandSurface` union with 20 `gsd-`-prefixed members. Added `GSD_SURFACE_SUBCOMMANDS` map (20 entries mapping subcommand names to surfaces), `GSD_PASSTHROUGH_SUBCOMMANDS` set (9 bridge-handled commands), and `GSD_HELP_TEXT` constant. Implemented `dispatchGSDSubcommand()` that parses the first word of args as the subcommand, then routes to surface/local/prompt based on classification. Wired into `dispatchBrowserSlashCommand()` after the `/new` check and before `SURFACE_COMMANDS.get()` — this ordering ensures `/gsd export` routes to `gsd-export` while `/export` still routes to `export`. Added `"gsd_help"` to the `BrowserSlashCommandLocalAction` union.

## Verification

- **Inline dispatch test:** All 8 test inputs produce expected results:
  - `/gsd forensics` → `surface gsd-forensics` ✅
  - `/gsd auto` → `prompt` (passthrough) ✅
  - `/gsd help` → `local gsd_help` ✅
  - `/gsd` (bare) → `prompt` (passthrough) ✅
  - `/gsd unknown` → `prompt` (passthrough) ✅
  - `/export` → `surface export` (built-in, not gsd-export) ✅
  - `/gsd export` → `surface gsd-export` ✅
  - `/gsd status extra args` → `surface gsd-status` (subArgs preserved) ✅
- **`npx tsc --noEmit`:** Passed clean — no TypeScript errors
- **Parity contract test:** 2 known failures in pre-existing assertions that expect `/gsd status` → `prompt` (old behavior). T03 will update these to expect `surface`. One pre-existing failure from upstream `provider` command not in `EXPECTED_BUILTIN_OUTCOMES`.

## Diagnostics

- Run `dispatchBrowserSlashCommand("/gsd <subcmd>")` and inspect `.kind`/`.surface`/`.action` fields
- `getBrowserSlashCommandTerminalNotice()` returns `type:"system"` for GSD surface commands, `null` for passthrough
- Unknown subs: `slashCommandName: "gsd"` set in prompt result for downstream error handling
- Test diagnostic: parity contract test (T03) will enumerate all subcommands and expected outcomes

## Deviations

- Exported `GSD_HELP_TEXT` (plan said `const`, made it `export const`) so downstream UI rendering (T02+) can reference it.

## Known Issues

- Pre-existing: `EXPECTED_BUILTIN_OUTCOMES` in parity test has 20 entries but upstream has 21 builtins (new `provider` command). Unrelated to this task — recorded in KNOWLEDGE.md.

## Files Created/Modified

- `web/lib/browser-slash-command-dispatch.ts` — expanded union (20 new members), added GSD dispatch maps/set/help/function, wired into main dispatch. ~179 → ~300 lines.
- `.gsd/milestones/M003/slices/S02/S02-PLAN.md` — added diagnostic verification step per pre-flight requirement
- `.gsd/milestones/M003/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section per pre-flight requirement
- `.gsd/KNOWLEDGE.md` — added entry about EXPECTED_BUILTIN_OUTCOMES drift
