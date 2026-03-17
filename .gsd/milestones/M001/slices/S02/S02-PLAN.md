# S02: Structured Evidence Format

**Goal:** Task summaries contain a canonical verification evidence table. T##-VERIFY.json files are written alongside summaries with machine-queryable results. Observability validator rejects summaries without evidence blocks.
**Demo:** After a gate run, `T03-VERIFY.json` exists in the tasks directory with `schemaVersion: 1`, per-check results, and a top-level `passed` boolean. The task summary has a `## Verification Evidence` section with a formatted table. Running the observability validator on a summary missing that section produces a warning.

## Must-Haves

- `writeVerificationJSON(result, tasksDir, taskId)` writes a versioned JSON artifact with check-level detail
- `formatEvidenceTable(result)` returns a markdown table with Check, Command, Exit Code, Verdict, Duration columns
- `writeVerificationJSON` is called from the gate block in auto.ts after `runVerificationGate()` returns
- Task summary template includes `## Verification Evidence` section
- Execute-task prompt instructs the agent to populate the evidence table from gate output
- `validateTaskSummaryContent()` warns when `## Verification Evidence` is missing or placeholder-only
- JSON schema is versioned (`schemaVersion: 1`) and forward-compatible for S04/S05 extensions
- All 28 existing verification-gate tests still pass (no regressions)

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (unit tests with temp dir isolation are sufficient)
- Human/UAT required: no

## Verification

- `npm run test:unit -- --test-name-pattern "verification-evidence"` — all evidence writer + validator tests pass
- `npm run test:unit -- --test-name-pattern "verification-gate"` — 28 S01 tests still pass
- `npm run test:unit` — no new failures introduced
- `npx --yes tsx src/resources/extensions/gsd/verification-evidence.ts` — compiles cleanly

## Integration Closure

- Upstream surfaces consumed: `VerificationResult` and `VerificationCheck` interfaces from `types.ts`, `runVerificationGate()` call site in `auto.ts` (line ~1512), `resolveSlicePath` from `paths.ts`
- New wiring introduced in this slice: `writeVerificationJSON` call added to auto.ts gate block; `evidence_block_missing` validator rule added to `observability-validator.ts`
- What remains before the milestone is truly usable end-to-end: S03 (retry loop), S04 (runtime errors), S05 (npm audit)

## Tasks

- [x] **T01: Create evidence writer module with JSON and markdown formatters** `est:25m`
  - Why: Foundation module — all other tasks depend on these pure functions existing. Covers R003 (structured evidence format).
  - Files: `src/resources/extensions/gsd/verification-evidence.ts`, `src/resources/extensions/gsd/tests/verification-evidence.test.ts`
  - Do: Create `verification-evidence.ts` with `writeVerificationJSON(result, tasksDir, taskId)` and `formatEvidenceTable(result)`. JSON output uses `schemaVersion: 1` and includes taskId, unitId, timestamp, passed, discoverySource, and checks array (command, exitCode, durationMs, verdict — no stdout/stderr to avoid unbounded size). Markdown table has columns: Check, Command, Exit Code, Verdict, Duration. Write comprehensive tests: JSON schema shape, all-pass case, mixed pass/fail, empty checks, directory creation when missing.
  - Verify: `npm run test:unit -- --test-name-pattern "verification-evidence"`
  - Done when: All evidence writer tests pass, module compiles cleanly

- [ ] **T02: Wire evidence writing into auto.ts and update template and prompt** `est:20m`
  - Why: Connects the evidence module to the runtime pipeline and gives agents the template to populate evidence tables. Covers R003 integration.
  - Files: `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/templates/task-summary.md`, `src/resources/extensions/gsd/prompts/execute-task.md`
  - Do: In the gate block in auto.ts (~line 1512), after `runVerificationGate()` returns, add a call to `writeVerificationJSON(result, tasksDir, tid)` where tasksDir is resolved from the already-parsed mid/sid using `resolveSlicePath`. Use `mkdirSync` with `{ recursive: true }` if the tasks dir doesn't exist. Add `## Verification Evidence` section to the task summary template between `## Verification` and `## Diagnostics`. Add instruction in execute-task prompt telling the agent to populate the evidence table from gate stderr output.
  - Verify: `npm run test:unit -- --test-name-pattern "verification-gate"` (28 tests still pass), `npx --yes tsx src/resources/extensions/gsd/auto.ts` compiles
  - Done when: Gate block calls writeVerificationJSON, template has evidence section, prompt has evidence instruction

- [ ] **T03: Add evidence block validator rule and integration tests** `est:20m`
  - Why: Closes R004 — the validator rejects summaries without evidence blocks, making the gate truly mandatory.
  - Files: `src/resources/extensions/gsd/observability-validator.ts`, `src/resources/extensions/gsd/tests/verification-evidence.test.ts`
  - Do: Add `evidence_block_missing` and `evidence_block_placeholder` rules to `validateTaskSummaryContent()` following the exact pattern of the existing `missing_diagnostics_section` / `diagnostics_placeholder_only` rules — use `getSection(content, "Verification Evidence", 2)` and `sectionLooksPlaceholderOnly()`. Severity: `"warning"` (matching existing rules). Add tests to the existing evidence test file verifying: summary with evidence section passes, summary without it triggers warning, summary with placeholder-only triggers warning.
  - Verify: `npm run test:unit -- --test-name-pattern "verification-evidence"`, `npm run test:unit` (no regressions)
  - Done when: Validator warns on missing/placeholder evidence sections, all existing tests pass

## Observability / Diagnostics

- **T##-VERIFY.json artifacts:** After a gate run, `ls .gsd/milestones/M001/slices/S##/tasks/T##-VERIFY.json` shows the persisted evidence file. `cat` it to inspect `schemaVersion`, `passed`, and per-check `verdict` fields.
- **Evidence table in summaries:** `grep "## Verification Evidence" .gsd/milestones/M001/slices/S##/tasks/T##-SUMMARY.md` confirms the section exists. The table renders in any markdown viewer.
- **Validator warnings:** Running the observability validator on a summary missing `## Verification Evidence` produces a `evidence_block_missing` or `evidence_block_placeholder` warning — visible in gate stderr output.
- **Failure visibility:** If `writeVerificationJSON` fails (e.g., disk full, permission error), it throws synchronously — the error propagates to the gate caller and is logged to stderr. The JSON file will be absent, which downstream agents can detect.
- **Redaction:** No secrets are present in evidence artifacts. stdout/stderr are excluded from JSON to avoid leaking environment variables or API keys that might appear in command output.

## Files Likely Touched

- `src/resources/extensions/gsd/verification-evidence.ts` (new)
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` (new)
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/templates/task-summary.md`
- `src/resources/extensions/gsd/prompts/execute-task.md`
- `src/resources/extensions/gsd/observability-validator.ts`
