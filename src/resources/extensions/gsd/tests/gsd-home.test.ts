/**
 * Tests for gsdHome() — GSD home directory resolution.
 *
 * @see https://github.com/gsd-build/gsd-2/issues/5015
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

describe("gsdHome", () => {
  let savedGsdHome: string | undefined;
  let gsdHome: () => string;

  beforeEach(async () => {
    savedGsdHome = process.env.GSD_HOME;
    const mod = await import("../gsd-home.js");
    gsdHome = mod.gsdHome;
  });

  afterEach(() => {
    if (savedGsdHome !== undefined) {
      process.env.GSD_HOME = savedGsdHome;
    } else {
      delete process.env.GSD_HOME;
    }
  });

  it("returns ~/.gsd by default", () => {
    delete process.env.GSD_HOME;
    assert.equal(gsdHome(), join(homedir(), ".gsd"));
  });

  it("uses GSD_HOME env var when set", () => {
    process.env.GSD_HOME = "/custom/gsd/home";
    // resolve() normalizes to platform absolute path on Windows
    assert.equal(gsdHome(), resolve("/custom/gsd/home"));
  });

  it("returns a non-empty string", () => {
    assert.ok(gsdHome().length > 0);
  });
});
