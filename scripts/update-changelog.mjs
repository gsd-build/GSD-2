#!/usr/bin/env node
/**
 * Insert a changelog entry into CHANGELOG.md after the [Unreleased] heading,
 * and update the version comparison links at the bottom of the file.
 *
 * Usage: node scripts/update-changelog.mjs <changelog-entry-file>
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const entryFile = process.argv[2];
if (!entryFile) {
  console.error("Usage: node scripts/update-changelog.mjs <changelog-entry-file>");
  process.exit(1);
}

const entry = readFileSync(entryFile, "utf-8").trim();
const changelogPath = resolve(root, "CHANGELOG.md");
let changelog = readFileSync(changelogPath, "utf-8");

// Extract new version from the entry header: "## [X.Y.Z] - YYYY-MM-DD"
const versionMatch = entry.match(/^## \[(\d+\.\d+\.\d+)\]/);
if (!versionMatch) {
  console.error("Could not extract version from changelog entry");
  process.exit(1);
}
const newVersion = versionMatch[1];

// Insert entry after "## [Unreleased]" line
const unreleased = "## [Unreleased]";
const idx = changelog.indexOf(unreleased);
if (idx === -1) {
  console.error("[Unreleased] heading not found in CHANGELOG.md");
  process.exit(1);
}
const insertPos = idx + unreleased.length;
changelog = changelog.slice(0, insertPos) + "\n\n" + entry + changelog.slice(insertPos);

// Update comparison links at the bottom of the file
// Replace: [Unreleased]: .../compare/vOLD...HEAD
// With:    [Unreleased]: .../compare/vNEW...HEAD
//          [NEW]: .../compare/vOLD...vNEW
const linkRe = /\[Unreleased\]: (https:\/\/github\.com\/[^/]+\/[^/]+)\/compare\/v([\d.]+)\.\.\.HEAD/;
const linkMatch = changelog.match(linkRe);
if (linkMatch) {
  const [fullMatch, repoUrl, oldVersion] = linkMatch;
  const newLinks = [
    `[Unreleased]: ${repoUrl}/compare/v${newVersion}...HEAD`,
    `[${newVersion}]: ${repoUrl}/compare/v${oldVersion}...v${newVersion}`,
  ].join("\n");
  changelog = changelog.replace(fullMatch, newLinks);
}

writeFileSync(changelogPath, changelog);
console.log(`[update-changelog] Inserted ${newVersion} entry into CHANGELOG.md`);
