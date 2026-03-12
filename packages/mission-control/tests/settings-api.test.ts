import { describe, expect, it, beforeAll, afterAll, beforeEach } from "bun:test";
import { join } from "node:path";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  getSettings,
  saveSettings,
  handleSettingsRequest,
  _setGlobalDir,
} from "../src/server/settings-api";

const TEST_DIR = join(tmpdir(), `gsd-settings-test-${Date.now()}`);
const GLOBAL_DIR = join(TEST_DIR, "global-home", ".gsd");
const PROJECT_DIR = join(TEST_DIR, "project", ".planning");

beforeAll(async () => {
  await mkdir(GLOBAL_DIR, { recursive: true });
  await mkdir(PROJECT_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  // Clean config files between tests
  try { await rm(join(GLOBAL_DIR, "defaults.json")); } catch {}
  try { await rm(join(PROJECT_DIR, "preferences.md")); } catch {}
});

describe("getSettings", () => {
  it("returns empty objects when config files don't exist", async () => {
    _setGlobalDir(join(TEST_DIR, "nonexistent", ".gsd"));
    const result = await getSettings(join(TEST_DIR, "nonexistent-project", ".planning"));
    expect(result.global).toEqual({});
    expect(result.project).toEqual({});
    expect(result.merged).toEqual({});
  });

  it("reads global settings from defaults.json", async () => {
    _setGlobalDir(GLOBAL_DIR);
    await writeFile(join(GLOBAL_DIR, "defaults.json"), JSON.stringify({ theme: "dark", lang: "en" }));
    const result = await getSettings(PROJECT_DIR);
    expect(result.global).toEqual({ theme: "dark", lang: "en" });
  });

  it("reads project settings from preferences.md", async () => {
    _setGlobalDir(GLOBAL_DIR);
    // Write preferences.md with YAML frontmatter
    await writeFile(join(PROJECT_DIR, "preferences.md"), "---\nresearch_model: opus\n---\n");
    const result = await getSettings(PROJECT_DIR);
    expect(result.project).toEqual({ research_model: "opus" });
  });

  it("merges with project overriding global", async () => {
    _setGlobalDir(GLOBAL_DIR);
    await writeFile(join(GLOBAL_DIR, "defaults.json"), JSON.stringify({ theme: "dark", lang: "en" }));
    await writeFile(join(PROJECT_DIR, "preferences.md"), "---\ntheme: light\nresearch_model: opus\n---\n");
    const result = await getSettings(PROJECT_DIR);
    expect(result.merged).toEqual({ theme: "light", lang: "en", research_model: "opus" });
  });
});

describe("saveSettings", () => {
  it("saves to global tier creating dirs if needed", async () => {
    const newGlobalDir = join(TEST_DIR, "new-global", ".gsd");
    _setGlobalDir(newGlobalDir);
    await saveSettings("global", { theme: "dark" });
    const content = JSON.parse(await readFile(join(newGlobalDir, "defaults.json"), "utf-8"));
    expect(content).toEqual({ theme: "dark" });
  });

  it("saves to project tier (preferences.md)", async () => {
    _setGlobalDir(GLOBAL_DIR);
    await saveSettings("project", { research_model: "sonnet" }, PROJECT_DIR);
    const raw = await readFile(join(PROJECT_DIR, "preferences.md"), "utf-8");
    // gray-matter.stringify produces YAML frontmatter; parse it back to verify
    const { default: matter } = await import("gray-matter");
    const { data } = matter(raw);
    expect(data).toEqual({ research_model: "sonnet" });
  });

  it("merges with existing data (partial update)", async () => {
    _setGlobalDir(GLOBAL_DIR);
    await writeFile(join(GLOBAL_DIR, "defaults.json"), JSON.stringify({ theme: "dark", lang: "en" }));
    await saveSettings("global", { theme: "light" });
    const content = JSON.parse(await readFile(join(GLOBAL_DIR, "defaults.json"), "utf-8"));
    expect(content).toEqual({ theme: "light", lang: "en" });
  });
});

describe("handleSettingsRequest", () => {
  it("GET /api/settings returns merged settings", async () => {
    _setGlobalDir(GLOBAL_DIR);
    await writeFile(join(GLOBAL_DIR, "defaults.json"), JSON.stringify({ theme: "dark" }));
    await writeFile(join(PROJECT_DIR, "preferences.md"), "---\nresearch_model: opus\n---\n");

    const req = new Request("http://localhost/api/settings", { method: "GET" });
    const url = new URL(req.url);
    const res = await handleSettingsRequest(req, url, PROJECT_DIR);

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.merged).toEqual({ theme: "dark", research_model: "opus" });
  });

  it("PUT /api/settings saves to correct tier", async () => {
    _setGlobalDir(GLOBAL_DIR);

    const req = new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "global", settings: { theme: "light" } }),
    });
    const url = new URL(req.url);
    const res = await handleSettingsRequest(req, url, PROJECT_DIR);

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const content = JSON.parse(await readFile(join(GLOBAL_DIR, "defaults.json"), "utf-8"));
    expect(content).toEqual({ theme: "light" });
  });

  it("PUT /api/settings with project tier but no planningDir returns 400", async () => {
    _setGlobalDir(GLOBAL_DIR);

    const req = new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "project", settings: { model: "opus" } }),
    });
    const url = new URL(req.url);
    const res = await handleSettingsRequest(req, url, "");

    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });

  it("returns null for unmatched routes", async () => {
    const req = new Request("http://localhost/api/settings/unknown", { method: "GET" });
    const url = new URL(req.url);
    const res = await handleSettingsRequest(req, url, PROJECT_DIR);
    expect(res).toBeNull();
  });
});
