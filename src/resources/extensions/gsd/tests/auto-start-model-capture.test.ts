import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(import.meta.dirname, "..", "auto-start.ts");
const source = readFileSync(sourcePath, "utf-8");

test("bootstrapAutoSession snapshots ctx.model before guided-flow entry (#2829)", () => {
  const snapshotIdx = source.indexOf("const startModelSnapshot = ctx.model");
  assert.ok(snapshotIdx > -1, "auto-start.ts should snapshot ctx.model at bootstrap start");

  const firstDiscussIdx = source.indexOf('await showSmartEntry(ctx, pi, base, { step: requestedStepMode, onAutoStart });');
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
