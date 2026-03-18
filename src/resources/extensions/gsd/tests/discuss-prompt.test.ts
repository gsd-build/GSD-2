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
