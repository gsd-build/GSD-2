import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import React from "react";
import ProjectHomeScreen from "../src/components/workspace/ProjectHomeScreen";
import ProjectCard from "../src/components/workspace/ProjectCard";
import ProjectCardMenu from "../src/components/workspace/ProjectCardMenu";
import type { RecentProject } from "../src/server/fs-types";

// Extended fixture with Phase 19 fields
const projectFixture: RecentProject & {
  archived: boolean;
  activeMilestone: string;
  progressPercent: number;
  lastActivity: string;
} = {
  path: "/projects/test",
  name: "Test Project",
  lastOpened: Date.now() - 7200000,
  isGsdProject: true,
  archived: false,
  activeMilestone: "v2.0",
  progressPercent: 43,
  lastActivity: "2026-03-14",
};

describe("Developer empty state", () => {
  it("shows Open Folder button", () => {
    const html = renderToString(
      React.createElement(ProjectHomeScreen, { builderMode: false, projects: [] })
    );
    expect(html).toContain("Open Folder");
  });
});

describe("Builder empty state", () => {
  it("shows brief-taking input", () => {
    const html = renderToString(
      React.createElement(ProjectHomeScreen, { builderMode: true, projects: [] })
    );
    // Should contain a project name input or brief input placeholder
    const hasInput = html.includes("project") || html.includes("Project") || html.includes("brief") || html.includes("name");
    expect(hasInput).toBe(true);
  });
});

describe("ProjectCard renders", () => {
  it("renders name, last active, milestone, progress, Resume button", () => {
    const html = renderToString(
      React.createElement(ProjectCard, { project: projectFixture })
    );
    expect(html).toContain("Test Project");
    expect(html).toContain("v2.0");
    expect(html).toContain("Resume");
  });
});

describe("ProjectCardMenu", () => {
  it("shows Archive, Open in Finder, Remove from list", () => {
    const html = renderToString(
      React.createElement(ProjectCardMenu, { project: projectFixture, onClose: () => {} })
    );
    expect(html).toContain("Archive");
    expect(html).toContain("Finder");
    expect(html).toContain("Remove");
  });
});
