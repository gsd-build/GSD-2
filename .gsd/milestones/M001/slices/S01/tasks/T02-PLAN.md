---
estimated_steps: 4
estimated_files: 1
---

# T02: Add unit tests for verification gate

**Slice:** S01 — Built-in Verification Gate
**Milestone:** M001

## Description

Write comprehensive unit tests for the verification gate's command discovery and execution logic. These tests use temp directories with mock `package.json` files and real `spawnSync` of trivial commands (`echo`, `exit 1`) to verify the gate contract. Tests must prove all discovery paths, execution outcomes, and edge cases before the gate is wired into auto.ts.

## Steps

1. **Create test file** at `src/resources/extensions/gsd/tests/verification-gate.test.ts`. Use the project's test pattern:
   ```ts
   import { describe, it } from "node:test";
   import assert from "node:assert/strict";
   import { discoverCommands, runVerificationGate } from "../verification-gate.ts";
   ```
   The project uses Node's built-in test runner (`node:test`) with `--experimental-strip-types`. Use `describe`/`it` blocks with `assert` from `node:assert/strict`. The project also has `createTestContext()` from `./test-helpers.ts` but `describe`/`it` with `node:assert` is the more standard pattern and both work fine.

2. **Test command discovery** — Create temp dirs with `fs.mkdtempSync` and write mock `package.json` files:
   - Test: preference commands provided → returns those commands, source = "preference"
   - Test: no preference, taskPlanVerify = "npm test && npm run lint" → returns ["npm test", "npm run lint"], source = "task-plan"
   - Test: no preference, no verify field, package.json has `{ "scripts": { "typecheck": "tsc", "lint": "eslint .", "test": "vitest" } }` → returns ["npm run typecheck", "npm run lint", "npm run test"], source = "package-json"
   - Test: no preference, no verify, package.json has only `"build"` script (no typecheck/lint/test) → returns [], source = "none"
   - Test: no preference, no verify, no package.json → returns [], source = "none"
   - Test: first-non-empty-wins — preference provided AND package.json has scripts → preference wins, package.json not read
   - Test: package.json has only `"test"` but not `"typecheck"` or `"lint"` → returns only ["npm run test"]

3. **Test gate execution** — Use real commands that are available on any Unix system:
   - Test: all commands pass → `runVerificationGate` returns `{ passed: true, checks: [...] }` with exit code 0 for each. Use commands like `echo pass` or `true`.
   - Test: one command fails → gate returns `{ passed: false }` with the failing command having non-zero exit code. Use `exit 1` or `false` as the failing command. Other commands should still run (gate runs all, doesn't short-circuit).
   - Test: command not found → gate returns failure with exit code 127 or similar, stderr contains error message
   - Test: no commands discovered → gate returns `{ passed: true, checks: [], discoverySource: "none" }`

4. **Test preference validation** — Verify the new preference keys are accepted and validated:
   - Test: `verification_commands: ["npm test"]` produces no unknown-key warnings
   - Test: `verification_auto_fix: true` produces no unknown-key warnings
   - Test: `verification_max_retries: 2` produces no unknown-key warnings
   - Test: `verification_max_retries: -1` produces a validation error or warning

   Clean up temp dirs in `after()` / `afterEach()` hooks or use `{ recursive: true }` cleanup.

## Must-Haves

- [ ] Discovery tests: preference source, task-plan source, package-json source, no-source, first-non-empty-wins
- [ ] Execution tests: all pass, one fails (non-short-circuit), command not found, empty discovery
- [ ] Preference validation tests: new keys accepted, type validation works
- [ ] All tests use temp dirs — no hardcoded paths or side effects
- [ ] Tests pass with `npm run test:unit -- --test-name-pattern "verification-gate"`

## Verification

- `npm run test:unit -- --test-name-pattern "verification-gate"` — all tests pass
- `npm run test:unit` — all existing tests still pass (no regressions)

## Inputs

- `src/resources/extensions/gsd/verification-gate.ts` — T01 output: exports `discoverCommands` and `runVerificationGate`
- `src/resources/extensions/gsd/types.ts` — T01 output: `VerificationResult`, `VerificationCheck` interfaces
- `src/resources/extensions/gsd/preferences.ts` — T01 output: 3 new preference keys
- `src/resources/extensions/gsd/tests/test-helpers.ts` — existing test helpers (optional, can use node:assert instead)
- `src/resources/extensions/gsd/tests/preferences-schema-validation.test.ts` — reference for preference test patterns

## Observability Impact

- **Test output**: `npm run test:unit -- --test-name-pattern "verification-gate"` shows per-test pass/fail with names prefixed `verification-gate:`. A future agent can run this command to confirm the gate contract holds after any change to `verification-gate.ts` or `preferences.ts`.
- **Failure diagnostics**: Each test uses temp dirs with deterministic setup; failure messages include the actual vs expected values for commands, sources, exit codes, and stderr content. This makes root-cause visible in CI logs without re-running locally.
- **Regression signal**: The full suite (`npm run test:unit`) includes these tests, so any break to discovery order, spawnSync behavior, or preference validation surfaces as a named test failure in CI.

## Expected Output

- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — new test file with 12+ test cases covering discovery, execution, and preference validation
