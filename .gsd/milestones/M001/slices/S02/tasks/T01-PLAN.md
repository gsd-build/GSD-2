---
estimated_steps: 5
estimated_files: 2
---

# T01: Create evidence writer module with JSON and markdown formatters

**Slice:** S02 — Structured Evidence Format
**Milestone:** M001

## Description

Create `verification-evidence.ts` as a pure module with two exported functions: `writeVerificationJSON()` for persisting a machine-readable JSON artifact, and `formatEvidenceTable()` for generating a markdown evidence table. These are the foundation for all evidence formatting in S02 — downstream tasks wire them into the runtime pipeline and validator.

The JSON schema uses `schemaVersion: 1` for forward-compatibility (S04 will add `runtimeErrors`, S05 will add `auditResults`). stdout/stderr are intentionally excluded from the JSON to avoid unbounded file sizes — the full output is in `VerificationResult` in memory and logged to stderr during the gate run.

## Steps

1. Create `src/resources/extensions/gsd/verification-evidence.ts` with two functions:
   - `writeVerificationJSON(result: VerificationResult, tasksDir: string, taskId: string)`: Writes `T##-VERIFY.json` to `tasksDir`. Creates the directory with `mkdirSync({ recursive: true })` if it doesn't exist. JSON shape:
     ```json
     {
       "schemaVersion": 1,
       "taskId": "T03",
       "unitId": "M001/S01/T03",
       "timestamp": 1710000000000,
       "passed": true,
       "discoverySource": "package-json",
       "checks": [
         {
           "command": "npm run typecheck",
           "exitCode": 0,
           "durationMs": 2340,
           "verdict": "pass"
         }
       ]
     }
     ```
     Note: `unitId` should be constructed from context if possible, but since only `taskId` is passed, accept an optional `unitId?: string` parameter. The `verdict` field is derived: `exitCode === 0 ? "pass" : "fail"`.
   - `formatEvidenceTable(result: VerificationResult)`: Returns a markdown string. If `result.checks` is empty, return a note like `_No verification checks discovered._`. Otherwise return a table:
     ```
     | # | Command | Exit Code | Verdict | Duration |
     |---|---------|-----------|---------|----------|
     | 1 | npm run typecheck | 0 | ✅ pass | 2.3s |
     | 2 | npm run lint | 1 | ❌ fail | 1.1s |
     ```
     Duration should be formatted as seconds with 1 decimal (e.g. `2340` → `2.3s`).

2. Create `src/resources/extensions/gsd/tests/verification-evidence.test.ts` with tests:
   - `writeVerificationJSON` writes correct JSON shape (schemaVersion, taskId, timestamp, passed, discoverySource, checks)
   - `writeVerificationJSON` creates directory if it doesn't exist
   - `writeVerificationJSON` maps exitCode to verdict correctly (0 = pass, non-zero = fail)
   - `writeVerificationJSON` excludes stdout/stderr from output
   - `writeVerificationJSON` handles empty checks array
   - `formatEvidenceTable` returns markdown table with correct columns for checks
   - `formatEvidenceTable` returns "no checks" message for empty checks
   - `formatEvidenceTable` formats duration as seconds with 1 decimal
   - `formatEvidenceTable` uses ✅/❌ emoji for pass/fail verdict

3. Use the same test patterns as `verification-gate.test.ts`: `node:test`, `node:assert/strict`, temp dir isolation with `mkdtempSync` + `rmSync` cleanup.

4. Verify the module compiles: `npx --yes tsx src/resources/extensions/gsd/verification-evidence.ts`

5. Run tests: `npm run test:unit -- --test-name-pattern "verification-evidence"`

## Must-Haves

- [ ] `writeVerificationJSON` writes correctly-shaped JSON with `schemaVersion: 1`
- [ ] `writeVerificationJSON` creates tasks directory if missing
- [ ] `writeVerificationJSON` excludes stdout/stderr from JSON output
- [ ] `formatEvidenceTable` returns a 5-column markdown table
- [ ] All tests pass

## Verification

- `npm run test:unit -- --test-name-pattern "verification-evidence"` — all tests pass
- `npx --yes tsx src/resources/extensions/gsd/verification-evidence.ts` — compiles cleanly
- `npm run test:unit -- --test-name-pattern "verification-gate"` — 28 S01 tests still pass (no regressions)

## Inputs

- `src/resources/extensions/gsd/types.ts` — `VerificationResult` and `VerificationCheck` interfaces (import these for type safety)
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — test pattern reference (temp dir isolation, node:test, node:assert/strict)
- S01 summary's Forward Intelligence: `VerificationResult` shape is `{ passed, checks[], discoverySource, timestamp }`. Each `VerificationCheck` has `{ command, exitCode, stdout, stderr, durationMs }`.

## Observability Impact

- **New artifact:** `T##-VERIFY.json` files written to `tasksDir` — inspect with `cat` to see `schemaVersion`, `passed`, `checks[].verdict`. Absence of the file after a gate run indicates `writeVerificationJSON` was not called or threw.
- **New diagnostic surface:** `formatEvidenceTable()` output can be piped to stderr or embedded in summaries. An empty-checks case returns `_No verification checks discovered._` rather than an empty table, making the state unambiguous.
- **Failure state:** `writeVerificationJSON` throws on fs errors (EACCES, ENOSPC). The error message includes the target path for diagnosis. No silent failures — the gate caller sees the exception.
- **What future agents inspect:** Check `T##-VERIFY.json` exists and has `schemaVersion: 1`. Verify `checks` array length matches expected command count. Confirm no `stdout`/`stderr` keys in the JSON (they are intentionally excluded).

## Expected Output

- `src/resources/extensions/gsd/verification-evidence.ts` — new module with `writeVerificationJSON` and `formatEvidenceTable` exports
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` — new test file with 8+ tests covering JSON shape, directory creation, table formatting, edge cases
