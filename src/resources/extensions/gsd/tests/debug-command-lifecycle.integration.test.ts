import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { handleGSDCommand } from "../commands/dispatcher.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-debug-lifecycle-int-"));
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
      custom: async () => {},
    },
    shutdown: async () => {},
  };
}

test("/gsd debug lifecycle works through dispatcher routing", async () => {
  const base = makeBase();
  const saved = process.cwd();
  process.chdir(base);

  try {
    const ctx = createMockCtx();

    await handleGSDCommand("debug API returns 500 on checkout", ctx as any, {} as any);
    assert.ok(ctx.notifications.length >= 1);
    const created = ctx.notifications.at(-1)!;
    assert.equal(created.level, "info");
    assert.match(created.message, /Debug session started: api-returns-500-on-checkout/);

    await handleGSDCommand("debug list", ctx as any, {} as any);
    const listed = ctx.notifications.at(-1)!;
    assert.equal(listed.level, "info");
    assert.match(listed.message, /api-returns-500-on-checkout/);
    assert.match(listed.message, /mode=debug status=active phase=queued/);

    await handleGSDCommand("debug status api-returns-500-on-checkout", ctx as any, {} as any);
    const status = ctx.notifications.at(-1)!;
    assert.equal(status.level, "info");
    assert.match(status.message, /status=active/);
    assert.match(status.message, /phase=queued/);

    await handleGSDCommand("debug continue api-returns-500-on-checkout", ctx as any, {} as any);
    const resumed = ctx.notifications.at(-1)!;
    assert.equal(resumed.level, "info");
    assert.match(resumed.message, /Resumed debug session/);
    assert.match(resumed.message, /status=active/);
    assert.match(resumed.message, /phase=continued/);

    await handleGSDCommand("debug --diagnose api-returns-500-on-checkout", ctx as any, {} as any);
    const diagnosed = ctx.notifications.at(-1)!;
    assert.equal(diagnosed.level, "info");
    assert.match(diagnosed.message, /Diagnose session/);
    assert.match(diagnosed.message, /mode=debug/);
  } finally {
    process.chdir(saved);
    rmSync(base, { recursive: true, force: true });
  }
});
