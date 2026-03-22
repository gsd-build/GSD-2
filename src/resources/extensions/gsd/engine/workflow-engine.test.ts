// GSD Extension — WorkflowEngine Unit Tests
// Tests for engine creation, typed query methods, and deriveState().
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import {
  WorkflowEngine,
  getEngine,
  isEngineAvailable,
  resetEngine,
} from "../workflow-engine.ts";
import type { MilestoneRow, SliceRow, TaskRow } from "../workflow-engine.ts";

describe("WorkflowEngine", () => {
  beforeEach(() => {
    resetEngine();
    openDatabase(":memory:");
  });

  afterEach(() => {
    resetEngine();
    closeDatabase();
  });

  it("Test 1: constructor does not throw with open in-memory DB", () => {
    const engine = new WorkflowEngine("/tmp/test");
    assert.ok(engine, "Engine should be created");
  });

  it("Test 2: getTask returns null for nonexistent task", () => {
    const engine = new WorkflowEngine("/tmp/test");
    const result = engine.getTask("M001", "S01", "T99");
    assert.strictEqual(result, null);
  });

  it("Test 3: getTask returns typed result after inserting row via raw SQL", () => {
    const engine = new WorkflowEngine("/tmp/test");
    const db = _getAdapter()!;
    db.prepare(
      `INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, seq)
       VALUES ('T01', 'S01', 'M001', 'Test Task', 'A description', 'pending', '1h', '[]', 1)`,
    ).run();

    const task = engine.getTask("M001", "S01", "T01");
    assert.ok(task, "Task should be found");
    assert.strictEqual(task!.id, "T01");
    assert.strictEqual(task!.slice_id, "S01");
    assert.strictEqual(task!.milestone_id, "M001");
    assert.strictEqual(task!.title, "Test Task");
    assert.strictEqual(task!.description, "A description");
    assert.strictEqual(task!.status, "pending");
    assert.strictEqual(task!.estimate, "1h");
    assert.strictEqual(task!.files, "[]");
    assert.strictEqual(task!.seq, 1);
  });

  it("Test 4: getTasks returns empty array when no tasks exist", () => {
    const engine = new WorkflowEngine("/tmp/test");
    const tasks = engine.getTasks("M001", "S01");
    assert.deepStrictEqual(tasks, []);
  });

  it("Test 5: getSlice returns null for nonexistent slice", () => {
    const engine = new WorkflowEngine("/tmp/test");
    const result = engine.getSlice("M001", "S99");
    assert.strictEqual(result, null);
  });

  it("Test 6: getMilestone returns null for nonexistent milestone", () => {
    const engine = new WorkflowEngine("/tmp/test");
    const result = engine.getMilestone("M999");
    assert.strictEqual(result, null);
  });

  it("Test 7: isEngineAvailable returns true when DB has v5 schema", () => {
    const available = isEngineAvailable("/tmp/test");
    assert.strictEqual(available, true);
  });

  it("Test 8: getEngine returns a WorkflowEngine instance", () => {
    const engine = getEngine("/tmp/test");
    assert.ok(engine instanceof WorkflowEngine);
  });

  it("Test 9: deriveState returns valid GSDState with null active refs on empty DB", () => {
    const engine = new WorkflowEngine("/tmp/test");
    const state = engine.deriveState();
    assert.strictEqual(state.activeMilestone, null);
    assert.strictEqual(state.activeSlice, null);
    assert.strictEqual(state.activeTask, null);
    assert.strictEqual(state.phase, "pre-planning");
    assert.ok(Array.isArray(state.recentDecisions));
    assert.ok(Array.isArray(state.blockers));
    assert.strictEqual(state.blockers.length, 0);
    assert.ok(typeof state.nextAction === "string");
    assert.ok(Array.isArray(state.registry));
  });
});
