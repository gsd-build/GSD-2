import test from "node:test";
import assert from "node:assert/strict";

const { PtyChatParser } = await import("../../web/lib/pty-chat-parser.ts");

test("PtyChatParser.flush emits a trailing partial line without waiting for a newline", () => {
  const parser = new PtyChatParser("test");
  let latest = parser.getMessages();
  parser.onMessage(() => {
    latest = parser.getMessages();
  });

  parser.feed("All slices are complete — nothing to discuss.");
  assert.equal(latest.length, 0, "partial line should stay buffered before flush");

  parser.flush();

  assert.equal(latest.length, 1);
  assert.equal(latest[0]?.role, "assistant");
  assert.equal(latest[0]?.content, "All slices are complete — nothing to discuss.\n");
});
