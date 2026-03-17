/**
 * Unit tests for the verification evidence module — JSON persistence and markdown table formatting.
 *
 * Tests cover:
 *   1. writeVerificationJSON writes correct JSON shape (schemaVersion, taskId, timestamp, passed, discoverySource, checks)
 *   2. writeVerificationJSON creates directory if it doesn't exist
 *   3. writeVerificationJSON maps exitCode to verdict correctly (0 = pass, non-zero = fail)
 *   4. writeVerificationJSON excludes stdout/stderr from output
 *   5. writeVerificationJSON handles empty checks array
 *   6. writeVerificationJSON accepts optional unitId
 *   7. formatEvidenceTable returns markdown table with correct columns for checks
 *   8. formatEvidenceTable returns "no checks" message for empty checks
 *   9. formatEvidenceTable formats duration as seconds with 1 decimal
 *  10. formatEvidenceTable uses ✅/❌ emoji for pass/fail verdict
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeVerificationJSON,
  formatEvidenceTable,
} from "../verification-evidence.ts";
import type { VerificationResult } from "../types.ts";

function makeTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeResult(overrides?: Partial<VerificationResult>): VerificationResult {
  return {
    passed: true,
    checks: [],
    discoverySource: "package-json",
    timestamp: 1710000000000,
    ...overrides,
  };
}

// ─── writeVerificationJSON Tests ─────────────────────────────────────────────

test("verification-evidence: writeVerificationJSON writes correct JSON shape", () => {
  const tmp = makeTempDir("ve-shape");
  try {
    const result = makeResult({
      passed: true,
      checks: [
        {
          command: "npm run typecheck",
          exitCode: 0,
          stdout: "all good",
          stderr: "",
          durationMs: 2340,
        },
      ],
    });

    writeVerificationJSON(result, tmp, "T03");

    const filePath = join(tmp, "T03-VERIFY.json");
    assert.ok(existsSync(filePath), "JSON file should exist");

    const json = JSON.parse(readFileSync(filePath, "utf-8"));
    assert.equal(json.schemaVersion, 1);
    assert.equal(json.taskId, "T03");
    assert.equal(json.unitId, "T03"); // defaults to taskId when unitId not provided
    assert.equal(json.timestamp, 1710000000000);
    assert.equal(json.passed, true);
    assert.equal(json.discoverySource, "package-json");
    assert.equal(json.checks.length, 1);
    assert.equal(json.checks[0].command, "npm run typecheck");
    assert.equal(json.checks[0].exitCode, 0);
    assert.equal(json.checks[0].durationMs, 2340);
    assert.equal(json.checks[0].verdict, "pass");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("verification-evidence: writeVerificationJSON creates directory if it doesn't exist", () => {
  const tmp = makeTempDir("ve-mkdir");
  const nested = join(tmp, "deep", "nested", "tasks");
  try {
    assert.ok(!existsSync(nested), "directory should not exist yet");

    writeVerificationJSON(makeResult(), nested, "T01");

    assert.ok(existsSync(nested), "directory should be created");
    assert.ok(existsSync(join(nested, "T01-VERIFY.json")), "JSON file should exist");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("verification-evidence: writeVerificationJSON maps exitCode to verdict correctly", () => {
  const tmp = makeTempDir("ve-verdict");
  try {
    const result = makeResult({
      passed: false,
      checks: [
        { command: "lint", exitCode: 0, stdout: "", stderr: "", durationMs: 100 },
        { command: "test", exitCode: 1, stdout: "", stderr: "fail", durationMs: 200 },
        { command: "audit", exitCode: 2, stdout: "", stderr: "err", durationMs: 300 },
      ],
    });

    writeVerificationJSON(result, tmp, "T02");

    const json = JSON.parse(readFileSync(join(tmp, "T02-VERIFY.json"), "utf-8"));
    assert.equal(json.checks[0].verdict, "pass");
    assert.equal(json.checks[1].verdict, "fail");
    assert.equal(json.checks[2].verdict, "fail");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("verification-evidence: writeVerificationJSON excludes stdout/stderr from output", () => {
  const tmp = makeTempDir("ve-no-stdio");
  try {
    const result = makeResult({
      checks: [
        {
          command: "echo hello",
          exitCode: 0,
          stdout: "hello\n",
          stderr: "some warning",
          durationMs: 50,
        },
      ],
    });

    writeVerificationJSON(result, tmp, "T01");

    const raw = readFileSync(join(tmp, "T01-VERIFY.json"), "utf-8");
    assert.ok(!raw.includes('"stdout"'), "JSON should not contain stdout key");
    assert.ok(!raw.includes('"stderr"'), "JSON should not contain stderr key");
    assert.ok(!raw.includes("hello\\n"), "JSON should not contain stdout value");
    assert.ok(!raw.includes("some warning"), "JSON should not contain stderr value");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("verification-evidence: writeVerificationJSON handles empty checks array", () => {
  const tmp = makeTempDir("ve-empty");
  try {
    writeVerificationJSON(makeResult({ checks: [] }), tmp, "T01");

    const json = JSON.parse(readFileSync(join(tmp, "T01-VERIFY.json"), "utf-8"));
    assert.equal(json.schemaVersion, 1);
    assert.equal(json.passed, true);
    assert.deepStrictEqual(json.checks, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("verification-evidence: writeVerificationJSON uses optional unitId when provided", () => {
  const tmp = makeTempDir("ve-unitid");
  try {
    writeVerificationJSON(makeResult(), tmp, "T03", "M001/S01/T03");

    const json = JSON.parse(readFileSync(join(tmp, "T03-VERIFY.json"), "utf-8"));
    assert.equal(json.taskId, "T03");
    assert.equal(json.unitId, "M001/S01/T03");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── formatEvidenceTable Tests ───────────────────────────────────────────────

test("verification-evidence: formatEvidenceTable returns markdown table with correct columns", () => {
  const result = makeResult({
    checks: [
      { command: "npm run typecheck", exitCode: 0, stdout: "", stderr: "", durationMs: 2340 },
      { command: "npm run lint", exitCode: 1, stdout: "", stderr: "err", durationMs: 1100 },
    ],
  });

  const table = formatEvidenceTable(result);
  const lines = table.split("\n");

  // Header row
  assert.ok(lines[0].includes("# |"), "header should have # column");
  assert.ok(lines[0].includes("Command"), "header should have Command column");
  assert.ok(lines[0].includes("Exit Code"), "header should have Exit Code column");
  assert.ok(lines[0].includes("Verdict"), "header should have Verdict column");
  assert.ok(lines[0].includes("Duration"), "header should have Duration column");

  // Separator row
  assert.ok(lines[1].includes("---|"), "should have separator row");

  // Data rows
  assert.equal(lines.length, 4, "header + separator + 2 data rows");
  assert.ok(lines[2].includes("npm run typecheck"), "first row command");
  assert.ok(lines[3].includes("npm run lint"), "second row command");
});

test("verification-evidence: formatEvidenceTable returns no-checks message for empty checks", () => {
  const result = makeResult({ checks: [] });
  const output = formatEvidenceTable(result);
  assert.equal(output, "_No verification checks discovered._");
});

test("verification-evidence: formatEvidenceTable formats duration as seconds with 1 decimal", () => {
  const result = makeResult({
    checks: [
      { command: "fast", exitCode: 0, stdout: "", stderr: "", durationMs: 150 },
      { command: "slow", exitCode: 0, stdout: "", stderr: "", durationMs: 2340 },
      { command: "zero", exitCode: 0, stdout: "", stderr: "", durationMs: 0 },
    ],
  });

  const table = formatEvidenceTable(result);
  assert.ok(table.includes("0.1s"), "150ms → 0.1s");
  assert.ok(table.includes("2.3s"), "2340ms → 2.3s");
  assert.ok(table.includes("0.0s"), "0ms → 0.0s");
});

test("verification-evidence: formatEvidenceTable uses ✅/❌ emoji for pass/fail verdict", () => {
  const result = makeResult({
    passed: false,
    checks: [
      { command: "pass-cmd", exitCode: 0, stdout: "", stderr: "", durationMs: 100 },
      { command: "fail-cmd", exitCode: 1, stdout: "", stderr: "", durationMs: 200 },
    ],
  });

  const table = formatEvidenceTable(result);
  assert.ok(table.includes("✅ pass"), "passing check should have ✅ pass");
  assert.ok(table.includes("❌ fail"), "failing check should have ❌ fail");
});
