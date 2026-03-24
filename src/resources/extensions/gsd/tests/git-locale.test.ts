/**
 * Regression tests for #1997: git locale not forced to C.
 *
 * Validates that GIT_NO_PROMPT_ENV includes LC_ALL=C so git always produces
 * English output, and that nativeMergeSquash passes the env to execFileSync.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { GIT_NO_PROMPT_ENV } from "../git-constants.ts";
import { nativeAddAllWithExclusions } from "../native-git-bridge.ts";
import { RUNTIME_EXCLUSION_PATHS } from "../git-service.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function initTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-locale-"));
  git(dir, "init");
  git(dir, "config", "user.email", "test@test.com");
  git(dir, "config", "user.name", "Test");
  // Initial commit so HEAD exists
  writeFileSync(join(dir, "init.txt"), "init");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "init");
  return dir;
}

function createFile(base: string, relPath: string, content: string): void {
  const full = join(base, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

async function main(): Promise<void> {
  // ─── GIT_NO_PROMPT_ENV includes LC_ALL=C ─────────────────────────────

  console.log("\n=== GIT_NO_PROMPT_ENV includes LC_ALL=C ===");

  assertEq(
    GIT_NO_PROMPT_ENV.LC_ALL,
    "C",
    "GIT_NO_PROMPT_ENV must set LC_ALL to 'C' to force English git output"
  );

  assertTrue(
    "GIT_TERMINAL_PROMPT" in GIT_NO_PROMPT_ENV,
    "GIT_NO_PROMPT_ENV still contains GIT_TERMINAL_PROMPT"
  );

  // ─── nativeAddAllWithExclusions: non-English locale does not throw ───

  console.log("\n=== nativeAddAllWithExclusions: non-English locale does not throw ===");

  {
    // Simulate what happens on a German system: .gsd is gitignored,
    // exclusion pathspecs trigger an advisory warning exit code 1.
    // With LC_ALL=C the English stderr guard should match and suppress.
    const repo = initTempRepo();

    writeFileSync(join(repo, ".gitignore"), ".gsd\n");
    createFile(repo, ".gsd/STATE.md", "# State");
    createFile(repo, "src/app.ts", "export const x = 1;");

    // Save original LC_ALL / LANG and force German locale env
    const origLcAll = process.env.LC_ALL;
    const origLang = process.env.LANG;
    process.env.LANG = "de_DE.UTF-8";
    delete process.env.LC_ALL;

    let threw = false;
    try {
      nativeAddAllWithExclusions(repo, RUNTIME_EXCLUSION_PATHS);
    } catch (e) {
      threw = true;
      console.error("  unexpected error:", e);
    }

    // Restore
    if (origLcAll !== undefined) process.env.LC_ALL = origLcAll;
    else delete process.env.LC_ALL;
    if (origLang !== undefined) process.env.LANG = origLang;
    else delete process.env.LANG;

    assertTrue(
      !threw,
      "nativeAddAllWithExclusions must not throw on non-English locale when .gsd is gitignored (#1997)"
    );

    const staged = git(repo, "diff", "--cached", "--name-only");
    assertTrue(staged.includes("src/app.ts"), "real file staged despite German locale");

    rmSync(repo, { recursive: true, force: true });
  }

  // ─── nativeMergeSquash: env is passed (merge-squash stderr is English) ─

  console.log("\n=== nativeMergeSquash fallback uses GIT_NO_PROMPT_ENV ===");

  {
    // We verify indirectly: the source code must pass env: GIT_NO_PROMPT_ENV.
    // Read the source and check for the pattern. This is a static check.
    const src = readFileSync(
      join(import.meta.dirname, "..", "native-git-bridge.ts"),
      "utf-8"
    );

    // Find the nativeMergeSquash function and check it uses GIT_NO_PROMPT_ENV
    const fnStart = src.indexOf("export function nativeMergeSquash");
    assertTrue(fnStart !== -1, "nativeMergeSquash function exists in source");

    const fnBody = src.slice(fnStart, src.indexOf("\nexport function", fnStart + 1));
    const hasEnv = fnBody.includes("env: GIT_NO_PROMPT_ENV");
    assertTrue(
      hasEnv,
      "nativeMergeSquash fallback must pass env: GIT_NO_PROMPT_ENV to execFileSync (#1997)"
    );
  }

  // ─── ALL production git call sites must use GIT_NO_PROMPT_ENV (#2294) ──

  console.log("\n=== ALL production git call sites use GIT_NO_PROMPT_ENV (#2294) ===");

  {
    // Static analysis: every production source file that calls
    // execFileSync("git" / execFile("git" / spawnSync("git" must either:
    //   a) pass env: GIT_NO_PROMPT_ENV in the options, OR
    //   b) spread EXEC_OPTS which itself includes env: GIT_NO_PROMPT_ENV
    //
    // This prevents regressions where new git call sites forget LC_ALL=C,
    // causing stderr checks to fail on non-English locales.

    const { readdirSync } = await import("node:fs");
    const { resolve: resolvePath } = await import("node:path");

    const srcDir = resolvePath(import.meta.dirname, "..");
    const sourceFiles = [
      "native-git-bridge.ts",
      "git-service.ts",
      "diff-context.ts",
      "auto-dashboard.ts",
      "auto-worktree.ts",
      "verification-gate.ts",
      "paths.ts",
      "repo-identity.ts",
      "gitignore.ts",
      "migrate-external.ts",
    ];

    const gitCallPattern = /(?:execFileSync|execFile|spawnSync)\(\s*"git"/g;

    for (const file of sourceFiles) {
      const filePath = join(srcDir, file);
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        continue; // File may not exist in all configurations
      }

      const lines = content.split("\n");

      // For each git call, verify the options object includes GIT_NO_PROMPT_ENV or LC_ALL
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!gitCallPattern.test(line)) {
          gitCallPattern.lastIndex = 0;
          continue;
        }
        gitCallPattern.lastIndex = 0;

        // Grab surrounding context (the options object may span multiple lines)
        const context = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");

        const hasLocaleEnv =
          context.includes("GIT_NO_PROMPT_ENV") ||
          context.includes("LC_ALL") ||
          context.includes("...EXEC_OPTS");

        assertTrue(
          hasLocaleEnv,
          `${file}:${i + 1} — git call must use GIT_NO_PROMPT_ENV (or LC_ALL) to ensure English output (#2294)`
        );
      }
    }
  }

  // ─── nativeCheckoutBranch fallback uses GIT_NO_PROMPT_ENV (#2294) ──

  console.log("\n=== nativeCheckoutBranch fallback uses GIT_NO_PROMPT_ENV (#2294) ===");

  {
    const src = readFileSync(
      join(import.meta.dirname, "..", "native-git-bridge.ts"),
      "utf-8"
    );
    const fnStart = src.indexOf("export function nativeCheckoutBranch");
    assertTrue(fnStart !== -1, "nativeCheckoutBranch function exists in source");

    const nextFnStart = src.indexOf("\nexport function", fnStart + 1);
    const fnBody = src.slice(fnStart, nextFnStart !== -1 ? nextFnStart : undefined);
    const hasEnv = fnBody.includes("env: GIT_NO_PROMPT_ENV");
    assertTrue(
      hasEnv,
      "nativeCheckoutBranch fallback must pass env: GIT_NO_PROMPT_ENV (#2294)"
    );
  }

  // ─── diff-context.ts uses GIT_NO_PROMPT_ENV (#2294) ───────────────────

  console.log("\n=== diff-context.ts uses GIT_NO_PROMPT_ENV (#2294) ===");

  {
    const src = readFileSync(
      join(import.meta.dirname, "..", "diff-context.ts"),
      "utf-8"
    );

    // EXEC_OPTS must include env: GIT_NO_PROMPT_ENV
    assertTrue(
      src.includes("GIT_NO_PROMPT_ENV"),
      "diff-context.ts must reference GIT_NO_PROMPT_ENV for locale-safe git calls (#2294)"
    );
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
