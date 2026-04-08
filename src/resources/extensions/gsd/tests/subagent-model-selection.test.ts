import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { formatSubagentModelLabel, resolveSubagentLaunchModel } from "../../subagent/model-selection.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const subagentIndexSource = readFileSync(join(__dirname, "../../subagent/index.ts"), "utf-8");

test("subagent preferences override agent frontmatter pins", () => {
  assert.equal(
    resolveSubagentLaunchModel("sonnet", "openai-codex/gpt-5.4"),
    "openai-codex/gpt-5.4",
  );
  assert.equal(
    formatSubagentModelLabel("sonnet", "openai-codex/gpt-5.4"),
    "openai-codex/gpt-5.4 via prefs; overrides sonnet",
  );
});

test("agent frontmatter pin remains fallback when no subagent preference exists", () => {
  assert.equal(resolveSubagentLaunchModel("sonnet", undefined), "sonnet");
  assert.equal(formatSubagentModelLabel("sonnet", undefined), "sonnet");
});

test("subagent tool reads models.subagent from GSD preferences", () => {
  assert.ok(
    subagentIndexSource.includes('resolveModelWithFallbacksForUnit("subagent")?.primary'),
    "subagent runtime should resolve a preferred model from GSD preferences",
  );
});
