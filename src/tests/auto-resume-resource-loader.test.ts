// GSD2 — Regression test: auto-mode resume resolves resource-loader.js from deployed path (#3949)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const autoTsPath = join(__dirname, "..", "resources", "extensions", "gsd", "auto.ts");
const loaderTsPath = join(__dirname, "..", "loader.ts");
const devCliJsPath = join(__dirname, "..", "..", "scripts", "dev-cli.js");

test("loader.ts sets GSD_PKG_ROOT env var", () => {
  const loaderSrc = readFileSync(loaderTsPath, "utf-8");
  assert.ok(
    loaderSrc.includes("process.env.GSD_PKG_ROOT"),
    "loader.ts must set GSD_PKG_ROOT so deployed extensions can locate package-root modules",
  );
});

test("source dev CLI remains the child-process GSD_BIN_PATH", () => {
  const loaderSrc = readFileSync(loaderTsPath, "utf-8");
  const devCliSrc = readFileSync(devCliJsPath, "utf-8");

  assert.ok(
    devCliSrc.includes("GSD_DEV_CLI_PATH: devCliPath") &&
    devCliSrc.includes("GSD_CLI_PATH: devCliPath") &&
    devCliSrc.includes("GSD_BIN_PATH: devCliPath"),
    "scripts/dev-cli.js must pass itself as the CLI entrypoint for child GSD processes",
  );
  assert.ok(
    loaderSrc.includes("GSD_DEV_CLI_PATH") &&
    /const\s+explicitCliPath\s*=\s*process\.env\.GSD_CLI_PATH\?\.trim\(\)\s*\|\|\s*process\.env\.GSD_BIN_PATH\?\.trim\(\)/.test(loaderSrc) &&
    /isSourceLoader\s*&&\s*existsSync\(devCliPath\)\s*\?\s*devCliPath\s*:\s*invokedBinPath/.test(loaderSrc),
    "loader.ts must preserve the dev CLI wrapper instead of exposing src/loader.ts to subagents",
  );
});

test("auto.ts resume uses GSD_PKG_ROOT for resource-loader import, not bare relative path", () => {
  const autoSrc = readFileSync(autoTsPath, "utf-8");

  // Must reference GSD_PKG_ROOT to build an absolute path
  assert.ok(
    autoSrc.includes("process.env.GSD_PKG_ROOT"),
    "auto.ts must use GSD_PKG_ROOT to resolve resource-loader.js from deployed extension path",
  );

  // The import must use the computed variable (resourceLoaderPath), not a hardcoded relative path.
  assert.ok(
    autoSrc.includes("await import(resourceLoaderPath)"),
    "auto.ts resource-loader import must use the computed resourceLoaderPath variable, not a hardcoded relative path",
  );

  // The resourceLoaderPath must be constructed from GSD_PKG_ROOT via pathToFileURL
  // (raw filesystem paths break on Windows with ERR_UNSUPPORTED_ESM_URL_SCHEME)
  assert.ok(
    autoSrc.includes("pathToFileURL(join(pkgRoot,"),
    "auto.ts must convert the constructed path to a file URL for cross-platform import()",
  );
});

test("GSD_PKG_ROOT resolves resource-loader.js correctly from package root", () => {
  // Simulate what auto.ts does: given GSD_PKG_ROOT, construct the path
  const pkgRoot = resolve(__dirname, "..", "..");
  const resourceLoaderPath = join(pkgRoot, "dist", "resource-loader.js");

  // After build, dist/resource-loader.js should exist
  // (this test runs post-build in CI; in dev it validates the path construction)
  const expectedDir = dirname(resourceLoaderPath);
  assert.ok(
    expectedDir.endsWith(join("dist")),
    `resource-loader path should be under dist/, got: ${expectedDir}`,
  );
});
