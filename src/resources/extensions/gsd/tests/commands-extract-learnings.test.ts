import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  parseExtractLearningsArgs,
  buildLearningsOutputPath,
  resolvePhaseArtifacts,
  buildExtractLearningsPrompt,
  buildFrontmatter,
  extractProjectName,
} from "../commands-extract-learnings.js";

// ─── parseExtractLearningsArgs ────────────────────────────────────────────────

describe("parseExtractLearningsArgs", () => {
  it("parses a milestone ID", () => {
    const result = parseExtractLearningsArgs("M001");
    assert.deepEqual(result, { milestoneId: "M001" });
  });

  it("returns null milestoneId for empty string", () => {
    const result = parseExtractLearningsArgs("");
    assert.deepEqual(result, { milestoneId: null });
  });

  it("returns null milestoneId for whitespace-only string", () => {
    const result = parseExtractLearningsArgs("  ");
    assert.deepEqual(result, { milestoneId: null });
  });

  it("trims whitespace from milestone ID", () => {
    const result = parseExtractLearningsArgs("  M002  ");
    assert.deepEqual(result, { milestoneId: "M002" });
  });
});

// ─── buildLearningsOutputPath ─────────────────────────────────────────────────

describe("buildLearningsOutputPath", () => {
  it("builds the correct output path", () => {
    const result = buildLearningsOutputPath("/base/.gsd/milestones/M001", "M001");
    assert.equal(result, "/base/.gsd/milestones/M001/M001-LEARNINGS.md");
  });

  it("builds path for different milestone ID", () => {
    const result = buildLearningsOutputPath("/project/.gsd/milestones/M005", "M005");
    assert.equal(result, "/project/.gsd/milestones/M005/M005-LEARNINGS.md");
  });
});

// ─── resolvePhaseArtifacts ────────────────────────────────────────────────────

describe("resolvePhaseArtifacts", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = join(tmpdir(), `gsd-learnings-test-${randomUUID()}`);
    mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("finds required PLAN and SUMMARY when both present", () => {
    writeFileSync(join(tmpBase, "M001-PLAN.md"), "# M001 Plan content", "utf-8");
    writeFileSync(join(tmpBase, "M001-SUMMARY.md"), "# M001 Summary content", "utf-8");

    const result = resolvePhaseArtifacts(tmpBase, "M001");
    assert.equal(result.plan, join(tmpBase, "M001-PLAN.md"));
    assert.equal(result.summary, join(tmpBase, "M001-SUMMARY.md"));
    assert.deepEqual(result.missingRequired, []);
  });

  it("reports missing PLAN as missingRequired", () => {
    writeFileSync(join(tmpBase, "M001-SUMMARY.md"), "# Summary", "utf-8");

    const result = resolvePhaseArtifacts(tmpBase, "M001");
    assert.ok(result.missingRequired.includes("M001-PLAN.md"));
    assert.equal(result.plan, null);
  });

  it("reports missing SUMMARY as missingRequired", () => {
    writeFileSync(join(tmpBase, "M001-PLAN.md"), "# Plan", "utf-8");

    const result = resolvePhaseArtifacts(tmpBase, "M001");
    assert.ok(result.missingRequired.includes("M001-SUMMARY.md"));
    assert.equal(result.summary, null);
  });

  it("reports both required files missing when neither present", () => {
    const result = resolvePhaseArtifacts(tmpBase, "M001");
    assert.equal(result.missingRequired.length, 2);
    assert.ok(result.missingRequired.includes("M001-PLAN.md"));
    assert.ok(result.missingRequired.includes("M001-SUMMARY.md"));
  });

  it("finds optional VERIFICATION when present", () => {
    writeFileSync(join(tmpBase, "M001-PLAN.md"), "# Plan", "utf-8");
    writeFileSync(join(tmpBase, "M001-SUMMARY.md"), "# Summary", "utf-8");
    writeFileSync(join(tmpBase, "M001-VERIFICATION.md"), "# Verification", "utf-8");

    const result = resolvePhaseArtifacts(tmpBase, "M001");
    assert.equal(result.verification, join(tmpBase, "M001-VERIFICATION.md"));
  });

  it("returns null for optional VERIFICATION when absent", () => {
    writeFileSync(join(tmpBase, "M001-PLAN.md"), "# Plan", "utf-8");
    writeFileSync(join(tmpBase, "M001-SUMMARY.md"), "# Summary", "utf-8");

    const result = resolvePhaseArtifacts(tmpBase, "M001");
    assert.equal(result.verification, null);
  });

  it("finds optional UAT when present", () => {
    writeFileSync(join(tmpBase, "M001-PLAN.md"), "# Plan", "utf-8");
    writeFileSync(join(tmpBase, "M001-SUMMARY.md"), "# Summary", "utf-8");
    writeFileSync(join(tmpBase, "M001-UAT.md"), "# UAT", "utf-8");

    const result = resolvePhaseArtifacts(tmpBase, "M001");
    assert.equal(result.uat, join(tmpBase, "M001-UAT.md"));
  });

  it("returns null for optional UAT when absent, no error", () => {
    writeFileSync(join(tmpBase, "M001-PLAN.md"), "# Plan", "utf-8");
    writeFileSync(join(tmpBase, "M001-SUMMARY.md"), "# Summary", "utf-8");

    const result = resolvePhaseArtifacts(tmpBase, "M001");
    assert.equal(result.uat, null);
    assert.deepEqual(result.missingRequired, []);
  });
});

// ─── buildExtractLearningsPrompt ──────────────────────────────────────────────

describe("buildExtractLearningsPrompt", () => {
  it("includes milestoneId and outputPath", () => {
    const result = buildExtractLearningsPrompt({
      milestoneId: "M001",
      milestoneName: "Test Milestone",
      outputPath: "/project/.gsd/milestones/M001/M001-LEARNINGS.md",
      relativeOutputPath: ".gsd/milestones/M001/M001-LEARNINGS.md",
      planContent: "# Plan content",
      summaryContent: "# Summary content",
      verificationContent: null,
      uatContent: null,
      missingArtifacts: [],
      projectName: "MyProject",
    });

    assert.ok(result.includes("M001"));
    assert.ok(result.includes("/project/.gsd/milestones/M001/M001-LEARNINGS.md"));
  });

  it("includes all 4 learning categories", () => {
    const result = buildExtractLearningsPrompt({
      milestoneId: "M001",
      milestoneName: "Test Milestone",
      outputPath: "/out/M001-LEARNINGS.md",
      relativeOutputPath: ".gsd/milestones/M001/M001-LEARNINGS.md",
      planContent: "# Plan",
      summaryContent: "# Summary",
      verificationContent: null,
      uatContent: null,
      missingArtifacts: [],
      projectName: "MyProject",
    });

    assert.ok(result.includes("Decisions"));
    assert.ok(result.includes("Lessons"));
    assert.ok(result.includes("Patterns"));
    assert.ok(result.includes("Surprises"));
  });

  it("includes plan and summary content", () => {
    const result = buildExtractLearningsPrompt({
      milestoneId: "M001",
      milestoneName: "Test Milestone",
      outputPath: "/out/M001-LEARNINGS.md",
      relativeOutputPath: ".gsd/milestones/M001/M001-LEARNINGS.md",
      planContent: "PLAN_CONTENT_UNIQUE_123",
      summaryContent: "SUMMARY_CONTENT_UNIQUE_456",
      verificationContent: null,
      uatContent: null,
      missingArtifacts: [],
      projectName: "MyProject",
    });

    assert.ok(result.includes("PLAN_CONTENT_UNIQUE_123"));
    assert.ok(result.includes("SUMMARY_CONTENT_UNIQUE_456"));
  });

  it("includes optional artifacts when present", () => {
    const result = buildExtractLearningsPrompt({
      milestoneId: "M001",
      milestoneName: "Test Milestone",
      outputPath: "/out/M001-LEARNINGS.md",
      relativeOutputPath: ".gsd/milestones/M001/M001-LEARNINGS.md",
      planContent: "# Plan",
      summaryContent: "# Summary",
      verificationContent: "VERIFICATION_UNIQUE_789",
      uatContent: "UAT_UNIQUE_012",
      missingArtifacts: [],
      projectName: "MyProject",
    });

    assert.ok(result.includes("VERIFICATION_UNIQUE_789"));
    assert.ok(result.includes("UAT_UNIQUE_012"));
  });

  it("lists missing artifacts when present", () => {
    const result = buildExtractLearningsPrompt({
      milestoneId: "M001",
      milestoneName: "Test Milestone",
      outputPath: "/out/M001-LEARNINGS.md",
      relativeOutputPath: ".gsd/milestones/M001/M001-LEARNINGS.md",
      planContent: "# Plan",
      summaryContent: "# Summary",
      verificationContent: null,
      uatContent: null,
      missingArtifacts: ["M001-VERIFICATION.md"],
      projectName: "MyProject",
    });

    assert.ok(result.includes("M001-VERIFICATION.md"));
  });
});

// ─── buildFrontmatter ─────────────────────────────────────────────────────────

describe("buildFrontmatter", () => {
  it("starts with --- and ends with ---", () => {
    const result = buildFrontmatter({
      milestoneId: "M001",
      milestoneName: "Test Milestone",
      projectName: "MyProject",
      generatedAt: "2026-04-15T10:00:00Z",
      counts: { decisions: 0, lessons: 0, patterns: 0, surprises: 0 },
      missingArtifacts: [],
    });

    assert.ok(result.startsWith("---\n"));
    assert.ok(result.endsWith("---"));
  });

  it("includes required fields", () => {
    const result = buildFrontmatter({
      milestoneId: "M001",
      milestoneName: "Test Milestone",
      projectName: "MyProject",
      generatedAt: "2026-04-15T10:00:00Z",
      counts: { decisions: 3, lessons: 2, patterns: 1, surprises: 0 },
      missingArtifacts: [],
    });

    assert.ok(result.includes("phase:"));
    assert.ok(result.includes("phase_name:"));
    assert.ok(result.includes("project:"));
    assert.ok(result.includes("generated:"));
    assert.ok(result.includes("counts:"));
    assert.ok(result.includes("missing_artifacts:"));
  });

  it("includes milestoneId as phase value", () => {
    const result = buildFrontmatter({
      milestoneId: "M001",
      milestoneName: "Auth System",
      projectName: "MyApp",
      generatedAt: "2026-04-15T10:00:00Z",
      counts: { decisions: 0, lessons: 0, patterns: 0, surprises: 0 },
      missingArtifacts: [],
    });

    assert.ok(result.includes("M001"));
    assert.ok(result.includes("Auth System"));
    assert.ok(result.includes("MyApp"));
    assert.ok(result.includes("2026-04-15T10:00:00Z"));
  });

  it("includes missing artifacts list", () => {
    const result = buildFrontmatter({
      milestoneId: "M001",
      milestoneName: "Test",
      projectName: "Proj",
      generatedAt: "2026-04-15T10:00:00Z",
      counts: { decisions: 0, lessons: 0, patterns: 0, surprises: 0 },
      missingArtifacts: ["M001-VERIFICATION.md", "M001-UAT.md"],
    });

    assert.ok(result.includes("M001-VERIFICATION.md"));
    assert.ok(result.includes("M001-UAT.md"));
  });
});

// ─── extractProjectName ───────────────────────────────────────────────────────

describe("extractProjectName", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = join(tmpdir(), `gsd-projname-test-${randomUUID()}`);
    mkdirSync(join(tmpBase, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it("reads name from PROJECT.md frontmatter", () => {
    writeFileSync(
      join(tmpBase, ".gsd", "PROJECT.md"),
      "---\nname: My Cool Project\nversion: 1\n---\n# Project\n",
      "utf-8",
    );

    const result = extractProjectName(tmpBase);
    assert.equal(result, "My Cool Project");
  });

  it("falls back to directory name when PROJECT.md absent", () => {
    const result = extractProjectName(tmpBase);
    // Should return the last path segment of tmpBase
    assert.equal(result, tmpBase.split("/").at(-1));
  });

  it("falls back to directory name when PROJECT.md has no name field", () => {
    writeFileSync(
      join(tmpBase, ".gsd", "PROJECT.md"),
      "---\nversion: 1\n---\n# Project\n",
      "utf-8",
    );

    const result = extractProjectName(tmpBase);
    assert.equal(result, tmpBase.split("/").at(-1));
  });
});
