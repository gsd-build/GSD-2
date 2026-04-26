import test from "node:test";
import assert from "node:assert/strict";

import { runFinalize } from "../auto/phases.ts";
import { AutoSession } from "../auto/session.ts";

test("runFinalize clears currentUnit after successful finalize", async () => {
  const s = new AutoSession();
  s.basePath = "/tmp/gsd-finalize-current-unit";
  s.currentUnit = {
    type: "execute-task",
    id: "M001/S01/T01",
    startedAt: Date.now(),
  };

  const deps = {
    clearUnitTimeout() {},
    buildSnapshotOpts() {
      return {};
    },
    stopAuto: async () => {},
    pauseAuto: async () => {},
    updateProgressWidget() {},
    postUnitPreVerification: async () => "continue",
    runPostUnitVerification: async () => "continue",
    postUnitPostVerification: async () => "continue",
  };

  const result = await runFinalize(
    {
      ctx: { ui: { notify() {} } },
      pi: {},
      s,
      deps,
      prefs: undefined,
      iteration: 1,
      flowId: "flow-1",
      nextSeq: () => 1,
    } as any,
    {
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      prompt: "",
      finalPrompt: "",
      pauseAfterUatDispatch: false,
      state: {} as any,
      mid: "M001",
      midTitle: "Milestone",
      isRetry: false,
      previousTier: undefined,
    },
    {
      recentUnits: [],
      stuckRecoveryAttempts: 0,
      consecutiveFinalizeTimeouts: 0,
    },
  );

  assert.equal(result.action, "next");
  assert.equal(s.currentUnit, null);
});
