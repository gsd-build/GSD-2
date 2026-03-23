// GSD Extension — Write Intercept Unit Tests
// Tests for isBlockedStateFile path matching and BLOCKED_WRITE_ERROR message content.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBlockedStateFile, BLOCKED_WRITE_ERROR } from "../write-intercept.ts";

describe("write-intercept", () => {
  describe("isBlockedStateFile()", () => {
    it("returns true for .gsd/STATE.md (engine-rendered)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/STATE.md"), true);
    });

    it("returns true for symlink-resolved STATE.md under ~/.gsd/projects/ (Pitfall #6)", () => {
      assert.equal(isBlockedStateFile("/home/user/.gsd/projects/abc123/STATE.md"), true);
    });

    // All other .gsd/ files are agent-authored and must NOT be blocked
    it("returns false for .gsd/REQUIREMENTS.md (agent-authored during discuss)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/REQUIREMENTS.md"), false);
    });

    it("returns false for .gsd/PROJECT.md (agent-authored during discuss)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/PROJECT.md"), false);
    });

    it("returns false for .gsd/milestones/M001/M001-ROADMAP.md (agent-authored during planning)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/milestones/M001/M001-ROADMAP.md"), false);
    });

    it("returns false for .gsd/milestones/M001/slices/S01/S01-PLAN.md (agent-authored during planning)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/milestones/M001/slices/S01/S01-PLAN.md"), false);
    });

    it("returns false for .gsd/milestones/M001/S01-SUMMARY.md (content file)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/milestones/M001/S01-SUMMARY.md"), false);
    });

    it("returns false for .gsd/KNOWLEDGE.md (content file)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/KNOWLEDGE.md"), false);
    });

    it("returns false for .gsd/CONTEXT.md (content file)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/CONTEXT.md"), false);
    });

    it("returns false for .gsd/DECISIONS.md (agent-appended)", () => {
      assert.equal(isBlockedStateFile("/project/.gsd/DECISIONS.md"), false);
    });

    it("returns false for /project/src/app.ts (not in .gsd/)", () => {
      assert.equal(isBlockedStateFile("/project/src/app.ts"), false);
    });

    it("BLOCKED_WRITE_ERROR contains required tool call references", () => {
      assert.ok(BLOCKED_WRITE_ERROR.includes("gsd_complete_task"), "must reference gsd_complete_task");
      assert.ok(BLOCKED_WRITE_ERROR.includes("gsd_complete_slice"), "must reference gsd_complete_slice");
      assert.ok(BLOCKED_WRITE_ERROR.includes("gsd_save_decision"), "must reference gsd_save_decision");
    });
  });
});
