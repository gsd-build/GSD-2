/**
 * Triage dispatch ordering contract tests.
 *
 * These tests verify structural invariants of the triage integration
 * by inspecting the actual source code of auto.ts, auto-post-unit.ts,
 * and post-unit-hooks.ts.
 * Full behavioral testing requires the @gsd/pi-coding-agent runtime.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksPath = join(__dirname, "..", "post-unit-hooks.ts");
const autoPromptsPath = join(__dirname, "..", "auto-prompts.ts");

// Post-unit dispatch logic was split from auto.ts into auto-post-unit.ts — read both
const autoSrc = [
  readFileSync(join(__dirname, "..", "auto.ts"), "utf-8"),
  readFileSync(join(__dirname, "..", "auto-post-unit.ts"), "utf-8"),
].join("\n");
const hooksSrc = readFileSync(hooksPath, "utf-8");
const autoPromptsSrc = (() => { try { return readFileSync(autoPromptsPath, "utf-8"); } catch { return autoSrc; } })();

// ─── Hook exclusion ──────────────────────────────────────────────────────────

test("dispatch: triage-captures excluded from post-unit hook triggering", () => {
  // post-unit-hooks.ts must return null for triage-captures unit type
  assert.ok(
    hooksSrc.includes('"triage-captures"'),
    "post-unit-hooks.ts should reference triage-captures",
  );
  assert.ok(
    hooksSrc.includes('completedUnitType === "triage-captures"'),
    "should check for triage-captures in the hook exclusion guard",
  );
});

// ─── Triage check placement ──────────────────────────────────────────────────

test("dispatch: triage check appears after hook section and before stepMode check", () => {
  const hookRetryIndex = autoSrc.indexOf("isRetryPending()");
  const triageCheckIndex = autoSrc.indexOf("Triage check");
  const stepModeIndex = autoSrc.indexOf("Step mode");

  assert.ok(hookRetryIndex > 0, "hook retry check should exist");
  assert.ok(triageCheckIndex > 0, "triage check block should exist");
  assert.ok(stepModeIndex > 0, "step mode check should exist");

  assert.ok(
    triageCheckIndex > hookRetryIndex,
    "triage check should come after hook retry check",
  );
  assert.ok(
    triageCheckIndex < stepModeIndex,
    "triage check should come before stepMode check",
  );
});

// ─── Guard conditions ────────────────────────────────────────────────────────

test("dispatch: triage check guards against step mode", () => {
  // The triage block should check !stepMode
  const triageBlock = autoSrc.slice(
    autoSrc.indexOf("Triage check"),
    autoSrc.indexOf("Step mode"),
  );
  assert.ok(
    triageBlock.includes("!s.stepMode"),
    "triage block should guard against step mode",
  );
});

test("dispatch: triage check guards against hook unit types", () => {
  const triageBlock = autoSrc.slice(
    autoSrc.indexOf("Triage check"),
    autoSrc.indexOf("Step mode"),
  );
  assert.ok(
    triageBlock.includes('!s.currentUnit.type.startsWith("hook/")'),
    "triage block should not fire for hook units",
  );
});

test("dispatch: triage check guards against triage-on-triage", () => {
  const triageBlock = autoSrc.slice(
    autoSrc.indexOf("Triage check"),
    autoSrc.indexOf("Step mode"),
  );
  assert.ok(
    triageBlock.includes('s.currentUnit.type !== "triage-captures"'),
    "triage block should not fire for triage units",
  );
});

test("dispatch: triage check guards against quick-task triggering triage", () => {
  const triageBlock = autoSrc.slice(
    autoSrc.indexOf("Triage check"),
    autoSrc.indexOf("Step mode"),
  );
  assert.ok(
    triageBlock.includes('s.currentUnit.type !== "quick-task"'),
    "triage block should not fire for quick-task units",
  );
});

test("dispatch: triage dispatch uses early-return pattern", () => {
  const triageBlock = autoSrc.slice(
    autoSrc.indexOf("Triage check"),
    autoSrc.indexOf("Step mode"),
  );
  assert.ok(
    triageBlock.includes('return "dispatched"') || triageBlock.includes("return; // handleAgentEnd"),
    "triage dispatch should return after sending message",
  );
});

test("dispatch: triage imports hasPendingCaptures and loadPendingCaptures", () => {
  assert.ok(
    autoSrc.includes("hasPendingCaptures") && autoSrc.includes("loadPendingCaptures"),
    "should import capture functions",
  );
});

// ─── Prompt integration ──────────────────────────────────────────────────────

test("dispatch: replan prompt builder loads capture context", () => {
  const src = autoPromptsSrc;
  assert.ok(
    src.includes("loadReplanCaptures"),
    "buildReplanSlicePrompt should load replan captures",
  );
  assert.ok(
    src.includes("captureContext"),
    "buildReplanSlicePrompt should pass captureContext to template",
  );
});

test("dispatch: reassess prompt builder loads deferred captures", () => {
  const src = autoPromptsSrc;
  assert.ok(
    src.includes("loadDeferredCaptures"),
    "buildReassessRoadmapPrompt should load deferred captures",
  );
  assert.ok(
    src.includes("deferredCaptures"),
    "buildReassessRoadmapPrompt should pass deferredCaptures to template",
  );
});

// ─── Prompt templates ────────────────────────────────────────────────────────

test("dispatch: replan prompt template includes captureContext variable", () => {
  const promptPath = join(__dirname, "..", "prompts", "replan-slice.md");
  const prompt = readFileSync(promptPath, "utf-8");
  assert.ok(
    prompt.includes("{{captureContext}}"),
    "replan-slice.md should include {{captureContext}}",
  );
});

test("dispatch: reassess prompt template includes deferredCaptures variable", () => {
  const promptPath = join(__dirname, "..", "prompts", "reassess-roadmap.md");
  const prompt = readFileSync(promptPath, "utf-8");
  assert.ok(
    prompt.includes("{{deferredCaptures}}"),
    "reassess-roadmap.md should include {{deferredCaptures}}",
  );
});

test("dispatch: triage prompt template exists and has classification criteria", () => {
  const promptPath = join(__dirname, "..", "prompts", "triage-captures.md");
  const prompt = readFileSync(promptPath, "utf-8");
  assert.ok(prompt.includes("quick-task"), "should have quick-task classification");
  assert.ok(prompt.includes("inject"), "should have inject classification");
  assert.ok(prompt.includes("defer"), "should have defer classification");
  assert.ok(prompt.includes("replan"), "should have replan classification");
  assert.ok(prompt.includes("note"), "should have note classification");
  assert.ok(prompt.includes("{{pendingCaptures}}"), "should have pending captures variable");
});

// ─── Dashboard integration ───────────────────────────────────────────────────

test("dashboard: AutoDashboardData includes pendingCaptureCount field", () => {
  assert.ok(
    autoSrc.includes("pendingCaptureCount"),
    "auto.ts should have pendingCaptureCount in AutoDashboardData",
  );
});

test("dashboard: getAutoDashboardData computes pendingCaptureCount", () => {
  assert.ok(
    autoSrc.includes("pendingCaptureCount = countPendingCaptures") ||
    autoSrc.includes("pendingCaptureCount = countPendingCaptures(basePath)"),
    "getAutoDashboardData should compute pendingCaptureCount from countPendingCaptures (single-read)",
  );
});

test("dashboard: overlay renders pending captures badge", () => {
  const overlayPath = join(__dirname, "..", "dashboard-overlay.ts");
  const overlaySrc = readFileSync(overlayPath, "utf-8");
  assert.ok(
    overlaySrc.includes("pendingCaptureCount"),
    "dashboard-overlay.ts should reference pendingCaptureCount",
  );
  assert.ok(
    overlaySrc.includes("pending capture"),
    "dashboard-overlay.ts should show pending captures text",
  );
});

test("dashboard: overlay labels triage-captures and quick-task unit types", () => {
  const overlayPath = join(__dirname, "..", "dashboard-overlay.ts");
  const overlaySrc = readFileSync(overlayPath, "utf-8");
  assert.ok(
    overlaySrc.includes('"triage-captures"'),
    "unitLabel should handle triage-captures",
  );
  assert.ok(
    overlaySrc.includes('"quick-task"'),
    "unitLabel should handle quick-task",
  );
});

// ─── Post-triage resolution execution ─────────────────────────────────────────

test("dispatch: post-triage resolution executor fires after triage-captures unit", () => {
  const triageCompletionBlock = autoSrc.slice(
    autoSrc.indexOf("Post-triage: execute actionable resolutions"),
    autoSrc.indexOf("Artifact verification"),
  );
  assert.ok(
    triageCompletionBlock.includes('s.currentUnit.type === "triage-captures"'),
    "should check for triage-captures unit completion",
  );
  assert.ok(
    triageCompletionBlock.includes("executeTriageResolutions"),
    "should call executeTriageResolutions",
  );
});

test("dispatch: post-triage executor handles inject results", () => {
  const triageCompletionBlock = autoSrc.slice(
    autoSrc.indexOf("Post-triage: execute actionable resolutions"),
    autoSrc.indexOf("Artifact verification"),
  );
  assert.ok(
    triageCompletionBlock.includes("triageResult.injected"),
    "should check injected count",
  );
});

test("dispatch: post-triage executor handles replan results", () => {
  const triageCompletionBlock = autoSrc.slice(
    autoSrc.indexOf("Post-triage: execute actionable resolutions"),
    autoSrc.indexOf("Artifact verification"),
  );
  assert.ok(
    triageCompletionBlock.includes("triageResult.replanned"),
    "should check replanned count",
  );
});

test("dispatch: post-triage executor queues quick-tasks", () => {
  const triageCompletionBlock = autoSrc.slice(
    autoSrc.indexOf("Post-triage: execute actionable resolutions"),
    autoSrc.indexOf("Artifact verification"),
  );
  assert.ok(
    triageCompletionBlock.includes("s.pendingQuickTasks"),
    "should push quick-tasks to s.pendingQuickTasks queue",
  );
});

// ─── Quick-task dispatch ──────────────────────────────────────────────────────

test("dispatch: quick-task dispatch block exists after triage check", () => {
  const quickTaskBlock = autoSrc.indexOf("Quick-task dispatch");
  const triageBlock = autoSrc.indexOf("Triage check");
  const stepModeBlock = autoSrc.indexOf("Step mode");

  assert.ok(quickTaskBlock > 0, "quick-task dispatch block should exist");
  assert.ok(
    quickTaskBlock > triageBlock,
    "quick-task dispatch should come after triage check",
  );
  assert.ok(
    quickTaskBlock < stepModeBlock,
    "quick-task dispatch should come before step mode check",
  );
});

test("dispatch: quick-task dispatch uses buildQuickTaskPrompt", () => {
  const quickTaskSection = autoSrc.slice(
    autoSrc.indexOf("Quick-task dispatch"),
    autoSrc.indexOf("Step mode"),
  );
  assert.ok(
    quickTaskSection.includes("buildQuickTaskPrompt"),
    "should call buildQuickTaskPrompt for quick-task dispatch",
  );
});

test("dispatch: quick-task dispatch marks capture as executed", () => {
  const quickTaskSection = autoSrc.slice(
    autoSrc.indexOf("Quick-task dispatch"),
    autoSrc.indexOf("Step mode"),
  );
  assert.ok(
    quickTaskSection.includes("markCaptureExecuted"),
    "should mark capture as executed after dispatch",
  );
});

test("dispatch: quick-task dispatch uses early-return pattern", () => {
  const quickTaskSection = autoSrc.slice(
    autoSrc.indexOf("Quick-task dispatch"),
    autoSrc.indexOf("Step mode"),
  );
  assert.ok(
    quickTaskSection.includes('return "dispatched"') || quickTaskSection.includes("return; // handleAgentEnd"),
    "quick-task dispatch should return after sending message",
  );
});

// ─── Post-unit hook exclusion for quick-task ──────────────────────────────────

test("dispatch: quick-task excluded from post-unit hook triggering", () => {
  assert.ok(
    hooksSrc.includes('"quick-task"'),
    "post-unit-hooks.ts should reference quick-task",
  );
});

// ─── pendingQuickTasks queue lifecycle ────────────────────────────────────────

test("dispatch: pendingQuickTasks queue is reset on auto-mode start/stop", () => {
  const resetMatches = autoSrc.match(/s\.pendingQuickTasks = \[\]/g);
  assert.ok(
    resetMatches && resetMatches.length >= 2,
    "s.pendingQuickTasks should be reset in start and stop paths",
  );
});
