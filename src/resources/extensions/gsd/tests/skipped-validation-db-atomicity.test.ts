import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("skipped validation DB persistence stays atomic", () => {
  const source = readFileSync(join(__dirname, "..", "auto-dispatch.ts"), "utf-8");

  assert.match(
    source,
    /if \(isDbAvailable\(\)\) \{\s+transaction\(\(\) => \{\s+insertAssessment\([\s\S]*?insertMilestoneValidationGates\(/,
    "skipped validation DB writes must remain inside a single transaction",
  );
});
