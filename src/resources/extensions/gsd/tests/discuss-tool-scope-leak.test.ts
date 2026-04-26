// GSD-2 — Behavioural regression test for #3616.
//
// Bug: After a discuss session narrows the active tool set via setActiveTools,
// the narrowed list persisted into the next auto-mode session because newSession()
// did not restore extension tools when cwd was unchanged. This caused
// gsd_plan_slice and other DB tools to be missing from plan-slice subagent
// sessions.
//
// The behavioural invariant we can pin without grepping source: gsd_plan_slice
// (a heavy planning tool) is NOT inside the discuss allowlist. The remaining
// guarantees (newSession including all extension tools in both branches) are
// covered by agent-session.test.ts inside packages/pi-coding-agent.
//
// Refs #4826 (rewrite from source-grep on guided-flow.ts / agent-session.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { DISCUSS_TOOLS_ALLOWLIST } from "../constants.ts";

describe("#3616 — discuss tool scoping must not leak across sessions", () => {
	test("gsd_plan_slice is NOT in DISCUSS_TOOLS_ALLOWLIST", () => {
		assert.ok(
			!DISCUSS_TOOLS_ALLOWLIST.includes("gsd_plan_slice"),
			`gsd_plan_slice (a heavy planning tool) must be excluded from the discuss scope; allowlist=${JSON.stringify(DISCUSS_TOOLS_ALLOWLIST)}`,
		);
	});

	test("DISCUSS_TOOLS_ALLOWLIST is non-empty (sanity)", () => {
		assert.ok(
			DISCUSS_TOOLS_ALLOWLIST.length > 0,
			"discuss scope should include at least one tool — empty allowlist would break /gsd discuss",
		);
	});
});
