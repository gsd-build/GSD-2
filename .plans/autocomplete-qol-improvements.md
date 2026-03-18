# Plan: Autocomplete QOL Improvements

## Goal
Maximize quality-of-life for the autocomplete system by adding missing argument completions, improving discoverability with descriptions, and adding test coverage.

## Changes

### 1. Add `/thinking` argument completions (interactive-mode.ts)
- Add `getArgumentCompletions` to the `thinking` builtin command
- Values: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` with descriptions
- Location: `setupAutocomplete()` in interactive-mode.ts, after the `/model` block

### 2. Add descriptions to GSD 2nd-level subcommand completions (commands.ts)
- Currently `/gsd auto --verbose` shows label only, no description
- Add descriptions to all 2nd-level completion items across:
  - `auto` flags: --verbose, --debug
  - `mode` subcommands: global, project
  - `parallel` subcommands: start, status, stop, pause, resume, merge
  - `setup` subcommands: llm, search, remote, keys, prefs
  - `prefs` subcommands: global, project, status, wizard, setup, import-claude
  - `remote` subcommands: slack, discord, status, disconnect
  - `next` flags: --verbose, --dry-run
  - `history` flags: --cost, --phase, --model, 10, 20, 50
  - `undo`: --force
  - `export` flags: --json, --markdown, --html, --html --all
  - `cleanup` subcommands: branches, snapshots
  - `knowledge` subcommands: rule, pattern, lesson
  - `doctor` modes: fix, heal, audit
  - `dispatch` phases: research, plan, execute, complete, reassess, uat, replan

### 3. Add test coverage for autocomplete.ts and fuzzy.ts
- Test file: `packages/pi-tui/src/tests/autocomplete.test.ts`
- Cover: slash command completion, argument completion, @ file prefix extraction, path prefix extraction, apply completion
- Test file: `packages/pi-tui/src/tests/fuzzy.test.ts`
- Cover: basic matching, scoring, word boundaries, gap penalties, token splitting, alphanumeric swaps

## Files Modified
- `packages/pi-coding-agent/src/modes/interactive/interactive-mode.ts` — thinking completions
- `src/resources/extensions/gsd/commands.ts` — 2nd-level descriptions
- `packages/pi-tui/src/tests/autocomplete.test.ts` — new test file
- `packages/pi-tui/src/tests/fuzzy.test.ts` — new test file

## Testing
- Run existing test suite to verify no regressions
- Run new test files
- Build to verify TypeScript compiles
