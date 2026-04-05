/**
 * deriveStateFromDb must NOT return phase: 'blocked' when a milestone's
 * ROADMAP has no real slice entries. Two scenarios trigger this:
 *
 * 1. Placeholder roadmap — the roadmap file exists but the slices section
 *    contains only placeholder text. The DB may have stale slice rows from
 *    a previous draft. Without the fix, the stale rows bypass the zero-slice
 *    guard and the dep-eligibility loop finds nothing → 'blocked'.
 *
 * 2. Stale DB rows after roadmap replacement — a milestone was previously
 *    planned with real slices, the roadmap was later replaced with a
 *    placeholder, but the DB rows were not cleaned up. Same result.
 *
 * Expected: when the ROADMAP on disk has zero parsed slices,
 * deriveStateFromDb must return phase: 'pre-planning' regardless of what
 * the DB contains.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { deriveStateFromDb, invalidateStateCache } from "../state.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
} from "../gsd-db.ts";

// ─── Fixture helpers ───────────────────────────────────────────────────────────

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-blocked-empty-roadmap-"));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

function writeGsd(base: string, rel: string, content: string): void {
  const full = join(base, ".gsd", rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

// Roadmap with only placeholder text in the slices section — no slice entries
const PLACEHOLDER_ROADMAP = [
  "# M002: Next Milestone",
  "",
  "**Vision:** Build the next thing.",
  "",
  "## Success Criteria",
  "- The thing works.",
  "",
  "## Slices",
  "",
  "_To be planned when this milestone becomes active._",
].join("\n");

// Roadmap with real slices that have an unresolvable circular dependency
const CIRCULAR_DEP_ROADMAP = [
  "# M002: Next Milestone",
  "",
  "**Vision:** Build the next thing.",
  "",
  "## Slices",
  "",
  "- [ ] **S01: Alpha** `risk:low` `depends:[S02]`",
  "- [ ] **S02: Beta** `risk:low` `depends:[S01]`",
].join("\n");

// ─── Tests ────────────────────────────────────────────────────────────────────

test("placeholder roadmap with stale DB slices → pre-planning, not blocked", async (t) => {
  const base = makeBase();
  t.after(() => { closeDatabase(); rmSync(base, { recursive: true, force: true }); });

  writeGsd(base, "milestones/M001/M001-SUMMARY.md", "# M001: Done\nstatus: complete\n");
  writeGsd(base, "milestones/M002/M002-CONTEXT.md", "# M002: Next Milestone\n");
  writeGsd(base, "milestones/M002/M002-ROADMAP.md", PLACEHOLDER_ROADMAP);

  openDatabase(":memory:");
  insertMilestone({ id: "M001", title: "Done Milestone", status: "complete", depends_on: [] });
  insertMilestone({ id: "M002", title: "Next Milestone", status: "active", depends_on: [] });

  // Stale slice rows from a previous roadmap draft — these must not trigger 'blocked'
  insertSlice({ id: "S01", milestoneId: "M002", title: "Stale Slice A", status: "pending", depends: ["S00"] });
  insertSlice({ id: "S02", milestoneId: "M002", title: "Stale Slice B", status: "pending", depends: ["S01"] });

  invalidateStateCache();
  const state = await deriveStateFromDb(base);

  assert.equal(state.phase, "pre-planning", "stale DB slices + placeholder roadmap must yield pre-planning");
  assert.equal(state.activeMilestone?.id, "M002", "M002 must be the active milestone");
  assert.equal(state.activeSlice, null, "no active slice expected");
});

test("milestone transition with empty-slice roadmap → pre-planning, not blocked", async (t) => {
  const base = makeBase();
  t.after(() => { closeDatabase(); rmSync(base, { recursive: true, force: true }); });

  // M001 is complete (summary exists on disk)
  writeGsd(base, "milestones/M001/M001-SUMMARY.md", "# M001: Done\nstatus: complete\n");
  // M002 has a roadmap that the LLM left as placeholder during M001
  writeGsd(base, "milestones/M002/M002-CONTEXT.md", "# M002: Next Milestone\n");
  writeGsd(base, "milestones/M002/M002-ROADMAP.md", PLACEHOLDER_ROADMAP);

  openDatabase(":memory:");
  insertMilestone({ id: "M001", title: "Done Milestone", status: "complete", depends_on: [] });
  insertMilestone({ id: "M002", title: "Next Milestone", status: "active", depends_on: [] });
  // No slices in DB for M002 (clean state after milestone transition)

  invalidateStateCache();
  const state = await deriveStateFromDb(base);

  assert.equal(state.phase, "pre-planning", "empty-slice roadmap after milestone transition must yield pre-planning");
  assert.equal(state.activeMilestone?.id, "M002");
});

test("genuinely blocked milestone (circular deps, real slices) stays blocked", async (t) => {
  const base = makeBase();
  t.after(() => { closeDatabase(); rmSync(base, { recursive: true, force: true }); });

  writeGsd(base, "milestones/M001/M001-CONTEXT.md", "# M001: Real Milestone\n");
  writeGsd(base, "milestones/M001/M001-ROADMAP.md", CIRCULAR_DEP_ROADMAP);

  openDatabase(":memory:");
  insertMilestone({ id: "M001", title: "Real Milestone", status: "active", depends_on: [] });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Alpha", status: "pending", depends: ["S02"] });
  insertSlice({ id: "S02", milestoneId: "M001", title: "Beta", status: "pending", depends: ["S01"] });

  invalidateStateCache();
  const state = await deriveStateFromDb(base);

  assert.equal(state.phase, "blocked", "circular deps with real roadmap slices must stay blocked");
  assert.ok(state.blockers.length > 0, "blockers must be non-empty for a genuinely blocked milestone");
});
