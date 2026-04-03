import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createTestContext } from "./test-helpers.ts";

const { assertTrue, report } = createTestContext();

const srcPath = join(import.meta.dirname, "..", "auto.ts");
const src = readFileSync(srcPath, "utf-8");

console.log("\n=== #3397: paused auto resume opens DB before looping ===");

const pausedBlockIdx = src.indexOf("if (s.paused) {");
assertTrue(pausedBlockIdx >= 0, "auto.ts contains the paused auto resume branch (#3397)");

const pausedRegion = pausedBlockIdx >= 0 ? src.slice(pausedBlockIdx, pausedBlockIdx + 2200) : "";
assertTrue(
  pausedRegion.includes("await openProjectDbIfPresent(base);"),
  "paused auto resume opens the project DB before resuming the loop (#3397)",
);

const openDbIdx = pausedRegion.indexOf("await openProjectDbIfPresent(base);");
const firstDeriveIdx = pausedRegion.indexOf("await deriveState(s.basePath)");
assertTrue(firstDeriveIdx > 0, "paused auto resume derives state after rebuild (#3397)");
assertTrue(
  openDbIdx >= 0 && openDbIdx < firstDeriveIdx,
  "paused auto resume opens the DB before the first deriveState(s.basePath) call (#3397)",
);

report();
