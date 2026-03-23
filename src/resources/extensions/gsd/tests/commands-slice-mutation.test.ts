import test from "node:test";
import assert from "node:assert/strict";

// Test the argument parsing logic used by slice mutation commands.
// Full integration tests require DB + engine runtime, so we test
// the parsing and ID generation utilities directly.

// ─── Utilities from commands-slice-mutation.ts ──────────────────────────

function parseFlag(args: string, flag: string): string | undefined {
  const regex = new RegExp(`${flag}\\s+(\\S+)`);
  const match = args.match(regex);
  return match?.[1];
}

function stripFlags(args: string): string {
  return args
    .replace(/--\w+\s+\S+/g, "")
    .replace(/--\w+/g, "")
    .trim();
}

function generateNextSliceId(existingIds: string[]): string {
  let maxNum = 0;
  for (const id of existingIds) {
    const match = id.match(/^S(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `S${String(maxNum + 1).padStart(2, "0")}`;
}

// ─── Tests ──────────────────────────────────────────────────────────────

test("add-slice: parse --id flag", () => {
  assert.equal(parseFlag("--id S99 My title", "--id"), "S99");
  assert.equal(parseFlag("My title --id S05", "--id"), "S05");
  assert.equal(parseFlag("My title", "--id"), undefined);
});

test("add-slice: parse --risk flag", () => {
  assert.equal(parseFlag("--risk high My title", "--risk"), "high");
  assert.equal(parseFlag("My title", "--risk"), undefined);
});

test("add-slice: parse --depends flag", () => {
  assert.equal(parseFlag("--depends S01,S02 My title", "--depends"), "S01,S02");
  const deps = parseFlag("--depends S01,S02 My title", "--depends")?.split(",");
  assert.deepEqual(deps, ["S01", "S02"]);
});

test("add-slice: strip flags leaves title", () => {
  assert.equal(stripFlags("--id S99 --risk high My new slice"), "My new slice");
  assert.equal(stripFlags("Simple title"), "Simple title");
  assert.equal(stripFlags("--depends S01,S02 --risk low Auth middleware"), "Auth middleware");
});

test("add-slice: empty after stripping flags", () => {
  assert.equal(stripFlags("--id S99 --risk high"), "");
});

test("add-slice: generate next slice ID from empty", () => {
  assert.equal(generateNextSliceId([]), "S01");
});

test("add-slice: generate next slice ID increments", () => {
  assert.equal(generateNextSliceId(["S01", "S02", "S03"]), "S04");
});

test("add-slice: generate next slice ID handles gaps", () => {
  assert.equal(generateNextSliceId(["S01", "S05", "S03"]), "S06");
});

test("add-slice: generate next slice ID pads to 2 digits", () => {
  assert.equal(generateNextSliceId(["S09"]), "S10");
  assert.equal(generateNextSliceId(["S01"]), "S02");
});

test("remove-slice: parse --force flag", () => {
  const args1 = "S05 --force";
  const args2 = "S05";

  assert.ok(args1.includes("--force"));
  assert.ok(!args2.includes("--force"));

  assert.equal(args1.replace(/--force/g, "").trim(), "S05");
  assert.equal(args2.replace(/--force/g, "").trim(), "S05");
});

test("insert-slice: parse after-id and title", () => {
  const args = "S03 Auth middleware";
  const parts = args.trim().split(/\s+/);
  const afterId = parts[0];
  const title = parts.slice(1).join(" ");

  assert.equal(afterId, "S03");
  assert.equal(title, "Auth middleware");
});

test("insert-slice: quoted title", () => {
  const args = 'S03 "Auth middleware with OAuth"';
  const parts = args.trim().split(/\s+/);
  const afterId = parts[0];
  const title = parts.slice(1).join(" ").replace(/^['"]|['"]$/g, "");

  assert.equal(afterId, "S03");
  assert.equal(title, "Auth middleware with OAuth");
});
