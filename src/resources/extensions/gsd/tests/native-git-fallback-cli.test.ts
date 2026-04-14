/**
 * Regression test for #4180: command-string git fallbacks break on Windows.
 * The fallback path should use argv-based git execution for repo checks,
 * commits, and hard resets.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "..", "native-git-bridge.ts"), "utf-8");

function section(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end);
}

describe("native git fallback uses argv-based execution (#4180)", () => {
  test("nativeIsRepo avoids execSync command strings", () => {
    const block = section(
      "export function nativeIsRepo",
      "export function nativeHasStagedChanges",
    );
    assert.doesNotMatch(block, /execSync\(/, "nativeIsRepo should not shell out with execSync");
    assert.match(
      block,
      /gitFileExec\(basePath,\s*\["rev-parse",\s*"--git-dir"\],\s*true\)/,
      "nativeIsRepo should use argv-based git execution",
    );
  });

  test("nativeCommit uses execFileSync with argv", () => {
    const block = section(
      "export function nativeCommit",
      "export function nativeCheckoutBranch",
    );
    assert.doesNotMatch(block, /execSync\(/, "nativeCommit should not shell out with execSync");
    assert.match(
      block,
      /execFileSync\("git",\s*args,/,
      "nativeCommit should use execFileSync with argv",
    );
  });

  test("nativeResetHard avoids execSync command strings", () => {
    const block = section(
      "export function nativeResetHard",
      "export function nativeResetSoft",
    );
    assert.doesNotMatch(block, /execSync\(/, "nativeResetHard should not shell out with execSync");
    assert.match(
      block,
      /gitFileExec\(basePath,\s*\["reset",\s*"--hard",\s*"HEAD"\],\s*true\)/,
      "nativeResetHard should use argv-based git execution",
    );
  });
});
