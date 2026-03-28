import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsdDir = join(__dirname, "..");

describe("forensics dedup (#2096)", () => {
  it("forensics_dedup is in KNOWN_PREFERENCE_KEYS", () => {
    const source = readFileSync(join(gsdDir, "preferences-types.ts"), "utf-8");
    assert.ok(source.includes('"forensics_dedup"'),
      "KNOWN_PREFERENCE_KEYS must contain forensics_dedup");
    assert.ok(source.includes("forensics_dedup?: boolean"),
      "GSDPreferences must declare forensics_dedup as optional boolean");
  });

  it("forensics prompt contains {{dedupSection}} placeholder", () => {
    const prompt = readFileSync(join(gsdDir, "prompts", "forensics.md"), "utf-8");
    assert.ok(prompt.includes("{{dedupSection}}"),
      "forensics.md must contain {{dedupSection}} placeholder");
  });

  it("forensics prompt runs dedup before the investigation protocol", () => {
    const prompt = readFileSync(join(gsdDir, "prompts", "forensics.md"), "utf-8");
    const dedupIndex = prompt.indexOf("## Pre-Investigation: Duplicate Check");
    const investigationIndex = prompt.indexOf("## Investigation Protocol");
    assert.ok(dedupIndex >= 0, "forensics.md must define the duplicate-check gate");
    assert.ok(investigationIndex >= 0, "forensics.md must define the investigation protocol");
    assert.ok(dedupIndex < investigationIndex,
      "duplicate detection must appear before the investigation protocol");
  });

  it("DEDUP_PROMPT_SECTION contains required search commands", async () => {
    const source = readFileSync(join(gsdDir, "forensics.ts"), "utf-8");
    assert.ok(source.includes("DEDUP_PROMPT_SECTION"), "forensics.ts must define DEDUP_PROMPT_SECTION");
    assert.ok(source.includes("gh issue list --repo gsd-build/gsd-2 --state closed"));
    assert.ok(source.includes("gh pr list --repo gsd-build/gsd-2 --state open"));
    assert.ok(source.includes("gh pr list --repo gsd-build/gsd-2 --state merged"));
    assert.ok(
      source.includes("user's problem description and the anomaly summaries"),
      "dedup search should start from the problem description and anomaly summaries, not a post-investigation diagnosis",
    );
    assert.ok(
      source.includes("skip the full investigation"),
      "dedup gate should allow early exit when an existing fix already matches",
    );
    assert.ok(
      !source.includes("similar keywords from your diagnosis"),
      "dedup gate should not require a diagnosis before the early duplicate check",
    );
  });

  it("handleForensics checks forensics_dedup preference", () => {
    const source = readFileSync(join(gsdDir, "forensics.ts"), "utf-8");
    assert.ok(source.includes("forensics_dedup"),
      "handleForensics must reference forensics_dedup preference");
    assert.ok(source.includes("dedupSection"),
      "handleForensics must pass dedupSection to loadPrompt");
  });

  it("first-time opt-in shows when preference is undefined", () => {
    const source = readFileSync(join(gsdDir, "forensics.ts"), "utf-8");
    assert.ok(source.includes("=== undefined"),
      "first-time detection must check for undefined (not false)");
    assert.ok(source.includes("Duplicate detection available") || source.includes("duplicate detection"),
      "opt-in notice must mention duplicate detection");
  });
});
