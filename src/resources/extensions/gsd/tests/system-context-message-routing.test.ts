// GSD bootstrap + system-context-message-routing.test — regression coverage
// for #5019. `memoryBlock` is FTS-queried against the user prompt and changes
// per call; embedding it in the cached system prefix invalidates Anthropic
// prompt-cache hits on every request. The fix routes memory through the
// existing context-message channel (volatile user-message suffix) and combines
// it with any active guided-execute or forensics injection.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildContextMessage } from "../bootstrap/system-context.ts";

describe("buildContextMessage (#5019 — memory routing)", () => {
  test("returns null when nothing to inject", () => {
    const result = buildContextMessage({
      memoryBlock: "",
      injection: null,
      forensicsInjection: null,
    });
    assert.equal(result, null);
  });

  test("whitespace-only memoryBlock counts as empty", () => {
    const result = buildContextMessage({
      memoryBlock: "   \n\n   ",
      injection: null,
      forensicsInjection: null,
    });
    assert.equal(result, null);
  });

  test("memory-only path emits gsd-memory message with trimmed content", () => {
    const result = buildContextMessage({
      memoryBlock: "\n\n[MEMORY]\nrule one\nrule two\n\n",
      injection: null,
      forensicsInjection: null,
    });
    assert.ok(result, "expected a context message");
    assert.equal(result.customType, "gsd-memory");
    assert.equal(result.content, "[MEMORY]\nrule one\nrule two");
    assert.equal(result.display, false);
  });

  test("guided-execute injection alone emits gsd-guided-context", () => {
    const result = buildContextMessage({
      memoryBlock: "",
      injection: "[GUIDED]\nexecute T01",
      forensicsInjection: null,
    });
    assert.ok(result);
    assert.equal(result.customType, "gsd-guided-context");
    assert.equal(result.content, "[GUIDED]\nexecute T01");
  });

  test("forensics injection alone emits gsd-forensics", () => {
    const result = buildContextMessage({
      memoryBlock: "",
      injection: null,
      forensicsInjection: "[FORENSICS]\ninvestigation context",
    });
    assert.ok(result);
    assert.equal(result.customType, "gsd-forensics");
    assert.equal(result.content, "[FORENSICS]\ninvestigation context");
  });

  test("memory + guided injection: memory prepended, customType is gsd-guided-context", () => {
    const result = buildContextMessage({
      memoryBlock: "[MEMORY]\nrule one",
      injection: "[GUIDED]\nexecute T01",
      forensicsInjection: null,
    });
    assert.ok(result);
    assert.equal(result.customType, "gsd-guided-context");
    assert.equal(result.content, "[MEMORY]\nrule one\n\n[GUIDED]\nexecute T01");
  });

  test("memory + forensics: memory prepended, customType is gsd-forensics", () => {
    const result = buildContextMessage({
      memoryBlock: "[MEMORY]\nrule one",
      injection: null,
      forensicsInjection: "[FORENSICS]\ninvestigation context",
    });
    assert.ok(result);
    assert.equal(result.customType, "gsd-forensics");
    assert.equal(result.content, "[MEMORY]\nrule one\n\n[FORENSICS]\ninvestigation context");
  });

  test("guided takes precedence over forensics when both are somehow present", () => {
    // The caller in buildBeforeAgentStartResult already gates forensics on
    // `!injection`, but the helper's documented priority is guided > forensics.
    // Test the contract directly so a future refactor can't silently flip it.
    const result = buildContextMessage({
      memoryBlock: "",
      injection: "[GUIDED]",
      forensicsInjection: "[FORENSICS]",
    });
    assert.ok(result);
    assert.equal(result.customType, "gsd-guided-context");
    assert.equal(result.content, "[GUIDED]");
  });
});
