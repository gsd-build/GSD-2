import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dirname, "..", "sync.ts"), "utf8");

test("slice plan sync records issues without creating a draft PR", () => {
	const planStart = source.indexOf("async function syncSlicePlan");
	const prHelperStart = source.indexOf("async function ensureSlicePullRequest");
	assert.ok(planStart >= 0 && prHelperStart > planStart, "slice plan and PR helper functions are present");

	const planBody = source.slice(planStart, prHelperStart);
	assert.match(planBody, /prNumber:\s*0/);
	assert.doesNotMatch(planBody, /ghCreatePR\(/);
	assert.doesNotMatch(planBody, /ghPushBranch\(/);
});

test("slice completion creates the PR only after slice work is complete", () => {
	const completeStart = source.indexOf("async function syncSliceComplete");
	const milestoneStart = source.indexOf("async function syncMilestoneComplete");
	assert.ok(completeStart >= 0 && milestoneStart > completeStart, "slice complete function is present");

	const completeBody = source.slice(completeStart, milestoneStart);
	assert.match(completeBody, /ensureSlicePullRequest\(basePath, mapping, mid, sid\)/);
});
