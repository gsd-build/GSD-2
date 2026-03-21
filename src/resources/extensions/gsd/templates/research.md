# {{scope}} — Research

**Date:** {{date}}

<!-- Required sections: Summary, Recommendation, Implementation Landscape.
     All other sections: include only when they have real content.
     For light research (straightforward work with known patterns),
     the required sections alone are sufficient. -->

## Summary

{{summary — 2-3 paragraphs with primary recommendation}}

## Recommendation

{{whatApproachToTake_AND_why}}

## Implementation Landscape

<!-- This section is the primary input for the planner agent.
     Be specific — file paths, function names, patterns to follow.
     The planner uses this to scope tasks to files and decide build order. -->

### Key Files

- `{{filePath}}` — {{whatItDoesAndHowItRelates}}
- `{{filePath}}` — {{whatNeedsToChange}}

### Build Order

{{whatToProveOrBuildFirst_AND_why — whatUnblocksDownstreamWork}}

### Verification Approach

{{howToConfirmTheSliceWorks — commands, tests, observable behaviors}}

<!-- Sections below: include when applicable, omit entirely when not. -->

## Don't Hand-Roll

<!-- Include when existing libraries/tools solve problems the slice would otherwise reimplement. -->

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| {{problem}} | {{solution}} | {{why}} |

## Constraints

<!-- Include when the codebase, runtime, or dependencies impose hard limits on approach. -->

- {{hardConstraintFromCodebaseOrRuntime}}
- {{constraintFromDependencies}}

## Common Pitfalls

<!-- Include when there are non-obvious failure modes worth flagging. -->

- **{{pitfall}}** — {{howToAvoid}}
- **{{pitfall}}** — {{howToAvoid}}

## Open Risks

<!-- Include when execution could hit unknowns that affect the plan. -->

- {{riskThatCouldSurfaceDuringExecution}}

## Skills Discovered

<!-- Include when skill discovery found relevant skills. -->

| Technology | Skill | Status |
|------------|-------|--------|
| {{technology}} | {{owner/repo@skill}} | {{installed / available / none found}} |

## Sources

<!-- Include when external docs, articles, or references informed the research. -->

- {{whatWasLearned}} (source: [{{title}}]({{url}}))

## Unknowns Inventory

<!-- REQUIRED. List every implementation-affecting claim that is not directly observed
     this session. Training data recall (version numbers, API signatures, CLI flags,
     config schemas, magic numbers) is NOT observed — it needs verification.

     If there are no unknowns, write: "None identified — all implementation-affecting
     claims were verified by reading project files and running commands this session."

     Evidence basis values:
       observed     — verified this session via file read, command output, tool result (no entry needed)
       training-data — recalled from model training, not verified against current state
       inferred     — working theory from indirect evidence
       assumption   — believed true, no evidence either way
       unknown      — gap identified, no information available

     Resolution strategy types:
       check-docs     — read official documentation or repo README
       read-code      — read actual source files in this project
       experiment     — run a command, test an API, try the thing
       ask-user       — present findings, ask for confirmation or input
       fetch-reference — retrieve external resource (screenshot, clone repo, scrape)
       search         — web search for current information
-->

| # | Claim | Basis | Affects | Resolution | Status |
|---|-------|-------|---------|------------|--------|
| {{N}} | {{specificClaim}} | {{basis}} | {{whatDecisionThisAffects}} | {{strategyType}}: {{specificAction}} | unresolved |
