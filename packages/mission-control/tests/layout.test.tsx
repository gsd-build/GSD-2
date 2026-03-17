/**
 * Layout component tests for the sidebar + single-column navigation.
 *
 * Tests verify Sidebar and AppShell components.
 * TabLayout was removed in Phase 20.1-02; tests updated accordingly.
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in panel-states.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Sidebar } from "../src/components/layout/Sidebar";
import { AppShell } from "../src/components/layout/AppShell";
import { LAYOUT_DEFAULTS } from "../src/styles/design-tokens";

describe("Sidebar", () => {
  it("exports as a function component", () => {
    expect(typeof Sidebar).toBe("function");
  });

  it("module can be imported without error", async () => {
    const mod = await import("../src/components/layout/Sidebar");
    expect(typeof mod.Sidebar).toBe("function");
  });
});

describe("AppShell", () => {
  it("exports as a function component", () => {
    expect(typeof AppShell).toBe("function");
  });

  it("module can be imported without error", async () => {
    const mod = await import("../src/components/layout/AppShell");
    expect(typeof mod.AppShell).toBe("function");
  });
});

describe("SingleColumnView project name header (source-text)", () => {
  it("accepts projectName prop in interface", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/SingleColumnView.tsx"), "utf8");
    expect(src).toContain("projectName?: string");
  });

  it("renders FolderOpen icon in header bar", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/SingleColumnView.tsx"), "utf8");
    expect(src).toContain("FolderOpen");
  });

  it("header bar uses font-mono text styling", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/SingleColumnView.tsx"), "utf8");
    expect(src).toContain("text-xs font-mono text-slate-400");
  });
});

describe("AppShell projectName derivation (source-text)", () => {
  it("derives projectName as a const before return", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/AppShell.tsx"), "utf8");
    expect(src).toContain("const projectName =");
  });

  it("passes projectName to SingleColumnView", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/AppShell.tsx"), "utf8");
    expect(src).toContain("projectName={projectName}");
  });
});

describe("globals.css scrollbar-thin (source-text)", () => {
  it("contains Firefox scrollbar-width: thin inside .scrollbar-thin", () => {
    const src = readFileSync(join(import.meta.dir, "../src/styles/globals.css"), "utf8");
    expect(src).toContain("scrollbar-width: thin");
  });

  it("contains scrollbar-color property", () => {
    const src = readFileSync(join(import.meta.dir, "../src/styles/globals.css"), "utf8");
    expect(src).toContain("scrollbar-color");
  });
});

describe("LAYOUT_DEFAULTS", () => {
  it("has sidebarWidth defined", () => {
    expect(LAYOUT_DEFAULTS.sidebarWidth).toBeDefined();
    expect(typeof LAYOUT_DEFAULTS.sidebarWidth).toBe("number");
  });

  it("has sidebarCollapsedWidth defined", () => {
    expect(LAYOUT_DEFAULTS.sidebarCollapsedWidth).toBeDefined();
    expect(typeof LAYOUT_DEFAULTS.sidebarCollapsedWidth).toBe("number");
  });

  it("has tabBarHeight defined", () => {
    expect(LAYOUT_DEFAULTS.tabBarHeight).toBeDefined();
    expect(typeof LAYOUT_DEFAULTS.tabBarHeight).toBe("number");
  });

  it("sidebar collapsed width is less than full width", () => {
    expect(LAYOUT_DEFAULTS.sidebarCollapsedWidth).toBeLessThan(
      LAYOUT_DEFAULTS.sidebarWidth,
    );
  });
});
