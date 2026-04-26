/**
 * Behavioural regression tests for #2892.
 *
 * When the DB is open but empty (e.g. after crash/truncation),
 * getMilestoneSlices() returns []. The fix in showDiscuss() falls back to
 * parsing slices from the on-disk ROADMAP file instead of declaring "all
 * slices are complete." These tests pin the parser contract that the
 * fallback depends on: incomplete checkboxes (`[ ]`) yield `done=false`
 * slices and completed checkboxes (`[x]`) yield `done=true`.
 *
 * The earlier source-grep / regex-on-showDiscuss-body tests (audit verdicts
 * SOURCE_GREP / POSITIONAL — see #4826/#4829) were dropped; they pinned a
 * specific surface form rather than behaviour.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseRoadmapSlices } from "../roadmap-slices.ts";

const SAMPLE_ROADMAP = `# M012 Roadmap

## Slices
- [ ] **S01: Core setup** \`risk:low\` \`depends:[]\`
  > After this: basic project scaffolding works
- [ ] **S02: Auth module** \`risk:medium\` \`depends:[S01]\`
  > After this: users can log in
- [ ] **S03: Dashboard** \`risk:low\` \`depends:[S02]\`
  > After this: dashboard renders
`;

describe("discuss-empty-db-fallback parser contract (#2892)", () => {
  test("parseRoadmapSlices extracts slices from a valid ROADMAP", () => {
    const slices = parseRoadmapSlices(SAMPLE_ROADMAP);
    assert.strictEqual(slices.length, 3, "should parse 3 slices from sample roadmap");
    const ids = slices.map(s => s.id).sort();
    assert.deepStrictEqual(ids, ["S01", "S02", "S03"]);
  });

  test("incomplete checkboxes yield done=false (so fallback shows them as pending)", () => {
    const slices = parseRoadmapSlices(SAMPLE_ROADMAP);
    assert.ok(
      slices.every(s => s.done === false),
      "all 3 incomplete roadmap slices must be done=false — otherwise the empty-DB fallback would falsely report them complete (#2892)",
    );
  });

  test("completed checkboxes yield done=true; mixed roadmap surfaces only the open slices as pending", () => {
    const completedRoadmap = `# M012 Roadmap

## Slices
- [x] **S01: Core setup** \`risk:low\` \`depends:[]\`
  > After this: basic project scaffolding works
- [ ] **S02: Auth module** \`risk:medium\` \`depends:[S01]\`
  > After this: users can log in
- [x] **S03: Dashboard** \`risk:low\` \`depends:[S02]\`
  > After this: dashboard renders
`;
    const slices = parseRoadmapSlices(completedRoadmap);
    const pendingIds = slices.filter(s => !s.done).map(s => s.id);
    assert.deepStrictEqual(pendingIds, ["S02"], "only S02 should be reported as pending");
  });
});
