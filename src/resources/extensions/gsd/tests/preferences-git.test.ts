/**
 * preferences-git.test.ts — Validates that deprecated git.isolation and
 * git.merge_to_main preference fields produce deprecation errors.
 */

import { createTestContext } from "./test-helpers.ts";
import { validatePreferences } from "../preferences.ts";

const { assertEq, assertTrue, report } = createTestContext();

async function main(): Promise<void> {
  console.log("\n=== git.isolation deprecated ===");

  // Any value produces a deprecation error
  {
    const { errors } = validatePreferences({ git: { isolation: "worktree" } });
    assertTrue(errors.length > 0, "isolation: worktree — produces deprecation error");
    assertTrue(errors[0].includes("deprecated"), "isolation: worktree — error mentions deprecated");
  }
  {
    const { errors } = validatePreferences({ git: { isolation: "branch" } });
    assertTrue(errors.length > 0, "isolation: branch — produces deprecation error");
    assertTrue(errors[0].includes("deprecated"), "isolation: branch — error mentions deprecated");
  }

  // Undefined passes through without error
  {
    const { preferences, errors } = validatePreferences({ git: { auto_push: true } });
    assertEq(errors.length, 0, "isolation: undefined — no errors");
    assertEq(preferences.git?.isolation, undefined, "isolation: undefined — not set");
  }

  console.log("\n=== git.merge_to_main deprecated ===");

  // Any value produces a deprecation error
  {
    const { errors } = validatePreferences({ git: { merge_to_main: "milestone" } });
    assertTrue(errors.length > 0, "merge_to_main: milestone — produces deprecation error");
    assertTrue(errors[0].includes("deprecated"), "merge_to_main: milestone — error mentions deprecated");
  }
  {
    const { errors } = validatePreferences({ git: { merge_to_main: "slice" } });
    assertTrue(errors.length > 0, "merge_to_main: slice — produces deprecation error");
    assertTrue(errors[0].includes("deprecated"), "merge_to_main: slice — error mentions deprecated");
  }

  // Undefined passes through without error
  {
    const { preferences, errors } = validatePreferences({ git: { auto_push: true } });
    assertEq(errors.length, 0, "merge_to_main: undefined — no errors");
    assertEq(preferences.git?.merge_to_main, undefined, "merge_to_main: undefined — not set");
  }

  console.log("\n=== both deprecated fields together ===");
  {
    const { errors } = validatePreferences({
      git: { isolation: "worktree", merge_to_main: "slice" },
    });
    assertEq(errors.length, 2, "both deprecated fields — 2 errors");
    assertTrue(errors.some(e => e.includes("isolation")), "one error mentions isolation");
    assertTrue(errors.some(e => e.includes("merge_to_main")), "one error mentions merge_to_main");
  }

  report();
}

main();
