// GSD Workflow Mode Tests — validates mode defaults, overrides, and validation

import { createTestContext } from "./test-helpers.ts";
import { validatePreferences, applyModeDefaults } from "../preferences.ts";
import type { GSDPreferences } from "../preferences.ts";

const { assertEq, assertTrue, report } = createTestContext();

async function main(): Promise<void> {
  console.log("\n=== mode: solo defaults ===");

  {
    const prefs: GSDPreferences = { mode: "solo" };
    const result = applyModeDefaults("solo", prefs);
    assertEq(result.git?.auto_push, true, "solo — auto_push defaults to true");
    assertEq(result.git?.push_branches, false, "solo — push_branches defaults to false");
    assertEq(result.git?.pre_merge_check, false, "solo — pre_merge_check defaults to false");
    assertEq(result.git?.merge_strategy, "squash", "solo — merge_strategy defaults to squash");
    assertEq(result.git?.isolation, "worktree", "solo — isolation defaults to worktree");
    assertEq(result.git?.commit_docs, true, "solo — commit_docs defaults to true");
    assertEq(result.unique_milestone_ids, false, "solo — unique_milestone_ids defaults to false");
  }

  console.log("\n=== mode: team defaults ===");

  {
    const prefs: GSDPreferences = { mode: "team" };
    const result = applyModeDefaults("team", prefs);
    assertEq(result.git?.auto_push, false, "team — auto_push defaults to false");
    assertEq(result.git?.push_branches, true, "team — push_branches defaults to true");
    assertEq(result.git?.pre_merge_check, true, "team — pre_merge_check defaults to true");
    assertEq(result.git?.merge_strategy, "squash", "team — merge_strategy defaults to squash");
    assertEq(result.git?.isolation, "worktree", "team — isolation defaults to worktree");
    assertEq(result.git?.commit_docs, true, "team — commit_docs defaults to true");
    assertEq(result.unique_milestone_ids, true, "team — unique_milestone_ids defaults to true");
  }

  console.log("\n=== explicit override wins over mode default ===");

  {
    const prefs: GSDPreferences = {
      mode: "solo",
      git: { auto_push: false },
    };
    const result = applyModeDefaults("solo", prefs);
    assertEq(result.git?.auto_push, false, "solo + explicit auto_push=false — override wins");
    assertEq(result.git?.push_branches, false, "solo + override — other defaults still apply");
    assertEq(result.git?.merge_strategy, "squash", "solo + override — merge_strategy still defaults");
  }

  console.log("\n=== no mode set — no defaults injected ===");

  {
    const prefs: GSDPreferences = { git: { auto_push: true } };
    const { preferences } = validatePreferences(prefs);
    assertEq(preferences.mode, undefined, "no mode — mode is undefined");
    assertEq(preferences.git?.push_branches, undefined, "no mode — push_branches not injected");
    assertEq(preferences.unique_milestone_ids, undefined, "no mode — unique_milestone_ids not injected");
  }

  console.log("\n=== invalid mode value → validation error ===");

  {
    const { errors } = validatePreferences({ mode: "invalid" as any });
    assertTrue(errors.length > 0, "invalid mode — produces error");
    assertTrue(errors[0].includes("solo, team"), "invalid mode — error mentions valid values");
  }

  console.log("\n=== valid mode values pass validation ===");

  {
    const { errors: soloErrors, preferences: soloPrefs } = validatePreferences({ mode: "solo" });
    assertEq(soloErrors.length, 0, "mode: solo — no errors");
    assertEq(soloPrefs.mode, "solo", "mode: solo — value preserved");
  }
  {
    const { errors: teamErrors, preferences: teamPrefs } = validatePreferences({ mode: "team" });
    assertEq(teamErrors.length, 0, "mode: team — no errors");
    assertEq(teamPrefs.mode, "team", "mode: team — value preserved");
  }

  console.log("\n=== deep merge: mode + explicit git.remote ===");

  {
    const prefs: GSDPreferences = {
      mode: "team",
      git: { remote: "upstream" },
    };
    const result = applyModeDefaults("team", prefs);
    assertEq(result.git?.remote, "upstream", "team + git.remote — custom remote preserved");
    assertEq(result.git?.auto_push, false, "team + git.remote — team auto_push default applied");
    assertEq(result.git?.push_branches, true, "team + git.remote — team push_branches default applied");
  }

  console.log("\n=== mode + unique_milestone_ids explicit override ===");

  {
    const prefs: GSDPreferences = {
      mode: "team",
      unique_milestone_ids: false,
    };
    const result = applyModeDefaults("team", prefs);
    assertEq(result.unique_milestone_ids, false, "team + explicit unique_milestone_ids=false — override wins");
    assertEq(result.git?.push_branches, true, "team + override — other team defaults still apply");
  }

  report();
}

main();
