import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load the native addon directly
const addonDir = path.resolve(__dirname, "..", "..", "..", "..", "native", "addon");
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
  console.error("Native addon not found. Run `npm run build:native -w @gsd/native` first.");
  process.exit(1);
}

const testColors = {
  comment: "\x1b[38;2;106;153;85m",
  keyword: "\x1b[38;2;197;134;192m",
  function: "\x1b[38;2;220;220;170m",
  variable: "\x1b[38;2;156;220;254m",
  string: "\x1b[38;2;206;145;120m",
  number: "\x1b[38;2;181;206;168m",
  type: "\x1b[38;2;78;201;176m",
  operator: "\x1b[38;2;212;212;212m",
  punctuation: "\x1b[38;2;212;212;212m",
};

describe("native highlight: highlightCode()", () => {
  test("highlights JavaScript code with ANSI colors", () => {
    const code = 'const x = 42;\n';
    const result = native.highlightCode(code, "javascript", testColors);

    // Result should contain ANSI escape sequences
    assert.ok(result.includes("\x1b["), "should contain ANSI escape codes");
    // Result should contain the original tokens
    assert.ok(result.includes("const"), "should contain 'const'");
    assert.ok(result.includes("42"), "should contain '42'");
    // Reset codes should be present
    assert.ok(result.includes("\x1b[39m"), "should contain ANSI reset codes");
  });

  test("returns unhighlighted code for unknown language", () => {
    const code = "some random text\n";
    const result = native.highlightCode(code, "nonexistent_lang_xyz", testColors);

    // Plain text syntax should pass through without color codes on plain content
    assert.ok(typeof result === "string");
    assert.ok(result.includes("some random text"));
  });

  test("handles null language gracefully", () => {
    const code = "hello world\n";
    const result = native.highlightCode(code, null, testColors);

    assert.ok(typeof result === "string");
    assert.ok(result.includes("hello world"));
  });

  test("handles empty code", () => {
    const result = native.highlightCode("", "javascript", testColors);
    assert.equal(result, "");
  });

  test("handles multiline code", () => {
    const code = 'function foo() {\n  return "bar";\n}\n';
    const result = native.highlightCode(code, "javascript", testColors);

    assert.ok(result.includes("function"));
    assert.ok(result.includes("foo"));
    assert.ok(result.includes("return"));
    assert.ok(result.includes('"bar"'));
  });

  test("supports optional inserted/deleted colors", () => {
    const colorsWithDiff = {
      ...testColors,
      inserted: "\x1b[38;2;0;255;0m",
      deleted: "\x1b[38;2;255;0;0m",
    };
    const code = "+added line\n-removed line\n";
    const result = native.highlightCode(code, "diff", colorsWithDiff);

    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
  });
});

describe("native highlight: supportsLanguage()", () => {
  test("returns true for known aliases", () => {
    assert.ok(native.supportsLanguage("javascript"));
    assert.ok(native.supportsLanguage("typescript"));
    assert.ok(native.supportsLanguage("python"));
    assert.ok(native.supportsLanguage("rust"));
    assert.ok(native.supportsLanguage("go"));
    assert.ok(native.supportsLanguage("bash"));
  });

  test("returns true case-insensitively", () => {
    assert.ok(native.supportsLanguage("JavaScript"));
    assert.ok(native.supportsLanguage("PYTHON"));
    assert.ok(native.supportsLanguage("Rust"));
  });

  test("returns true for short aliases", () => {
    assert.ok(native.supportsLanguage("ts"));
    assert.ok(native.supportsLanguage("py"));
    assert.ok(native.supportsLanguage("rs"));
    assert.ok(native.supportsLanguage("rb"));
    assert.ok(native.supportsLanguage("sh"));
  });

  test("returns false for completely unknown languages", () => {
    assert.equal(native.supportsLanguage("nonexistent_lang_xyz"), false);
  });
});

describe("native highlight: getSupportedLanguages()", () => {
  test("returns an array of language names", () => {
    const langs = native.getSupportedLanguages();
    assert.ok(Array.isArray(langs));
    assert.ok(langs.length > 0, "should have at least one language");
  });

  test("includes common languages", () => {
    const langs = native.getSupportedLanguages();
    // These are syntect default syntax names
    assert.ok(langs.includes("JavaScript"), "should include JavaScript");
    assert.ok(langs.includes("Python"), "should include Python");
    assert.ok(langs.includes("Rust"), "should include Rust");
    assert.ok(langs.includes("C"), "should include C");
  });

  test("returns strings", () => {
    const langs = native.getSupportedLanguages();
    for (const lang of langs) {
      assert.equal(typeof lang, "string");
    }
  });
});
