/**
 * Unit tests for `/gsd eval-review` (commands-eval-review.ts).
 *
 * Each PR #4247 review finding is paired with a regression test that asserts
 * the documented fix behavior. Tests are organized one `describe` per
 * exported function, with the regression-test cases marked in their `it`
 * descriptions.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  EvalReviewArgError,
  MAX_CONTEXT_BYTES,
  SLICE_ID_PATTERN,
  buildEvalReviewContext,
  buildEvalReviewPrompt,
  detectEvalReviewState,
  evalReviewWritePath,
  findEvalReviewFile,
  parseEvalReviewArgs,
  type EvalReviewState,
} from "../commands-eval-review.js";
import { _clearGsdRootCache } from "../paths.js";

// ─── parseEvalReviewArgs ──────────────────────────────────────────────────────

describe("parseEvalReviewArgs", () => {
  it("parses a bare slice ID", () => {
    const result = parseEvalReviewArgs("S07");
    assert.equal(result.sliceId, "S07");
    assert.equal(result.force, false);
    assert.equal(result.show, false);
  });

  it("recognizes --force", () => {
    const result = parseEvalReviewArgs("S07 --force");
    assert.equal(result.force, true);
  });

  it("recognizes --show", () => {
    const result = parseEvalReviewArgs("S07 --show");
    assert.equal(result.show, true);
  });

  it("treats flag order as irrelevant", () => {
    const result = parseEvalReviewArgs("--force S07 --show");
    assert.equal(result.sliceId, "S07");
    assert.equal(result.force, true);
    assert.equal(result.show, true);
  });

  it("collapses multiple whitespace separators", () => {
    const result = parseEvalReviewArgs("   S07    --force  ");
    assert.equal(result.sliceId, "S07");
    assert.equal(result.force, true);
  });

  it("throws when the slice ID is missing entirely", () => {
    assert.throws(() => parseEvalReviewArgs(""), EvalReviewArgError);
    assert.throws(() => parseEvalReviewArgs("   "), EvalReviewArgError);
    assert.throws(() => parseEvalReviewArgs("--force"), EvalReviewArgError);
  });

  it("throws on an unknown --* token (regression for #4247: --force-wipe must not be silently stripped)", () => {
    assert.throws(() => parseEvalReviewArgs("S07 --force-wipe"), EvalReviewArgError);
  });

  it("throws on multiple slice IDs", () => {
    assert.throws(() => parseEvalReviewArgs("S07 S08"), EvalReviewArgError);
  });

  it("rejects path-traversal in the slice ID (regression for #4247 BLOCKER)", () => {
    assert.throws(() => parseEvalReviewArgs("../../etc/passwd"), EvalReviewArgError);
    assert.throws(() => parseEvalReviewArgs("S01/../../"), EvalReviewArgError);
    assert.throws(() => parseEvalReviewArgs("S01/.."), EvalReviewArgError);
  });

  it("rejects backslash separators in the slice ID", () => {
    assert.throws(() => parseEvalReviewArgs("S01\\..\\..\\etc"), EvalReviewArgError);
  });

  it("rejects null bytes in the slice ID", () => {
    assert.throws(() => parseEvalReviewArgs("S01\0"), EvalReviewArgError);
  });

  it("rejects unicode look-alikes (Cyrillic Ѕ)", () => {
    // U+0405 (Cyrillic capital S) ≠ U+0053 (Latin capital S)
    assert.throws(() => parseEvalReviewArgs("Ѕ" + "01"), EvalReviewArgError);
  });

  it("rejects lowercase 's' prefix", () => {
    assert.throws(() => parseEvalReviewArgs("s01"), EvalReviewArgError);
  });

  it("rejects ID without trailing digits", () => {
    assert.throws(() => parseEvalReviewArgs("S"), EvalReviewArgError);
    assert.throws(() => parseEvalReviewArgs("Sabc"), EvalReviewArgError);
  });

  it("accepts multi-digit slice IDs", () => {
    assert.equal(parseEvalReviewArgs("S100").sliceId, "S100");
  });
});

// ─── SLICE_ID_PATTERN export ──────────────────────────────────────────────────

describe("SLICE_ID_PATTERN", () => {
  it("matches the canonical /^S\\d+$/ shape used elsewhere in the gsd extension", () => {
    assert.ok(SLICE_ID_PATTERN.test("S01"));
    assert.ok(SLICE_ID_PATTERN.test("S99"));
    assert.ok(!SLICE_ID_PATTERN.test("s01"));
    assert.ok(!SLICE_ID_PATTERN.test("S"));
    assert.ok(!SLICE_ID_PATTERN.test("S01a"));
    assert.ok(!SLICE_ID_PATTERN.test("../S01"));
  });
});

// ─── detectEvalReviewState ────────────────────────────────────────────────────

describe("detectEvalReviewState", () => {
  let basePath: string;

  beforeEach(() => {
    basePath = join(tmpdir(), `gsd-eval-review-test-${randomUUID()}`);
    mkdirSync(basePath, { recursive: true });
  });

  afterEach(() => {
    _clearGsdRootCache();
    rmSync(basePath, { recursive: true, force: true });
  });

  function setupSliceLayout(sliceFiles: Record<string, string>): void {
    const sliceDir = join(basePath, ".gsd", "milestones", "M001", "slices", "S07");
    mkdirSync(sliceDir, { recursive: true });
    for (const [filename, content] of Object.entries(sliceFiles)) {
      writeFileSync(join(sliceDir, filename), content, "utf-8");
    }
  }

  it("returns no-slice-dir when the slice directory is missing (regression for #4247 MINOR — no-summary conflation)", () => {
    mkdirSync(join(basePath, ".gsd", "milestones", "M001", "slices"), { recursive: true });
    const result = detectEvalReviewState(
      { sliceId: "S07", force: false, show: false },
      basePath,
      "M001",
    );
    assert.equal(result.kind, "no-slice-dir");
    if (result.kind === "no-slice-dir") {
      assert.equal(result.sliceId, "S07");
      assert.ok(result.expectedDir.includes("S07"));
    }
  });

  it("returns no-summary when the slice directory exists but SUMMARY.md is missing", () => {
    setupSliceLayout({});
    const result = detectEvalReviewState(
      { sliceId: "S07", force: false, show: false },
      basePath,
      "M001",
    );
    assert.equal(result.kind, "no-summary");
  });

  it("returns no-summary with specPath populated when only AI-SPEC.md is present", () => {
    setupSliceLayout({ "S07-AI-SPEC.md": "# spec" });
    const result = detectEvalReviewState(
      { sliceId: "S07", force: false, show: false },
      basePath,
      "M001",
    );
    assert.equal(result.kind, "no-summary");
    if (result.kind === "no-summary") {
      assert.ok(result.specPath?.endsWith("S07-AI-SPEC.md"));
    }
  });

  it("returns ready when SUMMARY.md is present, with specPath null when AI-SPEC.md is absent", () => {
    setupSliceLayout({ "S07-SUMMARY.md": "# summary" });
    const result = detectEvalReviewState(
      { sliceId: "S07", force: false, show: false },
      basePath,
      "M001",
    );
    assert.equal(result.kind, "ready");
    if (result.kind === "ready") {
      assert.ok(result.summaryPath.endsWith("S07-SUMMARY.md"));
      assert.equal(result.specPath, null);
    }
  });

  it("returns ready with both paths populated when both files exist", () => {
    setupSliceLayout({
      "S07-SUMMARY.md": "# summary",
      "S07-AI-SPEC.md": "# spec",
    });
    const result = detectEvalReviewState(
      { sliceId: "S07", force: false, show: false },
      basePath,
      "M001",
    );
    assert.equal(result.kind, "ready");
    if (result.kind === "ready") {
      assert.ok(result.summaryPath.endsWith("S07-SUMMARY.md"));
      assert.ok(result.specPath?.endsWith("S07-AI-SPEC.md"));
    }
  });
});

// ─── buildEvalReviewContext ───────────────────────────────────────────────────

describe("buildEvalReviewContext", () => {
  let basePath: string;
  let sliceDir: string;

  beforeEach(() => {
    basePath = join(tmpdir(), `gsd-eval-ctx-test-${randomUUID()}`);
    sliceDir = join(basePath, ".gsd", "milestones", "M001", "slices", "S07");
    mkdirSync(sliceDir, { recursive: true });
    process.chdir(basePath);
  });

  afterEach(() => {
    _clearGsdRootCache();
    process.chdir(tmpdir());
    rmSync(basePath, { recursive: true, force: true });
  });

  function fakeReady(opts: {
    summaryBytes?: number;
    specBytes?: number | null;
  } = {}): Extract<EvalReviewState, { kind: "ready" }> {
    const summaryPath = join(sliceDir, "S07-SUMMARY.md");
    writeFileSync(summaryPath, "S".repeat(opts.summaryBytes ?? 512), "utf-8");

    let specPath: string | null = null;
    if (opts.specBytes != null) {
      specPath = join(sliceDir, "S07-AI-SPEC.md");
      writeFileSync(specPath, "P".repeat(opts.specBytes), "utf-8");
    }

    return {
      kind: "ready",
      sliceId: "S07",
      sliceDir,
      summaryPath,
      specPath,
    };
  }

  it("inlines SUMMARY without truncation when under the cap", async () => {
    const state = fakeReady({ summaryBytes: 1024 });
    const ctx = await buildEvalReviewContext(state, "M001", () => new Date("2026-04-28T14:00:00Z"));
    assert.equal(ctx.truncated, false);
    assert.equal(ctx.summary.length, 1024);
    assert.equal(ctx.spec, null);
    assert.equal(ctx.generatedAt, "2026-04-28T14:00:00Z");
  });

  it("truncates SUMMARY when it alone exceeds the cap (regression for #4247 MAJOR — no size cap)", async () => {
    const state = fakeReady({ summaryBytes: MAX_CONTEXT_BYTES + 4096 });
    const ctx = await buildEvalReviewContext(state, "M001");
    assert.equal(ctx.truncated, true);
    assert.ok(ctx.summary.includes("[truncated:"));
    assert.equal(ctx.spec, null, "no budget for spec when summary alone exceeds cap");
  });

  it("inlines both SUMMARY and SPEC when their combined bytes fit", async () => {
    const state = fakeReady({ summaryBytes: 1024, specBytes: 2048 });
    const ctx = await buildEvalReviewContext(state, "M001");
    assert.equal(ctx.truncated, false);
    assert.equal(ctx.summary.length, 1024);
    assert.equal(ctx.spec?.length, 2048);
  });

  it("truncates SPEC to the residual budget when SUMMARY is large", async () => {
    const summaryBytes = MAX_CONTEXT_BYTES - 1024;
    const specBytes = 8 * 1024;
    const state = fakeReady({ summaryBytes, specBytes });
    const ctx = await buildEvalReviewContext(state, "M001");
    assert.equal(ctx.truncated, true);
    assert.ok(ctx.spec?.includes("[truncated:"));
  });

  it("returns spec=null when no AI-SPEC.md exists (best-practices audit mode)", async () => {
    const state = fakeReady({ summaryBytes: 256 });
    const ctx = await buildEvalReviewContext(state, "M001");
    assert.equal(ctx.spec, null);
  });

  it("populates outputPath using the canonical slice file naming", async () => {
    const state = fakeReady({ summaryBytes: 64 });
    const ctx = await buildEvalReviewContext(state, "M001");
    assert.ok(ctx.outputPath.endsWith("S07-EVAL-REVIEW.md"));
  });
});

// ─── evalReviewWritePath ──────────────────────────────────────────────────────

describe("evalReviewWritePath", () => {
  it("computes the canonical write path purely from inputs", () => {
    const result = evalReviewWritePath("/repo/.gsd/milestones/M001/slices/S07", "S07");
    assert.equal(result, "/repo/.gsd/milestones/M001/slices/S07/S07-EVAL-REVIEW.md");
  });

  it("does not touch the filesystem", () => {
    // Calling with a nonexistent dir is fine — it's pure path math.
    const result = evalReviewWritePath("/nonexistent/path/abc", "S99");
    assert.ok(result.endsWith("S99-EVAL-REVIEW.md"));
  });
});

// ─── findEvalReviewFile ───────────────────────────────────────────────────────

describe("findEvalReviewFile", () => {
  let basePath: string;

  beforeEach(() => {
    basePath = join(tmpdir(), `gsd-find-eval-${randomUUID()}`);
    mkdirSync(join(basePath, ".gsd", "milestones", "M001", "slices", "S07"), { recursive: true });
  });

  afterEach(() => {
    _clearGsdRootCache();
    rmSync(basePath, { recursive: true, force: true });
  });

  it("returns null when EVAL-REVIEW.md is absent", () => {
    assert.equal(findEvalReviewFile(basePath, "M001", "S07"), null);
  });

  it("returns the absolute path when EVAL-REVIEW.md is present", () => {
    const target = join(basePath, ".gsd", "milestones", "M001", "slices", "S07", "S07-EVAL-REVIEW.md");
    writeFileSync(target, "---\nschema: eval-review/v1\n---\n", "utf-8");
    const found = findEvalReviewFile(basePath, "M001", "S07");
    assert.equal(found, target);
  });
});

// ─── buildEvalReviewPrompt ────────────────────────────────────────────────────

describe("buildEvalReviewPrompt", () => {
  function ctxFixture(overrides: Partial<Parameters<typeof buildEvalReviewPrompt>[0]> = {}) {
    return {
      milestoneId: "M001",
      sliceId: "S07",
      summary: "The slice did stuff.",
      summaryPath: "/abs/.gsd/milestones/M001/slices/S07/S07-SUMMARY.md",
      spec: "Required: log every LLM call.",
      specPath: "/abs/.gsd/milestones/M001/slices/S07/S07-AI-SPEC.md",
      outputPath: "/abs/.gsd/milestones/M001/slices/S07/S07-EVAL-REVIEW.md",
      relativeOutputPath: ".gsd/milestones/M001/slices/S07/S07-EVAL-REVIEW.md",
      truncated: false,
      generatedAt: "2026-04-28T14:00:00Z",
      ...overrides,
    };
  }

  it("includes the explicit anti-Goodhart rule (regression for #4247 CONCEPTUAL — string presence is not evidence)", () => {
    const prompt = buildEvalReviewPrompt(ctxFixture());
    assert.ok(prompt.includes("Anti-Goodhart"), "prompt must reference the anti-Goodhart rule by name");
    assert.ok(
      prompt.includes("string or file\npresence") || prompt.includes("string presence") || prompt.toLowerCase().includes("not evidence"),
      "prompt must explicitly state that string/token presence is not evidence",
    );
    assert.ok(prompt.includes("grep langfuse"), "prompt must show the canonical Goodhart counter-example");
  });

  it("requires evidence on every gap (frontmatter contract)", () => {
    const prompt = buildEvalReviewPrompt(ctxFixture());
    assert.ok(prompt.includes("evidence"), "prompt must require an evidence field");
    assert.ok(prompt.includes("REQUIRED"), "prompt must mark evidence as required");
  });

  it("inlines the YAML schema with the expected version literal", () => {
    const prompt = buildEvalReviewPrompt(ctxFixture());
    assert.ok(prompt.includes("schema: eval-review/v1"));
    assert.ok(prompt.includes("PRODUCTION_READY"));
    assert.ok(prompt.includes("NOT_IMPLEMENTED"));
  });

  it("instructs the agent to write to the canonical output path", () => {
    const prompt = buildEvalReviewPrompt(ctxFixture());
    assert.ok(prompt.includes("/abs/.gsd/milestones/M001/slices/S07/S07-EVAL-REVIEW.md"));
  });

  it("surfaces the truncation marker into the prompt body when inputs were truncated", () => {
    const prompt = buildEvalReviewPrompt(ctxFixture({ truncated: true }));
    assert.ok(prompt.includes("truncated"));
  });

  it("documents the 60/40 weighting alongside the rubric", () => {
    const prompt = buildEvalReviewPrompt(ctxFixture());
    assert.ok(prompt.includes("0.6"));
    assert.ok(prompt.includes("0.4"));
    assert.ok(prompt.includes("ADR-011"));
  });

  it("falls back to a best-practices note when AI-SPEC.md is absent", () => {
    const prompt = buildEvalReviewPrompt(ctxFixture({ spec: null, specPath: null }));
    assert.ok(prompt.toLowerCase().includes("not present"));
  });
});