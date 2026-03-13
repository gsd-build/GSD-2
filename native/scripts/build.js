#!/usr/bin/env node

/**
 * Build script for the GSD native Rust addon.
 *
 * Usage:
 *   node native/scripts/build.js          # release build
 *   node native/scripts/build.js --dev    # debug build
 *
 * Runs `cargo build` in the engine crate directory and copies the resulting
 * shared library to `native/addon/` with a `.node` extension so Node.js
 * can load it via `require()`.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativeRoot = path.resolve(__dirname, "..");
const engineDir = path.join(nativeRoot, "crates", "engine");
const addonDir = path.join(nativeRoot, "addon");

const isDev = process.argv.includes("--dev");
const profile = isDev ? "debug" : "release";
const cargoArgs = ["build"];
if (!isDev) cargoArgs.push("--release");

console.log(`Building gsd-engine (${profile})...`);

try {
  execSync(`cargo ${cargoArgs.join(" ")}`, {
    cwd: engineDir,
    stdio: "inherit",
    env: {
      ...process.env,
      // Optimize for native CPU when building locally
      RUSTFLAGS: process.env.RUSTFLAGS || "-C target-cpu=native",
    },
  });
} catch {
  process.exit(1);
}

// Locate the built library
const targetDir = path.join(nativeRoot, "target", profile);
const platformTag = `${process.platform}-${process.arch}`;

const libraryNames = {
  darwin: "libgsd_engine.dylib",
  linux: "libgsd_engine.so",
  win32: "gsd_engine.dll",
};

const libName = libraryNames[process.platform];
if (!libName) {
  console.error(`Unsupported platform: ${process.platform}`);
  process.exit(1);
}

const sourcePath = path.join(targetDir, libName);
if (!fs.existsSync(sourcePath)) {
  console.error(`Built library not found at: ${sourcePath}`);
  process.exit(1);
}

fs.mkdirSync(addonDir, { recursive: true });

const destFilename = isDev
  ? "gsd_engine.dev.node"
  : `gsd_engine.${platformTag}.node`;
const destPath = path.join(addonDir, destFilename);

fs.copyFileSync(sourcePath, destPath);
console.log(`Installed: ${destPath}`);
console.log("Build complete.");
