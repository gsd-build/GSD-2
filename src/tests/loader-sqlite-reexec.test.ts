import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loaderPath = resolve(__dirname, "..", "loader.ts");

describe("loader sqlite re-exec guard", () => {
  it("loader.ts contains the __GSD_SQLITE_REEXEC loop guard", () => {
    const source = readFileSync(loaderPath, "utf-8");
    // The guard must check the env var to prevent infinite re-exec loops
    assert.ok(
      source.includes("__GSD_SQLITE_REEXEC"),
      "loader.ts must reference __GSD_SQLITE_REEXEC env var as a loop guard",
    );
  });

  it("re-exec block is guarded by nodeMajor < 24", () => {
    const source = readFileSync(loaderPath, "utf-8");
    // The re-exec must only trigger on Node <24 where node:sqlite is experimental
    assert.ok(
      source.includes("nodeMajor < 24"),
      "re-exec block must be guarded by nodeMajor < 24",
    );
  });

  it("re-exec block checks process.execArgv for --experimental-sqlite", () => {
    const source = readFileSync(loaderPath, "utf-8");
    assert.ok(
      source.includes("--experimental-sqlite"),
      "re-exec block must check for --experimental-sqlite flag",
    );
  });

  it("re-exec does not loop when __GSD_SQLITE_REEXEC is set", () => {
    // Simulate the re-exec scenario: if the env var is set, the guard should
    // prevent another re-exec. We verify this by checking that running the
    // loader with the env var set does not hang (would hang on infinite loop).
    const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
    if (nodeMajor >= 24) {
      // On Node 24+, the re-exec block is skipped entirely — test is vacuous
      return;
    }
    // Run loader --version with the reexec guard already set — should exit quickly
    const result = execFileSync(
      process.execPath,
      ["--experimental-strip-types", loaderPath, "--version"],
      {
        env: { ...process.env, __GSD_SQLITE_REEXEC: "1" },
        timeout: 5000,
        encoding: "utf-8",
      },
    );
    // Should print version and exit, not loop
    assert.ok(result.trim().length > 0, "loader should print version and exit");
  });
});
