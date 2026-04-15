import test from "node:test";
import assert from "node:assert/strict";

import { resolveUokFlags } from "../uok/flags.ts";

test("uok flags default to enabled when preference is unset", () => {
  const flags = resolveUokFlags(undefined);
  assert.equal(flags.enabled, true);
  assert.equal(flags.legacyFallback, false);
});

test("uok legacy fallback preference forces legacy path", () => {
  const flags = resolveUokFlags({
    uok: {
      enabled: true,
      legacy_fallback: { enabled: true },
    },
  });
  assert.equal(flags.enabled, false);
  assert.equal(flags.legacyFallback, true);
});

test("uok legacy fallback env var forces legacy path", () => {
  const previous = process.env.GSD_UOK_FORCE_LEGACY;
  process.env.GSD_UOK_FORCE_LEGACY = "1";
  try {
    const flags = resolveUokFlags({
      uok: {
        enabled: true,
      },
    });
    assert.equal(flags.enabled, false);
    assert.equal(flags.legacyFallback, true);
  } finally {
    if (previous === undefined) delete process.env.GSD_UOK_FORCE_LEGACY;
    else process.env.GSD_UOK_FORCE_LEGACY = previous;
  }
});

