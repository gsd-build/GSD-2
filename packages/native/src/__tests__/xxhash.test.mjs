import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { xxHash32, xxHash32Fallback } from "@gsd/native/xxhash";

/**
 * Reference values computed from the pure-JS xxHash32 implementation
 * that was previously inlined in hashline.ts.
 */

// Pure-JS reference implementation for generating expected values
const PRIME32_1 = 0x9e3779b1;
const PRIME32_2 = 0x85ebca77;
const PRIME32_3 = 0xc2b2ae3d;
const PRIME32_4 = 0x27d4eb2f;
const PRIME32_5 = 0x165667b1;

function rotl32(val, bits) {
  return ((val << bits) | (val >>> (32 - bits))) >>> 0;
}
function imul32(a, b) {
  return Math.imul(a, b) >>> 0;
}
function jsXxHash32(input, seed) {
  const buf = Buffer.from(input, "utf-8");
  const len = buf.length;
  let h32;
  let i = 0;
  if (len >= 16) {
    let v1 = (seed + PRIME32_1 + PRIME32_2) >>> 0;
    let v2 = (seed + PRIME32_2) >>> 0;
    let v3 = (seed + 0) >>> 0;
    let v4 = (seed - PRIME32_1) >>> 0;
    while (i <= len - 16) {
      v1 = imul32(rotl32((v1 + imul32(buf.readUInt32LE(i), PRIME32_2)) >>> 0, 13), PRIME32_1) >>> 0; i += 4;
      v2 = imul32(rotl32((v2 + imul32(buf.readUInt32LE(i), PRIME32_2)) >>> 0, 13), PRIME32_1) >>> 0; i += 4;
      v3 = imul32(rotl32((v3 + imul32(buf.readUInt32LE(i), PRIME32_2)) >>> 0, 13), PRIME32_1) >>> 0; i += 4;
      v4 = imul32(rotl32((v4 + imul32(buf.readUInt32LE(i), PRIME32_2)) >>> 0, 13), PRIME32_1) >>> 0; i += 4;
    }
    h32 = (rotl32(v1, 1) + rotl32(v2, 7) + rotl32(v3, 12) + rotl32(v4, 18)) >>> 0;
  } else {
    h32 = (seed + PRIME32_5) >>> 0;
  }
  h32 = (h32 + len) >>> 0;
  while (i <= len - 4) {
    h32 = (h32 + imul32(buf.readUInt32LE(i), PRIME32_3)) >>> 0;
    h32 = imul32(rotl32(h32, 17), PRIME32_4);
    i += 4;
  }
  while (i < len) {
    h32 = (h32 + imul32(buf[i], PRIME32_5)) >>> 0;
    h32 = imul32(rotl32(h32, 11), PRIME32_1);
    i += 1;
  }
  h32 = imul32(h32 ^ (h32 >>> 15), PRIME32_2);
  h32 = imul32(h32 ^ (h32 >>> 13), PRIME32_3);
  h32 = (h32 ^ (h32 >>> 16)) >>> 0;
  return h32;
}

describe("xxHash32 native vs JS compatibility", () => {
  const testCases = [
    ["empty string, seed 0", "", 0],
    ["short string, seed 0", "hello", 0],
    ["short string, seed 42", "hello", 42],
    ["medium string, seed 0", "hello world!", 0],
    ["long string (>16 bytes)", "abcdefghijklmnopqrstuvwxyz", 0],
    ["whitespace only", "   ", 0],
    ["punctuation", "{}();", 0],
    ["unicode", "\u{4e16}\u{754c}\u{1f600}", 0],
    ["empty with nonzero seed", "", 7],
    ["typical code line", "  const x = 42;", 0],
    ["typical code line with seed", "  const x = 42;", 3],
  ];

  for (const [label, input, seed] of testCases) {
    it(`matches JS reference: ${label}`, () => {
      const expected = jsXxHash32(input, seed);
      const actual = xxHash32(input, seed);
      assert.equal(
        actual,
        expected,
        `Mismatch for "${input}" seed=${seed}: native=${actual.toString(16)} js=${expected.toString(16)}`
      );
    });
  }
});

describe("xxHash32Fallback (pure-JS path)", () => {
  // These tests exercise the JS fallback directly, validating the path that
  // runs when the native addon loads but does not export xxHash32.
  const testCases = [
    ["empty string, seed 0", "", 0],
    ["short string, seed 0", "hello", 0],
    ["short string, seed 42", "hello", 42],
    ["medium string, seed 0", "hello world!", 0],
    ["long string (>16 bytes)", "abcdefghijklmnopqrstuvwxyz", 0],
    ["whitespace only", "   ", 0],
    ["punctuation", "{}();", 0],
    ["unicode", "\u{4e16}\u{754c}\u{1f600}", 0],
    ["empty with nonzero seed", "", 7],
    ["typical code line", "  const x = 42;", 0],
    ["typical code line with seed", "  const x = 42;", 3],
  ];

  for (const [label, input, seed] of testCases) {
    it(`JS fallback matches JS reference: ${label}`, () => {
      const expected = jsXxHash32(input, seed);
      const actual = xxHash32Fallback(input, seed);
      assert.equal(
        actual,
        expected,
        `Fallback mismatch for "${input}" seed=${seed}: fallback=${actual.toString(16)} reference=${expected.toString(16)}`
      );
    });
  }

  it("JS fallback produces same result as xxHash32", () => {
    const input = "  const x = hashline;";
    const seed = 0;
    assert.equal(xxHash32Fallback(input, seed), xxHash32(input, seed));
  });
});
