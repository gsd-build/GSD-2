import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load the native addon directly
const addonDir = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "native",
  "addon",
);
const platformTag = `${process.platform}-${process.arch}`;
const candidates = [
  path.join(addonDir, `gsd_engine.${platformTag}.node`),
  path.join(addonDir, "gsd_engine.dev.node"),
];

let native;
for (const candidate of candidates) {
  try {
    native = require(candidate);
    break;
  } catch {
    // try next
  }
}

if (!native) {
  console.error(
    "Native addon not found. Run `npm run build:native -w @gsd/native` first.",
  );
  process.exit(1);
}

// ── visibleWidth ───────────────────────────────────────────────────────

describe("visibleWidth", () => {
  test("plain ASCII text", () => {
    assert.equal(native.visibleWidth("hello"), 5);
  });

  test("empty string", () => {
    assert.equal(native.visibleWidth(""), 0);
  });

  test("ignores ANSI SGR codes", () => {
    assert.equal(native.visibleWidth("\x1b[31mhello\x1b[0m"), 5);
  });

  test("ignores 256-color ANSI", () => {
    assert.equal(native.visibleWidth("\x1b[38;5;196mred\x1b[0m"), 3);
  });

  test("ignores RGB ANSI", () => {
    assert.equal(
      native.visibleWidth("\x1b[38;2;255;128;0morange\x1b[0m"),
      6,
    );
  });

  test("counts tabs with default width", () => {
    // default tab width = 3
    assert.equal(native.visibleWidth("a\tb"), 1 + 3 + 1);
  });

  test("counts tabs with custom width", () => {
    assert.equal(native.visibleWidth("a\tb", 4), 1 + 4 + 1);
  });

  test("CJK double-width characters", () => {
    assert.equal(native.visibleWidth("\u4e16\u754c"), 4); // 世界
  });

  test("mixed ASCII and CJK", () => {
    assert.equal(native.visibleWidth("a\u4e16b"), 4); // a + 2 + 1
  });
});

// ── wrapTextWithAnsi ───────────────────────────────────────────────────

describe("wrapTextWithAnsi", () => {
  test("wraps plain text at word boundary", () => {
    const lines = native.wrapTextWithAnsi("hello world", 5);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "hello");
    assert.equal(lines[1], "world");
  });

  test("no wrap needed", () => {
    const lines = native.wrapTextWithAnsi("hi", 10);
    assert.equal(lines.length, 1);
    assert.equal(lines[0], "hi");
  });

  test("empty string produces one empty line", () => {
    const lines = native.wrapTextWithAnsi("", 10);
    assert.equal(lines.length, 1);
    assert.equal(lines[0], "");
  });

  test("preserves ANSI color across wrap", () => {
    const lines = native.wrapTextWithAnsi(
      "\x1b[38;2;156;163;176mhello world\x1b[0m",
      5,
    );
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith("\x1b[38;2;156;163;176m"));
    assert.ok(lines[1].startsWith("\x1b[38;2;156;163;176m"));
    assert.ok(lines[1].includes("world"));
  });

  test("handles multiline input (newlines)", () => {
    const lines = native.wrapTextWithAnsi("line one\nline two", 20);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "line one");
    assert.equal(lines[1], "line two");
  });

  test("breaks long words", () => {
    const lines = native.wrapTextWithAnsi("abcdefghij", 5);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], "abcde");
    assert.equal(lines[1], "fghij");
  });

  test("carries OSC 8 hyperlink across word-boundary wrap", () => {
    const url = "https://example.com";
    const open = `\x1b]8;;${url}\x07`;
    const close = `\x1b]8;;\x07`;
    const text = `${open}click here please${close}`;
    const lines = native.wrapTextWithAnsi(text, 10);
    assert.ok(lines.length >= 2, `Expected wrapping, got ${lines.length} lines`);

    // First line should open the hyperlink and close it at the end
    assert.ok(lines[0].startsWith(open), `First line should start with OSC 8 open: ${JSON.stringify(lines[0])}`);
    assert.ok(lines[0].endsWith(close), `First line should end with OSC 8 close: ${JSON.stringify(lines[0])}`);

    // Second line should re-open the hyperlink
    assert.ok(lines[1].startsWith(open), `Second line should re-open OSC 8: ${JSON.stringify(lines[1])}`);
  });

  test("carries OSC 8 hyperlink across long-word break", () => {
    const url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=http://localhost:9004&scope=email&state=xyz";
    const open = `\x1b]8;;${url}\x07`;
    const close = `\x1b]8;;\x07`;
    const text = `${open}${url}${close}`;
    const lines = native.wrapTextWithAnsi(text, 40);
    assert.ok(lines.length >= 2, `Expected wrapping, got ${lines.length} lines`);

    // Every line except the last should end with close and re-open on next
    for (let i = 0; i < lines.length - 1; i++) {
      assert.ok(lines[i].includes(open), `Line ${i} should contain OSC 8 open`);
      assert.ok(lines[i].endsWith(close), `Line ${i} should end with OSC 8 close`);
    }
    // Last line should contain close
    assert.ok(lines[lines.length - 1].includes(close), `Last line should contain OSC 8 close`);
  });
});

// ── truncateToWidth ────────────────────────────────────────────────────

describe("truncateToWidth", () => {
  test("returns original when fits", () => {
    const result = native.truncateToWidth("hello", 10, 0, false);
    assert.equal(result, "hello");
  });

  test("truncates with unicode ellipsis", () => {
    const result = native.truncateToWidth("hello world", 6, 0, false);
    assert.equal(native.visibleWidth(result), 6);
    assert.ok(result.includes("\u2026"));
  });

  test("truncates with ASCII ellipsis", () => {
    const result = native.truncateToWidth("hello world", 8, 1, false);
    assert.ok(result.includes("..."));
  });

  test("truncates with no ellipsis", () => {
    const result = native.truncateToWidth("hello world", 5, 2, false);
    assert.equal(native.visibleWidth(result), 5);
    assert.ok(!result.includes("\u2026"));
    assert.ok(!result.includes("..."));
  });

  test("pads to width", () => {
    const result = native.truncateToWidth("hi", 10, 0, true);
    assert.equal(native.visibleWidth(result), 10);
  });

  test("preserves ANSI codes and resets on truncation", () => {
    const input = "\x1b[31mhello world\x1b[0m";
    const result = native.truncateToWidth(input, 6, 0, false);
    // Should contain the red code and a reset before ellipsis
    assert.ok(result.includes("\x1b[31m"));
    assert.ok(result.includes("\x1b[0m"));
  });
});

// ── sliceWithWidth ─────────────────────────────────────────────────────

describe("sliceWithWidth", () => {
  test("slices from start", () => {
    const result = native.sliceWithWidth("hello world", 0, 5, false);
    assert.equal(result.text, "hello");
    assert.equal(result.width, 5);
  });

  test("slices from middle", () => {
    const result = native.sliceWithWidth("hello world", 6, 5, false);
    assert.equal(result.text, "world");
    assert.equal(result.width, 5);
  });

  test("preserves ANSI codes in slice", () => {
    const result = native.sliceWithWidth(
      "\x1b[31mhello\x1b[0m world",
      0,
      5,
      false,
    );
    assert.equal(result.text, "\x1b[31mhello\x1b[0m");
    assert.equal(result.width, 5);
  });

  test("empty slice", () => {
    const result = native.sliceWithWidth("hello", 0, 0, false);
    assert.equal(result.text, "");
    assert.equal(result.width, 0);
  });

  test("beyond string length", () => {
    const result = native.sliceWithWidth("hi", 0, 100, false);
    assert.equal(result.text, "hi");
    assert.equal(result.width, 2);
  });
});

// ── extractSegments ────────────────────────────────────────────────────

describe("extractSegments", () => {
  test("extracts before and after segments", () => {
    const result = native.extractSegments(
      "hello world test",
      5,
      6,
      5,
      false,
    );
    assert.equal(result.before, "hello");
    assert.equal(result.beforeWidth, 5);
    assert.equal(result.after, "world");
    assert.equal(result.afterWidth, 5);
  });

  test("handles no after segment", () => {
    const result = native.extractSegments("hello world", 5, 0, 0, false);
    assert.equal(result.before, "hello");
    assert.equal(result.beforeWidth, 5);
    assert.equal(result.after, "");
    assert.equal(result.afterWidth, 0);
  });
});

// ── sanitizeText ───────────────────────────────────────────────────────

describe("sanitizeText", () => {
  test("strips ANSI codes", () => {
    assert.equal(native.sanitizeText("\x1b[31mhello\x1b[0m"), "hello");
  });

  test("returns original when clean", () => {
    assert.equal(native.sanitizeText("hello"), "hello");
  });

  test("removes control characters", () => {
    assert.equal(native.sanitizeText("he\x01llo"), "hello");
  });

  test("preserves tabs and newlines", () => {
    assert.equal(native.sanitizeText("a\tb\nc"), "a\tb\nc");
  });

  test("normalizes CR", () => {
    assert.equal(native.sanitizeText("hello\r\nworld"), "hello\nworld");
  });
});
