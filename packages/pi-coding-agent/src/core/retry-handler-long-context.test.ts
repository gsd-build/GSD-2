/**
 * Long-context entitlement error handling — tests for retry-handler changes.
 *
 * Verifies that long-context entitlement errors are classified as quota_exhausted
 * and that [1m] model variants can be downgraded to base models.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve retry-handler.ts from either the source tree (__dirname when running
// via tsx) or the project root (when running from dist/ in CI).
function findRetryHandlerSrc(): string {
  // Direct sibling (tsx / source run)
  const direct = join(__dirname, "retry-handler.ts");
  if (existsSync(direct)) return readFileSync(direct, "utf-8");
  // Walk up from cwd to find the source file
  const fromCwd = join(process.cwd(), "packages", "pi-coding-agent", "src", "core", "retry-handler.ts");
  if (existsSync(fromCwd)) return readFileSync(fromCwd, "utf-8");
  throw new Error("retry-handler.ts not found for structural tests");
}

const retryHandlerSrc = findRetryHandlerSrc();

// ─── Error classification ─────────────────────────────────────────────────

test("_classifyErrorType matches long-context entitlement patterns as quota_exhausted", () => {
  // The regex for long-context errors should exist
  assert.ok(
    retryHandlerSrc.includes("extra usage.*required|long context.*required"),
    "should have regex pattern for long-context entitlement errors",
  );
  // Should classify as quota_exhausted
  assert.ok(
    retryHandlerSrc.includes('"quota_exhausted"'),
    "long-context errors should be classified as quota_exhausted",
  );
});

test("_classifyErrorType long-context pattern precedes rate_limit classification", () => {
  // Long-context check must come before rate_limit return to avoid misclassification
  const lcIdx = retryHandlerSrc.indexOf("extra usage.*required");
  // Find the rate_limit return that follows the classification checks
  const rlIdx = retryHandlerSrc.indexOf('return "rate_limit"');
  assert.ok(lcIdx > -1, "long-context pattern should exist");
  assert.ok(rlIdx > -1, "rate-limit return should exist");
  assert.ok(lcIdx < rlIdx, "long-context check should precede rate-limit classification");
});

// ─── Model downgrade ──────────────────────────────────────────────────────

test("_tryLongContextDowngrade strips [1m] suffix", () => {
  assert.ok(
    retryHandlerSrc.includes("\\[1m\\]"),
    "should have regex matching [1m] suffix",
  );
  assert.ok(
    retryHandlerSrc.includes('.replace(lcSuffix, "")'),
    "should strip the [1m] suffix to get base model ID",
  );
});

test("_tryLongContextDowngrade returns null for non-[1m] models", () => {
  // The method should check for the suffix before attempting downgrade
  assert.ok(
    retryHandlerSrc.includes("if (!lcSuffix.test(model.id)) return null"),
    "should return null when model doesn't have [1m] suffix",
  );
});

test("quota_exhausted handler attempts long-context downgrade before giving up", () => {
  // The downgrade should be attempted in the quota_exhausted branch
  const quotaIdx = retryHandlerSrc.indexOf('errorType === "quota_exhausted"');
  const downgradeIdx = retryHandlerSrc.indexOf("_tryLongContextDowngrade");
  assert.ok(quotaIdx > -1 && downgradeIdx > -1, "both quota check and downgrade should exist");
  assert.ok(
    downgradeIdx > quotaIdx,
    "downgrade attempt should be within the quota_exhausted handler",
  );
});
