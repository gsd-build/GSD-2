import test from "node:test";
import assert from "node:assert/strict";

import {
  TOP_LEVEL_SUBCOMMANDS,
  GSD_COMMAND_DESCRIPTION,
} from "../commands/catalog.js";

const NEW_COMMANDS = [
  "scan",
  "graph",
  "extract-learnings",
  "explore",
  "eval-review",
  "eval-fix",
  "review",
] as const;

for (const cmd of NEW_COMMANDS) {
  test(`catalog: TOP_LEVEL_SUBCOMMANDS contains "${cmd}"`, () => {
    assert.ok(
      TOP_LEVEL_SUBCOMMANDS.some((entry) => entry.cmd === cmd),
      `Expected "${cmd}" in TOP_LEVEL_SUBCOMMANDS`,
    );
  });

  test(`catalog: GSD_COMMAND_DESCRIPTION includes "${cmd}"`, () => {
    assert.ok(
      GSD_COMMAND_DESCRIPTION.includes(`|${cmd}`) ||
        GSD_COMMAND_DESCRIPTION.endsWith(`|${cmd}`),
      `Expected "${cmd}" in GSD_COMMAND_DESCRIPTION pipe list`,
    );
  });
}
