#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

if [ ! -f "$ROOT/dist/loader.js" ]; then
  echo "dist/loader.js missing; run npm run build first" >&2
  exit 1
fi

if [ ! -f "$ROOT/native/npm/linux-x64-musl/gsd_engine.node" ]; then
  echo "native/npm/linux-x64-musl/gsd_engine.node missing; build musl addon first" >&2
  exit 1
fi

GSD_TARBALL="$(npm pack --ignore-scripts --pack-destination "$TMPDIR" "$ROOT" | tail -n 1)"
MUSL_TARBALL="$(npm pack --pack-destination "$TMPDIR" "$ROOT/native/npm/linux-x64-musl" | tail -n 1)"

CID="$(docker create node:24-alpine sh -lc 'while true; do sleep 3600; done')"
cleanup_container() {
  docker rm -f "$CID" >/dev/null 2>&1 || true
}
trap 'cleanup_container; cleanup' EXIT

docker start "$CID" >/dev/null
docker exec "$CID" sh -lc 'mkdir -p /artifacts /work/app'
docker cp "$TMPDIR/$MUSL_TARBALL" "$CID:/artifacts/$MUSL_TARBALL"
docker cp "$TMPDIR/$GSD_TARBALL" "$CID:/artifacts/$GSD_TARBALL"
docker exec "$CID" sh -lc '
  set -euo pipefail
  export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  export GSD_SKIP_RTK_INSTALL=1
  mkdir -p /work/app
  cd /work/app
  npm init -y >/dev/null 2>&1
  npm install "/artifacts/'"$MUSL_TARBALL"'" "/artifacts/'"$GSD_TARBALL"'" >/tmp/npm-install.log 2>&1 || {
    cat /tmp/npm-install.log
    exit 1
  }
  OUTPUT="$(node --input-type=module -e "import { visibleWidth } from '\''./node_modules/gsd-pi/packages/native/dist/text/index.js'\''; console.log(visibleWidth('\''\u001b[31mhi\u001b[0m'\''));" 2>&1)"
  echo "$OUTPUT"
  echo "$OUTPUT" | grep -qx "2"
  if echo "$OUTPUT" | grep -q "Falling back to JS implementations"; then
    echo "native loader fell back to JS on Alpine" >&2
    exit 1
  fi
'
