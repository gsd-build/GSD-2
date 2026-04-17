---
research_depth: {{researchDepth}}
research_signals:
  - {{signal}}
research_focus: {{researchFocus}}
milestone_class: {{feature_OR_transformation}}
---

# {{milestoneId}}: {{milestoneTitle}}

**Gathered:** {{date}}
**Status:** Ready for planning

## Project Description

{{description}}

## Milestone Intent

This section is the **pipeline-persistent core** — it is injected into EVERY downstream prompt (planner, executor, completer) so the user's pain and priorities survive context compression. Keep it concise (~500 chars max) and brutally honest.

### Core Problem Being Eliminated

{{what the user does TODAY that they must NOT have to do AFTER this milestone — one sentence, concrete, behavioral}}

### Priority Stack

1. {{requirement or capability}} — **KERN** — {{why this is non-negotiable; without this the milestone failed}}
2. {{requirement or capability}} — important — {{why}}
3. {{requirement or capability}} — nice-to-have — {{why}}

### Success Feels Like

- {{concrete behavioral delta: "I open X and Y already knows Z — no manual transfer"}}
- {{concrete behavioral delta: "When I do X, the system automatically does Y"}}

### Milestone Class

**{{feature | transformation}}** — A `feature` milestone adds new user-visible capabilities to an existing workflow. A `transformation` milestone changes HOW the system behaves — the user's workflow itself is different afterward. Transformation milestones may produce less visible UI but more behavioral change.

## Why This Milestone

{{whatProblemThisSolves_AND_whyNow}}

## User-Visible Outcome

### When this milestone is complete, the user can:

- {{literalUserActionInRealEnvironment}}
- {{literalUserActionInRealEnvironment}}

### Entry point / environment

- Entry point: {{CLI command / URL / bot / extension / service / workflow}}
- Environment: {{local dev / browser / mobile / launchd / CI / production-like}}
- Live dependencies involved: {{telegram / database / webhook / rpc subprocess / none}}

## Completion Class

- Contract complete means: {{what can be proven by tests / fixtures / artifacts}}
- Integration complete means: {{what must work across real subsystems}}
- Operational complete means: {{what must work under real lifecycle conditions, or none}}

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- {{one real end-to-end scenario}}
- {{one real end-to-end scenario}}
- {{what cannot be simulated if this milestone is to be considered truly done}}

## Architectural Decisions

### {{decisionTitle}}

**Decision:** {{decisionStatement}}

**Rationale:** {{rationale}}

**Alternatives Considered:**
- {{alternative}} — {{whyNotChosen}}

---

> Add additional decisions as separate `### Decision Title` blocks following the same structure above.
> See `.gsd/DECISIONS.md` for the full append-only register of all project decisions.

## Error Handling Strategy

{{errorHandlingStrategy}}

> Describe the approach for handling failures, edge cases, and error propagation. Include retry policies, fallback behaviors, and user-facing error messages where relevant.

## Risks and Unknowns

- {{riskOrUnknown}} — {{whyItMatters}}

## Existing Codebase / Prior Art

- `{{fileOrModule}}` — {{howItRelates}}
- `{{fileOrModule}}` — {{howItRelates}}

## Relevant Requirements

- {{requirementId}} — {{howThisMilestoneAdvancesIt}}

## Scope

### In Scope

- {{inScopeItem}}

### Out of Scope / Non-Goals

- {{outOfScopeItem}}

## Technical Constraints

- {{constraint}}

## Integration Points

- {{systemOrService}} — {{howThisMilestoneInteractsWithIt}}

## Testing Requirements

{{testingRequirements}}

> Specify test types (unit, integration, e2e), coverage expectations, and specific test scenarios that must pass.

## Acceptance Criteria

{{acceptanceCriteria}}

> Per-slice acceptance criteria gathered during discussion. Each slice should have clear, testable criteria.

## Open Questions

- {{question}} — {{currentThinking}}

## Seed Material

External documents that informed this milestone's context. The **planner MUST read these** before decomposing into slices — they contain depth that CONTEXT.md summarizes but cannot fully capture. If files are large, focus on sections relevant to the Priority Stack.

- `{{path/to/research-report.md}}` — {{what it contains and why it matters}}
- `{{path/to/voice-exploration.md}}` — {{what it contains and why it matters}}
- `{{path/to/external-chat-export.md}}` — {{what it contains and why it matters}}

If no external seed material exists (the discussion captured everything), omit this section entirely.
