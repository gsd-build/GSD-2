import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("root package exposes both glibc and musl native optional dependencies", () => {
  const pkg = readJson(join(rootDir, "package.json"));
  assert.equal(pkg.optionalDependencies["@gsd-build/engine-linux-x64-gnu"], ">=2.10.2");
  assert.equal(pkg.optionalDependencies["@gsd-build/engine-linux-x64-musl"], ">=2.10.2");
  assert.equal(pkg.optionalDependencies["@gsd-build/engine-linux-arm64-gnu"], ">=2.10.2");
  assert.equal(pkg.optionalDependencies["@gsd-build/engine-linux-arm64-musl"], ">=2.10.2");
});

test("linux native platform package manifests declare libc correctly", () => {
  const linuxX64Gnu = readJson(join(rootDir, "native", "npm", "linux-x64-gnu", "package.json"));
  const linuxArm64Gnu = readJson(join(rootDir, "native", "npm", "linux-arm64-gnu", "package.json"));
  const linuxX64Musl = readJson(join(rootDir, "native", "npm", "linux-x64-musl", "package.json"));
  const linuxArm64Musl = readJson(join(rootDir, "native", "npm", "linux-arm64-musl", "package.json"));

  assert.deepEqual(linuxX64Gnu.libc, ["glibc"]);
  assert.deepEqual(linuxArm64Gnu.libc, ["glibc"]);
  assert.deepEqual(linuxX64Musl.libc, ["musl"]);
  assert.deepEqual(linuxArm64Musl.libc, ["musl"]);
});
