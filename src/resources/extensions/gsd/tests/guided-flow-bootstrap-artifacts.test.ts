import test from "node:test";
import assert from "node:assert/strict";

import { hasProjectBootstrapArtifacts } from "../guided-flow.ts";

test("bootstrap artifacts require more than a zombie .gsd directory", () => {
  assert.equal(
    hasProjectBootstrapArtifacts({
      state: "v2-gsd-empty",
      isFirstEverLaunch: false,
      hasGlobalSetup: false,
      v2: {
        milestoneCount: 0,
        hasPreferences: false,
        hasContext: false,
      },
      projectSignals: {
        detectedFiles: [],
        isGitRepo: false,
        isMonorepo: false,
        xcodePlatforms: [],
        hasCI: false,
        hasTests: false,
        verificationCommands: [],
      },
    }),
    false,
  );
});

test("bootstrap artifacts accept seeded preferences or real milestones", () => {
  const baseDetection = {
    isFirstEverLaunch: false,
    hasGlobalSetup: false,
    v1: undefined,
    projectSignals: {
      detectedFiles: [],
      isGitRepo: false,
      isMonorepo: false,
      xcodePlatforms: [],
      hasCI: false,
      hasTests: false,
      verificationCommands: [],
    },
  };

  assert.equal(
    hasProjectBootstrapArtifacts({
      ...baseDetection,
      state: "v2-gsd-empty",
      v2: {
        milestoneCount: 0,
        hasPreferences: true,
        hasContext: false,
      },
    }),
    true,
  );

  assert.equal(
    hasProjectBootstrapArtifacts({
      ...baseDetection,
      state: "v2-gsd",
      v2: {
        milestoneCount: 1,
        hasPreferences: false,
        hasContext: false,
      },
    }),
    true,
  );
});
