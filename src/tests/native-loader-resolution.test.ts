import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveNativePackageCandidates,
  resolveNativeRuntimeTag,
} from "../../packages/native/src/native.ts";

test("native loader prefers glibc packages on linux x64", () => {
  assert.deepEqual(
    resolveNativePackageCandidates("linux", "x64", "glibc"),
    ["linux-x64-gnu", "linux-x64-musl"],
  );
  assert.equal(resolveNativeRuntimeTag("linux", "x64", "glibc"), "linux-x64-gnu");
});

test("native loader prefers musl packages on linux x64", () => {
  assert.deepEqual(
    resolveNativePackageCandidates("linux", "x64", "musl"),
    ["linux-x64-musl", "linux-x64-gnu"],
  );
  assert.equal(resolveNativeRuntimeTag("linux", "x64", "musl"), "linux-x64-musl");
});

test("native loader prefers glibc packages on linux arm64", () => {
  assert.deepEqual(
    resolveNativePackageCandidates("linux", "arm64", "glibc"),
    ["linux-arm64-gnu", "linux-arm64-musl"],
  );
  assert.equal(resolveNativeRuntimeTag("linux", "arm64", "glibc"), "linux-arm64-gnu");
});

test("native loader prefers musl packages on linux arm64", () => {
  assert.deepEqual(
    resolveNativePackageCandidates("linux", "arm64", "musl"),
    ["linux-arm64-musl", "linux-arm64-gnu"],
  );
  assert.equal(resolveNativeRuntimeTag("linux", "arm64", "musl"), "linux-arm64-musl");
});

test("native loader falls back to gnu-first when libc is unknown", () => {
  assert.deepEqual(
    resolveNativePackageCandidates("linux", "x64", null),
    ["linux-x64-gnu", "linux-x64-musl"],
  );
  assert.deepEqual(
    resolveNativePackageCandidates("linux", "arm64", null),
    ["linux-arm64-gnu", "linux-arm64-musl"],
  );
  assert.equal(resolveNativeRuntimeTag("linux", "x64", null), "linux-x64");
});

test("native loader keeps non-linux mappings unchanged", () => {
  assert.deepEqual(resolveNativePackageCandidates("darwin", "arm64", null), ["darwin-arm64"]);
  assert.deepEqual(resolveNativePackageCandidates("win32", "x64", null), ["win32-x64-msvc"]);
  assert.equal(resolveNativeRuntimeTag("darwin", "x64", null), "darwin-x64");
});
