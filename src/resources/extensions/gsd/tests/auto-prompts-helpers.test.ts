import test from "node:test";
import assert from "node:assert/strict";
import { extractMarkdownSection, escapeRegExp, buildSkillDiscoveryVars } from "../auto-prompts.ts";

// ─── extractMarkdownSection ────────────────────────────────────────────────

test("extractMarkdownSection returns content of matching section", () => {
  const content = "# Title\n\n## Goals\n\nBe good.\n\n## Steps\n\nDo stuff.\n";
  const result = extractMarkdownSection(content, "Goals");
  assert.equal(result, "Be good.");
});

test("extractMarkdownSection returns null when heading not found", () => {
  const result = extractMarkdownSection("# Title\n\n## Other\n\nStuff.\n", "Missing");
  assert.equal(result, null);
});

test("extractMarkdownSection returns content up to next ## heading", () => {
  const content = "## Section A\n\nContent A.\n\n## Section B\n\nContent B.\n";
  const result = extractMarkdownSection(content, "Section A");
  assert.equal(result, "Content A.");
});

test("extractMarkdownSection returns content when section is at end of file", () => {
  const content = "## First\n\nStuff.\n\n## Last\n\nTrailing content.";
  const result = extractMarkdownSection(content, "Last");
  assert.equal(result, "Trailing content.");
});

test("extractMarkdownSection handles section with special regex characters in heading", () => {
  const content = "## C++ Build\n\nCompile flags here.\n\n## Other\n\nIgnored.\n";
  const result = extractMarkdownSection(content, "C++ Build");
  assert.equal(result, "Compile flags here.");
});

test("extractMarkdownSection returns empty string for empty section", () => {
  const content = "## Section\n\n## Next\n\nContent.\n";
  const result = extractMarkdownSection(content, "Section");
  // trim() of empty/whitespace-only body → empty string, not null
  assert.equal(result, "");
});

// ─── escapeRegExp ──────────────────────────────────────────────────────────

test("escapeRegExp escapes all special regex characters", () => {
  const special = ".*+?^${}()|[]\\";
  const escaped = escapeRegExp(special);
  // If properly escaped, new RegExp(escaped) should match the literal string
  const re = new RegExp(escaped);
  assert.ok(re.test(special));
});

test("escapeRegExp leaves plain strings unchanged", () => {
  const plain = "hello world 123";
  assert.equal(escapeRegExp(plain), plain);
});

test("escapeRegExp escapes dot so it matches literal dot only", () => {
  const version = "1.2.3";
  const escaped = escapeRegExp(version);
  const re = new RegExp(`^${escaped}$`);
  assert.ok(re.test("1.2.3"));
  assert.ok(!re.test("1X2Y3"));
});

test("escapeRegExp escapes brackets so they match literals", () => {
  const input = "[T01]";
  const escaped = escapeRegExp(input);
  const re = new RegExp(escaped);
  assert.ok(re.test("[T01]"));
});

// ─── buildSkillDiscoveryVars ───────────────────────────────────────────────

test("buildSkillDiscoveryVars returns expected shape", () => {
  const result = buildSkillDiscoveryVars();
  assert.ok(typeof result.skillDiscoveryMode === "string" && result.skillDiscoveryMode.length > 0);
  assert.ok(typeof result.skillDiscoveryInstructions === "string");
});
