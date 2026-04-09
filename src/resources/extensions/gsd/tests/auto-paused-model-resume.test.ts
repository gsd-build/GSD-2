import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_TS_PATH = join(__dirname, "..", "auto.ts");
const source = readFileSync(AUTO_TS_PATH, "utf-8");

test("pauseAuto persists model snapshots in paused-session.json", () => {
  assert.ok(
    source.includes("autoModeStartModel: s.autoModeStartModel"),
    "pauseAuto must persist autoModeStartModel in paused-session.json",
  );
  assert.ok(
    source.includes("originalModelId: s.originalModelId"),
    "pauseAuto must persist originalModelId in paused-session.json",
  );
  assert.ok(
    source.includes("originalModelProvider: s.originalModelProvider"),
    "pauseAuto must persist originalModelProvider in paused-session.json",
  );
});

test("pauseAuto restores the user's original model while paused", () => {
  assert.ok(
    /paused-model restore failed/.test(source),
    "pauseAuto should attempt to restore the original model and log failures",
  );
  assert.ok(
    /await pi\.setModel\(original, \{ persist: false \}\)/.test(source),
    "pauseAuto must restore the original model with persist:false so paused interaction returns to the user's model",
  );
});

test("resume path restores model snapshots from paused-session metadata", () => {
  assert.ok(
    source.includes("meta.autoModeStartModel") && source.includes("s.autoModeStartModel = {"),
    "startAuto resume path must restore autoModeStartModel from paused-session.json",
  );
  assert.ok(
    source.includes("meta.originalModelProvider") && source.includes("s.originalModelProvider = meta.originalModelProvider"),
    "startAuto resume path must restore originalModelProvider from paused-session.json",
  );
  assert.ok(
    source.includes("meta.originalModelId") && source.includes("s.originalModelId = meta.originalModelId"),
    "startAuto resume path must restore originalModelId from paused-session.json",
  );
});

test("user-initiated resume refreshes the auto model snapshot from the current session model", () => {
  assert.ok(
    /if \("newSession" in ctx && typeof \(ctx as any\)\.newSession === "function"\)[\s\S]{0,500}s\.autoModeStartModel = \{[\s\S]{0,120}provider: ctx\.model\.provider,[\s\S]{0,120}id: ctx\.model\.id/.test(source),
    "user-initiated resume must refresh autoModeStartModel from ctx.model so model switches while paused actually stick",
  );
});
