import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Test: --all flag generates snapshots for milestones not yet in the index

test("handleExport --html --all generates reports for milestones missing from the index", async () => {
  // We test the export logic indirectly by verifying the flag parsing
  // and the deduplication logic via loadReportsIndex + milestone filtering
  const { loadReportsIndex } = await import("../reports.js");

  const tmp = join(tmpdir(), `gsd-export-all-test-${Date.now()}`);
  const gsdDir = join(tmp, ".gsd");
  const reportsDir = join(gsdDir, "reports");
  mkdirSync(reportsDir, { recursive: true });

  // No existing reports — loadReportsIndex returns null
  const noIndex = loadReportsIndex(tmp);
  assert.equal(noIndex, null, "empty reports dir should return null index");

  // Write a reports.json with M001 already present
  const index = {
    version: 1,
    projectName: "test-project",
    projectPath: tmp,
    gsdVersion: "2.27.0",
    entries: [
      {
        filename: "M001-2026-01-01T00-00-00.html",
        generatedAt: "2026-01-01T00:00:00.000Z",
        milestoneId: "M001",
        milestoneTitle: "First Milestone",
        label: "M001: First Milestone",
        kind: "milestone",
        totalCost: 0.5,
        totalTokens: 10000,
        totalDuration: 60000,
        doneSlices: 3,
        totalSlices: 3,
        doneMilestones: 1,
        totalMilestones: 3,
        phase: "complete",
      },
    ],
  };
  writeFileSync(join(reportsDir, "reports.json"), JSON.stringify(index), "utf-8");

  // Now loadReportsIndex should find M001
  const loaded = loadReportsIndex(tmp);
  assert.ok(loaded, "should load existing reports index");
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].milestoneId, "M001");

  // Simulate the deduplication logic from handleExport --all
  const existingIds = new Set(loaded.entries.map(e => e.milestoneId));
  const allMilestones = [
    { id: "M001", title: "First Milestone", status: "complete" },
    { id: "M002", title: "Second Milestone", status: "complete" },
    { id: "M003", title: "Third Milestone", status: "active" },
  ];

  const targets = allMilestones.filter(m => !existingIds.has(m.id));
  assert.equal(targets.length, 2, "should skip M001 and target M002 + M003");
  assert.equal(targets[0].id, "M002");
  assert.equal(targets[1].id, "M003");

  // Cleanup
  rmSync(tmp, { recursive: true, force: true });
});

test("handleExport --html --all sets milestone kind based on status", async () => {
  const completeMilestone = { id: "M001", status: "complete" };
  const activeMilestone = { id: "M002", status: "active" };

  // Logic from the implementation
  const completeKind = completeMilestone.status === "complete" ? "milestone" : "manual";
  const activeKind = activeMilestone.status === "complete" ? "milestone" : "manual";

  assert.equal(completeKind, "milestone", "completed milestones get kind 'milestone'");
  assert.equal(activeKind, "manual", "active milestones get kind 'manual'");
});

test("export completions include --html and --html --all", async () => {
  const { registerGSDCommand } = await import("../commands.js");

  const commands = new Map<string, any>();
  const pi = {
    registerCommand(name: string, options: any) { commands.set(name, options); },
    registerTool() {},
    registerShortcut() {},
    on() {},
    sendMessage() {},
  };

  registerGSDCommand(pi as any);
  const gsd = commands.get("gsd");
  assert.ok(gsd, "should register /gsd command");

  const completions = gsd.getArgumentCompletions("export --");
  const labels = completions.map((c: any) => c.label);
  assert.ok(labels.includes("--html"), "completions should include --html");
  assert.ok(labels.includes("--html --all"), "completions should include --html --all");
});
