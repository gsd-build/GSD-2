/**
 * empty-catch-regression.test.ts — Regression test for #3169
 *
 * Verifies that no production source files contain empty catch blocks
 * that silently discard errors. Empty catches make production debugging
 * difficult because failures leave no trace even with GSD_DEBUG=1.
 *
 * Pattern: grep the patched files and assert zero matches.
 * Test fails before the fix (when empty catches exist) and passes after.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "../../../../../..");

function readFile(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf-8");
}

/** Returns true if the source text contains a bare `} catch {}` or `catch {}` block. */
function hasEmptyCatch(source: string): boolean {
  // Match: catch {} or catch (e) {} or catch(err){} — empty body with optional whitespace
  return /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(source);
}

const PATCHED_FILES = [
  "src/resources/extensions/mac-tools/index.ts",
  "src/resources/extensions/aws-auth/index.ts",
  "src/resources/extensions/gsd/auto.ts",
  "src/resources/extensions/gsd/gsd-db.ts",
  "src/headless.ts",
];

describe("empty catch regression (#3169)", () => {
  for (const filePath of PATCHED_FILES) {
    test(`${filePath} has no empty catch blocks`, () => {
      const source = readFile(filePath);
      assert.ok(
        !hasEmptyCatch(source),
        `Found empty catch {} in ${filePath} — errors are silently swallowed. ` +
        `Use debugLog() (GSD files) or if (process.env.GSD_DEBUG) console.error() (non-GSD files).`
      );
    });
  }

  test("GSD extension files use debugLog for catch logging", () => {
    const gsdFiles = [
      "src/resources/extensions/gsd/auto.ts",
      "src/resources/extensions/gsd/gsd-db.ts",
    ];
    for (const filePath of gsdFiles) {
      const source = readFile(filePath);
      // Verify debugLog is present (used for error surfacing)
      assert.ok(
        source.includes("debugLog"),
        `${filePath} should use debugLog() for error surfacing in catch blocks`
      );
    }
  });

  test("non-GSD files use GSD_DEBUG guard for catch logging", () => {
    const nonGsdFiles = [
      "src/resources/extensions/mac-tools/index.ts",
      "src/resources/extensions/aws-auth/index.ts",
      "src/headless.ts",
    ];
    for (const filePath of nonGsdFiles) {
      const source = readFile(filePath);
      assert.ok(
        source.includes("GSD_DEBUG"),
        `${filePath} should use if (process.env.GSD_DEBUG) for error surfacing in catch blocks`
      );
    }
  });
});
