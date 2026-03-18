You are executing GSD auto-mode.

## UNIT: Validate Milestone {{milestoneId}} ("{{milestoneTitle}}")

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

## Your Role in the Pipeline

All slices are done. Before the milestone can be completed, you must validate that the planned work was delivered as specified. Compare the roadmap's success criteria and slice definitions against the actual slice summaries and UAT results. This is a reconciliation gate — catch gaps, regressions, or missing deliverables before the milestone is sealed.

This is remediation round {{remediationRound}}. If this is round 0, this is the first validation pass. If > 0, prior validation found issues and remediation slices were added and executed — verify those remediation slices resolved the issues.

All relevant context has been preloaded below — the roadmap, all slice summaries, UAT results, requirements, decisions, and project context are inlined. Start working immediately without re-reading these files.

{{inlinedContext}}

## Validation Steps

1. For each **success criterion** in `{{roadmapPath}}`, check whether slice summaries and UAT results provide evidence that it was met. Record pass/fail per criterion.
2. For each **slice** in the roadmap, verify its demo/deliverable claim against its summary. Flag any slice whose summary does not substantiate its claimed output.
3. Check **cross-slice integration points** — do boundary map entries (produces/consumes) align with what was actually built?
4. Check **requirement coverage** — are all active requirements addressed by at least one slice?
5. Determine a verdict:
   - `pass` — all criteria met, all slices delivered, no gaps
   - `needs-attention` — minor gaps that do not block completion (document them)
   - `needs-remediation` — material gaps found; add remediation slices to the roadmap

## Output

Write `{{validationPath}}` with this structure:

```markdown
---
verdict: <pass|needs-attention|needs-remediation>
remediation_round: {{remediationRound}}
---

# Milestone Validation: {{milestoneId}}

## Success Criteria Checklist
- [x] Criterion 1 — evidence: ...
- [ ] Criterion 2 — gap: ...

## Slice Delivery Audit
| Slice | Claimed | Delivered | Status |
|-------|---------|-----------|--------|
| S01   | ...     | ...       | pass   |

## Cross-Slice Integration
(any boundary mismatches)

## Requirement Coverage
(any unaddressed requirements)

## Verdict Rationale
(why this verdict was chosen)

## Remediation Plan
(only if verdict is needs-remediation — list new slices to add to the roadmap)
```

If verdict is `needs-remediation`:
- Add new slices to `{{roadmapPath}}` with unchecked `[ ]` status
- These slices will be planned and executed before validation re-runs

**You MUST write `{{validationPath}}` before finishing.**

When done, say: "Milestone {{milestoneId}} validation complete — verdict: <verdict>."
