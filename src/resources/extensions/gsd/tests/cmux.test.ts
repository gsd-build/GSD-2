import test, { describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCmuxProgress,
  buildCmuxStatusLabel,
  buildCmuxTabTitle,
  CmuxClient,
  detectCmuxEnvironment,
  markCmuxPromptShown,
  resetCmuxPromptState,
  resolveCmuxConfig,
  shouldPromptToEnableCmux,
} from "../../cmux/index.ts";
import type { GSDState } from "../types.ts";

test("detectCmuxEnvironment requires workspace, surface, and socket", () => {
  const detected = detectCmuxEnvironment(
    {
      CMUX_WORKSPACE_ID: "workspace:1",
      CMUX_SURFACE_ID: "surface:2",
      CMUX_SOCKET_PATH: "/tmp/cmux.sock",
    },
    (path) => path === "/tmp/cmux.sock",
    () => true,
  );
  assert.equal(detected.available, true);
  assert.equal(detected.cliAvailable, true);
});

test("resolveCmuxConfig auto-enables when environment is available and no preference is set", () => {
  const config = resolveCmuxConfig(
    undefined,
    {
      CMUX_WORKSPACE_ID: "workspace:1",
      CMUX_SURFACE_ID: "surface:2",
      CMUX_SOCKET_PATH: "/tmp/cmux.sock",
    },
    () => true,
    () => true,
  );
  assert.equal(config.enabled, true);
  assert.equal(config.notifications, true);
  assert.equal(config.sidebar, true);
  assert.equal(config.splits, false); // splits stay opt-in
  assert.equal(config.browser, false); // browser stays opt-in
});

test("resolveCmuxConfig respects explicit enabled: false to disable", () => {
  const config = resolveCmuxConfig(
    { cmux: { enabled: false } },
    {
      CMUX_WORKSPACE_ID: "workspace:1",
      CMUX_SURFACE_ID: "surface:2",
      CMUX_SOCKET_PATH: "/tmp/cmux.sock",
    },
    () => true,
    () => true,
  );
  assert.equal(config.enabled, false);
  assert.equal(config.notifications, false);
  assert.equal(config.sidebar, false);
});

test("resolveCmuxConfig enables only when preference and environment are both active", () => {
  const config = resolveCmuxConfig(
    { cmux: { enabled: true, notifications: true, sidebar: true, splits: true } },
    {
      CMUX_WORKSPACE_ID: "workspace:1",
      CMUX_SURFACE_ID: "surface:2",
      CMUX_SOCKET_PATH: "/tmp/cmux.sock",
    },
    () => true,
    () => true,
  );
  assert.equal(config.enabled, true);
  assert.equal(config.notifications, true);
  assert.equal(config.sidebar, true);
  assert.equal(config.splits, true);
});

test("shouldPromptToEnableCmux only prompts once per session", () => {
  resetCmuxPromptState();
  assert.equal(shouldPromptToEnableCmux({}, {}, () => false, () => true), false);

  assert.equal(
    shouldPromptToEnableCmux(
      {},
      {
        CMUX_WORKSPACE_ID: "workspace:1",
        CMUX_SURFACE_ID: "surface:2",
        CMUX_SOCKET_PATH: "/tmp/cmux.sock",
      },
      () => true,
      () => true,
    ),
    true,
  );
  markCmuxPromptShown();
  assert.equal(
    shouldPromptToEnableCmux(
      {},
      {
        CMUX_WORKSPACE_ID: "workspace:1",
        CMUX_SURFACE_ID: "surface:2",
        CMUX_SOCKET_PATH: "/tmp/cmux.sock",
      },
      () => true,
      () => true,
    ),
    false,
  );
  resetCmuxPromptState();
});

test("shouldPromptToEnableCmux does not prompt when cmux config block is present", () => {
  resetCmuxPromptState();
  const env = {
    CMUX_WORKSPACE_ID: "workspace:1",
    CMUX_SURFACE_ID: "surface:2",
    CMUX_SOCKET_PATH: "/tmp/cmux.sock",
  };
  const socketExists = () => true;
  const cliAvail = () => true;
  // Any cmux config block suppresses the prompt — user has already seen/configured it
  assert.equal(shouldPromptToEnableCmux({ cmux: { enabled: true } }, env, socketExists, cliAvail), false);
  assert.equal(shouldPromptToEnableCmux({ cmux: { enabled: false } }, env, socketExists, cliAvail), false);
  assert.equal(shouldPromptToEnableCmux({ cmux: { splits: true } }, env, socketExists, cliAvail), false);
  resetCmuxPromptState();
});

test("buildCmuxStatusLabel and progress prefer deepest active unit", () => {
  const state: GSDState = {
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: { id: "S02", title: "Slice" },
    activeTask: { id: "T03", title: "Task" },
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "Keep going",
    registry: [],
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 1, total: 3 },
      tasks: { done: 2, total: 5 },
    },
  };

  assert.equal(buildCmuxStatusLabel(state), "M001 S02/T03 · executing");
  assert.deepEqual(buildCmuxProgress(state), { value: 0.4, label: "2/5 tasks" });
});

describe("createGridLayout", () => {
  // Create a mock CmuxClient that tracks createSplitFrom calls
  function makeMockClient() {
    let nextId = 1;
    const calls: Array<{ source: string | undefined; direction: string }> = [];

    const client = {
      calls,
      async createGridLayout(count: number) {
        // Simulate the grid layout logic with a fake client
        if (count <= 0) return [];
        const surfaces: string[] = [];

        const createSplitFrom = async (source: string | undefined, direction: string) => {
          calls.push({ source, direction });
          return `surface-${nextId++}`;
        };

        const rightCol = await createSplitFrom("gsd-surface", "right");
        surfaces.push(rightCol);
        if (count === 1) return surfaces;

        const bottomRight = await createSplitFrom(rightCol, "down");
        surfaces.push(bottomRight);
        if (count === 2) return surfaces;

        const bottomLeft = await createSplitFrom("gsd-surface", "down");
        surfaces.push(bottomLeft);
        if (count === 3) return surfaces;

        let lastSurface = bottomRight;
        for (let i = 3; i < count; i++) {
          const next = await createSplitFrom(lastSurface, "down");
          surfaces.push(next);
          lastSurface = next;
        }

        return surfaces;
      },
    };
    return client;
  }

  test("1 agent creates single right split", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(1);
    assert.equal(surfaces.length, 1);
    assert.deepEqual(mock.calls, [
      { source: "gsd-surface", direction: "right" },
    ]);
  });

  test("2 agents creates right column then splits it down", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(2);
    assert.equal(surfaces.length, 2);
    assert.deepEqual(mock.calls, [
      { source: "gsd-surface", direction: "right" },
      { source: "surface-1", direction: "down" },
    ]);
  });

  test("3 agents creates 2x2 grid (gsd + 3 agent surfaces)", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(3);
    assert.equal(surfaces.length, 3);
    assert.deepEqual(mock.calls, [
      { source: "gsd-surface", direction: "right" },
      { source: "surface-1", direction: "down" },
      { source: "gsd-surface", direction: "down" },
    ]);
  });

  test("4 agents creates 2x2 grid with extra split", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(4);
    assert.equal(surfaces.length, 4);
    assert.deepEqual(mock.calls, [
      { source: "gsd-surface", direction: "right" },
      { source: "surface-1", direction: "down" },
      { source: "gsd-surface", direction: "down" },
      { source: "surface-2", direction: "down" },
    ]);
  });

  test("0 agents returns empty", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(0);
    assert.equal(surfaces.length, 0);
    assert.equal(mock.calls.length, 0);
  });
});

describe("cmux extension discovery opt-out", () => {
  test("cmux directory has package.json with pi manifest to prevent auto-discovery as extension", () => {
    const cmuxDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../cmux",
    );
    const pkgPath = path.join(cmuxDir, "package.json");
    assert.ok(fs.existsSync(pkgPath), `${pkgPath} must exist`);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    assert.ok(
      pkg.pi !== undefined && typeof pkg.pi === "object",
      'package.json must have a "pi" field to opt out of extension auto-discovery',
    );
    assert.ok(
      !pkg.pi.extensions?.length,
      "pi.extensions must be empty or absent — cmux is a library, not an extension",
    );
  });
});

// ─── buildCmuxTabTitle ────────────────────────────────────────────────────────

describe("buildCmuxTabTitle", () => {
  const base: GSDState = {
    activeMilestone: null,
    activeSlice: null,
    activeTask: null,
    phase: "pre-planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [],
    progress: undefined,
  };

  test("no active milestone → gsd · <phase>", () => {
    assert.equal(buildCmuxTabTitle({ ...base, phase: "pre-planning" }), "gsd · pre-planning");
  });

  test("milestone only → gsd · M001", () => {
    assert.equal(
      buildCmuxTabTitle({ ...base, activeMilestone: { id: "M001", title: "T" }, phase: "planning" }),
      "gsd · M001",
    );
  });

  test("milestone + slice → gsd · M001 · S02", () => {
    assert.equal(
      buildCmuxTabTitle({
        ...base,
        activeMilestone: { id: "M001", title: "T" },
        activeSlice: { id: "S02", title: "T" },
        phase: "executing",
      }),
      "gsd · M001 · S02",
    );
  });

  test("milestone + slice + task → gsd · M001 · S02/T03", () => {
    assert.equal(
      buildCmuxTabTitle({
        ...base,
        activeMilestone: { id: "M001", title: "T" },
        activeSlice: { id: "S02", title: "T" },
        activeTask: { id: "T03", title: "T" },
        phase: "executing",
      }),
      "gsd · M001 · S02/T03",
    );
  });
});

// ─── parseSurfaceRef (via createSplitFrom) ────────────────────────────────────

describe("createSplitFrom parses surface ref directly from new-split output", () => {
  function makeClientWithOutput(output: string | null) {
    const config = resolveCmuxConfig(
      { cmux: { splits: true } },
      { CMUX_WORKSPACE_ID: "workspace:1", CMUX_SURFACE_ID: "surface:1", CMUX_SOCKET_PATH: "/tmp/cmux.sock" },
      () => true,
      () => true,
    );
    // Patch runAsync to return fixed output without actually calling cmux
    const client = new CmuxClient(config) as unknown as Record<string, unknown>;
    (client as { runAsync: (args: string[]) => Promise<string | null> }).runAsync = async () => output;
    return client as unknown as CmuxClient;
  }

  test("parses 'OK surface:N workspace:M' format", async () => {
    const client = makeClientWithOutput("OK surface:105 workspace:2\n");
    const result = await client.createSplit("right");
    assert.equal(result, "surface:105");
  });

  test("parses 'OK surface=surface:N pane=...' format", async () => {
    const client = makeClientWithOutput("OK surface=surface:109 pane=pane:70 placement=split\n");
    const result = await client.createSplit("right");
    assert.equal(result, "surface:109");
  });

  test("returns null when output is null (CLI failure)", async () => {
    const client = makeClientWithOutput(null);
    const result = await client.createSplit("right");
    assert.equal(result, null);
  });

  test("returns null when output has no surface ref", async () => {
    const client = makeClientWithOutput("Error: something went wrong\n");
    const result = await client.createSplit("right");
    assert.equal(result, null);
  });
});

// ─── new methods — smoke-test guard calls ─────────────────────────────────────

describe("CmuxClient new methods respect feature flags", () => {
  const env = { CMUX_WORKSPACE_ID: "workspace:1", CMUX_SURFACE_ID: "surface:1", CMUX_SOCKET_PATH: "/tmp/cmux.sock" };
  const socketExists = () => true;
  const cliAvail = () => true;

  test("renameTab no-ops when cliAvailable is false", () => {
    const config = resolveCmuxConfig({ cmux: {} }, env, socketExists, () => false);
    const client = new CmuxClient(config);
    assert.doesNotThrow(() => client.renameTab("test"));
  });

  test("triggerFlash no-ops when cliAvailable is false", () => {
    const config = resolveCmuxConfig({ cmux: {} }, env, socketExists, () => false);
    const client = new CmuxClient(config);
    assert.doesNotThrow(() => client.triggerFlash());
  });

  test("renameTab no-ops when cmux enabled is false", () => {
    const config = resolveCmuxConfig({ cmux: { enabled: false } }, env, socketExists, cliAvail);
    const client = new CmuxClient(config) as unknown as { renameTab: (title: string) => void; runSync: (args: string[]) => string | null };
    let called = false;
    client.runSync = () => {
      called = true;
      return "OK";
    };
    client.renameTab("test");
    assert.equal(called, false);
  });

  test("triggerFlash no-ops when cmux enabled is false", () => {
    const config = resolveCmuxConfig({ cmux: { enabled: false } }, env, socketExists, cliAvail);
    const client = new CmuxClient(config) as unknown as { triggerFlash: () => void; runSync: (args: string[]) => string | null };
    let called = false;
    client.runSync = () => {
      called = true;
      return "OK";
    };
    client.triggerFlash();
    assert.equal(called, false);
  });

  test("openBrowserSplit returns null when browser feature is off", async () => {
    const config = resolveCmuxConfig({ cmux: { browser: false } }, env, socketExists, cliAvail);
    const client = new CmuxClient(config);
    const result = await client.openBrowserSplit("https://example.com");
    assert.equal(result, null);
  });

  test("readScreen returns null when cliAvailable is false", async () => {
    const config = resolveCmuxConfig({ cmux: {} }, env, socketExists, () => false);
    const client = new CmuxClient(config);
    const result = await client.readScreen();
    assert.equal(result, null);
  });

  test("openMarkdown returns null when cliAvailable is false", async () => {
    const config = resolveCmuxConfig({ cmux: {} }, env, socketExists, () => false);
    const client = new CmuxClient(config);
    const result = await client.openMarkdown("/tmp/test.md");
    assert.equal(result, null);
  });
});
