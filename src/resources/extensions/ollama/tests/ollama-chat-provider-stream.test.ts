// GSD2 — Regression test: Ollama streaming must not drop content on done:true chunks (#3576)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * This test validates the streaming logic pattern used in ollama-chat-provider.ts.
 * The bug: content on the terminal done:true chunk was silently dropped because
 * the stream loop only emitted content when `!chunk.done`.
 *
 * The fix: process chunk.message.content regardless of chunk.done, then handle
 * done metadata. This test exercises that logic path with a simulated chunk stream.
 */

interface OllamaChunk {
  done: boolean;
  done_reason?: string;
  message?: { content?: string; tool_calls?: unknown[] };
  prompt_eval_count?: number;
  eval_count?: number;
}

function simulateStreamLoop(chunks: OllamaChunk[]): string {
  let output = "";

  for (const chunk of chunks) {
    // This mirrors the fixed logic in ollama-chat-provider.ts
    const content = chunk.message?.content ?? "";
    if (content) {
      output += content;
    }

    if (chunk.done) {
      break;
    }
  }

  return output;
}

describe("Ollama stream terminal chunk handling", () => {
  it("captures content from done:true chunk", () => {
    const chunks: OllamaChunk[] = [
      { done: false, message: { content: "Hello " } },
      { done: false, message: { content: "world" } },
      { done: true, done_reason: "stop", message: { content: "!" } },
    ];

    const result = simulateStreamLoop(chunks);
    assert.equal(result, "Hello world!", "trailing content on done chunk must not be dropped");
  });

  it("works when done chunk has no content", () => {
    const chunks: OllamaChunk[] = [
      { done: false, message: { content: "Hello" } },
      { done: true, done_reason: "stop", message: {} },
    ];

    const result = simulateStreamLoop(chunks);
    assert.equal(result, "Hello");
  });

  it("works when done chunk has empty string content", () => {
    const chunks: OllamaChunk[] = [
      { done: false, message: { content: "data" } },
      { done: true, done_reason: "stop", message: { content: "" } },
    ];

    const result = simulateStreamLoop(chunks);
    assert.equal(result, "data");
  });

  it("handles single done chunk with content", () => {
    const chunks: OllamaChunk[] = [
      { done: true, done_reason: "stop", message: { content: "one-shot" } },
    ];

    const result = simulateStreamLoop(chunks);
    assert.equal(result, "one-shot", "single done chunk with content should work");
  });
});

// ─── Native thinking field on chunks (ollama 0.4+) ───────────────────────────
// Reasoning-capable cloud models (e.g. glm-5.1:cloud) emit thinking in a
// separate `message.thinking` field, not inline as <think> tags. The provider
// must capture this channel; otherwise the reasoning trace is silently dropped.

interface OllamaChunkWithThink {
  done: boolean;
  done_reason?: string;
  message?: { content?: string; thinking?: string; tool_calls?: unknown[] };
}

function simulateThinkingStreamLoop(chunks: OllamaChunkWithThink[]): { thinking: string; content: string } {
  let thinking = "";
  let content = "";

  for (const chunk of chunks) {
    // Mirrors the dual-channel logic in ollama-chat-provider.ts:
    // emit thinking before content so blocks open in reasoning-then-answer order.
    const t = chunk.message?.thinking ?? "";
    if (t) thinking += t;

    const c = chunk.message?.content ?? "";
    if (c) content += c;

    if (chunk.done) break;
  }

  return { thinking, content };
}

describe("Ollama stream thinking-field handling", () => {
  it("captures thinking from a separate message.thinking channel", () => {
    const chunks: OllamaChunkWithThink[] = [
      { done: false, message: { thinking: "Let me think... " } },
      { done: false, message: { thinking: "2+2 = 4." } },
      { done: false, message: { content: "The answer is " } },
      { done: true, done_reason: "stop", message: { content: "4." } },
    ];

    const { thinking, content } = simulateThinkingStreamLoop(chunks);
    assert.equal(thinking, "Let me think... 2+2 = 4.");
    assert.equal(content, "The answer is 4.");
  });

  it("captures thinking from the terminal done:true chunk", () => {
    // Some models flush all reasoning on the final chunk.
    const chunks: OllamaChunkWithThink[] = [
      { done: false, message: { content: "answer" } },
      { done: true, done_reason: "stop", message: { thinking: "post-hoc trace" } },
    ];

    const { thinking, content } = simulateThinkingStreamLoop(chunks);
    assert.equal(thinking, "post-hoc trace");
    assert.equal(content, "answer");
  });

  it("handles a chunk with both thinking and content together", () => {
    const chunks: OllamaChunkWithThink[] = [
      { done: true, done_reason: "stop", message: { thinking: "T", content: "C" } },
    ];

    const { thinking, content } = simulateThinkingStreamLoop(chunks);
    assert.equal(thinking, "T");
    assert.equal(content, "C");
  });
});
