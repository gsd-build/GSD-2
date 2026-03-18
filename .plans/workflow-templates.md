# GSD Workflow Templates — Implementation Plan (Updated)

**Date:** 2026-03-18
**Branch:** `feat/workflow-templates`
**Status:** In Progress — Phase 1

---

## Architecture Mapping (Plan → Actual Codebase)

The original plan referenced `gsd-tools.cjs`, `lib/init.cjs`, `lib/core.cjs` — these don't exist.
The actual architecture is a TypeScript extension system:

| Plan Reference | Actual Location |
|---|---|
| `gsd-tools.cjs` command routing | `src/resources/extensions/gsd/commands.ts` |
| `lib/workflow-template.cjs` | `src/resources/extensions/gsd/workflow-templates.ts` (new) |
| `lib/init.cjs` | No separate init; logic lives in handler module |
| `lib/core.cjs` | Utilities spread across `paths.ts`, `state.ts`, etc. |
| `~/.claude/get-shit-done/workflow-templates/` | `src/resources/extensions/gsd/workflow-templates/` (new dir) |
| `/gsd:start`, `/gsd:templates` | `/gsd start`, `/gsd templates` subcommands |
| Prompt templates | `src/resources/extensions/gsd/prompts/` |

---

## Phase 1: Foundation (Core Infrastructure)

### Files to Create

1. **`src/resources/extensions/gsd/workflow-templates/registry.json`**
   - Template metadata: name, description, phases, triggers, artifact_dir, complexity, agents

2. **`src/resources/extensions/gsd/workflow-templates.ts`**
   - `loadRegistry()` — parse registry.json from extension dir
   - `resolveTemplate(nameOrTrigger)` — match by name, alias, or trigger keywords
   - `autoDetect(context)` — analyze user input + project state for best template match
   - `listTemplates()` — formatted template list for display
   - `getTemplateInfo(name)` — detailed template metadata

3. **`src/resources/extensions/gsd/commands-workflow-templates.ts`**
   - `handleStart(args, ctx, pi)` — `/gsd start [template] [args]`
   - `handleTemplates(args, ctx)` — `/gsd templates [info <name>]`

4. **Wire into `commands.ts`**:
   - Add `start` and `templates` to subcommand completions
   - Add handler routing for both commands

### Files to Create (Phase 2 — Templates)

5. **`src/resources/extensions/gsd/workflow-templates/bugfix.md`**
6. **`src/resources/extensions/gsd/workflow-templates/small-feature.md`**
7. **`src/resources/extensions/gsd/workflow-templates/spike.md`**
8. **`src/resources/extensions/gsd/workflow-templates/hotfix.md`**
9. **`src/resources/extensions/gsd/workflow-templates/refactor.md`**
10. **`src/resources/extensions/gsd/workflow-templates/security-audit.md`**
11. **`src/resources/extensions/gsd/workflow-templates/dep-upgrade.md`**
12. **`src/resources/extensions/gsd/workflow-templates/full-project.md`**

### Prompt Templates

13. **`src/resources/extensions/gsd/prompts/workflow-start.md`** — dispatched when `/gsd start` resolves a template
14. **`src/resources/extensions/gsd/prompts/workflow-bugfix.md`** — bugfix-specific dispatch prompt
15. **`src/resources/extensions/gsd/prompts/workflow-small-feature.md`**
16. **`src/resources/extensions/gsd/prompts/workflow-spike.md`**
17. **`src/resources/extensions/gsd/prompts/workflow-hotfix.md`**

---

## Success Criteria

- [ ] `/gsd start bugfix` resolves template and dispatches workflow prompt
- [ ] `/gsd start` with no args auto-detects from context or shows choices
- [ ] `/gsd templates` lists all available templates
- [ ] `/gsd templates info bugfix` shows detailed template info
- [ ] All existing `/gsd *` commands work unchanged (zero regression)
- [ ] Registry validates (all referenced template files exist)
- [ ] Templates reuse existing agents and prompt patterns
