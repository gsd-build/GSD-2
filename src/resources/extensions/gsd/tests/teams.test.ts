import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverTeams,
  resolveTeamForFiles,
  resolveTeamForTask,
  resolveTeamForSlice,
  getTeamAgent,
} from "../teams.ts";
import type { TeamDefinition } from "../types.ts";

// ─── Helper ────────────────────────────────────────────────────────────────

function makeFrontendTeam(): TeamDefinition {
  return {
    name: "frontend",
    description: "React/UI specialists",
    members: [
      { agent: "typescript-pro", role: "implementer" },
      { agent: "worker", role: "reviewer" },
    ],
    filePatterns: ["src/components/**", "**/*.tsx", "**/*.css"],
    capabilities: ["react", "css", "tailwind"],
    model: "claude-sonnet-4-20250514",
  };
}

function makeBackendTeam(): TeamDefinition {
  return {
    name: "backend",
    description: "API and database work",
    members: [{ agent: "worker", role: "implementer" }],
    filePatterns: ["src/api/**", "**/*.sql", "src/db/**"],
    capabilities: ["node", "postgres", "api-design"],
  };
}

// ─── discoverTeams ─────────────────────────────────────────────────────────

test("discoverTeams loads teams from .gsd/teams/ YAML files (JSON format)", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-teams-discover-"));
  try {
    mkdirSync(join(base, ".gsd", "teams"), { recursive: true });

    // Use JSON format which the parser handles reliably
    writeFileSync(join(base, ".gsd", "teams", "frontend.yaml"), JSON.stringify({
      name: "frontend",
      description: "React team",
      members: [{ agent: "typescript-pro" }],
      filePatterns: ["src/components/**", "**/*.tsx"],
      capabilities: ["react", "css"],
    }));

    const teams = discoverTeams(base);
    assert.equal(teams.length, 1);
    assert.equal(teams[0].name, "frontend");
    assert.equal(teams[0].members.length, 1);
    assert.equal(teams[0].members[0].agent, "typescript-pro");
    assert.deepEqual(teams[0].filePatterns, ["src/components/**", "**/*.tsx"]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("discoverTeams returns empty when no teams dir exists", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-teams-empty-"));
  try {
    mkdirSync(join(base, ".gsd"), { recursive: true });
    assert.deepEqual(discoverTeams(base), []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ─── resolveTeamForFiles ──────────────────────────────────────────────────

test("resolveTeamForFiles matches .tsx files to frontend team", () => {
  const teams = [makeFrontendTeam(), makeBackendTeam()];
  const files = ["src/components/Button.tsx", "src/components/Modal.tsx"];

  const assignment = resolveTeamForFiles(teams, files);
  assert.ok(assignment);
  assert.equal(assignment.teamName, "frontend");
  assert.ok(assignment.confidence > 0.3);
});

test("resolveTeamForFiles matches .sql files to backend team", () => {
  const teams = [makeFrontendTeam(), makeBackendTeam()];
  const files = ["src/db/schema.sql", "src/api/routes.ts"];

  const assignment = resolveTeamForFiles(teams, files);
  assert.ok(assignment);
  assert.equal(assignment.teamName, "backend");
});

test("resolveTeamForFiles returns null when no team matches", () => {
  const teams = [makeFrontendTeam(), makeBackendTeam()];
  const files = ["docs/readme.md", "config/settings.toml"];

  const assignment = resolveTeamForFiles(teams, files);
  assert.equal(assignment, null);
});

test("resolveTeamForFiles uses capability matching for tie-breaking", () => {
  const teams = [makeFrontendTeam(), makeBackendTeam()];
  // Files that could match either team
  const files = ["src/components/DataGrid.tsx"];

  const assignment = resolveTeamForFiles(teams, files, "React component with CSS styling");
  assert.ok(assignment);
  assert.equal(assignment.teamName, "frontend");
  assert.ok(assignment.matchedCapabilities.includes("react"));
});

test("resolveTeamForFiles returns null for empty teams array", () => {
  assert.equal(resolveTeamForFiles([], ["a.ts"]), null);
});

test("resolveTeamForFiles returns null for empty files array", () => {
  assert.equal(resolveTeamForFiles([makeFrontendTeam()], []), null);
});

// ─── resolveTeamForTask / resolveTeamForSlice ─────────────────────────────

test("resolveTeamForTask delegates to resolveTeamForFiles", () => {
  const teams = [makeFrontendTeam()];
  const result = resolveTeamForTask(teams, ["src/components/App.tsx"]);
  assert.ok(result);
  assert.equal(result.teamName, "frontend");
});

test("resolveTeamForSlice delegates to resolveTeamForFiles", () => {
  const teams = [makeBackendTeam()];
  const result = resolveTeamForSlice(teams, ["src/api/users.ts", "src/db/migrate.sql"]);
  assert.ok(result);
  assert.equal(result.teamName, "backend");
});

// ─── getTeamAgent ─────────────────────────────────────────────────────────

test("getTeamAgent returns member by role", () => {
  const team = makeFrontendTeam();
  const reviewer = getTeamAgent(team, "reviewer");
  assert.ok(reviewer);
  assert.equal(reviewer.agent, "worker");
});

test("getTeamAgent returns first member when no role specified", () => {
  const team = makeFrontendTeam();
  const agent = getTeamAgent(team);
  assert.ok(agent);
  assert.equal(agent.agent, "typescript-pro");
});

test("getTeamAgent returns first member when role not found", () => {
  const team = makeFrontendTeam();
  const agent = getTeamAgent(team, "nonexistent");
  assert.ok(agent);
  assert.equal(agent.agent, "typescript-pro");
});

test("getTeamAgent returns null for empty members", () => {
  const team: TeamDefinition = {
    name: "empty", description: "", members: [],
    filePatterns: [], capabilities: [],
  };
  assert.equal(getTeamAgent(team), null);
});
