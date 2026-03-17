# S03: Auto-Fix Retry Loop — Research

**Date:** 2026-03-17

## Summary

S03 is straightforward integration work. The verification gate (`runVerificationGate()`) already runs after every execute-task and logs pass/fail, but currently the unit still completes regardless of gate outcome. The retry loop needs to: (1) detect gate failure, (2) prevent the unit from completing, (3) re-dispatch the same execute-task with failure context injected into the prompt, and (4) do this up to `verification_max_retries` times (default 2) before failing permanently.

All the building blocks exist: `VerificationResult` has structured failure details (command, exitCode, stderr per check), `verification_auto_fix` and `verification_max_retries` preferences are defined/validated/merged but not consumed, the dispatch loop in `auto.ts` already has a prompt injection mechanism for retries (`pendingCrashRecovery` pattern at line ~2841), and `dispatchNextUnit` already handles re-dispatching the same unit via the `unitDispatchCount` tracking. The work is wiring these pieces together in `handleAgentEnd`.

## Recommendation

Implement the retry loop directly in the gate block in `handleAgentEnd` (auto.ts, starting around line 1491). When the gate fails and `verification_auto_fix` is enabled (default true), store the failure context in a module-level variable (`pendingVerificationRetry`), skip the post-unit hooks and DB dual-write, and return early from `handleAgentEnd` — which triggers `dispatchNextUnit` on the same unit. In `dispatchNextUnit`, inject the stored failure context into the prompt (same pattern as `pendingCrashRecovery`). Track retry count in a module-level Map keyed by unitId.

This approach is simpler and more reliable than using the hook engine's `retry_on` mechanism, which requires artifact files and hook configuration. The retry loop is a built-in behavior of the gate (per D001 — gate is hardcoded, not using hook engine).

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/auto.ts` — **Primary change site.** The gate block at line ~1491 needs retry logic: when `result.passed === false` and auto-fix is enabled and retries remain, store failure context and return early (skip DB dual-write, skip post-unit hooks). The `dispatchNextUnit` function at line ~2841 already has prompt injection for retries — add a parallel path for verification failure context. Module-level state needed: `pendingVerificationRetry: { unitId: string; failureContext: string; attempt: number } | null` and `verificationRetryCount: Map<string, number>`.
- `src/resources/extensions/gsd/verification-gate.ts` — **Minor addition.** Add a `formatFailureContext(result: VerificationResult): string` helper that formats failed check details (command, exit code, stderr excerpt) into a prompt-injectable block. This keeps formatting logic out of auto.ts.
- `src/resources/extensions/gsd/verification-evidence.ts` — **Minor extension.** Add optional `retryAttempt` and `maxRetries` fields to `EvidenceJSON` so the final T##-VERIFY.json records how many retries occurred. The `writeVerificationJSON` function gains optional `retryAttempt`/`maxRetries` params.
- `src/resources/extensions/gsd/types.ts` — **No changes needed.** `VerificationResult` is already sufficient — it carries all the failure data S03 needs.
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — **Extend.** Add tests for `formatFailureContext` (formatting, truncation, edge cases).
- `src/resources/extensions/gsd/tests/verification-retry.test.ts` — **New file.** Unit tests for the retry state management logic. Cannot integration-test the full handleAgentEnd flow (it requires ExtensionContext), but can test the pure functions: formatting, retry count tracking, evidence writing with retry fields.

### Build Order

1. **T01: `formatFailureContext` + retry evidence fields.** Add `formatFailureContext()` to `verification-gate.ts`. Extend `EvidenceJSON` with optional `retryAttempt`/`maxRetries`. Write tests. This is pure function work with no integration risk — unblocks T02.

2. **T02: Retry loop wiring in `handleAgentEnd` + prompt injection in `dispatchNextUnit`.** Wire the retry loop into auto.ts: module-level state, gate block changes (early return on failure with retries remaining, permanent fail when exhausted), prompt injection in `dispatchNextUnit`, evidence writing with retry attempt number. Reset retry state when the gate passes or when retries are exhausted. This is the integration task — depends on T01.

### Verification Approach

- `npm run test:unit -- --test-name-pattern "verification"` — all existing 28 gate tests + new evidence tests still pass, plus new retry tests pass.
- `grep -n "pendingVerificationRetry\|verificationRetryCount\|formatFailureContext" src/resources/extensions/gsd/auto.ts` — confirms the retry state variables and prompt injection are wired.
- `grep -n "retryAttempt\|maxRetries" src/resources/extensions/gsd/verification-evidence.ts` — confirms evidence fields were added.
- Code review confirms: when gate fails with retries remaining, `handleAgentEnd` returns early (no DB dual-write, no post-unit hooks, no marking unit complete). When gate passes or retries exhausted, normal flow continues.
- Code review confirms: retry state is reset in `stopAuto` and `pauseAuto` to prevent stale state across sessions.

## Constraints

- The gate block in `handleAgentEnd` must return early without executing the DB dual-write or post-unit hooks sections below it — otherwise the unit gets marked complete and the task advances despite verification failure.
- Retry context injected into the prompt must be capped to prevent OOM (follow the existing `MAX_RECOVERY_CHARS = 50_000` pattern).
- The `pendingVerificationRetry` state must be cleared in `stopAuto` and any state-reset path to prevent stale retry context from leaking into unrelated sessions.
- `verification_auto_fix` defaults to `true` (undefined treated as enabled) per R005 — most failures are fixable. `verification_max_retries` defaults to `2`.
- The retry must NOT use the hook engine's `retry_on` mechanism — per D001, the gate is hardcoded and separate from user hooks.

## Common Pitfalls

- **Forgetting to skip post-unit hooks on retry** — If the retry path falls through to the post-unit hooks section, hook dispatch could advance state or mark the unit complete, making the retry impossible. The retry path must `return` from `handleAgentEnd` before reaching hooks.
- **Not resetting retry state on gate pass** — If a retry succeeds (gate passes on attempt 2), the retry count and pending context must be cleared. Otherwise the next task inherits stale retry state.
- **Evidence JSON overwrite on retry** — Each retry attempt overwrites T##-VERIFY.json. The final write should have the correct `retryAttempt` number. Only write evidence on the final attempt (pass or exhausted), or write on every attempt with the current attempt number (simpler, last write wins).
- **unitDispatchCount collision** — `dispatchNextUnit` already tracks dispatch counts for artifact-missing retries (up to `MAX_UNIT_DISPATCHES = 4`). The verification retry count is separate from this — verification retries happen within a single "dispatch" (the unit is re-dispatched but the artifact-missing counter shouldn't conflict because the summary artifact doesn't exist yet during execute-task).
