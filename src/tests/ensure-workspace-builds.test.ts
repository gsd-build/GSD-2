import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { newestSrcMtime } = require("../../scripts/ensure-workspace-builds.cjs");

describe("newestSrcMtime", () => {
  let tmp: string;

  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "gsd-mtime-test-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("returns 0 for a non-existent directory", () => {
    assert.equal(newestSrcMtime(join(tmp, "does-not-exist")), 0);
  });

  it("returns 0 when directory has no .ts files", () => {
    writeFileSync(join(tmp, "index.js"), "");
    writeFileSync(join(tmp, "config.json"), "");
    assert.equal(newestSrcMtime(tmp), 0);
  });

  it("returns the mtime of a single .ts file", () => {
    const file = join(tmp, "index.ts");
    writeFileSync(file, "");
    const mtime = new Date("2024-01-15T10:00:00Z");
    utimesSync(file, mtime, mtime);
    assert.equal(newestSrcMtime(tmp), mtime.getTime());
  });

  it("returns the max mtime across multiple .ts files", () => {
    const older = join(tmp, "a.ts");
    const newer = join(tmp, "b.ts");
    writeFileSync(older, "");
    writeFileSync(newer, "");
    utimesSync(older, new Date("2024-01-01T00:00:00Z"), new Date("2024-01-01T00:00:00Z"));
    utimesSync(newer, new Date("2024-06-01T00:00:00Z"), new Date("2024-06-01T00:00:00Z"));
    assert.equal(newestSrcMtime(tmp), new Date("2024-06-01T00:00:00Z").getTime());
  });

  it("recurses into subdirectories", () => {
    const subdir = join(tmp, "nested", "deep");
    mkdirSync(subdir, { recursive: true });
    const file = join(subdir, "util.ts");
    writeFileSync(file, "");
    const mtime = new Date("2024-03-01T00:00:00Z");
    utimesSync(file, mtime, mtime);
    assert.equal(newestSrcMtime(tmp), mtime.getTime());
  });

  it("skips node_modules entirely", () => {
    const nm = join(tmp, "node_modules", "some-pkg");
    mkdirSync(nm, { recursive: true });
    const nmFile = join(nm, "index.ts");
    writeFileSync(nmFile, "");
    const future = new Date("2099-01-01T00:00:00Z");
    utimesSync(nmFile, future, future);
    assert.equal(newestSrcMtime(tmp), 0);
  });
});
