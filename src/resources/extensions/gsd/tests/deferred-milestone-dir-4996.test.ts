// GSD Extension — Regression test for #4996: deferred milestone dir creation
// Verifies that showHeadlessMilestoneCreation does not pre-create the milestone
// directory before the discuss flow runs. The dir should only appear after a
// writer (saveArtifactToDb / atomicWriteAsync) emits the first artifact.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { isReusableGhostMilestone } from "../state.ts";
import { nextMilestoneIdReserved } from "../milestone-id-reservation.ts";
import { clearReservedMilestoneIds, findMilestoneIds } from "../milestone-ids.ts";
import { invalidateAllCaches } from "../cache.ts";
import { closeDatabase, openDatabase } from "../gsd-db.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUIDED_FLOW_PATH = join(__dirname, "..", "guided-flow.ts");

function getShowHeadlessBody(): string {
  const source = readFileSync(GUIDED_FLOW_PATH, "utf-8");
  const fnStart = source.indexOf("export async function showHeadlessMilestoneCreation");
  assert.ok(fnStart > -1, "showHeadlessMilestoneCreation must exist in guided-flow.ts");
  const nextExport = source.indexOf("\nexport ", fnStart + 1);
  return source.slice(fnStart, nextExport === -1 ? source.length : nextExport);
}

function makeBase(prefix = "gsd-deferred-dir-"): string {
  const base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

describe("showHeadlessMilestoneCreation source guard (#4996)", () => {
  it("does not call mkdirSync in the headless milestone creation path", () => {
    const body = getShowHeadlessBody();
    assert.doesNotMatch(
      body,
      /\bmkdirSync\s*\(/,
      "showHeadlessMilestoneCreation must not pre-create milestone directories",
    );
  });

  it("does not call mkdir or mkdirp before dispatchWorkflow", () => {
    const body = getShowHeadlessBody();
    const dispatchIdx = body.indexOf("dispatchWorkflow");
    assert.ok(dispatchIdx > -1, "dispatchWorkflow must be present");

    const beforeDispatch = body.slice(0, dispatchIdx);
    assert.doesNotMatch(
      beforeDispatch,
      /\b(?:mkdir|mkdirp)\s*\(/,
      "showHeadlessMilestoneCreation must defer directory creation until artifact write",
    );
  });
});

describe("deferred milestone dir creation (#4996)", () => {
  let base: string;

  beforeEach(() => {
    clearReservedMilestoneIds();
  });

  afterEach(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    try { invalidateAllCaches(); } catch { /* ignore */ }
    try { clearReservedMilestoneIds(); } catch { /* ignore */ }
    try { rmSync(base, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("(a) fresh project: milestones dir has no M001 entry before any discuss flow", () => {
    base = makeBase();
    const nextId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);
    assert.equal(nextId, "M001", "reservation should choose M001 for a fresh project");

    const ids = findMilestoneIds(base);
    assert.equal(ids.length, 0, "no milestone dirs should exist before any discuss flow");

    // And specifically M001 should not exist
    const m001Dir = join(base, ".gsd", "milestones", "M001");
    assert.ok(!existsSync(m001Dir), "M001 dir must not exist before the discuss flow runs");
  });

  it("(b) abandoned discuss flow leaves no orphan: isReusableGhostMilestone returns false for non-existent dir", () => {
    base = makeBase();
    const nextId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);
    assert.equal(nextId, "M001", "reservation should not require a pre-created directory");

    const m001Dir = join(base, ".gsd", "milestones", "M001");
    assert.ok(!existsSync(m001Dir), "no M001 dir should exist");
    assert.equal(isReusableGhostMilestone(base, "M001"), false, "non-existent milestone should not be reusable");
    // findMilestoneIds only returns dirs that exist
    const ids = findMilestoneIds(base);
    assert.ok(!ids.includes("M001"), "M001 should not appear in findMilestoneIds when no dir exists");
  });

  it("(c) a stub dir left from a previous bug IS reusable but a newly-generated ID with no dir is not in the ghost list", () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    // Create a stub to represent a pre-existing phantom
    mkdirSync(join(base, ".gsd", "milestones", "M001", "slices"), { recursive: true });

    // isReusableGhostMilestone identifies the orphaned stub
    assert.ok(isReusableGhostMilestone(base, "M001"), "pre-existing stub should be identified as reusable ghost");
    const nextId = nextMilestoneIdReserved(findMilestoneIds(base), false, base);
    assert.equal(nextId, "M001", "reservation should reuse the pre-existing ghost");

    // The new ID (M002, which would be max+1 in this scenario but ghost reuse returns M001)
    // should not have a dir
    const m002Dir = join(base, ".gsd", "milestones", "M002");
    assert.ok(!existsSync(m002Dir), "a freshly-requested ID should have no dir until first artifact write");
  });
});
