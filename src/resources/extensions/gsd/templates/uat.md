# {{sliceId}}: {{sliceTitle}} — UAT

**Milestone:** {{milestoneId}}
**Written:** {{date}}

## UAT Type

- UAT mode: {{artifact-driven | browser-executable | runtime-executable | human-judgment | mixed}}
- Why this mode is sufficient: {{reason}}

## Preconditions

{{whatMustBeTrueBeforeTesting — server running, data seeded, etc.}}

## Smoke Test

{{oneQuickCheckThatConfirmsTheSliceBasicallyWorks}}

## Test Cases

### 1. {{testName}}

1. {{step}}
2. {{step}}
3. **Expected:** {{expected}}

### 2. {{testName}}

1. {{step}}
2. **Expected:** {{expected}}

## Executable Checks

<!-- Include this section ONLY for browser-executable or runtime-executable UAT types.
     Delete it entirely for artifact-driven, human-judgment, or mixed types.
     
     For browser-executable: define steps as browser_verify_flow actions.
     For runtime-executable: define steps as CLI commands with expected outputs. -->

### Flow: {{flowName}}

<!-- For browser-executable UAT — each step maps to a browser_verify_flow action -->

| Step | Action | Selector/URL | Value | Assertion |
|------|--------|-------------|-------|-----------|
| 1 | navigate | {{url}} | | |
| 2 | click | {{selector}} | | |
| 3 | assert | | | text_visible: {{expected text}} |

### CLI Checks

<!-- For runtime-executable UAT — each check is a command with expected output -->

| Check | Command | Expected | Match Type |
|-------|---------|----------|------------|
| 1 | {{command}} | {{expected output}} | contains |

## Edge Cases

### {{edgeCaseName}}

1. {{step}}
2. **Expected:** {{expected}}

## Failure Signals

- {{whatWouldIndicateSomethingIsBroken — errors, missing UI, wrong data}}

## Requirements Proved By This UAT

- {{requirementIdOr_none}} — {{what this UAT proves}}

## Not Proven By This UAT

- {{what this UAT intentionally does not prove}}
- {{remaining live/runtime/operational gaps, if any}}

## Notes for Tester

{{anythingTheHumanShouldKnow — known rough edges, things to ignore, areas needing gut check}}
