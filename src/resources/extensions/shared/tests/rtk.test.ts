import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rewriteCommandWithRtk } from "../rtk.js";
import type { spawnSync } from "node:child_process";

type SpawnSyncImpl = typeof spawnSync;

const makeSpawn = (status: number, stdout: string): SpawnSyncImpl =>
  ((_bin: string, _args: string[]) => ({
    status,
    stdout,
    stderr: "",
    output: [],
    pid: 0,
    signal: null,
    error: undefined,
  })) as unknown as SpawnSyncImpl;

describe("rewriteCommandWithRtk (shared extension)", () => {
  it("rewrites command when spawn returns exit 0", () => {
    const spawnSyncImpl = makeSpawn(0, "rtk git status");
    assert.equal(
      rewriteCommandWithRtk("git status", { binaryPath: "/fake/rtk", spawnSyncImpl }),
      "rtk git status",
    );
  });

  it("rewrites command when spawn returns exit 3 (ask mode)", () => {
    const spawnSyncImpl = makeSpawn(3, "rtk npm run test");
    assert.equal(
      rewriteCommandWithRtk("npm run test", { binaryPath: "/fake/rtk", spawnSyncImpl }),
      "rtk npm run test",
    );
  });

  it("passes command through when spawn returns non-zero non-3 status", () => {
    const spawnSyncImpl = makeSpawn(1, "");
    assert.equal(
      rewriteCommandWithRtk("echo hello", { binaryPath: "/fake/rtk", spawnSyncImpl }),
      "echo hello",
    );
  });

  it("passes command through when spawn errors", () => {
    const failingSpawn = ((_bin: string, _args: string[]) => ({
      status: null,
      stdout: "",
      stderr: "",
      output: [],
      pid: 0,
      signal: null,
      error: new Error("spawn failed"),
    })) as unknown as SpawnSyncImpl;
    assert.equal(
      rewriteCommandWithRtk("git status", { binaryPath: "/fake/rtk", spawnSyncImpl: failingSpawn }),
      "git status",
    );
  });

  it("passes command through when RTK is disabled via env", () => {
    const spawnSyncImpl = (() => {
      throw new Error("should not be called");
    }) as unknown as SpawnSyncImpl;
    assert.equal(
      rewriteCommandWithRtk("git status", {
        binaryPath: "/fake/rtk",
        spawnSyncImpl,
        env: { GSD_RTK_DISABLED: "1" },
      }),
      "git status",
    );
  });

  it("returns empty command unchanged", () => {
    const spawnSyncImpl = makeSpawn(0, "rtk  ");
    assert.equal(rewriteCommandWithRtk("  ", { binaryPath: "/fake/rtk", spawnSyncImpl }), "  ");
  });

  it("passes command through when no binary path resolves", () => {
    assert.equal(
      rewriteCommandWithRtk("git status", {
        env: {},
        spawnSyncImpl: makeSpawn(0, "rtk git status"),
      }),
      "git status",
    );
  });
});
