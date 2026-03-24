import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getPriorSliceCompletionBlocker, getSliceDependencyBlocker } from "../dispatch-guard.ts";

// ─── Sequential blocker (existing behavior, parallel disabled) ────────────

test("sequential blocker: S03 blocked when S02 incomplete (no explicit deps needed)", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dg-seq-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
    writeFileSync(join(repo, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# M001: Test\n\n## Slices\n" +
      "- [x] **S01: Done** `risk:low` `depends:[]`\n" +
      "- [ ] **S02: Pending** `risk:low` `depends:[S01]`\n" +
      "- [ ] **S03: Also Pending** `risk:low` `depends:[S01]`\n");

    // Sequential blocker blocks S03 because S02 (earlier in order) is incomplete
    const blocker = getPriorSliceCompletionBlocker(repo, "main", "execute-task", "M001/S03/T01");
    assert.ok(blocker);
    assert.ok(blocker.includes("S02"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ─── Dependency-aware blocker (parallel enabled) ──────────────────────────

test("dependency blocker: S03 NOT blocked when S02 incomplete but S03 has no dep on S02", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dg-dep-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
    writeFileSync(join(repo, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# M001: Test\n\n## Slices\n" +
      "- [x] **S01: Done** `risk:low` `depends:[]`\n" +
      "- [ ] **S02: Pending** `risk:low` `depends:[S01]`\n" +
      "- [ ] **S03: Independent** `risk:low` `depends:[S01]`\n");

    // Dependency blocker only checks explicit deps — S03 depends on S01 (done), not S02
    const blocker = getSliceDependencyBlocker(repo, "main", "execute-task", "M001/S03/T01");
    assert.equal(blocker, null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dependency blocker: S03 IS blocked when it explicitly depends on S02 (incomplete)", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dg-dep-blocked-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
    writeFileSync(join(repo, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# M001: Test\n\n## Slices\n" +
      "- [x] **S01: Done** `risk:low` `depends:[]`\n" +
      "- [ ] **S02: Pending** `risk:low` `depends:[S01]`\n" +
      "- [ ] **S03: Depends on S02** `risk:low` `depends:[S02]`\n");

    // S03 explicitly depends on S02 which is incomplete
    const blocker = getSliceDependencyBlocker(repo, "main", "execute-task", "M001/S03/T01");
    assert.ok(blocker);
    assert.ok(blocker.includes("S02"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dependency blocker: cross-milestone blocking still works", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dg-cross-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
    mkdirSync(join(repo, ".gsd", "milestones", "M002"), { recursive: true });

    writeFileSync(join(repo, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# M001: First\n\n## Slices\n" +
      "- [x] **S01: Done** `risk:low` `depends:[]`\n" +
      "- [ ] **S02: Incomplete** `risk:low` `depends:[S01]`\n");

    writeFileSync(join(repo, ".gsd", "milestones", "M002", "M002-ROADMAP.md"),
      "# M002: Second\n\n## Slices\n" +
      "- [ ] **S01: Waiting** `risk:low` `depends:[]`\n");

    // M001/S02 is incomplete — blocks M002/S01 even with dependency-aware blocker
    const blocker = getSliceDependencyBlocker(repo, "main", "plan-slice", "M002/S01");
    assert.ok(blocker);
    assert.ok(blocker.includes("M001"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dependency blocker: skips non-slice dispatch types", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dg-skip-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
    // plan-milestone is not a slice dispatch type
    const blocker = getSliceDependencyBlocker(repo, "main", "plan-milestone", "M001");
    assert.equal(blocker, null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dependency blocker: parked milestones skipped", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dg-parked-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
    mkdirSync(join(repo, ".gsd", "milestones", "M002"), { recursive: true });

    writeFileSync(join(repo, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# M001: Parked\n\n## Slices\n- [ ] **S01: Incomplete** `risk:low` `depends:[]`\n");
    writeFileSync(join(repo, ".gsd", "milestones", "M001", "M001-PARKED.md"),
      "---\nparked_at: 2026-03-20\nreason: parked\n---\n");

    writeFileSync(join(repo, ".gsd", "milestones", "M002", "M002-ROADMAP.md"),
      "# M002: Active\n\n## Slices\n- [ ] **S01: Ready** `risk:low` `depends:[]`\n");

    // M001 is parked — should not block M002
    const blocker = getSliceDependencyBlocker(repo, "main", "plan-slice", "M002/S01");
    assert.equal(blocker, null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
