/**
 * verify-flow — unit tests for runVerifyFlow
 *
 * Uses jiti for TypeScript imports, node:test for the runner,
 * and node:assert/strict for assertions.
 *
 * Tests pure flow execution logic with mocked deps (no real browser).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename, { interopDefault: true, debug: false });

const { runVerifyFlow } = jiti("../tools/verify-flow.ts");

// ---------------------------------------------------------------------------
// Mock deps factory
// ---------------------------------------------------------------------------

function createMockDeps(overrides = {}) {
	let trackedActions = [];
	const writtenArtifacts = [];
	const gotoUrls = [];
	const mockPage = {
		url: () => "http://localhost:3000/test",
		goto: async (url) => { gotoUrls.push(url); },
		waitForLoadState: async () => {},
		keyboard: { press: async () => {} },
		screenshot: async () => {},
		evaluate: async () => {},
	};
	const mockTarget = {
		locator: () => ({
			first: () => ({
				click: async () => {},
				fill: async () => {},
			}),
		}),
		waitForSelector: async () => {},
		waitForFunction: async () => {},
	};

	return {
		ensureBrowser: async () => ({ browser: {}, context: {}, page: mockPage }),
		closeBrowser: async () => {},
		getActivePage: () => mockPage,
		getActiveTarget: () => mockTarget,
		getActivePageOrNull: () => mockPage,
		attachPageListeners: () => {},
		captureCompactPageState: async () => ({
			url: "http://localhost:3000/test",
			title: "Test",
			focus: "",
			headings: [],
			bodyText: "test content visible text",
			counts: { landmarks: 0, buttons: 0, links: 0, inputs: 0 },
			dialog: { count: 0, title: "" },
			selectorStates: {},
		}),
		postActionSummary: async () => "ok",
		formatCompactStateSummary: () => "ok",
		constrainScreenshot: async (p, buf) => buf,
		captureErrorScreenshot: async () => null,
		getRecentErrors: () => "",
		settleAfterActionAdaptive: async () => ({
			settleMode: "adaptive",
			settleMs: 0,
			settleReason: "zero_mutation_shortcut",
			settlePolls: 0,
		}),
		ensureMutationCounter: async () => {},
		buildRefSnapshot: async () => [],
		resolveRefTarget: async () => ({ ok: true, selector: "button" }),
		parseRef: (input) => ({
			key: input.replace(/^@?v\d+:/, ""),
			version: 1,
			display: input,
		}),
		formatVersionedRef: (v, k) => `@v${v}:${k}`,
		staleRefGuidance: () => "stale",
		beginTrackedAction: (tool, params, url) => {
			const entry = { id: trackedActions.length + 1, tool, status: "running" };
			trackedActions.push(entry);
			return entry;
		},
		finishTrackedAction: (actionId, updates) => {
			const entry = trackedActions.find((e) => e.id === actionId);
			if (entry) Object.assign(entry, updates);
			return entry;
		},
		truncateText: (t) => t,
		verificationFromChecks: () => ({
			verified: true,
			checks: [],
			verificationSummary: "",
		}),
		verificationLine: () => "",
		collectAssertionState: async (p, checks) => ({
			url: "http://localhost:3000/test",
			title: "Test",
			bodyText: "test content visible text",
			selectorStates: {},
			consoleEntries: [],
			networkEntries: [],
		}),
		formatAssertionText: () => "",
		formatDiffText: () => "",
		getUrlHash: () => "",
		captureClickTargetState: async () => ({
			exists: true,
			ariaExpanded: null,
			ariaPressed: null,
			ariaSelected: null,
			open: null,
		}),
		readInputLikeValue: async () => null,
		firstErrorLine: (err) => String(err),
		captureAccessibilityMarkdown: async () => ({
			snapshot: "# Accessibility\n",
			scope: "page",
			source: "mock",
		}),
		resolveAccessibilityScope: async () => ({ scope: "page", source: "mock" }),
		getLivePagesSnapshot: async () => [],
		getSinceTimestamp: () => 0,
		getConsoleEntriesSince: () => [],
		getNetworkEntriesSince: () => [],
		writeArtifactFile: async (filePath, content) => {
			writtenArtifacts.push({
				path: filePath,
				size: typeof content === "string" ? content.length : content.byteLength,
			});
			return { path: filePath, bytes: typeof content === "string" ? content.length : content.byteLength };
		},
		copyArtifactFile: async (src, dest) => ({ path: dest, bytes: 0 }),
		ensureSessionArtifactDir: async () => "/tmp/test-artifacts",
		buildSessionArtifactPath: (f) => `/tmp/test-artifacts/${f}`,
		getSessionArtifactMetadata: () => ({}),
		sanitizeArtifactName: (v, fb) => v || fb,
		formatArtifactTimestamp: () => "20260317-020700",
		// Expose internals for assertions
		_trackedActions: trackedActions,
		_writtenArtifacts: writtenArtifacts,
		_gotoUrls: gotoUrls,
		_mockPage: mockPage,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runVerifyFlow", () => {
	// -----------------------------------------------------------------------
	// a. Happy path: all steps pass
	// -----------------------------------------------------------------------
	it("all steps pass → verdict PASS, no debug bundle", async () => {
		const deps = createMockDeps();
		const result = await runVerifyFlow(deps, {
			name: "happy-flow",
			steps: [
				{ action: "navigate", url: "http://example.com" },
				{
					action: "assert",
					checks: [{ kind: "text_visible", text: "visible text" }],
				},
			],
		});
		assert.equal(result.verdict, "PASS");
		assert.equal(result.name, "happy-flow");
		assert.equal(result.failedStepIndex, null);
		assert.equal(result.debugBundle, undefined);
		assert.equal(result.stepResults.length, 2);
		assert.ok(result.stepResults.every((r) => r.ok));
		assert.ok(result.totalDurationMs >= 0);
		// No artifacts written on success
		assert.equal(deps._writtenArtifacts.length, 0);
	});

	// -----------------------------------------------------------------------
	// b. Assert step fails → FAIL with debug bundle + writeArtifactFile calls
	// -----------------------------------------------------------------------
	it("assert step fails → verdict FAIL, debug bundle captured with expected artifact files", async () => {
		const deps = createMockDeps({
			collectAssertionState: async () => ({
				url: "http://localhost:3000/test",
				title: "Test",
				bodyText: "no matching text here",
				selectorStates: {},
				consoleEntries: [],
				networkEntries: [],
			}),
		});
		const result = await runVerifyFlow(deps, {
			name: "assert-fail",
			steps: [
				{
					action: "assert",
					checks: [{ kind: "text_visible", text: "does not exist on page" }],
				},
			],
		});
		assert.equal(result.verdict, "FAIL");
		assert.equal(result.failedStepIndex, 0);
		assert.ok(result.debugBundle);
		assert.ok(result.debugBundle.dir);
		assert.equal(result.stepResults[0].ok, false);

		// Verify writeArtifactFile was called with expected debug bundle files
		const artifactPaths = deps._writtenArtifacts.map((a) => a.path);
		assert.ok(
			artifactPaths.some((p) => p.endsWith("console.json")),
			"Expected console.json in written artifacts",
		);
		assert.ok(
			artifactPaths.some((p) => p.endsWith("network.json")),
			"Expected network.json in written artifacts",
		);
		assert.ok(
			artifactPaths.some((p) => p.endsWith("dialog.json")),
			"Expected dialog.json in written artifacts",
		);
		assert.ok(
			artifactPaths.some((p) => p.endsWith("timeline.json")),
			"Expected timeline.json in written artifacts",
		);
		assert.ok(
			artifactPaths.some((p) => p.endsWith("accessibility.md")),
			"Expected accessibility.md in written artifacts",
		);
		// At least 5 artifact files (console, network, dialog, timeline, accessibility)
		assert.ok(deps._writtenArtifacts.length >= 5, `Expected >= 5 artifacts, got ${deps._writtenArtifacts.length}`);
	});

	// -----------------------------------------------------------------------
	// c. Step fails then succeeds on retry → verdict PASS
	// -----------------------------------------------------------------------
	it("step fails then succeeds on retry → verdict PASS, attempts === 2", async () => {
		let clickAttempts = 0;
		const mockTarget = {
			locator: () => ({
				first: () => ({
					click: async () => {
						clickAttempts++;
						if (clickAttempts < 2) throw new Error("Transient failure");
					},
					fill: async () => {},
				}),
			}),
			waitForSelector: async () => {},
			waitForFunction: async () => {},
		};
		const deps = createMockDeps({
			getActiveTarget: () => mockTarget,
		});
		const result = await runVerifyFlow(deps, {
			name: "retry-pass",
			steps: [{ action: "click", selector: "button" }],
			retryPolicy: { maxRetries: 1, retryDelayMs: 10 },
		});
		assert.equal(result.verdict, "PASS");
		assert.equal(clickAttempts, 2);
		assert.equal(result.stepResults[0].attempts, 2);
		assert.equal(result.stepResults[0].ok, true);
		assert.equal(result.debugBundle, undefined);
	});

	// -----------------------------------------------------------------------
	// d. Step fails after exhausting retries → verdict FAIL
	// -----------------------------------------------------------------------
	it("step fails after exhausting retries → verdict FAIL, attempts === maxRetries+1", async () => {
		let clickAttempts = 0;
		const mockTarget = {
			locator: () => ({
				first: () => ({
					click: async () => {
						clickAttempts++;
						throw new Error("Always broken");
					},
					fill: async () => {},
				}),
			}),
			waitForSelector: async () => {},
			waitForFunction: async () => {},
		};
		const deps = createMockDeps({
			getActiveTarget: () => mockTarget,
		});
		const result = await runVerifyFlow(deps, {
			name: "retry-exhaust",
			steps: [{ action: "click", selector: "button" }],
			retryPolicy: { maxRetries: 2, retryDelayMs: 10 },
		});
		assert.equal(result.verdict, "FAIL");
		assert.equal(clickAttempts, 3); // 1 initial + 2 retries
		assert.equal(result.stepResults[0].attempts, 3);
		assert.equal(result.stepResults[0].ok, false);
		assert.ok(result.stepResults[0].error);
	});

	// -----------------------------------------------------------------------
	// e. baseUrl provided → navigate step prepended
	// -----------------------------------------------------------------------
	it("baseUrl → navigate step prepended, page.goto called with baseUrl", async () => {
		const gotoUrls = [];
		const mockPage = {
			url: () => "http://localhost:3000",
			goto: async (url) => { gotoUrls.push(url); },
			waitForLoadState: async () => {},
			keyboard: { press: async () => {} },
			screenshot: async () => {},
			evaluate: async () => {},
		};
		const deps = createMockDeps({
			ensureBrowser: async () => ({ browser: {}, context: {}, page: mockPage }),
			getActivePage: () => mockPage,
			getActivePageOrNull: () => mockPage,
		});
		const result = await runVerifyFlow(deps, {
			name: "baseurl-flow",
			steps: [{ action: "click", selector: "button" }],
			baseUrl: "http://localhost:3000",
		});
		assert.equal(result.verdict, "PASS");
		assert.equal(result.stepResults.length, 2); // navigate + click
		assert.equal(result.stepResults[0].action, "navigate");
		assert.ok(
			gotoUrls.includes("http://localhost:3000"),
			`Expected goto to be called with baseUrl, got: ${gotoUrls}`,
		);
	});

	// -----------------------------------------------------------------------
	// f. Empty steps → verdict PASS immediately
	// -----------------------------------------------------------------------
	it("empty steps → verdict PASS immediately, no stepResults", async () => {
		const deps = createMockDeps();
		const result = await runVerifyFlow(deps, {
			name: "empty-flow",
			steps: [],
		});
		assert.equal(result.verdict, "PASS");
		assert.equal(result.stepResults.length, 0);
		assert.equal(result.failedStepIndex, null);
		assert.equal(result.debugBundle, undefined);
	});

	// -----------------------------------------------------------------------
	// g. Click step failure → verdict FAIL, error message captured
	// -----------------------------------------------------------------------
	it("click step throws → verdict FAIL, error message captured in stepResult", async () => {
		const mockTarget = {
			locator: () => ({
				first: () => ({
					click: async () => {
						throw new Error("Element not found");
					},
					fill: async () => {},
				}),
			}),
			waitForSelector: async () => {},
			waitForFunction: async () => {},
		};
		const deps = createMockDeps({
			getActiveTarget: () => mockTarget,
		});
		const result = await runVerifyFlow(deps, {
			name: "click-fail",
			steps: [
				{ action: "navigate", url: "http://example.com" },
				{ action: "click", selector: "button.missing" },
			],
		});
		assert.equal(result.verdict, "FAIL");
		assert.equal(result.failedStepIndex, 1);
		assert.equal(result.stepResults[0].ok, true);
		assert.equal(result.stepResults[1].ok, false);
		assert.ok(
			result.stepResults[1].error.includes("Element not found"),
			`Expected error to contain "Element not found", got: ${result.stepResults[1].error}`,
		);
	});

	// -----------------------------------------------------------------------
	// Additional: per-step retries override flow-level retryPolicy
	// -----------------------------------------------------------------------
	it("per-step retries override flow-level retryPolicy", async () => {
		let clickAttempts = 0;
		const mockTarget = {
			locator: () => ({
				first: () => ({
					click: async () => {
						clickAttempts++;
						throw new Error("Always fails");
					},
					fill: async () => {},
				}),
			}),
			waitForSelector: async () => {},
			waitForFunction: async () => {},
		};
		const deps = createMockDeps({
			getActiveTarget: () => mockTarget,
		});
		const result = await runVerifyFlow(deps, {
			name: "per-step-retry",
			steps: [{ action: "click", selector: "button", retries: 3 }],
			retryPolicy: { maxRetries: 1, retryDelayMs: 10 },
		});
		assert.equal(result.verdict, "FAIL");
		// per-step retries:3 should override flow-level maxRetries:1
		assert.equal(clickAttempts, 4); // 1 initial + 3 retries
		assert.equal(result.stepResults[0].attempts, 4);
	});

	// -----------------------------------------------------------------------
	// Additional: action tracking integration
	// -----------------------------------------------------------------------
	it("action tracking: begin/finish called, status reflects verdict", async () => {
		const deps = createMockDeps();
		const result = await runVerifyFlow(deps, {
			name: "tracked-flow",
			steps: [{ action: "navigate", url: "http://example.com" }],
		});
		assert.equal(result.verdict, "PASS");
		assert.equal(deps._trackedActions.length, 1);
		assert.equal(deps._trackedActions[0].tool, "browser_verify_flow");
		assert.equal(deps._trackedActions[0].status, "success");
	});

	it("action tracking on failure: status is 'error'", async () => {
		const mockTarget = {
			locator: () => ({
				first: () => ({
					click: async () => { throw new Error("boom"); },
					fill: async () => {},
				}),
			}),
			waitForSelector: async () => {},
			waitForFunction: async () => {},
		};
		const deps = createMockDeps({
			getActiveTarget: () => mockTarget,
		});
		const result = await runVerifyFlow(deps, {
			name: "fail-tracked",
			steps: [{ action: "click", selector: "button" }],
		});
		assert.equal(result.verdict, "FAIL");
		assert.equal(deps._trackedActions.length, 1);
		assert.equal(deps._trackedActions[0].status, "error");
		assert.ok(deps._trackedActions[0].error);
	});

	// -----------------------------------------------------------------------
	// Additional: unreached steps marked as "Not reached"
	// -----------------------------------------------------------------------
	it("unreached steps after failure are marked with attempts:0", async () => {
		const mockTarget = {
			locator: () => ({
				first: () => ({
					click: async () => { throw new Error("First click fails"); },
					fill: async () => {},
				}),
			}),
			waitForSelector: async () => {},
			waitForFunction: async () => {},
		};
		const deps = createMockDeps({
			getActiveTarget: () => mockTarget,
		});
		const result = await runVerifyFlow(deps, {
			name: "unreached-steps",
			steps: [
				{ action: "click", selector: "button1" },
				{ action: "click", selector: "button2" },
				{ action: "click", selector: "button3" },
			],
		});
		assert.equal(result.verdict, "FAIL");
		assert.equal(result.failedStepIndex, 0);
		assert.equal(result.stepResults.length, 3);
		// First step failed
		assert.equal(result.stepResults[0].ok, false);
		assert.equal(result.stepResults[0].attempts, 1);
		// Remaining steps not reached
		assert.equal(result.stepResults[1].attempts, 0);
		assert.equal(result.stepResults[1].error, "Not reached (prior step failed)");
		assert.equal(result.stepResults[2].attempts, 0);
		assert.equal(result.stepResults[2].error, "Not reached (prior step failed)");
	});

	// -----------------------------------------------------------------------
	// Additional: debug bundle dir path includes flow name and timestamp
	// -----------------------------------------------------------------------
	it("debug bundle dir path includes sanitized flow name and timestamp", async () => {
		const mockTarget = {
			locator: () => ({
				first: () => ({
					click: async () => { throw new Error("fail"); },
					fill: async () => {},
				}),
			}),
			waitForSelector: async () => {},
			waitForFunction: async () => {},
		};
		const deps = createMockDeps({
			getActiveTarget: () => mockTarget,
			formatArtifactTimestamp: () => "20260317-030000",
			sanitizeArtifactName: (v, fb) => v || fb,
		});
		const result = await runVerifyFlow(deps, {
			name: "my-flow",
			steps: [{ action: "click", selector: "button" }],
		});
		assert.equal(result.verdict, "FAIL");
		assert.ok(result.debugBundle);
		assert.ok(
			result.debugBundle.dir.includes("20260317-030000"),
			`Expected dir to contain timestamp, got: ${result.debugBundle.dir}`,
		);
		assert.ok(
			result.debugBundle.dir.includes("my-flow"),
			`Expected dir to contain flow name, got: ${result.debugBundle.dir}`,
		);
	});
});
