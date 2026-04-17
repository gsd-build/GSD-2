// GSD Extension — Notification Widget Tests

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  initNotificationStore,
  appendNotification,
  _resetNotificationStore,
} from "../notification-store.js";
import { buildNotificationWidgetLines } from "../notification-widget.js";

describe("notification-widget", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gsd-widget-test-"));
    mkdirSync(join(tmp, ".gsd"), { recursive: true });
    _resetNotificationStore();
    initNotificationStore(tmp);
  });

  afterEach(() => {
    _resetNotificationStore();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns empty array when no unread notifications", () => {
    const lines = buildNotificationWidgetLines();
    assert.deepEqual(lines, []);
  });

  test("returns single-element array for single-line message", () => {
    appendNotification("Build completed successfully", "success");
    const lines = buildNotificationWidgetLines();
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("Build completed successfully"));
    assert.ok(lines[0].includes("1 unread"));
  });

  test("flattens multiline message into single line", () => {
    const multilineMsg =
      "Codebase Map Stats:\n" +
      "  Files: 500\n" +
      "  Described: 0 (0%)\n" +
      "  Undescribed: 500\n" +
      "  Generated: 2026-04-11T08:30:35Z";
    appendNotification(multilineMsg, "info");

    const lines = buildNotificationWidgetLines();
    assert.equal(lines.length, 1);
    // Must not contain any newline characters
    assert.ok(!lines[0].includes("\n"), "widget line must not contain newlines");
  });

  test("collapses extra whitespace from flattened message", () => {
    appendNotification("Line one\n\n\n  Line two\n  Line three", "info");
    const lines = buildNotificationWidgetLines();
    assert.equal(lines.length, 1);
    assert.ok(!lines[0].includes("\n"));
    // The flattened message content itself should not have runs of multiple spaces
    assert.ok(lines[0].includes("Line one Line two Line three"), "should collapse newlines and extra whitespace into single spaces");
  });

  test("truncates long flattened message with ellipsis", () => {
    const longMsg = "A".repeat(200);
    appendNotification(longMsg, "info");
    const lines = buildNotificationWidgetLines();
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("…"), "long message should be truncated with ellipsis");
  });

  test("shows correct icon for each severity", () => {
    appendNotification("error msg", "error");
    let lines = buildNotificationWidgetLines();
    assert.ok(lines[0].includes("✗"), "error should show ✗");

    _resetNotificationStore();
    initNotificationStore(tmp);
    appendNotification("warning msg", "warning");
    lines = buildNotificationWidgetLines();
    assert.ok(lines[0].includes("⚠"), "warning should show ⚠");

    _resetNotificationStore();
    initNotificationStore(tmp);
    appendNotification("info msg", "info");
    lines = buildNotificationWidgetLines();
    assert.ok(lines[0].includes("●"), "info should show ●");
  });

  test("shows correct unread count with multiple notifications", () => {
    appendNotification("msg1", "info");
    appendNotification("msg2", "warning");
    appendNotification("msg3", "error");
    const lines = buildNotificationWidgetLines();
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("3 unread"));
  });

  test("real-world codebase stats notification produces no newlines", () => {
    // This is the exact message that caused the UI layout shift bug
    const statsMsg =
      "Codebase Map Stats:\n" +
      "  Files: 500\n" +
      "  Described: 0 (0%)\n" +
      "  Undescribed: 500\n" +
      "  Generated: 2026-04-11T08:30:35Z\n\n" +
      "Tip: Auto-refresh keeps the cache current, but /gsd codebase update forces an immediate refresh.";
    appendNotification(statsMsg, "info");

    const lines = buildNotificationWidgetLines();
    assert.equal(lines.length, 1, "must return exactly 1 line");
    assert.ok(!lines[0].includes("\n"), "must not contain newline characters");
    assert.ok(lines[0].includes("Codebase Map Stats:"), "should include message start");
  });
});
