// gsd-2 / Deep planning mode — Regression coverage for hasPendingDeepStage()
// being exported and consumed by the showSmartEntry deep-mode kickoff branch.
//
// Context: PR #5094 wires a deep-mode branch into showSmartEntry that calls
// hasPendingDeepStage() to decide whether to hand off to startAutoDetached().
// Without this guard, /gsd new-project --deep set the planning_depth flag but
// never actually triggered the staged interview because showSmartEntry fell
// straight through to the standard milestone wizard. These tests pin the
// exported contract so the kickoff branch can rely on it.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { hasPendingDeepStage } from "../auto-dispatch.ts";
import type { GSDPreferences } from "../preferences.ts";
import { loadEffectiveGSDPreferences } from "../preferences.ts";

function makeBase(): string {
  const base = join(tmpdir(), `gsd-deep-pending-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

const lightPrefs: GSDPreferences = { planning_depth: "light" } as GSDPreferences;
const deepPrefs: GSDPreferences = { planning_depth: "deep" } as GSDPreferences;

test("hasPendingDeepStage: returns false when prefs is undefined (light by omission)", () => {
  const base = makeBase();
  try {
    assert.equal(hasPendingDeepStage(undefined, base), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("hasPendingDeepStage: returns false in light mode regardless of artifacts", () => {
  const base = makeBase();
  try {
    assert.equal(hasPendingDeepStage(lightPrefs, base), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("hasPendingDeepStage: returns true in deep mode when nothing has been captured", () => {
  // Fresh project — no PREFERENCES.md frontmatter, no PROJECT.md, no
  // REQUIREMENTS.md, no research-decision marker. Every gate is pending.
  const base = makeBase();
  try {
    assert.equal(hasPendingDeepStage(deepPrefs, base), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("hasPendingDeepStage: returns true in deep mode when only some gates pass", () => {
  // workflow-preferences captured but PROJECT.md still missing.
  const base = makeBase();
  try {
    writeFileSync(
      join(base, ".gsd", "PREFERENCES.md"),
      "---\nplanning_depth: deep\nworkflow_prefs_captured: true\n---\n",
    );
    assert.equal(hasPendingDeepStage(deepPrefs, base), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// Regression test for the bug found while debugging /gsd new-project --deep:
// `planning_depth` was missing from KNOWN_PREFERENCE_KEYS, validatePreferences,
// and mergePreferences, so it was stripped on every load. The deep-mode flow
// silently never triggered because every dispatch saw planning_depth: undefined.
test("loadEffectiveGSDPreferences: planning_depth survives the validate + merge pipeline", () => {
  const base = makeBase();
  try {
    writeFileSync(
      join(base, ".gsd", "PREFERENCES.md"),
      "---\nplanning_depth: deep\n---\n",
    );
    const loaded = loadEffectiveGSDPreferences(base);
    assert.equal(
      loaded?.preferences?.planning_depth,
      "deep",
      "planning_depth must survive load — see KNOWN_PREFERENCE_KEYS, validatePreferences, mergePreferences",
    );
    // Cross-check: the dispatch helper reads loaded.preferences, so it must
    // see the same value. If planning_depth gets stripped anywhere in the
    // pipeline, hasPendingDeepStage returns false and the deep flow dies.
    assert.equal(hasPendingDeepStage(loaded?.preferences, base), true);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
