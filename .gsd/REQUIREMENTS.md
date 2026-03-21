# Requirements

This file is the explicit capability and coverage contract for the project.

## Validated

### R001 — Skill reads S##-UAT.md and synthesizes individual test items into 2-4 meaningful experience-oriented scenarios that test real user experience (position, feel, look, behavior) rather than mechanical presence checks.
- Class: core-capability
- Status: validated
- Description: Skill reads S##-UAT.md and synthesizes individual test items into 2-4 meaningful experience-oriented scenarios that test real user experience (position, feel, look, behavior) rather than mechanical presence checks.
- Why it matters: Assembly-line checkbox testing misses craft issues. Grouping related items into holistic scenarios produces richer, more useful feedback.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: synthesis-guide.md delivers 4-step algorithm, 2 worked examples (mechanical-vs-holistic contrast), 5 anti-patterns, scenario count guidance covering all 5 UAT sections. verify-s02.sh 20/20 checks pass. Structural proof complete; runtime synthesis quality is prompt-dependent.
- Notes: The synthesis quality lives primarily in the skill prompt — good examples and anti-patterns guide the LLM. synthesis-guide.md is 338 lines with detailed worked examples making the mechanical-vs-holistic contrast unmistakable.

### R002 — Skill presents synthesized scenarios one at a time, the user tests freely and describes what they see in natural language, the skill captures observations as structured findings with severity classification.
- Class: primary-user-loop
- Status: validated
- Description: Skill presents synthesized scenarios one at a time, the user tests freely and describes what they see in natural language, the skill captures observations as structured findings with severity classification.
- Why it matters: This is the core interaction loop — the user tests, the agent listens and structures.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: run-uat.md implements 8-step interactive workflow: target, read, synthesize, present one-at-a-time, collect with open-ended questions, classify severity (broken/feels-wrong/change-request/observation), present findings summary, hand off. verify-s02.sh 20/20 checks pass.
- Notes: Severity levels: broken (blocker), feels-wrong (should fix), change-request (enhancement), observation (informational). Default severity is feels-wrong when unclear. Findings summary uses markdown table format for S03 parsing.

### R003 — Writes S##-UAT-RESULT.md in the format the existing GSD dispatch system expects — YAML frontmatter with sliceId, uatType, verdict, date, plus structured checks table and overall verdict.
- Class: integration
- Status: validated
- Description: Writes S##-UAT-RESULT.md in the format the existing GSD dispatch system expects — YAML frontmatter with sliceId, uatType, verdict, date, plus structured checks table and overall verdict.
- Why it matters: Must integrate cleanly with GSD auto-mode's existing UAT result consumption (reassessment, milestone completion gates).
- Source: inferred
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: uat-result.md template has YAML frontmatter (sliceId, uatType, verdict, date), checks table with human-follow-up Mode, overall verdict section. write-results.md writes using template. verify-s03.sh 26/26 checks pass.
- Notes: Format defined in src/resources/extensions/gsd/prompts/run-uat.md.

### R004 — After UAT session, the skill presents all findings for review. User confirms which findings become fix tasks. Skill generates T##-PLAN.md fix task plans with enough context for the executing agent to know exactly what to change.
- Class: core-capability
- Status: validated
- Description: After UAT session, the skill presents all findings for review. User confirms which findings become fix tasks. Skill generates T##-PLAN.md fix task plans with enough context for the executing agent to know exactly what to change.
- Why it matters: Closes the loop — UAT findings become actionable work items, not just a report that sits there.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: fix-task-guide.md maps all 4 severity levels to actions (broken→mandatory, feels-wrong→user-confirmed, change-request→logged, observation→never). write-results.md implements review gate (Step 5) and generation (Step 6) with collision-safe T## numbering. verify-s03.sh 26/26 checks pass.
- Notes: Fix tasks go in current slice or a new fix slice depending on scope.

### R005 — Skill correctly identifies the UAT target as the most recently completed slice with an existing S##-UAT.md and no S##-UAT-RESULT.md — NOT state.activeSlice (which has already advanced).
- Class: integration
- Status: validated
- Description: Skill correctly identifies the UAT target as the most recently completed slice with an existing S##-UAT.md and no S##-UAT-RESULT.md — NOT state.activeSlice (which has already advanced).
- Why it matters: Known bug area (#1693, #1695). The skill must use the same targeting logic as auto-mode's checkNeedsRunUat().
- Source: inferred
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: slice-targeting.md documents 7-step roadmap-based algorithm with 4 edge cases and explicit activeSlice prohibition. All skill files verified to not contain activeSlice. verify-s01.sh 19/19 checks pass.
- Notes: Read roadmap, find last completed slice, check for UAT file, check no result exists yet.

### R006 — Skill activates when user says "verify work", "test this slice", "run UAT", or similar phrases. Also supports explicit /gsd verify-work style invocation.
- Class: launchability
- Status: validated
- Description: Skill activates when user says "verify work", "test this slice", "run UAT", or similar phrases. Also supports explicit /gsd verify-work style invocation.
- Why it matters: Must feel natural to invoke, not require remembering exact syntax.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: SKILL.md YAML description contains all 3 trigger phrases ("verify work", "test this slice", "run UAT"). Skill installed at ~/.gsd/agent/skills/gsd-verify-work/ for GSD discovery. verify-s01.sh checks 10-12 pass.
- Notes: Activation via SKILL.md description field triggers — GSD skill discovery matches user intent to skill descriptions.

### R007 — Skill reads the UAT template format (Smoke Test, Test Cases, Edge Cases sections) and writes UAT-RESULT in the format consumed by GSD auto-mode dispatch rules.
- Class: integration
- Status: validated
- Description: Skill reads the UAT template format (Smoke Test, Test Cases, Edge Cases sections) and writes UAT-RESULT in the format consumed by GSD auto-mode dispatch rules.
- Why it matters: Must be a drop-in participant in the existing GSD workflow, not a parallel system.
- Source: inferred
- Primary owning slice: M001/S03
- Supporting slices: M001/S01
- Validation: Template matches GSD dispatch format from src/resources/extensions/gsd/prompts/run-uat.md. Workflow maps findings to checks table with human-follow-up Mode. verify-s03.sh confirms YAML fields, table structure, cross-references (26/26 pass).
- Notes: UAT template in src/resources/extensions/gsd/templates/uat.md. Result format in src/resources/extensions/gsd/prompts/run-uat.md.

### R008 — After all scenarios are tested, the skill presents a summary of all findings. User confirms which findings should become fix tasks before any task plans are generated.
- Class: quality-attribute
- Status: validated
- Description: After all scenarios are tested, the skill presents a summary of all findings. User confirms which findings should become fix tasks before any task plans are generated.
- Why it matters: Prevents noise — minor observations or "nice to have" items shouldn't automatically become fix tasks.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: write-results.md Step 5 implements review gate — broken pre-selected, feels-wrong for user choice, change-request/observation shown but not selectable. Explicit user confirmation required before fix task generation. verify-s03.sh 26/26 pass.
- Notes: User can also re-classify severity during review.

## Deferred

### R009 — User pastes screenshots (Ctrl+V) alongside text observations for visual evidence in the UAT report.
- Class: quality-attribute
- Status: deferred
- Description: User pastes screenshots (Ctrl+V) alongside text observations for visual evidence in the UAT report.
- Why it matters: Visual evidence is more precise than text descriptions for layout/design issues.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred to keep first version focused on the core text-based flow.

### R010 — Before presenting scenarios to the user, run quick automated browser checks (page loads, elements exist) to filter out obvious failures.
- Class: quality-attribute
- Status: deferred
- Description: Before presenting scenarios to the user, run quick automated browser checks (page loads, elements exist) to filter out obvious failures.
- Why it matters: Saves human time by catching broken builds before UAT starts.
- Source: research
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Could leverage gsd-pi's native browser tools. Natural extension for a future milestone.

## Out of Scope

### R011 — Skill only works within GSD projects with existing slice UAT files.
- Class: constraint
- Status: out-of-scope
- Description: Skill only works within GSD projects with existing slice UAT files.
- Why it matters: Prevents scope creep into general-purpose testing tool.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: none

### R012 — Norcalcoop-style automated browser test execution via agent-browser/portless.
- Class: anti-feature
- Status: out-of-scope
- Description: Norcalcoop-style automated browser test execution via agent-browser/portless.
- Why it matters: This skill is about human judgment, not automation. The built-in run-uat dispatch handles automated checks.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Norcalcoop reference material kept in .research/ for potential future use.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | validated | M001/S02 | none | synthesis-guide.md delivers 4-step algorithm, 2 worked examples (mechanical-vs-holistic contrast), 5 anti-patterns, scenario count guidance covering all 5 UAT sections. verify-s02.sh 20/20 checks pass. Structural proof complete; runtime synthesis quality is prompt-dependent. |
| R002 | primary-user-loop | validated | M001/S02 | none | run-uat.md implements 8-step interactive workflow: target, read, synthesize, present one-at-a-time, collect with open-ended questions, classify severity (broken/feels-wrong/change-request/observation), present findings summary, hand off. verify-s02.sh 20/20 checks pass. |
| R003 | integration | validated | M001/S03 | none | uat-result.md template has YAML frontmatter (sliceId, uatType, verdict, date), checks table with human-follow-up Mode, overall verdict section. write-results.md writes using template. verify-s03.sh 26/26 checks pass. |
| R004 | core-capability | validated | M001/S03 | none | fix-task-guide.md maps all 4 severity levels to actions (broken→mandatory, feels-wrong→user-confirmed, change-request→logged, observation→never). write-results.md implements review gate (Step 5) and generation (Step 6) with collision-safe T## numbering. verify-s03.sh 26/26 checks pass. |
| R005 | integration | validated | M001/S01 | none | slice-targeting.md documents 7-step roadmap-based algorithm with 4 edge cases and explicit activeSlice prohibition. All skill files verified to not contain activeSlice. verify-s01.sh 19/19 checks pass. |
| R006 | launchability | validated | M001/S01 | none | SKILL.md YAML description contains all 3 trigger phrases ("verify work", "test this slice", "run UAT"). Skill installed at ~/.gsd/agent/skills/gsd-verify-work/ for GSD discovery. verify-s01.sh checks 10-12 pass. |
| R007 | integration | validated | M001/S03 | M001/S01 | Template matches GSD dispatch format from src/resources/extensions/gsd/prompts/run-uat.md. Workflow maps findings to checks table with human-follow-up Mode. verify-s03.sh confirms YAML fields, table structure, cross-references (26/26 pass). |
| R008 | quality-attribute | validated | M001/S03 | none | write-results.md Step 5 implements review gate — broken pre-selected, feels-wrong for user choice, change-request/observation shown but not selectable. Explicit user confirmation required before fix task generation. verify-s03.sh 26/26 pass. |
| R009 | quality-attribute | deferred | none | none | unmapped |
| R010 | quality-attribute | deferred | none | none | unmapped |
| R011 | constraint | out-of-scope | none | none | n/a |
| R012 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 0
- Mapped to slices: 0
- Validated: 8 (R001, R002, R003, R004, R005, R006, R007, R008)
- Unmapped active requirements: 0
