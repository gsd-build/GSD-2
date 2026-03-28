import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  clearRtkSessionBaseline,
  ensureRtkSessionBaseline,
  formatRtkSavingsLabel,
  getRtkSessionSavings,
} from "../resources/extensions/shared/rtk-session-stats.ts";
import { createFakeRtk } from "./rtk-test-utils.ts";

function summary(totalCommands: number, totalInput: number, totalOutput: number, totalSaved: number, totalTimeMs = 1000) {
  return JSON.stringify({
    summary: {
      total_commands: totalCommands,
      total_input: totalInput,
      total_output: totalOutput,
      total_saved: totalSaved,
      avg_savings_pct: totalInput > 0 ? (totalSaved / totalInput) * 100 : 0,
      total_time_ms: totalTimeMs,
      avg_time_ms: totalCommands > 0 ? totalTimeMs / totalCommands : 0,
    },
  });
}

describe("RTK session savings diff from a persisted baseline", () => {
  let basePath: string;
  let runtimeDir: string;
  let first: ReturnType<typeof createFakeRtk>;
  let second: ReturnType<typeof createFakeRtk>;
  let previousRtkPath: string | undefined;

  before(() => {
    basePath = mkdtempSync(join(tmpdir(), "gsd-rtk-session-stats-"));
    runtimeDir = join(basePath, ".gsd", "runtime");
    mkdirSync(runtimeDir, { recursive: true });

    first = createFakeRtk({ "gain --all --format json": { stdout: summary(10, 1000, 600, 400) } });
    second = createFakeRtk({ "gain --all --format json": { stdout: summary(14, 1600, 900, 700, 1800) } });

    previousRtkPath = process.env.GSD_RTK_PATH;
  });

  after(() => {
    if (previousRtkPath === undefined) delete process.env.GSD_RTK_PATH;
    else process.env.GSD_RTK_PATH = previousRtkPath;
    first.cleanup();
    second.cleanup();
    rmSync(basePath, { recursive: true, force: true });
  });

  test("computes delta between baseline and current", () => {
    process.env.GSD_RTK_PATH = first.path;
    ensureRtkSessionBaseline(runtimeDir, "sess-1");

    process.env.GSD_RTK_PATH = second.path;
    const savings = getRtkSessionSavings(runtimeDir, "sess-1");
    assert.ok(savings, "expected RTK savings snapshot");
    assert.equal(savings?.commands, 4);
    assert.equal(savings?.inputTokens, 600);
    assert.equal(savings?.outputTokens, 300);
    assert.equal(savings?.savedTokens, 300);
    assert.equal(Math.round(savings?.savingsPct ?? 0), 50);
  });
});

describe("RTK session savings baseline resets cleanly when tracking totals go backwards", () => {
  let basePath: string;
  let runtimeDir: string;
  let first: ReturnType<typeof createFakeRtk>;
  let second: ReturnType<typeof createFakeRtk>;
  let previousRtkPath: string | undefined;

  before(() => {
    basePath = mkdtempSync(join(tmpdir(), "gsd-rtk-session-reset-"));
    runtimeDir = join(basePath, ".gsd", "runtime");
    mkdirSync(runtimeDir, { recursive: true });

    first = createFakeRtk({ "gain --all --format json": { stdout: summary(8, 800, 500, 300) } });
    second = createFakeRtk({ "gain --all --format json": { stdout: summary(1, 100, 80, 20) } });

    previousRtkPath = process.env.GSD_RTK_PATH;
  });

  after(() => {
    if (previousRtkPath === undefined) delete process.env.GSD_RTK_PATH;
    else process.env.GSD_RTK_PATH = previousRtkPath;
    first.cleanup();
    second.cleanup();
    rmSync(basePath, { recursive: true, force: true });
  });

  test("returns zero delta when totals go backwards", () => {
    process.env.GSD_RTK_PATH = first.path;
    ensureRtkSessionBaseline(runtimeDir, "sess-2");

    process.env.GSD_RTK_PATH = second.path;
    const savings = getRtkSessionSavings(runtimeDir, "sess-2");
    assert.ok(savings, "expected RTK savings snapshot");
    assert.equal(savings?.commands, 0);
    assert.equal(savings?.savedTokens, 0);
  });
});

describe("RTK session stats fall back to the managed RTK path when GSD_RTK_PATH is unset", () => {
  let basePath: string;
  let runtimeDir: string;
  let managedHome: string;
  let fake: ReturnType<typeof createFakeRtk>;
  let previousHome: string | undefined;
  let previousRtkPath: string | undefined;
  let env: NodeJS.ProcessEnv;

  before(() => {
    basePath = mkdtempSync(join(tmpdir(), "gsd-rtk-session-managed-"));
    runtimeDir = join(basePath, ".gsd", "runtime");
    mkdirSync(runtimeDir, { recursive: true });

    fake = createFakeRtk({ "gain --all --format json": { stdout: summary(6, 900, 500, 400) } });

    managedHome = mkdtempSync(join(tmpdir(), "gsd-rtk-home-"));
    const managedDir = join(managedHome, "agent", "bin");
    const managedPath = join(managedDir, process.platform === "win32" ? "rtk.cmd" : "rtk");
    mkdirSync(managedDir, { recursive: true });
    copyFileSync(fake.path, managedPath);
    if (process.platform !== "win32") chmodSync(managedPath, 0o755);

    previousHome = process.env.GSD_HOME;
    previousRtkPath = process.env.GSD_RTK_PATH;

    process.env.GSD_HOME = managedHome;
    delete process.env.GSD_RTK_PATH;

    env = { ...process.env, GSD_HOME: managedHome };
    delete env.GSD_RTK_PATH;
  });

  after(() => {
    if (previousHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousHome;
    if (previousRtkPath === undefined) delete process.env.GSD_RTK_PATH;
    else process.env.GSD_RTK_PATH = previousRtkPath;
    fake.cleanup();
    rmSync(managedHome, { recursive: true, force: true });
    rmSync(basePath, { recursive: true, force: true });
  });

  test("resolves baseline via managed RTK path", () => {
    const baseline = ensureRtkSessionBaseline(runtimeDir, "sess-managed", env);
    assert.ok(baseline, "expected baseline from managed RTK path");
  });

  test("returns zero delta when baseline equals current", () => {
    const savings = getRtkSessionSavings(runtimeDir, "sess-managed", env);
    assert.ok(savings, "expected savings snapshot from managed RTK path");
    assert.equal(savings?.commands, 0);
  });
});

test("formatRtkSavingsLabel produces a compact footer string", () => {
  assert.equal(
    formatRtkSavingsLabel({
      commands: 5,
      inputTokens: 5949,
      outputTokens: 2905,
      savedTokens: 3044,
      savingsPct: 51.2,
      totalTimeMs: 3200,
      avgTimeMs: 640,
      updatedAt: new Date().toISOString(),
    }),
    "rtk: 3.0k saved (51%)",
  );
  assert.equal(
    formatRtkSavingsLabel({
      commands: 2,
      inputTokens: 0,
      outputTokens: 0,
      savedTokens: 0,
      savingsPct: 0,
      totalTimeMs: 120,
      avgTimeMs: 60,
      updatedAt: new Date().toISOString(),
    }),
    "rtk: active (2 cmds)",
  );
  assert.equal(formatRtkSavingsLabel(null), null);
});

describe("clearRtkSessionBaseline removes a stored session entry", () => {
  let basePath: string;
  let runtimeDir: string;
  let fake: ReturnType<typeof createFakeRtk>;
  let previousRtkPath: string | undefined;

  before(() => {
    basePath = mkdtempSync(join(tmpdir(), "gsd-rtk-session-clear-"));
    runtimeDir = join(basePath, ".gsd", "runtime");
    mkdirSync(runtimeDir, { recursive: true });

    fake = createFakeRtk({ "gain --all --format json": { stdout: summary(3, 300, 200, 100) } });

    previousRtkPath = process.env.GSD_RTK_PATH;
    process.env.GSD_RTK_PATH = fake.path;
  });

  after(() => {
    if (previousRtkPath === undefined) delete process.env.GSD_RTK_PATH;
    else process.env.GSD_RTK_PATH = previousRtkPath;
    fake.cleanup();
    rmSync(basePath, { recursive: true, force: true });
  });

  test("recreates baseline and returns zero delta after clear", () => {
    ensureRtkSessionBaseline(runtimeDir, "sess-clear");
    clearRtkSessionBaseline(runtimeDir, "sess-clear");
    const savings = getRtkSessionSavings(runtimeDir, "sess-clear");
    assert.ok(savings, "expected savings snapshot after baseline recreation");
    assert.equal(savings?.commands, 0);
  });
});
