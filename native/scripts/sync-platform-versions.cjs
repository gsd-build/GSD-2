#!/usr/bin/env node

/**
 * Synchronize platform package versions with the root package version.
 *
 * Reads version from root package.json, writes it to all platform
 * package.json files and updates optionalDependencies in root package.json.
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..", "..");
const npmDir = path.resolve(__dirname, "..", "npm");

const rootPkgPath = path.join(rootDir, "package.json");
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
const version = rootPkg.version;

console.log(`[sync-platform-versions] Syncing to version ${version}`);

const platformPackages = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64-gnu",
  "linux-arm64-gnu",
  "win32-x64-msvc",
];

// Update each platform package.json
for (const platform of platformPackages) {
  const pkgPath = path.join(npmDir, platform, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.warn(`  Skipping ${platform}: ${pkgPath} not found`);
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (pkg.version !== version) {
    console.log(`  ${platform}: ${pkg.version} -> ${version}`);
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  } else {
    console.log(`  ${platform}: already ${version}`);
  }
}

// Update optionalDependencies in root package.json
let rootChanged = false;
const optDeps = rootPkg.optionalDependencies || {};
for (const platform of platformPackages) {
  const depName = `@gsd-build/engine-${platform}`;
  if (optDeps[depName] && optDeps[depName] !== version) {
    console.log(`  root optionalDependencies ${depName}: ${optDeps[depName]} -> ${version}`);
    optDeps[depName] = version;
    rootChanged = true;
  }
}

if (rootChanged) {
  rootPkg.optionalDependencies = optDeps;
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
  console.log("  Updated root package.json optionalDependencies");
}

console.log("[sync-platform-versions] Done.");
