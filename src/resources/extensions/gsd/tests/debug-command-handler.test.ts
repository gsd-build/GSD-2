import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { handleDebug, parseDebugCommand } from "../commands-debug.ts";
import { createDebugSession, debugSessionArtifactPath } from "../debug-session-store.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-debug-command-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function createMockCtx() {
  const notifications: Array<{ message: string; level: string }> = [];
  return {
    notifications,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };
}

describe("parseDebugCommand", () => {
  test("supports strict subcommands and issue-start fallback", () => {
    assert.deepEqual(parseDebugCommand("list"), { type: "list" });
    assert.deepEqual(parseDebugCommand("status auth-flake"), { type: "status", slug: "auth-flake" });
    assert.deepEqual(parseDebugCommand("continue auth-flake"), { type: "continue", slug: "auth-flake" });
    assert.deepEqual(parseDebugCommand("--diagnose"), { type: "diagnose" });
  });

  test("treats ambiguous reserved-word phrases as issue text unless strict syntax matches", () => {
    assert.deepEqual(parseDebugCommand("status login fails on safari"), {
      type: "issue-start",
      issue: "status login fails on safari",
    });
    assert.deepEqual(parseDebugCommand("continue flaky checkout flow"), {
      type: "issue-start",
      issue: "continue flaky checkout flow",
    });
    assert.deepEqual(parseDebugCommand("list broken retry behavior"), {
      type: "issue-start",
      issue: "list broken retry behavior",
    });
  });

  test("returns actionable errors for malformed subcommand invocations", () => {
    assert.equal(parseDebugCommand("status").type, "error");
    assert.equal(parseDebugCommand("continue").type, "error");
    assert.equal(parseDebugCommand("--diagnose not/a-slug").type, "error");
    assert.equal(parseDebugCommand("--wat").type, "error");
  });
});

describe("handleDebug lifecycle", () => {
  test("creates new session and persists mode/phase metadata", async () => {
    const base = makeBase();
    const ctx = createMockCtx();
    const saved = process.cwd();
    process.chdir(base);

    try {
      await handleDebug("Login fails on Safari", ctx as any);
      assert.equal(ctx.notifications.length, 1);
      const note = ctx.notifications[0];
      assert.equal(note.level, "info");
      assert.match(note.message, /Debug session started: login-fails-on-safari/);
      assert.match(note.message, /mode=debug/);
      assert.match(note.message, /phase=queued/);

      const artifact = debugSessionArtifactPath(base, "login-fails-on-safari");
      const statusCtx = createMockCtx();
      await handleDebug("status login-fails-on-safari", statusCtx as any);
      assert.match(statusCtx.notifications[0].message, new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(statusCtx.notifications[0].message, /status=active/);
      assert.match(statusCtx.notifications[0].message, /phase=queued/);
    } finally {
      process.chdir(saved);
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("list shows persisted session summaries with lifecycle metadata", async () => {
    const base = makeBase();
    const ctx = createMockCtx();
    const saved = process.cwd();
    process.chdir(base);

    try {
      createDebugSession(base, { issue: "Auth timeout", createdAt: 10 });
      createDebugSession(base, { issue: "Billing webhook", createdAt: 20 });

      await handleDebug("list", ctx as any);
      assert.equal(ctx.notifications.length, 1);
      const note = ctx.notifications[0].message;
      assert.match(note, /Debug sessions:/);
      assert.match(note, /mode=debug status=active phase=queued/);
      assert.match(note, /auth-timeout/);
      assert.match(note, /billing-webhook/);
    } finally {
      process.chdir(saved);
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("continue updates session lifecycle state", async () => {
    const base = makeBase();
    const ctx = createMockCtx();
    const saved = process.cwd();
    process.chdir(base);

    try {
      createDebugSession(base, { issue: "CI flake", createdAt: 10, status: "paused", phase: "blocked" });

      await handleDebug("continue ci-flake", ctx as any);
      assert.equal(ctx.notifications.length, 1);
      const note = ctx.notifications[0].message;
      assert.match(note, /Resumed debug session: ci-flake/);
      assert.match(note, /status=active/);
      assert.match(note, /phase=continued/);

      const statusCtx = createMockCtx();
      await handleDebug("status ci-flake", statusCtx as any);
      assert.match(statusCtx.notifications[0].message, /status=active/);
      assert.match(statusCtx.notifications[0].message, /phase=continued/);
    } finally {
      process.chdir(saved);
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("unknown slug and missing slug paths provide actionable warnings", async () => {
    const base = makeBase();
    const saved = process.cwd();
    process.chdir(base);

    try {
      const missingSlugCtx = createMockCtx();
      await handleDebug("status", missingSlugCtx as any);
      assert.equal(missingSlugCtx.notifications[0].level, "warning");
      assert.match(missingSlugCtx.notifications[0].message, /Missing slug/);

      const unknownSlugCtx = createMockCtx();
      await handleDebug("status no-such-session", unknownSlugCtx as any);
      assert.equal(unknownSlugCtx.notifications[0].level, "warning");
      assert.match(unknownSlugCtx.notifications[0].message, /Unknown debug session slug/);
      assert.match(unknownSlugCtx.notifications[0].message, /\/gsd debug list/);
    } finally {
      process.chdir(saved);
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("detects malformed artifacts and surfaces remediation in list/diagnose", async () => {
    const base = makeBase();
    const saved = process.cwd();
    process.chdir(base);

    try {
      createDebugSession(base, { issue: "Healthy issue", createdAt: 1 });
      writeFileSync(join(base, ".gsd", "debug", "sessions", "broken.json"), "{ nope", "utf-8");

      const listCtx = createMockCtx();
      await handleDebug("list", listCtx as any);
      assert.match(listCtx.notifications[0].message, /Malformed artifacts: 1/);
      assert.match(listCtx.notifications[0].message, /Run \/gsd debug --diagnose/);

      const diagnoseCtx = createMockCtx();
      await handleDebug("--diagnose", diagnoseCtx as any);
      assert.equal(diagnoseCtx.notifications[0].level, "warning");
      assert.match(diagnoseCtx.notifications[0].message, /Malformed artifacts/);
      assert.match(diagnoseCtx.notifications[0].message, /Remediation:/);
    } finally {
      process.chdir(saved);
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("reserved-word boundary condition still creates session when syntax is not strict", async () => {
    const base = makeBase();
    const saved = process.cwd();
    process.chdir(base);

    try {
      const ctx = createMockCtx();
      await handleDebug("status login is flaky on prod", ctx as any);
      assert.equal(ctx.notifications[0].level, "info");
      assert.match(ctx.notifications[0].message, /Debug session started:/);

      const slug = "status-login-is-flaky-on-prod";
      const statusCtx = createMockCtx();
      await handleDebug(`status ${slug}`, statusCtx as any);
      assert.equal(statusCtx.notifications[0].level, "info");
      assert.match(statusCtx.notifications[0].message, /mode=debug/);
    } finally {
      process.chdir(saved);
      rmSync(base, { recursive: true, force: true });
    }
  });
});
