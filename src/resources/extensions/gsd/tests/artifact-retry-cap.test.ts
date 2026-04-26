/**
 * artifact-retry-cap.test.ts — Regression tests for #2007.
 *
 * Three interacting bugs caused unbounded artifact-verification retry loops
 * that burned unlimited budget (202 dispatches observed in production):
 *
 * Bug 1: postUnitPreVerification in auto-post-unit.ts had no MAX check before
 *        returning "retry" when an expected artifact was missing. The attempt
 *        counter incremented forever.
 *
 * Bug 2: runDispatch in auto/phases.ts only pushed to loopState.recentUnits
 *        when pendingVerificationRetry was falsy, so the sliding-window stuck
 *        detector never saw artifact-retry dispatches and could not fire.
 *
 * Bug 3: MAX_UNIT_DISPATCHES and MAX_LIFETIME_DISPATCHES were exported from
 *        auto/session.ts but never compared against unitDispatchCount anywhere
 *        in the codebase — dead constants that provided false confidence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const dir = join(import.meta.dirname, "..");

const postUnitSrc = readFileSync(join(dir, "auto-post-unit.ts"), "utf-8");
const phasesSrc = readFileSync(join(dir, "auto", "phases.ts"), "utf-8");
const sessionSrc = readFileSync(join(dir, "auto", "session.ts"), "utf-8");
const autoSrc = readFileSync(join(dir, "auto.ts"), "utf-8");

function extractFunctionBody(source: string, functionName: string): string {
  const sourceFile = ts.createSourceFile(
    "auto-post-unit.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let body: ts.Block | undefined;

  function visit(node: ts.Node): void {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === functionName
    ) {
      body = node.body;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  assert.ok(body, `${functionName} must have a function body`);
  return source.slice(body.getStart(sourceFile) + 1, body.end - 1);
}

function extractStuckDetectionSection(source: string): string {
  const stuckSectionIdx = source.indexOf("Sliding-window stuck detection");
  assert.ok(stuckSectionIdx !== -1, "stuck-detection section must exist");

  const preDispatchIdx = source.indexOf("// Pre-dispatch hooks", stuckSectionIdx);
  assert.ok(preDispatchIdx !== -1, "pre-dispatch hooks section must follow stuck detection");

  return source.slice(stuckSectionIdx, preDispatchIdx);
}

const postUnitPreVerificationBody = extractFunctionBody(
  postUnitSrc,
  "postUnitPreVerification",
);

// ─── Bug 1: artifact retry must be bounded ───────────────────────────────────

test("#2007 bug 1: MAX_ARTIFACT_VERIFICATION_RETRIES constant is defined", () => {
  assert.ok(
    postUnitSrc.includes("MAX_ARTIFACT_VERIFICATION_RETRIES"),
    "auto-post-unit.ts must define MAX_ARTIFACT_VERIFICATION_RETRIES",
  );
});

test("#2007 bug 1: attempt is compared against MAX_ARTIFACT_VERIFICATION_RETRIES before returning retry", () => {
  const retryBlockIdx = postUnitPreVerificationBody.indexOf("const retryKey =");
  assert.ok(retryBlockIdx !== -1, "retry block must exist in postUnitPreVerification");

  const retryIdx = postUnitPreVerificationBody.indexOf("return \"retry\"", retryBlockIdx);
  assert.ok(retryIdx !== -1, "return \"retry\" must exist in postUnitPreVerification");

  const maxIdx = postUnitPreVerificationBody.indexOf(
    "if (attempt > MAX_ARTIFACT_VERIFICATION_RETRIES)",
    retryBlockIdx,
  );
  assert.ok(maxIdx !== -1, "retry block must compare attempt against MAX");
  assert.ok(
    maxIdx < retryIdx,
    "MAX_ARTIFACT_VERIFICATION_RETRIES check must appear before return \"retry\"",
  );
});

test("#2007 bug 1: exhaustion path pauses auto-mode instead of silently continuing", () => {
  const exhaustionIdx = postUnitPreVerificationBody.indexOf("phase: \"artifact-verify-exhausted\"");
  assert.ok(exhaustionIdx !== -1, "exhaustion branch must log artifact-verify-exhausted");

  const pauseIdx = postUnitPreVerificationBody.indexOf("await pauseAuto", exhaustionIdx);
  const dispatchedIdx = postUnitPreVerificationBody.indexOf("return \"dispatched\"", exhaustionIdx);

  assert.ok(
    pauseIdx !== -1 && dispatchedIdx !== -1 && pauseIdx < dispatchedIdx,
    "exhaustion branch must pause auto-mode before returning \"dispatched\"",
  );
});

test("#2007 bug 1: failure context message includes attempt count and max", () => {
  const failureContextIdx = postUnitPreVerificationBody.indexOf("failureContext:");
  assert.ok(failureContextIdx !== -1, "failureContext assignment must exist");
  assert.ok(
    postUnitPreVerificationBody.includes(
      "attempt ${attempt}/${MAX_ARTIFACT_VERIFICATION_RETRIES}",
      failureContextIdx,
    ),
    "failure context should include attempt progress (attempt/current-max)",
  );
});

// ─── Bug 2: stuck detection must see all dispatches ──────────────────────────

test("#2007 bug 2: recentUnits.push is unconditional — not gated on pendingVerificationRetry", () => {
  const stuckSection = extractStuckDetectionSection(phasesSrc);
  const pushIdx = stuckSection.indexOf("recentUnits.push");
  assert.ok(pushIdx !== -1, "recentUnits.push must exist in phases.ts");

  const pendingCheckIdx = stuckSection.indexOf("!s.pendingVerificationRetry");
  assert.ok(pendingCheckIdx !== -1, "pendingVerificationRetry guard must exist");

  // The push must come BEFORE the pendingVerificationRetry guard
  assert.ok(
    pushIdx < pendingCheckIdx,
    "recentUnits.push must be unconditional — it must appear before the !pendingVerificationRetry check",
  );
});

test("#2007 bug 2: detectStuck is still inside the pendingVerificationRetry guard", () => {
  // detectStuck should only run when NOT in a retry — to avoid false positives
  // during legitimate retries, but now the window is always populated.
  const stuckSection = extractStuckDetectionSection(phasesSrc);
  const pendingCheckIdx = stuckSection.indexOf("!s.pendingVerificationRetry");
  assert.ok(
    pendingCheckIdx !== -1,
    "pendingVerificationRetry guard must exist in the stuck-detection section",
  );
  const detectStuckIdx = stuckSection.indexOf("detectStuck(", pendingCheckIdx);

  assert.ok(
    detectStuckIdx !== -1 && detectStuckIdx > pendingCheckIdx,
    "detectStuck call must remain inside the !pendingVerificationRetry block",
  );
});

// ─── Bug 3: dead dispatch-limit constants removed ────────────────────────────

test("#2007 bug 3: MAX_UNIT_DISPATCHES is removed from session.ts", () => {
  assert.ok(
    !sessionSrc.includes("MAX_UNIT_DISPATCHES"),
    "MAX_UNIT_DISPATCHES was never enforced and must be removed to prevent false confidence",
  );
});

test("#2007 bug 3: MAX_LIFETIME_DISPATCHES is removed from session.ts", () => {
  assert.ok(
    !sessionSrc.includes("MAX_LIFETIME_DISPATCHES"),
    "MAX_LIFETIME_DISPATCHES was never enforced and must be removed to prevent false confidence",
  );
});

test("#2007 bug 3: dead constants are not re-exported from auto.ts", () => {
  assert.ok(
    !autoSrc.includes("MAX_UNIT_DISPATCHES"),
    "MAX_UNIT_DISPATCHES must not be re-exported from auto.ts",
  );
  assert.ok(
    !autoSrc.includes("MAX_LIFETIME_DISPATCHES"),
    "MAX_LIFETIME_DISPATCHES must not be re-exported from auto.ts",
  );
});

// ─── No stray dead constants left behind by the fix ──────────────────────────

test("#2007 fix does not introduce a new dead constant (STATE_REBUILD_MIN_INTERVAL_MS)", () => {
  // Bug 3 was about removing dead constants. A draft of this PR added
  // STATE_REBUILD_MIN_INTERVAL_MS without referencing it — the same anti-pattern
  // it set out to remove. Lock that down so it cannot regress.
  assert.ok(
    !postUnitSrc.includes("STATE_REBUILD_MIN_INTERVAL_MS"),
    "STATE_REBUILD_MIN_INTERVAL_MS was added but never referenced — must be removed",
  );
});

// ─── Behavioral: retry counter is cleared on success ─────────────────────────

test("#2007 verificationRetryCount is cleared on artifact verification success", () => {
  // Find the success-clear we just added: when triggerArtifactVerified is
  // true, the retry counter for the current unit must be deleted so a future
  // failure of the same unit type+id gets the full retry budget instead of
  // a stale leftover count.
  //
  // We assert on the structural shape because a behavioral test would need
  // to mock 30+ imports of postUnitPreVerification. The AutoSession-level
  // test below covers the Map contract.
  const successClearIdx = postUnitPreVerificationBody.indexOf(
    "if (triggerArtifactVerified)",
  );
  assert.ok(
    successClearIdx !== -1,
    "Must guard the retry-count clear behind a triggerArtifactVerified check",
  );
  const deleteIdx = postUnitPreVerificationBody.indexOf(
    "verificationRetryCount.delete",
    successClearIdx,
  );
  assert.ok(
    deleteIdx !== -1,
    "verificationRetryCount.delete must be called on the verification-success path",
  );
});

// ─── AutoSession.verificationRetryCount Map behavior ─────────────────────────

import { AutoSession } from "../auto/session.ts";

test("AutoSession.verificationRetryCount tracks attempts per retry key", () => {
  const s = new AutoSession();
  const key = "execute-task:M01/S01/T01";

  assert.equal(s.verificationRetryCount.get(key), undefined);

  s.verificationRetryCount.set(key, 1);
  assert.equal(s.verificationRetryCount.get(key), 1);

  s.verificationRetryCount.set(key, 2);
  assert.equal(s.verificationRetryCount.get(key), 2);

  // Simulate the success-clear path
  s.verificationRetryCount.delete(key);
  assert.equal(s.verificationRetryCount.get(key), undefined);
});

test("AutoSession.verificationRetryCount is cleared on session reset", () => {
  const s = new AutoSession();
  s.verificationRetryCount.set("execute-task:M01/S01/T01", 2);
  s.verificationRetryCount.set("plan-slice:M01/S02", 1);

  s.reset();

  assert.equal(s.verificationRetryCount.size, 0);
});

test("AutoSession.verificationRetryCount independence across retry keys", () => {
  // Critical: if retries for unit A fail twice and unit A then succeeds, the
  // counter for A should be cleared but B's counter must remain untouched.
  const s = new AutoSession();
  s.verificationRetryCount.set("execute-task:M01/S01/T01", 2);
  s.verificationRetryCount.set("execute-task:M01/S01/T02", 1);

  s.verificationRetryCount.delete("execute-task:M01/S01/T01");

  assert.equal(s.verificationRetryCount.get("execute-task:M01/S01/T01"), undefined);
  assert.equal(s.verificationRetryCount.get("execute-task:M01/S01/T02"), 1);
});
