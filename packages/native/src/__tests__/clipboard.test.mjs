import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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
  console.error("Native addon not found. Run build:native first.");
  process.exit(1);
}

describe("native clipboard: copyToClipboard()", () => {
  test("copies text without throwing", () => {
    assert.doesNotThrow(() => {
      native.copyToClipboard("GSD clipboard test");
    });
  });

  test("accepts empty string", () => {
    assert.doesNotThrow(() => {
      native.copyToClipboard("");
    });
  });

  test("accepts unicode text", () => {
    assert.doesNotThrow(() => {
      native.copyToClipboard("Hello 世界");
    });
  });
});

describe("native clipboard: readTextFromClipboard()", () => {
  test("reads back text that was copied", () => {
    const testText = `GSD clipboard roundtrip ${Date.now()}`;
    native.copyToClipboard(testText);
    const result = native.readTextFromClipboard();
    assert.equal(result, testText);
  });

  test("returns a string or null", () => {
    const result = native.readTextFromClipboard();
    assert.ok(result === null || typeof result === "string");
  });
});

describe("native clipboard: readImageFromClipboard()", () => {
  test("returns a promise", () => {
    const result = native.readImageFromClipboard();
    assert.ok(result instanceof Promise);
  });

  test("resolves to ClipboardImage or null", async () => {
    const result = await native.readImageFromClipboard();
    if (result !== null) {
      assert.ok(result.data instanceof Uint8Array, "data should be Uint8Array");
      assert.equal(result.mimeType, "image/png");
    }
  });
});
