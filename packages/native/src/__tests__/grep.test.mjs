import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";

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

describe("native grep: search()", () => {
  test("finds matches in buffer content", () => {
    const content = Buffer.from("hello world\nfoo bar\nhello rust\n");
    const result = native.search(content, { pattern: "hello" });

    assert.equal(result.matchCount, 2);
    assert.equal(result.matches.length, 2);
    assert.equal(result.matches[0].line, "hello world");
    assert.equal(result.matches[0].lineNumber, 1);
    assert.equal(result.matches[1].line, "hello rust");
    assert.equal(result.matches[1].lineNumber, 3);
    assert.equal(result.limitReached, false);
  });

  test("supports case-insensitive search", () => {
    const content = Buffer.from("Hello World\nhello world\nHELLO\n");
    const result = native.search(content, {
      pattern: "hello",
      ignoreCase: true,
    });

    assert.equal(result.matchCount, 3);
  });

  test("respects maxCount limit", () => {
    const content = Buffer.from("aaa\naaa\naaa\naaa\n");
    const result = native.search(content, {
      pattern: "aaa",
      maxCount: 2,
    });

    assert.equal(result.matches.length, 2);
    assert.equal(result.limitReached, true);
  });

  test("returns context lines", () => {
    const content = Buffer.from("line1\nline2\nmatch_here\nline4\nline5\n");
    const result = native.search(content, {
      pattern: "match_here",
      contextBefore: 1,
      contextAfter: 1,
    });

    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].contextBefore.length, 1);
    assert.equal(result.matches[0].contextBefore[0].line, "line2");
    assert.equal(result.matches[0].contextAfter.length, 1);
    assert.equal(result.matches[0].contextAfter[0].line, "line4");
  });

  test("returns error for invalid regex", () => {
    const content = Buffer.from("hello");
    const result = native.search(content, { pattern: "[invalid" });

    assert.ok(result.error);
    assert.equal(result.matchCount, 0);
  });
});

describe("native grep: grep()", () => {
  let tmpDir;

  test("searches files on disk", () => {
    // Create temp files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-grep-test-"));
    fs.writeFileSync(path.join(tmpDir, "file1.txt"), "hello world\nfoo bar\n");
    fs.writeFileSync(path.join(tmpDir, "file2.txt"), "hello rust\nbaz qux\n");
    fs.writeFileSync(path.join(tmpDir, "file3.log"), "no match here\n");

    const result = native.grep({
      pattern: "hello",
      path: tmpDir,
    });

    assert.equal(result.totalMatches, 2);
    assert.equal(result.filesWithMatches, 2);
    assert.equal(result.matches.length, 2);

    // Matches should be sorted by file path
    const paths = result.matches.map((m) => m.path);
    assert.deepEqual(paths, [...paths].sort());

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("respects glob filter", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-grep-test-"));
    fs.writeFileSync(path.join(tmpDir, "code.ts"), "hello typescript\n");
    fs.writeFileSync(path.join(tmpDir, "code.js"), "hello javascript\n");
    fs.writeFileSync(path.join(tmpDir, "readme.md"), "hello markdown\n");

    const result = native.grep({
      pattern: "hello",
      path: tmpDir,
      glob: "*.ts",
    });

    assert.equal(result.totalMatches, 1);
    assert.equal(result.matches[0].line, "hello typescript");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("respects maxCount", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-grep-test-"));
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${i}.txt`), "match_me\n");
    }

    const result = native.grep({
      pattern: "match_me",
      path: tmpDir,
      maxCount: 3,
    });

    assert.ok(result.matches.length <= 3);
    assert.equal(result.limitReached, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("errors on non-existent path", () => {
    assert.throws(() => {
      native.grep({
        pattern: "test",
        path: "/nonexistent/path/that/does/not/exist",
      });
    });
  });
});
