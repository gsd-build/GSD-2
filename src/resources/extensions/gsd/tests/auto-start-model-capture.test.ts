import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(import.meta.dirname, "..", "auto-start.ts");
const source = readFileSync(sourcePath, "utf-8");

test("bootstrapAutoSession snapshots ctx.model before guided-flow entry (#2829)", () => {
  // The snapshot ordering guarantee still holds: build snapshot before guided-flow.
  const snapshotIdx = source.indexOf("const startModelSnapshot = manualSessionOverride");
  assert.ok(snapshotIdx > -1, "auto-start.ts should snapshot model at bootstrap start");

  const firstDiscussIdx = source.indexOf('await showSmartEntry(ctx, pi, base, { step: requestedStepMode });');
  assert.ok(firstDiscussIdx > -1, "auto-start.ts should route through showSmartEntry during guided flow");

  assert.ok(
    snapshotIdx < firstDiscussIdx,
    "auto-start.ts must capture the start model before guided-flow can mutate ctx.model",
  );
});

test("bootstrapAutoSession restores autoModeStartModel from the early snapshot (#2829)", () => {
  const assignmentIdx = source.indexOf("s.autoModeStartModel = {");
  assert.ok(assignmentIdx > -1, "auto-start.ts should assign autoModeStartModel");

  const snapshotRefIdx = source.indexOf("provider: startModelSnapshot.provider", assignmentIdx);
  assert.ok(snapshotRefIdx > -1, "autoModeStartModel should be restored from startModelSnapshot");
});

test("bootstrapAutoSession checks manual session override before preferences", () => {
  const manualIdx = source.indexOf("const manualSessionOverride = getSessionModelOverride(");
  assert.ok(manualIdx > -1, "auto-start.ts should read session model override first");

  // resolveDefaultSessionModel() should still be called for fallback behavior
  const preferredIdx = source.indexOf("const preferredModel = resolveDefaultSessionModel(");
  assert.ok(preferredIdx > -1, "auto-start.ts should call resolveDefaultSessionModel()");

  // Session provider should be passed for bare model ID resolution
  const withProviderIdx = source.indexOf("resolveDefaultSessionModel(ctx.model?.provider)");
  assert.ok(withProviderIdx > -1, "auto-start.ts should pass ctx.model?.provider for bare ID resolution");

  const snapshotIdx = source.indexOf("const startModelSnapshot = manualSessionOverride");
  assert.ok(snapshotIdx > -1, "startModelSnapshot should prefer manual session override");

  assert.ok(
    manualIdx < snapshotIdx && preferredIdx < snapshotIdx,
    "manual override and preference fallback must be resolved before building startModelSnapshot",
  );
});

test("bootstrapAutoSession validates preferred model against live registry auth (#unconfigured-models)", () => {
  // The raw PREFERENCES.md value must be validated against getAvailable()
  // before being captured as the snapshot, so an unconfigured provider
  // (no API key / OAuth) can't become autoModeStartModel.
  const validationIdx = source.indexOf("ctx.modelRegistry.getAvailable()");
  assert.ok(validationIdx > -1, "auto-start.ts should validate preferred model against getAvailable()");

  const resolveModelIdIdx = source.indexOf("resolveModelId");
  assert.ok(resolveModelIdIdx > -1, "auto-start.ts should resolve preferred model against the registry");

  const warningIdx = source.indexOf("is not configured; falling back to session default");
  assert.ok(warningIdx > -1, "auto-start.ts should warn when preferred model is unconfigured");
});
