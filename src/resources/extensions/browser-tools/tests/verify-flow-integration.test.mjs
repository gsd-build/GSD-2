/**
 * verify-flow — Playwright integration tests
 *
 * Exercises `runVerifyFlow` against a real Chromium page:
 * - PASS flow with real text assertion
 * - FAIL flow with real debug bundle files on disk
 * - Multi-step flow: click mutates DOM, then assert
 * - Retry flow: wait_for succeeds after delayed DOM update
 *
 * Uses the same jiti/Playwright/node:test pattern as
 * browser-tools-integration.test.mjs.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jiti = require("jiti")(__dirname, { interopDefault: true, debug: false });

// Import the function-under-test
const { runVerifyFlow } = jiti("../tools/verify-flow.ts");

// Import real helpers for building deps
const { captureCompactPageState } = jiti("../capture.ts");
const {
	collectAssertionState,
	writeArtifactFile,
	formatArtifactTimestamp,
	sanitizeArtifactName,
	formatAssertionText,
	formatDiffText,
} = jiti("../utils.ts");
const { evaluateAssertionChecks } = jiti("../core.ts");

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

let browser;
let context;
let page;
let tempArtifactDir;

before(async () => {
	browser = await chromium.launch({ headless: true });
	context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	page = await context.newPage();
	// Create a temp directory for artifact output during tests
	tempArtifactDir = await mkdtemp(join(tmpdir(), "verify-flow-integ-"));
});

after(async () => {
	if (browser) await browser.close();
	// Clean up temp artifacts
	if (tempArtifactDir) {
		await rm(tempArtifactDir, { recursive: true, force: true }).catch(() => {});
	}
});

// ---------------------------------------------------------------------------
// Build a real-ish deps object that uses the real Playwright page for DOM
// interaction but stubs tracking/formatting deps that need module-level state.
// ---------------------------------------------------------------------------

function buildDeps() {
	let actionCounter = 0;
	const trackedActions = [];

	return {
		// Browser lifecycle — return the real browser/context/page
		ensureBrowser: async () => ({ browser, context, page }),
		closeBrowser: async () => {},
		getActivePage: () => page,
		getActiveTarget: () => page,
		getActivePageOrNull: () => page,

		// Page state capture — use the REAL captureCompactPageState
		captureCompactPageState: async (p, opts) =>
			captureCompactPageState(p, opts),

		// Assertion state — wrapper around the REAL collectAssertionState
		collectAssertionState: async (p, checks, target) =>
			collectAssertionState(p, checks, captureCompactPageState, target),

		// Settle — short delay to let DOM mutations propagate
		settleAfterActionAdaptive: async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			return {
				settleMode: "adaptive",
				settleMs: 50,
				settleReason: "integration-test-stub",
				settlePolls: 0,
			};
		},

		// Mutation counter — no-op for integration tests
		ensureMutationCounter: async () => {},

		// Action tracking — lightweight stubs
		beginTrackedAction: (tool, params, url) => {
			const entry = { id: ++actionCounter, tool, status: "running" };
			trackedActions.push(entry);
			return entry;
		},
		finishTrackedAction: (actionId, updates) => {
			const entry = trackedActions.find((e) => e.id === actionId);
			if (entry) Object.assign(entry, updates);
			return entry;
		},

		// Artifact writing — use REAL writeArtifactFile (writes to disk)
		writeArtifactFile,
		copyArtifactFile: async (src, dest) => ({ path: dest, bytes: 0 }),
		ensureSessionArtifactDir: async () => tempArtifactDir,
		buildSessionArtifactPath: (f) => join(tempArtifactDir, f),
		getSessionArtifactMetadata: () => ({}),
		sanitizeArtifactName,
		formatArtifactTimestamp,

		// Debug bundle support — accessibility capture from real page
		captureAccessibilityMarkdown: async () => {
			try {
				const snapshot = await page.accessibility.snapshot();
				return {
					snapshot: JSON.stringify(snapshot, null, 2),
					scope: "page",
					source: "integration-test",
				};
			} catch {
				return { snapshot: "# Accessibility\n(unavailable)", scope: "page", source: "integration-test" };
			}
		},

		// Formatting stubs — not exercised by the flow logic itself
		postActionSummary: async () => "ok",
		formatCompactStateSummary: () => "ok",
		constrainScreenshot: async (p, buf) => buf,
		captureErrorScreenshot: async () => null,
		getRecentErrors: () => "",
		truncateText: (t) => t,
		verificationFromChecks: () => ({
			verified: true,
			checks: [],
			verificationSummary: "",
		}),
		verificationLine: () => "",
		formatAssertionText,
		formatDiffText,
		getUrlHash: (url) => { try { return new URL(url).hash || ""; } catch { return ""; } },
		captureClickTargetState: async () => ({
			exists: true,
			ariaExpanded: null,
			ariaPressed: null,
			ariaSelected: null,
			open: null,
		}),
		readInputLikeValue: async () => null,
		firstErrorLine: (err) => String(err),

		// Ref support — minimal stubs (not used in these tests)
		buildRefSnapshot: async () => [],
		resolveRefTarget: async () => ({ ok: true, selector: "button" }),
		parseRef: (input) => ({
			key: input.replace(/^@?v\d+:/, ""),
			version: 1,
			display: input,
		}),
		formatVersionedRef: (v, k) => `@v${v}:${k}`,
		staleRefGuidance: () => "stale",

		// Page/session stubs
		attachPageListeners: () => {},
		resolveAccessibilityScope: async () => ({ scope: "page", source: "stub" }),
		getLivePagesSnapshot: async () => [],
		getSinceTimestamp: () => 0,
		getConsoleEntriesSince: () => [],
		getNetworkEntriesSince: () => [],
	};
}

// =========================================================================
// Integration Tests
// =========================================================================

describe("runVerifyFlow integration (real Playwright)", () => {
	// -----------------------------------------------------------------------
	// a. PASS flow — assert visible text succeeds
	// -----------------------------------------------------------------------
	it("PASS flow — text_visible assertion against real DOM", async () => {
		await page.setContent("<h1>Welcome</h1><p>Hello World</p>");
		const deps = buildDeps();

		const result = await runVerifyFlow(deps, {
			name: "pass-flow",
			steps: [
				{
					action: "assert",
					checks: [{ kind: "text_visible", text: "Hello World" }],
				},
			],
		});

		assert.equal(result.verdict, "PASS", `Expected PASS, got ${result.verdict}`);
		assert.equal(result.name, "pass-flow");
		assert.equal(result.failedStepIndex, null);
		assert.equal(result.debugBundle, undefined, "No debug bundle on PASS");
		assert.equal(result.stepResults.length, 1);
		assert.equal(result.stepResults[0].ok, true);
		assert.equal(result.stepResults[0].action, "assert");
		assert.ok(result.totalDurationMs >= 0);
	});

	// -----------------------------------------------------------------------
	// b. FAIL flow — assert missing text triggers debug bundle on disk
	// -----------------------------------------------------------------------
	it("FAIL flow — missing text triggers FAIL verdict and debug bundle on disk", async () => {
		await page.setContent("<h1>Welcome</h1>");
		const deps = buildDeps();

		const result = await runVerifyFlow(deps, {
			name: "fail-flow",
			steps: [
				{
					action: "assert",
					checks: [{ kind: "text_visible", text: "Does Not Exist" }],
				},
			],
		});

		assert.equal(result.verdict, "FAIL", `Expected FAIL, got ${result.verdict}`);
		assert.equal(result.failedStepIndex, 0);
		assert.equal(result.stepResults[0].ok, false);
		assert.ok(result.stepResults[0].error, "Failed step should have error message");

		// Debug bundle should exist
		assert.ok(result.debugBundle, "Debug bundle should be defined on FAIL");
		assert.ok(result.debugBundle.dir, "Debug bundle should have a dir path");

		// Verify debug bundle directory exists on disk
		await access(result.debugBundle.dir);

		// Verify at least a screenshot file exists in the bundle dir
		const files = await readdir(result.debugBundle.dir);
		assert.ok(
			files.some((f) => f.includes("screenshot")),
			`Expected screenshot in debug bundle, found: ${files.join(", ")}`,
		);
		// Also verify console.json and network.json exist
		assert.ok(
			files.some((f) => f === "console.json"),
			`Expected console.json in debug bundle, found: ${files.join(", ")}`,
		);
		assert.ok(
			files.some((f) => f === "network.json"),
			`Expected network.json in debug bundle, found: ${files.join(", ")}`,
		);
	});

	// -----------------------------------------------------------------------
	// c. Multi-step flow — click triggers DOM change, then assert
	// -----------------------------------------------------------------------
	it("Multi-step flow — click mutates DOM, then assert succeeds", async () => {
		await page.setContent(
			'<button onclick="document.getElementById(\'msg\').textContent=\'Clicked!\'">Go</button>' +
			'<div id="msg">Not yet</div>',
		);
		const deps = buildDeps();

		const result = await runVerifyFlow(deps, {
			name: "multi-step-flow",
			steps: [
				{ action: "click", selector: "button" },
				{
					action: "assert",
					checks: [{ kind: "text_visible", text: "Clicked!" }],
				},
			],
		});

		assert.equal(result.verdict, "PASS", `Expected PASS, got ${result.verdict}`);
		assert.equal(result.stepResults.length, 2);
		assert.equal(result.stepResults[0].ok, true, "Click step should pass");
		assert.equal(result.stepResults[0].action, "click");
		assert.equal(result.stepResults[1].ok, true, "Assert step should pass");
		assert.equal(result.stepResults[1].action, "assert");
		assert.equal(result.failedStepIndex, null);
		assert.equal(result.debugBundle, undefined, "No debug bundle on PASS");

		// Verify DOM was actually mutated by the click
		const text = await page.textContent("#msg");
		assert.equal(text, "Clicked!", "Real DOM should reflect the click mutation");
	});

	// -----------------------------------------------------------------------
	// d. Retry flow — wait_for succeeds after delayed DOM update
	// -----------------------------------------------------------------------
	it("Retry flow — wait_for text_visible succeeds after delayed DOM update", async () => {
		await page.setContent('<div id="target">Loading...</div>');
		// Schedule a delayed DOM update — the text changes after 300ms
		await page.evaluate(() => {
			setTimeout(() => {
				document.getElementById("target").textContent = "Ready";
			}, 300);
		});

		const deps = buildDeps();

		const result = await runVerifyFlow(deps, {
			name: "retry-flow",
			steps: [
				{
					action: "wait_for",
					condition: "text_visible",
					value: "Ready",
					timeout: 3000,
				},
			],
			retryPolicy: { maxRetries: 2, retryDelayMs: 200 },
		});

		assert.equal(result.verdict, "PASS", `Expected PASS, got ${result.verdict}`);
		assert.equal(result.stepResults.length, 1);
		assert.equal(result.stepResults[0].ok, true);
		assert.equal(result.stepResults[0].action, "wait_for");
		assert.equal(result.failedStepIndex, null);

		// Verify the DOM actually has the updated text
		const text = await page.textContent("#target");
		assert.equal(text, "Ready", "Real DOM should show 'Ready' after delayed update");
	});
});
