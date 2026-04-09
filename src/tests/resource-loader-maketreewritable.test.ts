/**
 * Regression test: initResources must NOT call makeTreeWritable on the
 * full agentDir — only the directories it actually syncs (extensions, agents).
 *
 * The bug: makeTreeWritable(agentDir) walks the entire ~/.gsd/agent/ tree,
 * including node_modules (33k+ files via symlink), blobs, compile-cache, etc.
 * This caused 60+ second boot hangs under memory pressure.
 *
 * The fix: syncResourceDir() already calls makeTreeWritable(destDir) before
 * and after copying each target directory, so the standalone call on agentDir
 * was redundant. It has been removed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const resourceLoaderPath = join(import.meta.dirname, "..", "resource-loader.ts");

test("initResources does not call makeTreeWritable on the full agentDir", () => {
  const src = readFileSync(resourceLoaderPath, "utf-8");

  // Extract the initResources function body
  const fnStart = src.indexOf("export function initResources(");
  assert.ok(fnStart > -1, "initResources must exist in resource-loader.ts");

  // Find the closing brace (track brace depth)
  let depth = 0;
  let fnEnd = -1;
  for (let i = src.indexOf("{", fnStart); i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") depth--;
    if (depth === 0) { fnEnd = i; break; }
  }
  assert.ok(fnEnd > fnStart, "initResources function body must be parseable");

  const fnBody = src.slice(fnStart, fnEnd + 1);

  // The redundant call was: makeTreeWritable(agentDir)
  // It must NOT appear in the function body.
  // syncResourceDir's internal calls (makeTreeWritable(destDir)) are fine —
  // they're inside syncResourceDir, not in initResources.
  const directCalls = fnBody.match(/makeTreeWritable\s*\(\s*agentDir\s*\)/g);
  assert.equal(
    directCalls,
    null,
    "initResources must NOT call makeTreeWritable(agentDir) — " +
    "syncResourceDir already handles writability for each target directory. " +
    "Calling it on agentDir walks node_modules (33k+ files), blobs, " +
    "compile-cache, etc. and causes 60+ second boot hangs.",
  );
});

test("syncResourceDir calls makeTreeWritable on its destDir argument", () => {
  const src = readFileSync(resourceLoaderPath, "utf-8");

  // Verify syncResourceDir has the pre-copy and post-copy makeTreeWritable calls
  const fnStart = src.indexOf("function syncResourceDir(");
  assert.ok(fnStart > -1, "syncResourceDir must exist");

  let depth = 0;
  let fnEnd = -1;
  for (let i = src.indexOf("{", fnStart); i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") depth--;
    if (depth === 0) { fnEnd = i; break; }
  }
  const fnBody = src.slice(fnStart, fnEnd + 1);

  const calls = fnBody.match(/makeTreeWritable\s*\(\s*destDir\s*\)/g);
  assert.ok(
    calls && calls.length >= 2,
    "syncResourceDir must call makeTreeWritable(destDir) at least twice " +
    "(pre-copy to unlock read-only files, post-copy to ensure next upgrade can overwrite)",
  );
});
