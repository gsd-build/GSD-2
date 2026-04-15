/**
 * Regression tests for ollama-commands.ts UI behavior fixes:
 * - Theme color: "fg" replaced with "text" token
 * - Keypress dismiss: handleInput used instead of setTimeout instant-dismiss
 * - Overlay pattern: { render, handleInput, invalidate } structure
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "ollama-commands.ts"), "utf-8");

test("ollama-commands uses 'text' theme token, not deprecated 'fg'", () => {
  assert.ok(
    !src.includes('"fg"'),
    "Color token 'fg' is deprecated; use 'text' instead"
  );
});

test("ollama-commands overlay dismissed via handleInput keypress, not setTimeout", () => {
  assert.ok(
    !src.includes("setTimeout"),
    "Instant-dismiss via setTimeout removed; overlay must wait for keypress via handleInput"
  );
  assert.ok(
    src.includes("handleInput"),
    "handleInput must be present for keypress-dismiss behavior"
  );
});

test("ollama-commands overlay uses render + handleInput + invalidate pattern", () => {
  const hasRender      = src.includes("render");
  const hasHandleInput = src.includes("handleInput");
  const hasInvalidate  = src.includes("invalidate");
  assert.ok(
    hasRender && hasHandleInput && hasInvalidate,
    "Overlay must use { render, handleInput, invalidate } pattern"
  );
});
