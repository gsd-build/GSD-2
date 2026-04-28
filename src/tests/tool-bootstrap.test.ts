import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensureManagedTools, resolveToolFromPath } from "../tool-bootstrap.js";

const FD_TARGET = process.platform === "win32" ? "fd.exe" : "fd";
const RG_TARGET = process.platform === "win32" ? "rg.exe" : "rg";

function makeExecutable(dir: string, name: string, content = "#!/bin/sh\nexit 0\n"): string {
  const file = join(dir, name);
  writeFileSync(file, content);
  chmodSync(file, 0o755);
  return file;
}

test("resolveToolFromPath finds fd via fdfind fallback", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-tool-bootstrap-resolve-"));
  t.after(() => { rmSync(tmp, { recursive: true, force: true }); });

  makeExecutable(tmp, "fdfind");
  const resolved = resolveToolFromPath("fd", tmp);
  assert.equal(resolved, join(tmp, "fdfind"));
});

test("ensureManagedTools provisions fd and rg into managed bin dir", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-tool-bootstrap-provision-"));
  const sourceBin = join(tmp, "source-bin");
  const targetBin = join(tmp, "target-bin");

  mkdirSync(sourceBin, { recursive: true });
  mkdirSync(targetBin, { recursive: true });

  t.after(() => { rmSync(tmp, { recursive: true, force: true }); });

  makeExecutable(sourceBin, "fdfind");
  makeExecutable(sourceBin, "rg");

  const provisioned = ensureManagedTools(targetBin, sourceBin);

  assert.equal(provisioned.length, 2);
  assert.ok(existsSync(join(targetBin, FD_TARGET)));
  assert.ok(existsSync(join(targetBin, RG_TARGET)));
  assert.ok(lstatSync(join(targetBin, FD_TARGET)).isSymbolicLink() || lstatSync(join(targetBin, FD_TARGET)).isFile());
  assert.ok(lstatSync(join(targetBin, RG_TARGET)).isSymbolicLink() || lstatSync(join(targetBin, RG_TARGET)).isFile());
});

test("ensureManagedTools copies executable when symlink target already exists as a broken link", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-tool-bootstrap-copy-"));
  const sourceBin = join(tmp, "source-bin");
  const targetBin = join(tmp, "target-bin");
  const targetFd = join(targetBin, FD_TARGET);

  mkdirSync(sourceBin, { recursive: true });
  mkdirSync(targetBin, { recursive: true });

  t.after(() => { rmSync(tmp, { recursive: true, force: true }); });

  makeExecutable(sourceBin, "fdfind", "#!/bin/sh\necho fd\n");
  makeExecutable(sourceBin, "rg", "#!/bin/sh\necho rg\n");
  symlinkSync(join(tmp, "missing-target"), targetFd);

  const provisioned = ensureManagedTools(targetBin, sourceBin);

  assert.equal(provisioned.length, 2);
  assert.ok(lstatSync(targetFd).isFile(), "fd fallback should replace broken symlink with a copied file");
  assert.match(readFileSync(targetFd, "utf8"), /echo fd/);
});

test("ensureManagedTools skips trampoline shims (pixi/conda)", (t) => {
  // Regression test for #5111: on Windows, pixi uses small trampoline shims
  // that delegate to the real binary via a sibling trampoline_configuration/
  // directory. Copying just the shim breaks it. Since the tool was already
  // found on PATH, provisioning is unnecessary and must be skipped.
  if (process.platform !== "win32") return;

  const tmp = mkdtempSync(join(tmpdir(), "gsd-tool-bootstrap-trampoline-"));
  const sourceBin = join(tmp, "source-bin");
  const trampolineConfigDir = join(sourceBin, "trampoline_configuration");
  const targetBin = join(tmp, "target-bin");

  mkdirSync(sourceBin, { recursive: true });
  mkdirSync(trampolineConfigDir, { recursive: true });
  mkdirSync(targetBin, { recursive: true });

  t.after(() => { rmSync(tmp, { recursive: true, force: true }); });

  // Create a small file mimicking a pixi trampoline shim (they're ~436KB)
  const shimContent = Buffer.alloc(500_000, 0);
  const rgShim = join(sourceBin, "rg.exe");
  writeFileSync(rgShim, shimContent);
  chmodSync(rgShim, 0o755);

  // Create the trampoline configuration that marks this as a shim
  writeFileSync(
    join(trampolineConfigDir, "rg.json"),
    JSON.stringify({ exe: "C:\\real\\rg.exe" }),
  );

  const provisioned = ensureManagedTools(targetBin, sourceBin);

  assert.equal(provisioned.length, 0, "trampoline shim should NOT be provisioned");
  assert.ok(!existsSync(join(targetBin, "rg.exe")), "rg.exe must not exist in target bin");
});
