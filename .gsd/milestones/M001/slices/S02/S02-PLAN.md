# S02: Test synthesis and interactive session

**Goal:** Skill reads UAT items and synthesizes them into 2-4 experience-oriented scenarios, then guides the user through interactive testing and captures findings with severity classification.
**Demo:** Running against a real UAT file produces holistic experience scenarios (not mechanical checklists), an interactive session that uses open-ended questions, and structured findings with the four-level severity model.

## Must-Haves

- `references/synthesis-guide.md` documents how to read UAT items and group them into 2-4 experience scenarios with worked good/bad examples and anti-patterns
- `workflows/run-uat.md` implements the full interactive session loop: target slice → read UAT → synthesize scenarios → present one at a time → collect observations → classify severity → summarize findings → hand off to S03
- Workflow uses pure XML structure (`<required_reading>`, `<process>`, `<success_criteria>`) per GSD skill conventions
- Synthesis guide references all UAT file sections (Test Cases, Edge Cases, Smoke Test, Notes for Tester, Failure Signals) — not just Test Cases
- Interactive session uses open-ended questions ("What do you observe?") not closed questions ("Did the button appear?")
- Severity levels match SKILL.md exactly: broken, feels-wrong, change-request, observation — referenced, not redefined
- Workflow does NOT write UAT-RESULT (that's S03) — ends with structured findings summary
- SKILL.md updated: reference_index includes synthesis-guide.md, workflows_index shows run-uat.md as active (not "Planned (S02)"), routing note removed
- S01 verification script still passes (regression)

## Observability / Diagnostics

- **Runtime signals:** The synthesis guide is a reference file (not executable), so runtime signals come from the workflow that consumes it (`workflows/run-uat.md`). The workflow's scenario-presentation step is the observable surface — if scenarios read as mechanical checklists instead of holistic experience flows, the synthesis guide failed.
- **Inspection surfaces:** An agent can verify synthesis quality by reading `references/synthesis-guide.md` and checking: (1) the algorithm section covers all 5 UAT sections, (2) worked examples show clear bad→good transformations, (3) anti-patterns section exists. Structural verification via `verify-s02.sh` covers file existence, keyword presence, and cross-references.
- **Failure visibility:** If the synthesis guide is missing or malformed, the `run-uat.md` workflow will fail at the `<required_reading>` step — the agent won't have synthesis instructions and will fall back to mechanical per-item testing. This failure mode is detectable by observing whether synthesized scenarios group multiple UAT items or mirror them 1:1.
- **Redaction constraints:** None — all files in this slice are skill definitions (no secrets, no user data).

## Verification

- `bash .gsd/milestones/M001/slices/S02/scripts/verify-s02.sh` — structural and content checks for both new files and SKILL.md updates
- `bash .gsd/milestones/M001/slices/S01/scripts/verify-s01.sh` — regression: all 19 S01 checks still pass
- `grep -c "## Anti-Patterns\|## Worked Example\|## Algorithm" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — diagnostic: confirms synthesis guide has the three required structural sections

## Integration Closure

- Upstream surfaces consumed: `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` (severity model, routing), `references/slice-targeting.md` (targeting algorithm)
- New wiring introduced in this slice: `workflows/run-uat.md` is now routable from SKILL.md's `<routing>` section; `references/synthesis-guide.md` is loaded by the workflow via `<required_reading>`
- What remains before the milestone is truly usable end-to-end: S03 — result writing (UAT-RESULT.md output) and fix task generation

## Tasks

- [x] **T01: Write the synthesis guide reference** `est:30m`
  - Why: This is the intelligence layer that determines whether UAT produces holistic experience scenarios or falls back to mechanical checklists. It's the core risk item for R001.
  - Files: `~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md`
  - Do: Write the synthesis algorithm (read all UAT sections → identify themes → group into 2-4 scenarios → write craft-aware questions). Include at least 2 worked examples showing the same UAT items transformed mechanically (bad) vs. holistically (good). Document anti-patterns: one-to-one item mapping, "does it exist?" questions, ignoring edge cases, leading questions. Markdown format (not XML — this is a reference file, not a workflow).
  - Verify: `test -f ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md && grep -q "mechanical" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md && grep -q "experience\|holistic" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md && grep -q "example\|Example" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md`
  - Done when: synthesis-guide.md exists with algorithm, 2+ worked examples, and anti-pattern section; content emphasizes experience-oriented testing over mechanical presence checks

- [x] **T02: Write the interactive session workflow** `est:30m`
  - Why: This is the main executable workflow that SKILL.md routes to — the interactive UAT session loop covering R002. It references both slice-targeting.md and synthesis-guide.md.
  - Files: `~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md`
  - Do: Write the workflow with pure XML structure (`<required_reading>`, `<process>`, `<success_criteria>`). Process steps: (1) target slice via slice-targeting.md, (2) read the UAT file, (3) synthesize scenarios using synthesis-guide.md, (4) present scenarios one at a time, (5) collect user observations with open-ended questions, (6) classify each finding using the severity model from SKILL.md, (7) present findings summary for review, (8) hand off to result writing (S03). Must NOT write UAT-RESULT. Must NOT use activeSlice. Must NOT redefine severity levels.
  - Verify: `test -f ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md && grep -q "required_reading" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md && grep -q "process" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md && grep -q "success_criteria" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md && grep -q "observe\|observation" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md && ! grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md`
  - Done when: run-uat.md exists with XML structure, references both upstream files, uses open-ended questioning, covers all 8 process steps, does not write UAT-RESULT or use activeSlice

- [x] **T03: Update SKILL.md indexes and write S02 verification script** `est:20m`
  - Why: Wires the two new files into the skill's routing and indexes, then provides comprehensive structural verification for the entire S02 deliverable — including regression against S01.
  - Files: `~/.gsd/agent/skills/gsd-verify-work/SKILL.md`, `.gsd/milestones/M001/slices/S02/scripts/verify-s02.sh`
  - Do: (1) Update SKILL.md `<reference_index>` table to add synthesis-guide.md entry. (2) Update `<workflows_index>` table to change run-uat.md status from "Planned (S02)" to "Active". (3) Remove the "Note: This workflow will be created in S02" line from `<routing>`. (4) Write verify-s02.sh covering: file existence (2 new files), XML tag presence in workflow, reference cross-links, content quality (mechanical/experience/example keywords), SKILL.md index updates, no activeSlice in workflow, SKILL.md line count, and S01 regression (call verify-s01.sh). (5) Run both scripts to confirm everything passes.
  - Verify: `bash .gsd/milestones/M001/slices/S02/scripts/verify-s02.sh && bash .gsd/milestones/M001/slices/S01/scripts/verify-s01.sh`
  - Done when: SKILL.md indexes updated, routing note removed, verify-s02.sh passes all checks, verify-s01.sh still passes all 19 checks

## Files Likely Touched

- `~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md`
- `~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md`
- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md`
- `.gsd/milestones/M001/slices/S02/scripts/verify-s02.sh`
