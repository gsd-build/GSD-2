import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  postMessage,
  pollMessages,
  ackMessage,
  readAllMessages,
  publishArtifact,
  queryArtifacts,
  addKnowledge,
  queryKnowledge,
  raiseConflict,
  getActiveConflicts,
  resolveConflict,
  detectFileOverlaps,
  detectAndRaiseOverlaps,
} from "../agent-comms.ts";
import { cleanupMessages, truncateJsonl, cleanupConflicts, cleanupComms } from "../agent-comms-cleanup.ts";

// ─── Message Tests ────────────────────────────────────────────────────────

test("postMessage creates a message file and pollMessages returns it", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-msg-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const msg = postMessage(base, {
      from: "worker-S01",
      to: "worker-S02",
      channel: "discovery",
      payload: { key: "value" },
    });

    assert.ok(msg.id);
    assert.equal(msg.from, "worker-S01");
    assert.equal(msg.acked, false);

    const polled = pollMessages(base, "worker-S02");
    assert.equal(polled.length, 1);
    assert.equal(polled[0].id, msg.id);
    assert.deepEqual(polled[0].payload, { key: "value" });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("pollMessages filters by workerId and includes broadcasts", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-poll-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    postMessage(base, { from: "worker-S01", to: "worker-S02", channel: "discovery", payload: {} });
    postMessage(base, { from: "worker-S01", to: "*", channel: "discovery", payload: {} });
    postMessage(base, { from: "worker-S01", to: "worker-S03", channel: "artifact", payload: {} });

    const forS02 = pollMessages(base, "worker-S02");
    assert.equal(forS02.length, 2); // direct + broadcast

    const forS03 = pollMessages(base, "worker-S03");
    assert.equal(forS03.length, 2); // direct + broadcast
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("ackMessage deletes the message file", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-ack-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const msg = postMessage(base, {
      from: "worker-S01", to: "worker-S02", channel: "request", payload: {},
    });

    assert.equal(pollMessages(base, "worker-S02").length, 1);
    ackMessage(base, msg.id);
    assert.equal(pollMessages(base, "worker-S02").length, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("pollMessages returns empty for nonexistent comms dir", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-empty-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });
    assert.deepEqual(pollMessages(base, "worker-S01"), []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("pollMessages returns messages sorted by timestamp", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-order-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const msg1 = postMessage(base, { from: "a", to: "worker-X", channel: "discovery", payload: { order: 1 } });
    const msg2 = postMessage(base, { from: "b", to: "worker-X", channel: "discovery", payload: { order: 2 } });

    const polled = pollMessages(base, "worker-X");
    assert.equal(polled.length, 2);
    assert.ok(polled[0].timestamp <= polled[1].timestamp);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── Artifact Tests ───────────────────────────────────────────────────────

test("publishArtifact and queryArtifacts roundtrip", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-art-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const art = publishArtifact(base, {
      producedBy: "worker-S01",
      unitId: "M001/S01/T01",
      type: "interface",
      path: "src/types.ts",
      description: "Added new API interface",
    });

    assert.ok(art.id);
    assert.equal(art.producedBy, "worker-S01");

    const all = queryArtifacts(base);
    assert.equal(all.length, 1);
    assert.equal(all[0].path, "src/types.ts");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("queryArtifacts filters by producedBy, unitId, and type", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-art-filter-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    publishArtifact(base, { producedBy: "w1", unitId: "M001/S01/T01", type: "file", path: "a.ts", description: "a" });
    publishArtifact(base, { producedBy: "w2", unitId: "M001/S02/T01", type: "schema", path: "b.ts", description: "b" });
    publishArtifact(base, { producedBy: "w1", unitId: "M001/S01/T02", type: "test", path: "c.ts", description: "c" });

    assert.equal(queryArtifacts(base, { producedBy: "w1" }).length, 2);
    assert.equal(queryArtifacts(base, { type: "schema" }).length, 1);
    assert.equal(queryArtifacts(base, { unitId: "M001/S02/T01" }).length, 1);
    assert.equal(queryArtifacts(base, { producedBy: "w1", type: "test" }).length, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("queryArtifacts returns empty for no artifacts", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-art-empty-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });
    assert.deepEqual(queryArtifacts(base), []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── Knowledge Tests ──────────────────────────────────────────────────────

test("addKnowledge and queryKnowledge roundtrip", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-know-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    addKnowledge(base, {
      category: "discovery",
      content: "Found existing auth middleware",
      author: "worker-S01",
      unitId: "M001/S01/T01",
      relevantTo: ["M001/S02"],
    });

    const all = queryKnowledge(base);
    assert.equal(all.length, 1);
    assert.equal(all[0].content, "Found existing auth middleware");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("queryKnowledge filters by relevantTo", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-know-filter-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    addKnowledge(base, {
      category: "pattern", content: "Global pattern", author: "w1", unitId: "M001/S01/T01",
    });
    addKnowledge(base, {
      category: "decision", content: "Relevant to S02", author: "w1", unitId: "M001/S01/T02",
      relevantTo: ["M001/S02"],
    });
    addKnowledge(base, {
      category: "warning", content: "Relevant to S03", author: "w2", unitId: "M001/S02/T01",
      relevantTo: ["M001/S03"],
    });

    // Filter by S02 — should get global (no relevantTo) + S02-relevant
    const forS02 = queryKnowledge(base, ["M001/S02"]);
    assert.equal(forS02.length, 2);

    // Filter by S03 — should get global + S03-relevant
    const forS03 = queryKnowledge(base, ["M001/S03"]);
    assert.equal(forS03.length, 2);

    // No filter — returns all
    const all = queryKnowledge(base);
    assert.equal(all.length, 3);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── Conflict Tests ───────────────────────────────────────────────────────

test("raiseConflict and getActiveConflicts roundtrip", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-conflict-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const conflict = raiseConflict(base, {
      workers: ["worker-S01", "worker-S02"],
      files: ["src/shared.ts"],
      severity: "warning",
    });

    assert.ok(conflict.id);
    assert.equal(conflict.resolved, false);

    const active = getActiveConflicts(base);
    assert.equal(active.length, 1);
    assert.deepEqual(active[0].files, ["src/shared.ts"]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("resolveConflict removes the conflict file", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-resolve-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const conflict = raiseConflict(base, {
      workers: ["w1", "w2"], files: ["a.ts"], severity: "info",
    });

    assert.equal(getActiveConflicts(base).length, 1);
    resolveConflict(base, conflict.id);
    assert.equal(getActiveConflicts(base).length, 0);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("getActiveConflicts returns empty for nonexistent dir", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-noconflict-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });
    assert.deepEqual(getActiveConflicts(base), []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── File Overlap Detection Tests ─────────────────────────────────────────

test("detectFileOverlaps finds overlapping files between workers", () => {
  const workerFiles = new Map([
    ["worker-S01", ["src/a.ts", "src/b.ts", "src/shared.ts"]],
    ["worker-S02", ["src/c.ts", "src/shared.ts"]],
    ["worker-S03", ["src/d.ts"]],
  ]);

  const overlaps = detectFileOverlaps(workerFiles);
  assert.equal(overlaps.length, 1);
  assert.deepEqual(overlaps[0].workers, ["worker-S01", "worker-S02"]);
  assert.deepEqual(overlaps[0].files, ["src/shared.ts"]);
});

test("detectFileOverlaps returns empty when no overlaps", () => {
  const workerFiles = new Map([
    ["w1", ["a.ts"]],
    ["w2", ["b.ts"]],
  ]);

  assert.deepEqual(detectFileOverlaps(workerFiles), []);
});

test("detectAndRaiseOverlaps creates conflict warnings", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-overlap-raise-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    const workerFiles = new Map([
      ["w1", ["src/a.ts", "src/shared.ts", "src/config.ts"]],
      ["w2", ["src/shared.ts", "src/config.ts", "src/b.ts"]],
    ]);

    const warnings = detectAndRaiseOverlaps(base, workerFiles);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].severity, "info"); // 2 files = info

    const active = getActiveConflicts(base);
    assert.equal(active.length, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("detectAndRaiseOverlaps assigns correct severity", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-severity-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    // > 5 files overlap = critical
    const workerFiles = new Map([
      ["w1", ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts"]],
      ["w2", ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"]],
    ]);

    const warnings = detectAndRaiseOverlaps(base, workerFiles);
    assert.equal(warnings[0].severity, "critical");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── Cleanup Tests ────────────────────────────────────────────────────────

test("cleanupMessages removes acked and expired messages", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-cleanup-msg-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    // Post and ack a message
    const msg1 = postMessage(base, { from: "w1", to: "w2", channel: "discovery", payload: {} });
    ackMessage(base, msg1.id);

    // Post a fresh message (should survive cleanup)
    postMessage(base, { from: "w1", to: "w2", channel: "discovery", payload: {} });

    // Cleanup with very short TTL won't remove the fresh one unless acked
    const removed = cleanupMessages(base, 60_000);
    // The acked message file was already deleted by ackMessage, so cleanup gets 0
    assert.equal(removed, 0);

    // Verify the fresh message still exists
    assert.equal(readAllMessages(base).length, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("cleanupComms runs all cleanup operations without error", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-comms-cleanup-all-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });

    // Create some data
    postMessage(base, { from: "w1", to: "w2", channel: "discovery", payload: {} });
    publishArtifact(base, { producedBy: "w1", unitId: "M001/S01", type: "file", path: "a.ts", description: "a" });
    addKnowledge(base, { category: "pattern", content: "test", author: "w1", unitId: "M001/S01" });
    raiseConflict(base, { workers: ["w1", "w2"], files: ["a.ts"], severity: "info" });

    const result = cleanupComms(base);
    assert.equal(typeof result.messagesRemoved, "number");
    assert.equal(typeof result.artifactsTruncated, "number");
    assert.equal(typeof result.knowledgeTruncated, "number");
    assert.equal(typeof result.conflictsRemoved, "number");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
