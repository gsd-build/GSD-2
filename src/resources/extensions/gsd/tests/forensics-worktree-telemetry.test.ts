/**
 * Tests for the #4764 forensics integration — verifies that
 * buildForensicReport picks up worktree telemetry aggregates and emits
 * anomalies for orphans and auto-exits with unmerged work.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  emitWorktreeOrphaned,
  emitAutoExit,
  emitWorktreeCreated,
  emitWorktreeMerged,
} from "../worktree-telemetry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsdDir = join(__dirname, "..");

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-for-tel-test-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

describe("#4764 forensics + worktree telemetry integration", () => {
  const forensicsSrc = readFileSync(join(gsdDir, "forensics.ts"), "utf-8");

  it("forensics.ts imports the telemetry summarizer", () => {
    assert.ok(
      forensicsSrc.includes("summarizeWorktreeTelemetry"),
      "forensics must consume the telemetry aggregator",
    );
  });

  it("forensics.ts does NOT call queryJournal directly (memory guard)", () => {
    // The same invariant guarded by forensics-journal.test.ts — re-asserted
    // here so this feature change doesn't regress it.
    assert.ok(
      !forensicsSrc.includes("queryJournal("),
      "forensics.ts must route journal reads through aggregators, not queryJournal",
    );
  });

  it("ForensicReport includes worktreeTelemetry field", () => {
    assert.ok(
      forensicsSrc.includes("worktreeTelemetry"),
      "report shape must include the telemetry summary",
    );
  });

  it("formatReportForPrompt gates Worktree Telemetry section on signal", () => {
    assert.ok(
      forensicsSrc.includes("Worktree Telemetry"),
      "prompt formatter must include a Worktree Telemetry section",
    );
  });

  it("new anomaly types worktree-orphan and worktree-unmerged-exit exist on the union", () => {
    assert.ok(forensicsSrc.includes('"worktree-orphan"'));
    assert.ok(forensicsSrc.includes('"worktree-unmerged-exit"'));
  });

  it("buildForensicReport surfaces worktree-orphan anomaly when the journal shows an in-progress orphan", async () => {
    const base = makeTmpBase();
    try {
      // Seed the journal with one in-progress orphan event
      emitWorktreeOrphaned(base, "M001", {
        reason: "in-progress-unmerged",
        commitsAhead: 3,
        worktreeDirExists: true,
      });

      const { buildForensicReport } = await import("../forensics.ts");
      const report = await buildForensicReport(base);

      const orphanAnomalies = report.anomalies.filter(a => a.type === "worktree-orphan");
      assert.ok(orphanAnomalies.length >= 1, `expected a worktree-orphan anomaly; got ${JSON.stringify(report.anomalies.map(a => a.type))}`);
      assert.equal(orphanAnomalies[0].severity, "warning", "in-progress orphan should be a warning");

      // Aggregate fields surface in the telemetry summary
      assert.ok(report.worktreeTelemetry, "report should carry the telemetry summary");
      assert.equal(report.worktreeTelemetry!.orphansDetected, 1);
      assert.equal(report.worktreeTelemetry!.orphansByReason["in-progress-unmerged"], 1);
    } finally { cleanup(base); }
  });

  it("buildForensicReport surfaces worktree-unmerged-exit anomaly when auto-exit left work unmerged", async () => {
    const base = makeTmpBase();
    try {
      emitAutoExit(base, { reason: "pause", milestoneId: "M002", milestoneMerged: false });
      emitAutoExit(base, { reason: "stop", milestoneId: "M002", milestoneMerged: false });
      emitAutoExit(base, { reason: "all-complete", milestoneId: "M001", milestoneMerged: true });

      const { buildForensicReport } = await import("../forensics.ts");
      const report = await buildForensicReport(base);

      const unmergedExitAnomalies = report.anomalies.filter(a => a.type === "worktree-unmerged-exit");
      assert.equal(unmergedExitAnomalies.length, 1, "exactly one aggregate unmerged-exit anomaly");
      assert.equal(unmergedExitAnomalies[0].severity, "warning");
      assert.ok(
        unmergedExitAnomalies[0].summary.includes("2"),
        "summary should mention the count (2 unmerged exits out of 3 total)",
      );

      assert.equal(report.worktreeTelemetry!.exitsWithUnmergedWork, 2);
    } finally { cleanup(base); }
  });

  it("buildForensicReport emits no telemetry anomalies when there are no signals", async () => {
    const base = makeTmpBase();
    try {
      // Healthy path — worktree created and merged without incident
      emitWorktreeCreated(base, "M001");
      emitWorktreeMerged(base, "M001", {
        reason: "milestone-complete",
        durationMs: 250,
        conflict: false,
      });
      emitAutoExit(base, { reason: "all-complete", milestoneId: "M001", milestoneMerged: true });

      const { buildForensicReport } = await import("../forensics.ts");
      const report = await buildForensicReport(base);

      const telemetryAnomalies = report.anomalies.filter(a =>
        a.type === "worktree-orphan" || a.type === "worktree-unmerged-exit"
      );
      assert.deepStrictEqual(telemetryAnomalies, [], "no orphans, no unmerged exits → no telemetry anomalies");

      assert.equal(report.worktreeTelemetry!.worktreesCreated, 1);
      assert.equal(report.worktreeTelemetry!.worktreesMerged, 1);
      assert.equal(report.worktreeTelemetry!.orphansDetected, 0);
      assert.equal(report.worktreeTelemetry!.exitsWithUnmergedWork, 0);
    } finally { cleanup(base); }
  });
});
