---
estimated_steps: 4
estimated_files: 1
---

# T01: Write the synthesis guide reference

**Slice:** S02 — Test synthesis and interactive session
**Milestone:** M001

## Description

Write `references/synthesis-guide.md` — the intelligence layer that teaches the agent how to read a UAT file's individual test items and synthesize them into 2-4 holistic experience scenarios. This is the core risk item for the slice: if the synthesis guide's examples aren't vivid enough, the LLM will fall back to mechanical "check that X exists" testing instead of craft-aware "try the full flow and describe how it feels" scenarios.

This is a markdown reference file (not XML — references use markdown per GSD skill convention). It must include: the synthesis algorithm, at least 2 worked examples showing mechanical-vs-holistic transformation, and an anti-patterns section.

**Relevant skill:** `create-skill` — for reference file conventions.

## Steps

1. **Write the synthesis algorithm section.** Document the 4-step process: (a) read ALL sections of the UAT file (Test Cases, Edge Cases, Smoke Test, Notes for Tester, Failure Signals — not just Test Cases), (b) identify natural themes/groupings across items, (c) group related items into 2-4 experience scenarios, (d) write craft-aware open-ended questions for each scenario.

2. **Write 2+ worked examples.** Each example should take the same set of UAT items and show two transformations: a BAD mechanical version (one test case → one scenario, closed yes/no questions, checking presence not experience) and a GOOD holistic version (related items grouped, questions about feel/flow/craft, edge cases woven into scenarios). The bad example must feel obviously mechanical; the good example must feel obviously better. Use UAT items that resemble real GSD skill testing (e.g., "YAML frontmatter has name field" + "missing YAML causes error" → "the skill identity experience").

3. **Write the anti-patterns section.** Explicitly call out: (a) one-to-one item mapping (each UAT item becomes its own scenario), (b) "does it exist?" questions instead of "how does it feel?", (c) ignoring Edge Cases section — must weave edge cases into experience scenarios, (d) leading/closed questions ("Did the button appear?" vs. "What do you observe?"), (e) treating Smoke Test as a separate scenario instead of folding it into the first scenario.

4. **Write the scenario count guidance.** Explain why 2-4 scenarios: fewer than 2 means items aren't being grouped; more than 4 means they're being split too finely. The sweet spot is 3 for most slices.

## Must-Haves

- [ ] Algorithm covers all 5 UAT file sections (Test Cases, Edge Cases, Smoke Test, Notes for Tester, Failure Signals)
- [ ] At least 2 worked examples with clear bad (mechanical) and good (holistic) transformations
- [ ] Anti-patterns section calls out one-to-one mapping, closed questions, ignoring edge cases
- [ ] Content emphasizes experience/feel/craft over presence/existence checking
- [ ] File is markdown format (not XML — this is a reference, not a workflow)

## Verification

- `test -f ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — file exists
- `grep -q "mechanical" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — anti-pattern term present
- `grep -qi "experience\|holistic" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — positive pattern terms present
- `grep -qi "example\|Example" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — worked examples present
- `grep -qi "Edge Case" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — edge cases mentioned
- `grep -qi "Smoke Test\|smoke test" ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — smoke test mentioned
- `wc -l < ~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` returns >= 100 — substantive content

## Inputs

- `~/.gsd/agent/skills/gsd-verify-work/SKILL.md` — severity model and UAT philosophy (reference these, don't redefine)
- `~/.gsd/agent/skills/gsd-verify-work/references/slice-targeting.md` — context on the targeting algorithm (synthesis guide doesn't directly use this, but should understand the overall flow)

## Expected Output

- `~/.gsd/agent/skills/gsd-verify-work/references/synthesis-guide.md` — The synthesis guide reference (~150-200 lines) with algorithm, worked examples, and anti-patterns

## Observability Impact

- **New signal:** `references/synthesis-guide.md` existence and content quality are verifiable via grep checks (algorithm keywords, anti-pattern terms, example markers). These checks are codified in the S02 verification script.
- **Inspection:** A future agent can assess synthesis guide quality by checking whether worked examples show clear mechanical-vs-holistic contrast. If both "bad" and "good" examples read similarly, the guide isn't teaching the distinction effectively.
- **Failure state:** If this file is missing or lacks the algorithm/examples/anti-patterns sections, the `run-uat.md` workflow (T02) will degrade to mechanical per-item testing — the primary failure mode this guide exists to prevent.
