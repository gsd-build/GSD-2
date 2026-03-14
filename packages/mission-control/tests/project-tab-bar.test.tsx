import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import React from "react";
import ProjectTabBar from "../src/components/workspace/ProjectTabBar";

// Inline type for open projects (Phase 19)
interface OpenProject {
  id: string;
  name: string;
  isProcessing: boolean;
}

describe("tab bar visibility", () => {
  it("tab bar hidden when 0 projects open", () => {
    const html = renderToString(
      React.createElement(ProjectTabBar, { openProjects: [] as OpenProject[] })
    );
    // Component renders null or empty when no projects
    expect(html === "" || html === "null" || !html.includes("<nav") && !html.includes("<ul")).toBe(true);
  });

  it("tab bar hidden when 1 project open", () => {
    const projects: OpenProject[] = [{ id: "1", name: "Project Alpha", isProcessing: false }];
    const html = renderToString(
      React.createElement(ProjectTabBar, { openProjects: projects })
    );
    // Single project — tab bar not shown
    expect(html === "" || html === "null" || !html.includes("Project Alpha")).toBe(true);
  });

  it("tab bar visible when 2+ projects open", () => {
    const projects: OpenProject[] = [
      { id: "1", name: "Project Alpha", isProcessing: false },
      { id: "2", name: "Project Beta", isProcessing: false },
    ];
    const html = renderToString(
      React.createElement(ProjectTabBar, { openProjects: projects })
    );
    expect(html).toContain("Project Alpha");
    expect(html).toContain("Project Beta");
  });
});

describe("amber dot", () => {
  it("shown when project isProcessing", () => {
    const projects: OpenProject[] = [
      { id: "1", name: "Project Alpha", isProcessing: false },
      { id: "2", name: "Project Beta", isProcessing: true },
    ];
    const html = renderToString(
      React.createElement(ProjectTabBar, { openProjects: projects })
    );
    // Amber indicator should be present for the processing project
    const hasAmber = html.includes("amber") || html.includes("F59E0B") || html.includes("processing") || html.includes("pulse");
    expect(hasAmber).toBe(true);
  });
});
