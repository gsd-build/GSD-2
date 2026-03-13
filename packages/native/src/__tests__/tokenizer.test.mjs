import { describe, it, expect } from "vitest";
import { countTokens, countTokensBatch, estimateMessageTokens } from "../index.js";

describe("tokenizer", () => {
  describe("countTokens", () => {
    it("returns 0 for empty string", () => {
      expect(countTokens("")).toBe(0);
    });

    it("counts tokens for simple text", () => {
      const count = countTokens("Hello, world!");
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });

    it("counts tokens for longer text", () => {
      const short = countTokens("Hi");
      const long = countTokens("This is a much longer sentence with many more words in it.");
      expect(long).toBeGreaterThan(short);
    });

    it("handles unicode text", () => {
      const count = countTokens("Hello 世界! 🌍");
      expect(count).toBeGreaterThan(0);
    });
  });

  describe("countTokensBatch", () => {
    it("returns empty array for empty input", () => {
      expect(countTokensBatch([])).toEqual([]);
    });

    it("counts tokens for multiple strings", () => {
      const results = countTokensBatch(["Hello", "World", "Hello, world!"]);
      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r).toBeGreaterThan(0);
      }
    });

    it("matches individual countTokens calls", () => {
      const texts = ["foo bar", "The quick brown fox", ""];
      const batch = countTokensBatch(texts);
      const individual = texts.map(t => countTokens(t));
      expect(batch).toEqual(individual);
    });
  });

  describe("estimateMessageTokens", () => {
    it("estimates tokens for a user message with string content", () => {
      const count = estimateMessageTokens({
        role: "user",
        content: "What is the meaning of life?",
      });
      // 4 overhead + actual tokens
      expect(count).toBeGreaterThan(4);
    });

    it("estimates tokens for a user message with array content", () => {
      const count = estimateMessageTokens({
        role: "user",
        content: [{ type: "text", text: "Hello world" }],
      });
      expect(count).toBeGreaterThan(4);
    });

    it("estimates tokens for an assistant message with tool calls", () => {
      const count = estimateMessageTokens({
        role: "assistant",
        content: [
          { type: "text", text: "Let me help." },
          { type: "toolCall", name: "read", arguments: { path: "/foo/bar.ts" } },
        ],
      });
      expect(count).toBeGreaterThan(4);
    });

    it("estimates tokens for bashExecution messages", () => {
      const count = estimateMessageTokens({
        role: "bashExecution",
        content: "",
        command: "ls -la",
        output: "total 42\ndrwxr-xr-x  5 user staff 160 Jan 1 00:00 .",
      });
      expect(count).toBeGreaterThan(4);
    });

    it("handles image blocks with fixed estimate", () => {
      const count = estimateMessageTokens({
        role: "user",
        content: [{ type: "image" }],
      });
      // 4 overhead + 1200 image estimate
      expect(count).toBe(1204);
    });
  });
});
