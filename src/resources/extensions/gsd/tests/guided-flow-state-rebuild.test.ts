import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function src(): string {
  return readFileSync(join(__dirname, "..", "guided-flow.ts"), "utf-8");
}

describe("guided-flow-state-rebuild", () => {
  test("rebuildState is imported from doctor in guided-flow", () => {
    const source = src();
    assert.ok(
      source.includes("rebuildState") && source.includes("./doctor.js"),
      "guided-flow must import rebuildState from doctor.js",
    );
  });

  test("showDiscuss calls rebuildState before deriveState", () => {
    const source = src();
    const fnStart = source.indexOf("export async function showDiscuss(");
    assert.ok(fnStart > 0, "showDiscuss must exist");
    const fnBody = source.slice(fnStart, fnStart + 2000);
    const rebuildIdx = fnBody.indexOf("rebuildState(");
    const deriveIdx = fnBody.indexOf("deriveState(");
    assert.ok(rebuildIdx > 0, "showDiscuss must call rebuildState");
    assert.ok(deriveIdx > 0, "showDiscuss must call deriveState");
    assert.ok(rebuildIdx < deriveIdx, "rebuildState must be called before deriveState in showDiscuss");
  });

  test("showSmartEntry calls rebuildState before deriveState", () => {
    const source = src();
    const fnStart = source.indexOf("export async function showSmartEntry(");
    assert.ok(fnStart > 0, "showSmartEntry must exist");
    const fnBody = source.slice(fnStart, fnStart + 6000);
    const rebuildIdx = fnBody.indexOf("rebuildState(");
    const deriveIdx = fnBody.indexOf("deriveState(");
    assert.ok(rebuildIdx > 0, "showSmartEntry must call rebuildState");
    assert.ok(deriveIdx > 0, "showSmartEntry must call deriveState");
    assert.ok(rebuildIdx < deriveIdx, "rebuildState must be called before deriveState in showSmartEntry");
  });

  test("showDiscuss does not call bare invalidateAllCaches before deriveState", () => {
    const source = src();
    const fnStart = source.indexOf("export async function showDiscuss(");
    assert.ok(fnStart > 0, "showDiscuss must exist");
    const fnBody = source.slice(fnStart, fnStart + 600);
    const invalidateIdx = fnBody.indexOf("invalidateAllCaches()");
    const rebuildIdx = fnBody.indexOf("rebuildState(");
    if (invalidateIdx > 0) {
      assert.ok(
        rebuildIdx > 0 && rebuildIdx < invalidateIdx,
        "if invalidateAllCaches appears in showDiscuss opening, rebuildState must precede it",
      );
    }
  });
});
