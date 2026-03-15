import test from "node:test";
import assert from "node:assert/strict";
import { dirname } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { writeTempOutputFile } from "../resources/extensions/search-the-web/temp-output-file.ts";
import { getDisplayThinkingLevel } from "../resources/extensions/bg-shell/thinking-level.ts";

test("writeTempOutputFile persists truncated output to a temp file", async () => {
  const output = "full search results";
  const filePath = await writeTempOutputFile(output, { prefix: "web-search-test-" });

  assert.ok(filePath.startsWith(tmpdir()), "temp file should be created under the OS temp directory");
  assert.equal(await readFile(filePath, "utf8"), output);

  await rm(dirname(filePath), { recursive: true, force: true });
});

test("getDisplayThinkingLevel reads thinking state from the extension API", () => {
  const level = getDisplayThinkingLevel({
    getThinkingLevel() {
      return "high";
    },
  });

  assert.equal(level, "high");
});
