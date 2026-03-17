---
estimated_steps: 5
estimated_files: 4
---

# T01: Produce the TUI-to-web parity audit document

**Slice:** S08 — TUI-to-web 1:1 parity audit and gap closure
**Milestone:** M003

## Description

Build the comprehensive parity audit document that systematically compares every TUI feature against its web equivalent. This is the primary R109 deliverable — a structured feature matrix proving the audit was done and recording every gap with its disposition (fixed, intentional scope boundary, or deferred).

The audit covers four areas:
1. **All 30 `/gsd` subcommands** — command dispatch, data access, and UI rendering
2. **Dashboard overlay features** — pending captures badge, worktree name, cost summary
3. **Visualizer tabs** — all 7 sections compared between TUI and web
4. **Interactive flows** — prefs wizard, doctor heal, capture-with-args write, knowledge-with-args write

Each gap must be classified with a clear rationale. The research doc (S08-RESEARCH.md) already identified all gaps — this task formalizes them into the audit document.

## Steps

1. Read the TUI command handler to verify the 30 subcommand list and their behaviors:
   - `src/resources/extensions/gsd/commands.ts` — the `registerGSDCommand` function at line 84 lists all subcommands; each `handleX` function defines TUI behavior
   - `src/resources/extensions/gsd/dashboard-overlay.ts` — TUI dashboard features
   - `src/resources/extensions/gsd/visualizer-overlay.ts` + `visualizer-views.ts` — TUI visualizer

2. Read the web dispatch and panel files to verify web equivalents:
   - `web/lib/browser-slash-command-dispatch.ts` — `GSD_SURFACE_SUBCOMMANDS` (20), `GSD_PASSTHROUGH_SUBCOMMANDS` (9), inline help (1)
   - `web/components/gsd/command-surface.tsx` — orchestrator switch at lines 2018-2042
   - `web/components/gsd/diagnostics-panels.tsx` — ForensicsPanel, DoctorPanel, SkillHealthPanel
   - `web/components/gsd/settings-panels.tsx` — PrefsPanel, ModelRoutingPanel, BudgetPanel
   - `web/components/gsd/knowledge-captures-panel.tsx` — KnowledgeCapturesPanel
   - `web/components/gsd/remaining-command-panels.tsx` — 10 remaining panels
   - `web/components/gsd/visualizer-view.tsx` — 7-tab visualizer

3. Build the feature matrix with these columns: TUI Feature | TUI Behavior | Web Equivalent | Parity Status | Gap Disposition

4. Write `.gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` with:
   - Summary header with audit date and methodology
   - Section 1: Command dispatch matrix (all 30 subcommands)
   - Section 2: Surface command detail (20 surface commands — what each panel shows vs TUI)
   - Section 3: Dashboard overlay comparison
   - Section 4: Visualizer tab comparison (7 tabs)
   - Section 5: Interactive flow gaps (prefs wizard, doctor heal/audit, capture/knowledge write, skill-health filters)
   - Section 6: Gap summary with dispositions
   - Conclusion with overall parity assessment

5. Verify no TUI command or feature is unaccounted for by cross-checking the subcommand list from `commands.ts` against the audit document.

## Must-Haves

- [ ] Feature matrix covers all 30 `/gsd` subcommands with dispatch type and web equivalent
- [ ] All 20 surface commands have detailed comparison of TUI behavior vs web panel content
- [ ] Dashboard overlay features (captures badge, worktree name) are compared
- [ ] All 7 visualizer tabs are compared between TUI and web
- [ ] Interactive flows (prefs wizard, doctor heal, capture-with-args) are documented
- [ ] Every gap has a clear disposition: fixed (in T02), intentional scope boundary (with rationale), or deferred
- [ ] No TUI feature is left unaccounted for

## Verification

- `test -f .gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` — file exists
- Document contains a row for each of the 30 subcommands
- Document contains sections for dashboard, visualizer, and interactive flows
- Every identified gap has a disposition (no "TBD" or "unknown" entries)

## Inputs

- `src/resources/extensions/gsd/commands.ts` — authoritative TUI command handler with all 30 subcommands
- `src/resources/extensions/gsd/dashboard-overlay.ts` — TUI dashboard overlay features
- `src/resources/extensions/gsd/visualizer-overlay.ts` — TUI visualizer overlay
- `src/resources/extensions/gsd/visualizer-views.ts` — TUI visualizer views
- `web/lib/browser-slash-command-dispatch.ts` — web dispatch routing
- `web/components/gsd/command-surface.tsx` — web command surface orchestrator
- `web/components/gsd/diagnostics-panels.tsx` — forensics, doctor, skill-health panels
- `web/components/gsd/settings-panels.tsx` — prefs, model routing, budget panels
- `web/components/gsd/knowledge-captures-panel.tsx` — knowledge and captures panel
- `web/components/gsd/remaining-command-panels.tsx` — 10 remaining panels
- `web/components/gsd/visualizer-view.tsx` — 7-tab visualizer view
- `.gsd/milestones/M003/slices/S08/S08-RESEARCH.md` — pre-identified gaps and classifications

## Expected Output

- `.gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` — complete parity audit document with feature matrix, gap analysis, and dispositions for every TUI feature
