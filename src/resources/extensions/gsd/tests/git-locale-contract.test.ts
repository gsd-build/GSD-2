import test from "node:test";
import assert from "node:assert/strict";

import { GIT_NO_PROMPT_ENV } from "../git-constants.ts";

test("GIT_NO_PROMPT_ENV forces git CLI locale to C", () => {
  assert.equal(GIT_NO_PROMPT_ENV.LC_ALL, "C");
  assert.equal(GIT_NO_PROMPT_ENV.GIT_TERMINAL_PROMPT, "0");
  assert.equal(GIT_NO_PROMPT_ENV.GIT_ASKPASS, "");
});

test("nativeMergeSquash fallback uses GIT_NO_PROMPT_ENV", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(__dirname, "..", "native-git-bridge.ts"), "utf-8");

  assert.match(
    source,
    /execFileSync\("git", \["merge", "--squash", branch\], \{[\s\S]*?env: GIT_NO_PROMPT_ENV,[\s\S]*?\}\);/,
    "nativeMergeSquash fallback should pass GIT_NO_PROMPT_ENV to git merge --squash",
  );
});

test("nativeAddAllWithExclusions still relies on the shared locale-forced git env", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(__dirname, "..", "native-git-bridge.ts"), "utf-8");

  assert.match(
    source,
    /execFileSync\("git", \["add", "-A", "--", \.\.\.pathspecs\], \{[\s\S]*?env: GIT_NO_PROMPT_ENV,[\s\S]*?\}\);/,
    "nativeAddAllWithExclusions should pass GIT_NO_PROMPT_ENV to git add -A",
  );
  assert.match(
    source,
    /ignored by one of your \.gitignore files/,
    "the ignored-path suppression still depends on deterministic English git output",
  );
});
