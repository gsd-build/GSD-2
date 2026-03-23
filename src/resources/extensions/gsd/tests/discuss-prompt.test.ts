import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const promptPath = join(process.cwd(), "src/resources/extensions/gsd/prompts/discuss.md");
const discussPrompt = readFileSync(promptPath, "utf-8");

test("discuss prompt: resilient vision framing", () => {
  const hardenedPattern = /Say exactly:\s*"What's the vision\?"/;
  assert.ok(!hardenedPattern.test(discussPrompt), "prompt no longer uses exact-verbosity lock");
  assert.ok(discussPrompt.includes('Ask: "What\'s the vision?" once'), "prompt asks for vision exactly once");
  assert.ok(discussPrompt.includes("Special handling"), "prompt documents special handling");
  assert.ok(discussPrompt.includes('instead of repeating "What\'s the vision?"'), "prompt forbids repeating");
});

test("discuss prompt: dimension-specific depth verification IDs present", () => {
  assert.ok(
    discussPrompt.includes("depth_verification_what"),
    "prompt contains depth_verification_what"
  );
  assert.ok(
    discussPrompt.includes("depth_verification_risks"),
    "prompt contains depth_verification_risks"
  );
  assert.ok(
    discussPrompt.includes("depth_verification_dependencies"),
    "prompt contains depth_verification_dependencies"
  );
});

test("discuss prompt: backward compat note for bare depth_verification", () => {
  assert.ok(
    discussPrompt.includes("Bare `depth_verification`"),
    "prompt mentions bare depth_verification backward compat"
  );
  assert.ok(
    discussPrompt.includes("backward compatibility"),
    "prompt references backward compatibility"
  );
});

test("discuss prompt: multi-milestone uses dimension-specific IDs", () => {
  // Multi-milestone section should reference dimension-specific patterns with milestone IDs
  assert.ok(
    discussPrompt.includes("depth_verification_what_M002"),
    "multi-milestone section shows depth_verification_what_M002 example"
  );
  assert.ok(
    discussPrompt.includes("depth_verification_risks_M002"),
    "multi-milestone section shows depth_verification_risks_M002 example"
  );
  assert.ok(
    discussPrompt.includes("depth_verification_dependencies_M002"),
    "multi-milestone section shows depth_verification_dependencies_M002 example"
  );
});

test("discuss prompt: no remnant single-confirmation pattern", () => {
  // The old single-confirmation example should not remain
  assert.ok(
    !discussPrompt.includes("depth_verification_confirm"),
    "old depth_verification_confirm example removed"
  );
  assert.ok(
    !discussPrompt.includes('"Did I capture the depth right?"'),
    "old single-question example removed"
  );
});
