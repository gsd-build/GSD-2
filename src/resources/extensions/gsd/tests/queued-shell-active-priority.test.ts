import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { deriveStateFromDb } from "../state.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
} from "../gsd-db.ts";
import { invalidateAllCaches } from "../cache.ts";

describe("queued-shell-active-priority", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gsd-queued-priority-"));
    mkdirSync(join(tmp, ".gsd", "milestones"), { recursive: true });
    openDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase();
    invalidateAllCaches();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("queued shell with no slices does not eclipse subsequent active milestone", async () => {
    const m068Dir = join(tmp, ".gsd", "milestones", "M068");
    mkdirSync(m068Dir, { recursive: true });
    writeFileSync(join(m068Dir, "M068-ROADMAP.md"), "# M068: Placeholder\n\n## Slices\n");
    insertMilestone({ id: "M068", title: "Placeholder Shell", status: "queued" });

    const m070Dir = join(tmp, ".gsd", "milestones", "M070");
    mkdirSync(m070Dir, { recursive: true });
    writeFileSync(join(m070Dir, "M070-CONTEXT.md"), "# M070: Real Work\n\nContext here.");
    writeFileSync(
      join(m070Dir, "M070-ROADMAP.md"),
      "# M070: Real Work\n\n## Slices\n- [ ] **S01: First Slice** `risk:low` `depends:[]`\n  > After this: done.\n",
    );
    insertMilestone({ id: "M070", title: "Real Work", status: "active" });
    insertSlice({ id: "S01", milestoneId: "M070", title: "First Slice", status: "active", risk: "low", depends: [] });
    insertTask({ id: "T01", sliceId: "S01", milestoneId: "M070", title: "First Task", status: "pending" });

    invalidateAllCaches();
    const state = await deriveStateFromDb(tmp);

    assert.strictEqual(
      state.activeMilestone?.id,
      "M070",
      "M070 should be active — the queued shell M068 must not eclipse it",
    );

    const m068Entry = state.registry.find(e => e.id === "M068");
    assert.ok(m068Entry, "M068 should still appear in the registry");
    assert.strictEqual(m068Entry?.status, "pending", "M068 should be pending, not active");
  });

  test("queued shell with slices is still eligible to become active", async () => {
    const m001Dir = join(tmp, ".gsd", "milestones", "M001");
    mkdirSync(m001Dir, { recursive: true });
    writeFileSync(
      join(m001Dir, "M001-ROADMAP.md"),
      "# M001: Has Slices\n\n## Slices\n- [ ] **S01: Work** `risk:low` `depends:[]`\n  > After this: done.\n",
    );
    insertMilestone({ id: "M001", title: "Has Slices", status: "queued" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Work", status: "active", risk: "low", depends: [] });
    insertTask({ id: "T01", sliceId: "S01", milestoneId: "M001", title: "Task", status: "pending" });

    invalidateAllCaches();
    const state = await deriveStateFromDb(tmp);

    assert.strictEqual(
      state.activeMilestone?.id,
      "M001",
      "queued milestone with slices should be eligible to become active",
    );
  });
});
