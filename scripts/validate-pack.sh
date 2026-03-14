#!/usr/bin/env bash
# validate-pack.sh — Verify the npm tarball is installable before publishing.
#
# Catches the class of bugs where bundleDependencies silently fail,
# workspace cross-references leak into the published package, or
# any dependency can't be resolved from the npm registry.
#
# Usage: npm run validate-pack (or bash scripts/validate-pack.sh)
# Exit 0 = safe to publish, Exit 1 = broken package.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo "==> Packing tarball..."
TARBALL_NAME=$(npm pack --ignore-scripts 2>/dev/null | tail -1)
TARBALL="$ROOT/$TARBALL_NAME"

if [ ! -f "$TARBALL" ]; then
  echo "ERROR: npm pack produced no tarball (expected $TARBALL)"
  exit 1
fi

INSTALL_DIR=$(mktemp -d)
trap 'rm -rf "$INSTALL_DIR" "$TARBALL"' EXIT

echo "==> Tarball: $TARBALL_NAME"

# --- Check 1: Critical files exist in tarball ---
echo "==> Checking tarball contents..."
MISSING=0
for required in \
  "package/dist/loader.js" \
  "package/packages/pi-coding-agent/dist/index.js" \
  "package/packages/pi-ai/dist/index.js" \
  "package/packages/pi-agent-core/dist/index.js" \
  "package/packages/pi-tui/dist/index.js"; do
  if ! tar tzf "$TARBALL" | grep -q "^${required}$"; then
    echo "    MISSING: $required"
    MISSING=1
  fi
done
if [ "$MISSING" = "1" ]; then
  echo "ERROR: Critical files missing from tarball. Run 'npm run build' first."
  exit 1
fi
echo "    Critical files present."

# --- Check 2: No @gsd/* in dependencies (only in bundleDependencies) ---
echo "==> Checking for leaked @gsd/* dependencies..."
LEAKED=$(tar xzf "$TARBALL" -O package/package.json | node -e "
  let data = '';
  process.stdin.on('data', c => data += c);
  process.stdin.on('end', () => {
    const pkg = JSON.parse(data);
    const deps = Object.keys(pkg.dependencies || {}).filter(d => d.startsWith('@gsd/'));
    if (deps.length) {
      console.log(deps.join(', '));
      process.exit(1);
    }
  });
" 2>&1) || {
  echo "ERROR: @gsd/* packages found in dependencies — they must only be in bundleDependencies"
  echo "    Found: $LEAKED"
  exit 1
}
echo "    No leaked @gsd/* dependencies."

# --- Check 3: Workspace packages' package.json files have no @gsd/* deps ---
echo "==> Checking bundled workspace packages for @gsd/* cross-deps..."
CROSS_LEAKED=$(tar xzf "$TARBALL" -O package/node_modules/@gsd/pi-coding-agent/package.json 2>/dev/null | node -e "
  let data = '';
  process.stdin.on('data', c => data += c);
  process.stdin.on('end', () => {
    const pkg = JSON.parse(data);
    const deps = Object.keys(pkg.dependencies || {}).filter(d => d.startsWith('@gsd/'));
    if (deps.length) {
      console.log(deps.join(', '));
      process.exit(1);
    }
  });
" 2>&1) || {
  echo "ERROR: Bundled workspace packages still have @gsd/* cross-dependencies"
  echo "    Found in pi-coding-agent: $CROSS_LEAKED"
  echo "    Remove @gsd/* from packages/*/package.json dependencies."
  exit 1
}
echo "    No @gsd/* cross-dependencies in bundled packages."

# --- Check 4: Install test — the real proof ---
echo "==> Testing install in isolated directory..."
cd "$INSTALL_DIR"
npm init -y > /dev/null 2>&1

if npm install "$TARBALL" 2>&1; then
  echo "==> Install succeeded."
else
  echo ""
  echo "ERROR: npm install of tarball failed. This package would break for users."
  echo "Check that all dependencies resolve and bundleDependencies are correct."
  exit 1
fi

echo ""
echo "Package is installable. Safe to publish."
