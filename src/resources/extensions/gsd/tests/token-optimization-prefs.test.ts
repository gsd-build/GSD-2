import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Test the type definitions exist and are correct
describe("token-optimization: types", () => {
  it("CompressionStrategy accepts valid values", async () => {
    const { } = await import("../types.js");
    // Type-level test — if this compiles, the types exist
    const truncate: import("../types.js").CompressionStrategy = "truncate";
    const compress: import("../types.js").CompressionStrategy = "compress";
    assert.equal(truncate, "truncate");
    assert.equal(compress, "compress");
  });

  it("ContextSelectionMode accepts valid values", async () => {
    const full: import("../types.js").ContextSelectionMode = "full";
    const smart: import("../types.js").ContextSelectionMode = "smart";
    assert.equal(full, "full");
    assert.equal(smart, "smart");
  });
});

// Test cache hit rate computation
describe("token-optimization: cache hit rate", () => {
  it("computeCacheHitRate returns correct percentage", async () => {
    const { computeCacheHitRate } = await import("../prompt-cache-optimizer.js");
    assert.equal(computeCacheHitRate({ cacheRead: 900, cacheWrite: 100, input: 100 }), 90);
    assert.equal(computeCacheHitRate({ cacheRead: 0, cacheWrite: 0, input: 100 }), 0);
    assert.equal(computeCacheHitRate({ cacheRead: 0, cacheWrite: 0, input: 0 }), 0);
    assert.equal(computeCacheHitRate({ cacheRead: 500, cacheWrite: 0, input: 500 }), 50);
  });
});

// Test structured data savings
describe("token-optimization: structured data savings", () => {
  it("compact decisions format is shorter than markdown table", async () => {
    const { formatDecisionsCompact, measureSavings } = await import("../structured-data-formatter.js");
    const decisions = [
      { id: "D001", when_context: "M001/S01", scope: "architecture", decision: "Use SQLite for storage", choice: "WAL mode", rationale: "Built-in, no external deps", revisable: "yes" },
      { id: "D002", when_context: "M001/S02", scope: "testing", decision: "Unit test all parsers", choice: "node:test", rationale: "Fast, zero-dependency", revisable: "no" },
    ];
    const compact = formatDecisionsCompact(decisions);
    // A realistic markdown table equivalent
    const markdown = [
      "| # | When | Scope | Decision | Choice | Rationale | Revisable? |",
      "|---|------|-------|----------|--------|-----------|------------|",
      "| D001 | M001/S01 | architecture | Use SQLite for storage | WAL mode | Built-in, no external deps | yes |",
      "| D002 | M001/S02 | testing | Unit test all parsers | node:test | Fast, zero-dependency | no |",
    ].join("\n");
    const savings = measureSavings(compact, markdown);
    assert.ok(savings > 10, `Expected >10% savings, got ${savings}%`);
  });

  it("compact requirements format drops low-value fields", async () => {
    const { formatRequirementsCompact } = await import("../structured-data-formatter.js");
    const requirements = [{
      id: "R001", class: "functional", status: "active",
      description: "API response time < 200ms",
      why: "User experience", primary_owner: "S01",
      validation: "Load test P99 < 200ms",
    }];
    const compact = formatRequirementsCompact(requirements);
    assert.ok(!compact.includes("source"), "Should not include source field");
    assert.ok(!compact.includes("supporting_slices"), "Should not include supporting_slices");
    assert.ok(compact.includes("R001"), "Should include requirement ID");
  });
});

// Test compression levels
describe("token-optimization: prompt compression", () => {
  it("light compression removes extra whitespace", async () => {
    const { compressPrompt } = await import("../prompt-compressor.js");
    const input = "Line 1\n\n\n\n\nLine 2\n\n\n\nLine 3";
    const result = compressPrompt(input, { level: "light" });
    assert.ok(result.savingsPercent > 0, "Should have positive savings");
    assert.ok(!result.content.includes("\n\n\n"), "Should collapse multiple blank lines");
  });

  it("moderate compression abbreviates verbose phrases", async () => {
    const { compressPrompt } = await import("../prompt-compressor.js");
    const input = "In order to achieve this, it is important to note that the following steps are required.";
    const result = compressPrompt(input, { level: "moderate" });
    assert.ok(result.compressedChars < result.originalChars, "Should be shorter");
  });

  it("code blocks are preserved during compression", async () => {
    const { compressPrompt } = await import("../prompt-compressor.js");
    const input = "In order to do this:\n\n```typescript\nconst x = 1;\n```\n\nIn order to verify:";
    const result = compressPrompt(input, { level: "aggressive" });
    assert.ok(result.content.includes("const x = 1;"), "Code block should be preserved");
  });
});

// Test summary distillation
describe("token-optimization: summary distillation", () => {
  it("distills summaries preserving key fields", async () => {
    const { distillSummaries } = await import("../summary-distiller.js");
    const summary = `---
id: S01
provides:
  - Core types
key_files:
  - src/types.ts
key_decisions:
  - D001
---

# S01: Core Types

Built the foundation type system.

## What Happened

Long prose about implementation details that should be dropped...
`;
    const result = distillSummaries([summary], 5000);
    assert.ok(result.savingsPercent > 0, "Should have savings");
    assert.ok(result.content.includes("Core types"), "Should preserve provides");
    assert.ok(result.content.includes("src/types.ts"), "Should preserve key_files");
  });
});

// Test semantic chunker
describe("token-optimization: semantic chunking", () => {
  it("chunks TypeScript code at function boundaries", async () => {
    const { splitIntoChunks } = await import("../semantic-chunker.js");
    const code = `export function alpha() {
  return 1;
}

export function beta() {
  return 2;
}

export function gamma() {
  return 3;
}`;
    const chunks = splitIntoChunks(code);
    assert.ok(chunks.length >= 2, `Expected >=2 chunks, got ${chunks.length}`);
  });

  it("scores chunks by relevance to query", async () => {
    const { chunkByRelevance } = await import("../semantic-chunker.js");
    const code = `export function createUser(name: string) {
  return { name, id: generateId() };
}

export function deleteDatabase() {
  dropAllTables();
  clearCache();
}

export function updateUser(id: string, name: string) {
  const user = findUser(id);
  user.name = name;
  return user;
}`;
    const result = chunkByRelevance(code, "user creation and management", { maxChunks: 2 });
    // The user-related chunks should score higher
    const content = result.chunks.map(c => c.content).join("\n");
    assert.ok(content.includes("createUser") || content.includes("updateUser"),
      "Should include user-related chunks");
  });
});
