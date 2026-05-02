// GSD-2 + Unified path normalization tests: normalizeRealPath and tryRealpath parity

import { describe, test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeRealPath } from "../paths.ts";
import { createWorkspace } from "../workspace.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Detect whether the filesystem hosting `dir` is case-insensitive.
 * Creates a file with a lowercase name, then probes it via an uppercase name.
 */
function isCaseInsensitiveFs(dir: string): boolean {
  const lower = join(dir, "ci_probe_lower.txt");
  const upper = join(dir, "CI_PROBE_LOWER.TXT");
  try {
    writeFileSync(lower, "probe");
    return existsSync(upper);
  } finally {
    try { rmSync(lower); } catch { /* ignore */ }
  }
}

function makeProjectDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-pathnorm-")));
  mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
  return dir;
}

// ─── Suite 1: normalizeRealPath and tryRealpath return identical strings ──────

describe("normalizeRealPath and tryRealpath produce identical results", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("normalizeRealPath on an existing directory matches realpathSync.native", () => {
    const result = normalizeRealPath(projectDir);
    // realpathSync.native is the canonical form — result must equal it
    const expected = realpathSync.native(projectDir);
    assert.equal(result, expected);
  });

  test("createWorkspace identityKey equals normalizeRealPath of projectRoot", () => {
    const ws = createWorkspace(projectDir);
    // identityKey is computed via tryRealpath → normalizeRealPath
    assert.equal(ws.identityKey, normalizeRealPath(ws.projectRoot));
  });

  test("createWorkspace identityKey and normalizeRealPath agree on the same input", () => {
    const ws = createWorkspace(projectDir);
    const direct = normalizeRealPath(projectDir);
    assert.equal(ws.identityKey, direct);
  });
});

// ─── Suite 2: non-existent path fallback ─────────────────────────────────────

describe("normalizeRealPath: fallback for non-existent paths", () => {
  test("returns a resolved (absolute) path for a non-existent input", () => {
    const ghost = join(tmpdir(), "gsd-pathnorm-ghost-does-not-exist-" + Date.now());
    const result = normalizeRealPath(ghost);
    // Must be a string, must be absolute, must not throw
    assert.equal(typeof result, "string");
    assert.ok(result.startsWith("/") || /^[A-Za-z]:/.test(result), "result must be absolute");
  });

  test("normalizeRealPath of a non-existent path is idempotent", () => {
    const ghost = join(tmpdir(), "gsd-pathnorm-ghost2-" + Date.now());
    const first = normalizeRealPath(ghost);
    const second = normalizeRealPath(first);
    assert.equal(first, second);
  });
});

// ─── Suite 3: idempotency on existing paths ───────────────────────────────────

describe("normalizeRealPath: idempotency on existing paths", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("normalizeRealPath of a normalizeRealPath result is the same", () => {
    const once = normalizeRealPath(projectDir);
    const twice = normalizeRealPath(once);
    assert.equal(once, twice);
  });

  test("createWorkspace identityKey is idempotent across two calls with same path", () => {
    const ws1 = createWorkspace(projectDir);
    const ws2 = createWorkspace(projectDir);
    assert.equal(ws1.identityKey, ws2.identityKey);
  });
});

// ─── Suite 4: case-insensitive filesystem (macOS HFS+/APFS) ──────────────────

describe("normalizeRealPath: case normalization on case-insensitive volumes", () => {
  let projectDir: string;
  let caseInsensitive: boolean;

  before(() => {
    // Detect FS case sensitivity once for the suite
    const probe = mkdtempSync(join(tmpdir(), "gsd-ci-probe-"));
    caseInsensitive = isCaseInsensitiveFs(probe);
    rmSync(probe, { recursive: true, force: true });
  });

  beforeEach(() => {
    projectDir = makeProjectDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("upper and lower case paths resolve to the same canonical string on case-insensitive FS", (t) => {
    if (!caseInsensitive) {
      t.skip("case-sensitive filesystem — case-normalization check not applicable");
      return;
    }

    const lower = projectDir.toLowerCase();
    const upper = projectDir.toUpperCase();

    const canonicalFromLower = normalizeRealPath(lower);
    const canonicalFromUpper = normalizeRealPath(upper);

    assert.equal(
      canonicalFromLower,
      canonicalFromUpper,
      "both case variants must resolve to the same canonical path on case-insensitive FS",
    );
  });

  test("createWorkspace identityKey is case-stable on case-insensitive FS", (t) => {
    if (!caseInsensitive) {
      t.skip("case-sensitive filesystem — case-normalization check not applicable");
      return;
    }

    const wsLower = createWorkspace(projectDir.toLowerCase());
    const wsUpper = createWorkspace(projectDir.toUpperCase());

    assert.equal(
      wsLower.identityKey,
      wsUpper.identityKey,
      "identityKey must be identical regardless of input case on case-insensitive FS",
    );
  });
});
