/**
 * Tests for trust-api.ts — read/write .gsd/.mission-control-trust + REST routes.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtemp, rm, access } from "node:fs/promises";
import { join } from "node:path";

// We must import after tmpdir setup — dynamic imports for isolation
let isTrusted: (gsdDir: string) => Promise<boolean>;
let writeTrustFlag: (gsdDir: string) => Promise<void>;
let registerTrustRoutes: (url: URL, method: string, body: unknown) => Promise<Response | null>;

// Dynamic import to isolate module state
beforeEach(async () => {
  const mod = await import("../src/server/trust-api");
  isTrusted = mod.isTrusted;
  writeTrustFlag = mod.writeTrustFlag;
  registerTrustRoutes = mod.registerTrustRoutes;
});

describe("isTrusted", () => {
  test("returns false for non-existent path", async () => {
    const result = await isTrusted("/tmp/non-existent-gsd-dir-xyz-12345");
    expect(result).toBe(false);
  });

  test("returns false when trust flag file does not exist in real dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trust-test-"));
    try {
      const result = await isTrusted(dir);
      expect(result).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("writeTrustFlag", () => {
  test("creates the .mission-control-trust file; isTrusted then returns true", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trust-test-"));
    try {
      // Before write — not trusted
      expect(await isTrusted(dir)).toBe(false);
      // Write flag
      await writeTrustFlag(dir);
      // After write — trusted
      expect(await isTrusted(dir)).toBe(true);
      // Verify file actually exists
      await access(join(dir, ".mission-control-trust")); // no throw = file exists
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("creates gsdDir if it does not exist (mkdir -p behavior)", async () => {
    const base = await mkdtemp(join(tmpdir(), "trust-test-"));
    const nested = join(base, "deep", ".gsd");
    try {
      await writeTrustFlag(nested);
      expect(await isTrusted(nested)).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("registerTrustRoutes", () => {
  test("GET /api/trust returns { trusted: false } when file absent", async () => {
    const base = await mkdtemp(join(tmpdir(), "trust-rest-"));
    // Routes require a .gsd path (C3 validation)
    const dir = join(base, ".gsd");
    try {
      const url = new URL(`http://localhost/api/trust?dir=${encodeURIComponent(dir)}`);
      const res = await registerTrustRoutes(url, "GET", null);
      expect(res).not.toBeNull();
      const json = await res!.json();
      expect(json).toEqual({ trusted: false });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("GET /api/trust returns 400 for non-.gsd path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trust-rest-"));
    try {
      const url = new URL(`http://localhost/api/trust?dir=${encodeURIComponent(dir)}`);
      const res = await registerTrustRoutes(url, "GET", null);
      expect(res).not.toBeNull();
      const json = await res!.json();
      expect(json).toEqual({ error: "dir must be a .gsd directory path" });
      expect(res!.status).toBe(400);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("POST /api/trust creates file; subsequent GET returns { trusted: true }", async () => {
    const base = await mkdtemp(join(tmpdir(), "trust-rest-"));
    // Routes require a .gsd path (C3 validation)
    const dir = join(base, ".gsd");
    try {
      // POST to create the trust flag
      const postUrl = new URL("http://localhost/api/trust");
      const postRes = await registerTrustRoutes(postUrl, "POST", { dir });
      expect(postRes).not.toBeNull();
      const postJson = await postRes!.json();
      expect(postJson).toEqual({ ok: true });

      // GET to verify trusted
      const getUrl = new URL(`http://localhost/api/trust?dir=${encodeURIComponent(dir)}`);
      const getRes = await registerTrustRoutes(getUrl, "GET", null);
      expect(getRes).not.toBeNull();
      const getJson = await getRes!.json();
      expect(getJson).toEqual({ trusted: true });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("POST /api/trust returns 400 for non-.gsd path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trust-rest-"));
    try {
      const postUrl = new URL("http://localhost/api/trust");
      const postRes = await registerTrustRoutes(postUrl, "POST", { dir });
      expect(postRes).not.toBeNull();
      const postJson = await postRes!.json();
      expect(postJson).toEqual({ error: "dir must be a .gsd directory path" });
      expect(postRes!.status).toBe(400);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns null for non-matching pathname", async () => {
    const url = new URL("http://localhost/api/other");
    const res = await registerTrustRoutes(url, "GET", null);
    expect(res).toBeNull();
  });
});
