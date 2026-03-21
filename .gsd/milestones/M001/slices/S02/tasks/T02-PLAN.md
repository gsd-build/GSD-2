---
estimated_steps: 4
estimated_files: 1
---

# T02: Write the interactive session workflow

**Slice:** S02 — Test synthesis and interactive session
**Milestone:** M001

## Description

Write `workflows/run-uat.md` — the main interactive UAT session workflow that SKILL.md routes to. This workflow is the core user-facing flow for R002: it targets the correct slice, reads its UAT file, synthesizes experience scenarios (using the synthesis guide from T01), presents them one at a time, collects user observations with open-ended questions, classifies findings using the severity model, and presents a findings summary for review.

This is a workflow file, so it must use **pure XML structure** (`<required_reading>`, `<process>`, `<success_criteria>`) per GSD skill conventions. Content within tags uses markdown formatting (bold, lists, code blocks).

**Critical constraints:**
- The workflow must NOT write the UAT-RESULT file — that's S03's responsibility
- Must NOT use `activeSlice` — uses `references/slice-targeting.md` algorithm instead
- Must NOT redefine severity levels — references SKILL.md's definitions
- Must use open-ended questions ("What do you observe?", "How does that feel?") not closed questions ("Did it work? Yes/No")
- The workflow ends with a structured findings summary, giving the user a chance to review/reclassify before S03's result-writing workflow takes over

**Relevant skill:** `create-skill` — for workflow file XML structure conventions.

## Steps

1. **Write `<required_reading>` section.** Reference both upstream files: `references/slice-targeting.md` (for targeting) and `references/synthesis-guide.md` (for scenario synthesis). These are the two files the agent must read before executing the workflow.

2. **Write `<process>` section with 8 steps.** Each step is a concrete action:
   - Step 1: Target the slice — follow the algorithm in `references/slice-targeting.md` to identify which slice needs UAT. Read its UAT file.
   - Step 2: Read and understand the UAT file — read ALL sections (Test Cases, Edge Cases, Smoke Test, Notes for Tester, Failure Signals), understand preconditions.
   - Step 3: Synthesize scenarios — follow `references/synthesis-guide.md` to group UAT items into 2-4 experience scenarios with craft-aware questions.
   - Step 4: Present the first scenario — show the scenario title, context, and what the user should try. Ask the user to test and describe what they observe.
   - Step 5: Collect observation — wait for the user's description. Ask follow-up questions if needed ("Can you tell me more about what felt off?"). Do NOT ask leading questions.
   - Step 6: Classify finding — assign severity using the model from SKILL.md (broken/feels-wrong/change-request/observation). Default to feels-wrong when unclear. Confirm the classification with the user. Repeat steps 4-6 for remaining scenarios.
   - Step 7: Present findings summary — list all findings with: scenario name, observation, severity, reproduction context. Ask the user to review: "Do these findings accurately capture what you experienced? Would you reclassify any?"
   - Step 8: Hand off — state that the findings are ready for result writing. Do NOT write the UAT-RESULT file. Mention that `workflows/write-results.md` (S03) handles result writing and fix task generation.

3. **Write `<success_criteria>` section.** Define what a successful UAT session looks like: correct slice targeted, all UAT items covered through scenarios, findings captured with severity, user confirmed the findings summary.

4. **Add scenario presentation format.** Within Step 4, include a template for how scenarios should be presented to the user — a consistent format with scenario title, context (what area this covers), what to try, and the open-ended prompt.

## Must-Haves

- [ ] Pure XML structure: `<required_reading>`, `<process>`, `<success_criteria>` tags present
- [ ] `<required_reading>` references both `references/slice-targeting.md` and `references/synthesis-guide.md`
- [ ] Process has 8 explicit steps covering: target → read → synthesize → present → collect → classify → summarize → hand off
- [ ] Uses open-ended questioning (observe, describe, feel) — no closed yes/no questions
- [ ] References severity model from SKILL.md — does NOT redefine the four levels
- [ ] Does NOT write UAT-RESULT file (explicitly defers to S03)
- [ ] Does NOT use `activeSlice` anywhere
- [ ] Includes scenario presentation format template

## Verification

- `test -f ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — file exists
- `grep -q "<required_reading>" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — XML tag present
- `grep -q "<process>" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — XML tag present
- `grep -q "<success_criteria>" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — XML tag present
- `grep -q "slice-targeting.md" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — references targeting
- `grep -q "synthesis-guide.md" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — references synthesis guide
- `grep -qi "observe\|observation\|describe" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — open-ended language
- `! grep -q "activeSlice" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — no activeSlice usage
- `grep -q "finding" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — structured capture term present
- `grep -q "broken\|feels-wrong\|change-request\|observation" ~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — severity levels referenced

## Inputs

- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — routing destination, severity model, UAT philosophy, success criteria
- `~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` — the targeting algorithm the workflow must invoke
- `~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — the synthesis guide the workflow must reference (created in T01)

## Observability Impact

- **Signals changed:** `workflows/run-uat.md` is now routable from SKILL.md's `<routing>` section. When invoked, its 8-step process is the primary observable surface — an agent or human can inspect whether scenarios are holistic (cross-cutting UAT sections) or mechanical (1:1 item mapping) by reading the workflow output.
- **Inspection surface:** Read the file and check: (1) `<required_reading>` references both upstream files, (2) `<process>` has 8 explicit steps, (3) scenario presentation template uses open-ended questions, (4) no `activeSlice` usage. Structural verification via the task-level grep checks covers all of these.
- **Failure visibility:** If this file is missing or malformed, the skill's `<routing>` section will point to a nonexistent workflow. An agent invoking `run-uat` will fail at the file-read step. If the workflow exists but uses closed questions or mechanical per-item testing, the synthesis guide has been ignored — detectable by reading the workflow's scenario output.

## Expected Output

- `~/.gsd/agent/skills/gsd-verify-work/workflows/run-uat.md` — The interactive session workflow (~150-200 lines) with XML structure, 8-step process, and scenario presentation format
