import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getPriorSliceCompletionBlocker } from "../dispatch-guard.ts";

test("dispatch guard blocks when prior milestone has incomplete slices", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dispatch-guard-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M002"), { recursive: true });
    mkdirSync(join(repo, ".gsd", "milestones", "M003"), { recursive: true });

    writeFileSync(join(repo, ".gsd", "milestones", "M002", "M002-ROADMAP.md"),
      "# M002: Previous\n\n## Slices\n- [x] **S01: Done** `risk:low` `depends:[]`\n- [ ] **S02: Pending** `risk:low` `depends:[S01]`\n");
    writeFileSync(join(repo, ".gsd", "milestones", "M003", "M003-ROADMAP.md"),
      "# M003: Current\n\n## Slices\n- [ ] **S01: First** `risk:low` `depends:[]`\n- [ ] **S02: Second** `risk:low` `depends:[S01]`\n");

    assert.equal(
      getPriorSliceCompletionBlocker(repo, "main", "plan-slice", "M003/S01"),
      "Cannot dispatch plan-slice M003/S01: earlier slice M002/S02 is not complete.",
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch guard blocks later slice in same milestone when earlier incomplete", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dispatch-guard-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M002"), { recursive: true });
    mkdirSync(join(repo, ".gsd", "milestones", "M003"), { recursive: true });

    writeFileSync(join(repo, ".gsd", "milestones", "M002", "M002-ROADMAP.md"),
      "# M002: Previous\n\n## Slices\n- [x] **S01: Done** `risk:low` `depends:[]`\n- [x] **S02: Done** `risk:low` `depends:[S01]`\n");
    writeFileSync(join(repo, ".gsd", "milestones", "M003", "M003-ROADMAP.md"),
      "# M003: Current\n\n## Slices\n- [ ] **S01: First** `risk:low` `depends:[]`\n- [ ] **S02: Second** `risk:low` `depends:[S01]`\n");

    assert.equal(
      getPriorSliceCompletionBlocker(repo, "main", "execute-task", "M003/S02/T01"),
      "Cannot dispatch execute-task M003/S02/T01: earlier slice M003/S01 is not complete.",
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch guard allows dispatch when all earlier slices complete", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dispatch-guard-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M003"), { recursive: true });
    writeFileSync(join(repo, ".gsd", "milestones", "M003", "M003-ROADMAP.md"),
      "# M003: Current\n\n## Slices\n- [x] **S01: First** `risk:low` `depends:[]`\n- [ ] **S02: Second** `risk:low` `depends:[S01]`\n");

    assert.equal(getPriorSliceCompletionBlocker(repo, "main", "execute-task", "M003/S02/T01"), null);
    assert.equal(getPriorSliceCompletionBlocker(repo, "main", "plan-milestone", "M003"), null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("dispatch guard works without git repo", () => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-dispatch-guard-nogit-"));
  try {
    mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
    writeFileSync(join(repo, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# M001: Test\n\n## Slices\n- [x] **S01: Done** `risk:low` `depends:[]`\n- [ ] **S02: Pending** `risk:low` `depends:[S01]`\n");

    assert.equal(getPriorSliceCompletionBlocker(repo, "main", "plan-slice", "M001/S02"), null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
