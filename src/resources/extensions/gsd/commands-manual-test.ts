/**
 * commands-manual-test.ts — Handler for `/gsd test` command.
 *
 * Orchestrates the full manual testing flow:
 * 1. Resolve target slice(s) and gather test checks from UAT files
 * 2. Pause auto-mode if running
 * 3. Launch the interactive TUI test runner
 * 4. Persist results (DB + markdown artifact)
 * 5. Handle post-test action (fix now / fix later / ignore)
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { isAutoActive, stopAuto } from "./auto.js";
import { deriveState } from "./state.js";
import {
  gatherChecksForSlice,
  gatherChecksForAllSlices,
  getCompletedSliceIds,
  sessionCounts,
  renderManualTestResult,
  buildFixManualTestsPrompt,
  type ManualTestSession,
  type ManualTestCheck,
} from "./manual-test.js";
import { showManualTestRunner, showPostTestActionPicker, type PostTestAction } from "./manual-test-ui.js";
import {
  saveManualTestSession,
  getLatestManualTestSession,
  updateManualTestSessionStatus,
  updateSessionResults,
  getInProgressSession,
} from "./manual-test-db.js";

// ─── Check Merging ────────────────────────────────────────────────────────────

/**
 * Merge persisted verdicts onto freshly-generated checks.
 *
 * Fresh checks are canonical (ordering, additions, removals). For each fresh check,
 * if a persisted check with the same `id` exists and has a non-null verdict, copy
 * `verdict`, `notes`, and `timestamp` onto the fresh check. New checks keep null verdicts;
 * removed checks (present in persisted but not in fresh) are dropped.
 */
export function mergeChecks(freshChecks: ManualTestCheck[], persistedChecks: ManualTestCheck[]): ManualTestCheck[] {
  const persistedMap = new Map<string, ManualTestCheck>();
  for (const c of persistedChecks) {
    if (c.verdict !== null) persistedMap.set(c.id, c);
  }

  return freshChecks.map((fresh) => {
    const persisted = persistedMap.get(fresh.id);
    if (persisted) {
      return { ...fresh, verdict: persisted.verdict, notes: persisted.notes, timestamp: persisted.timestamp };
    }
    return fresh;
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleManualTest(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  basePath: string,
): Promise<void> {
  // ── Parse subcommands ──────────────────────────────────────────────────
  const trimmed = args.trim();

  if (trimmed === "results") {
    await showResults(ctx, basePath);
    return;
  }

  // ── Derive current state ───────────────────────────────────────────────
  const state = await deriveState(basePath);

  if (!state.activeMilestone) {
    ctx.ui.notify("No active milestone. Run /gsd to start a milestone first.", "warning");
    return;
  }

  const mid = state.activeMilestone.id;
  const midTitle = state.activeMilestone.title;

  // ── Determine target slice(s) ──────────────────────────────────────────
  const completedSliceIds = getCompletedSliceIds(basePath, mid);
  if (completedSliceIds.length === 0) {
    ctx.ui.notify(
      "No completed slices to test. Complete at least one slice first.",
      "warning",
    );
    return;
  }

  let targetSliceId: string | null = null;
  let checks;

  if (trimmed === "all" || trimmed === "") {
    // Default: if multiple completed slices, test all. If one, test that one.
    if (trimmed === "all" || completedSliceIds.length > 1) {
      targetSliceId = null; // "all" mode
      checks = gatherChecksForAllSlices(basePath, mid);
    } else {
      targetSliceId = completedSliceIds[completedSliceIds.length - 1];
      checks = gatherChecksForSlice(basePath, mid, targetSliceId);
    }
  } else {
    // Specific slice requested
    const requestedSlice = trimmed.toUpperCase();
    if (!completedSliceIds.includes(requestedSlice)) {
      const available = completedSliceIds.join(", ");
      ctx.ui.notify(
        `Slice ${requestedSlice} is not completed or doesn't exist.\nCompleted slices: ${available}`,
        "warning",
      );
      return;
    }
    targetSliceId = requestedSlice;
    checks = gatherChecksForSlice(basePath, mid, targetSliceId);
  }

  if (checks.length === 0) {
    ctx.ui.notify(
      targetSliceId
        ? `No test cases found for ${targetSliceId}. The slice has no UAT file, plan, or summary to extract checks from.`
        : "No test cases found in any completed slice. Slices may be missing UAT files and plan documents.",
      "warning",
    );
    return;
  }

  // ── Stop auto-mode if running ───────────────────────────────────────────
  const wasAutoRunning = isAutoActive();
  if (wasAutoRunning) {
    ctx.ui.notify("Stopping auto-mode for manual testing...", "info");
    await stopAuto(ctx, pi, "Manual testing requested via /gsd test");
    // Create a fresh session to kill the in-flight agent turn.
    // Without this, the LLM keeps streaming underneath the test overlay.
    await ctx.newSession();
  }

  // ── Resume detection ────────────────────────────────────────────────────
  const existingSession = getInProgressSession(mid, targetSliceId);
  let startIndex = 0;

  let session: ManualTestSession;

  if (existingSession) {
    // Resume path: merge persisted verdicts onto fresh checks, reuse DB row
    const mergedChecks = mergeChecks(checks, existingSession.checks);
    startIndex = mergedChecks.findIndex((c) => c.verdict === null);
    if (startIndex < 0) startIndex = 0; // all judged — restart from beginning

    session = {
      id: existingSession.id,
      milestoneId: existingSession.milestoneId,
      sliceId: existingSession.sliceId,
      status: "in-progress",
      startedAt: existingSession.startedAt,
      completedAt: null,
      checks: mergedChecks,
      snapshot: existingSession.snapshot,
    };

    const judged = mergedChecks.filter((c) => c.verdict !== null).length;
    ctx.ui.notify(
      `Resuming interrupted session — ${judged}/${mergedChecks.length} checks already judged, starting at #${startIndex + 1}`,
      "info",
    );
  } else {
    // New session path
    session = {
      milestoneId: mid,
      sliceId: targetSliceId,
      status: "in-progress",
      startedAt: new Date().toISOString(),
      completedAt: null,
      checks,
      snapshot: {
        phase: state.phase,
        milestoneProgress: state.progress
          ? `${state.progress.slices?.done ?? 0}/${state.progress.slices?.total ?? 0} slices done`
          : "unknown",
        slicesComplete: completedSliceIds,
      },
    };

    // Pre-insert session to DB for incremental persistence
    const sessionId = saveManualTestSession(session);
    if (sessionId > 0) session.id = sessionId;
  }

  // Incremental-save callback: persists verdicts after each pass/fail/skip
  const onVerdictRecorded = (s: ManualTestSession) => {
    try { updateSessionResults(s); } catch (e) { process.stderr.write(`gsd-manual-test: verdict persistence failed: ${(e as Error).message}\n`); }
  };

  // ── Show test runner ───────────────────────────────────────────────────
  ctx.ui.notify(
    `Starting manual testing: ${checks.length} check(s) for ${targetSliceId ?? "all completed slices"}\n` +
    `Milestone: ${mid} — ${midTitle}`,
    "info",
  );

  const result = await showManualTestRunner(ctx, session, { onVerdictRecorded, startIndex });

  if (!result) {
    ctx.ui.notify("Manual test runner requires an interactive terminal.", "warning");
    return;
  }

  const { completed, session: updatedSession } = result;
  const counts = sessionCounts(updatedSession);

  // ── Persist results ────────────────────────────────────────────────────
  const resultMarkdown = renderManualTestResult(updatedSession);

  // Incremental saves already persisted verdicts to DB — write the markdown artifact
  const { writeArtifactDirect } = await import("./manual-test-db.js");
  const artifactPath = writeArtifactDirect(updatedSession, resultMarkdown, basePath);

  // ── Show summary ───────────────────────────────────────────────────────
  const verdictLabel = counts.failed > 0 ? "FAIL" : counts.skipped > 0 ? "PARTIAL" : "PASS";
  const summary = [
    `Manual testing ${completed ? "complete" : "ended early"}: ${verdictLabel}`,
    `  ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
    `  Result saved: ${artifactPath}`,
  ];

  ctx.ui.notify(summary.join("\n"), counts.failed > 0 ? "warning" : "info");

  // ── Post-test action (only if there are failures) ──────────────────────
  if (counts.failed > 0) {
    const action = await showPostTestActionPicker(ctx, counts.failed);
    await handlePostTestAction(action, updatedSession, ctx, pi, basePath, wasAutoRunning);
  } else if (wasAutoRunning) {
    ctx.ui.notify("All tests passed. Run /gsd auto to resume.", "info");
  }
}

// ─── Post-test Action Handling ────────────────────────────────────────────────

async function handlePostTestAction(
  action: PostTestAction,
  session: ManualTestSession,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  basePath: string,
  wasAutoRunning: boolean,
): Promise<void> {
  switch (action) {
    case "fix-now": {
      // Update session status to needs-fix
      session.status = "needs-fix";
      try {
        updateManualTestSessionStatus(session.milestoneId, session.startedAt, "needs-fix");
      } catch (e) { process.stderr.write(`gsd-manual-test: status update to needs-fix failed: ${(e as Error).message}\n`); }
      const fixPrompt = buildFixManualTestsPrompt(session, basePath);

      // Store the fix prompt so the dispatch rule can pick it up
      const { setPendingManualTestFix } = await import("./manual-test-db.js");
      setPendingManualTestFix(session.milestoneId, fixPrompt);

      ctx.ui.notify(
        "Fix mode activated. The agent will analyze and fix each failure.\n" +
        "Run /gsd auto to start fixing, or /gsd next for step mode.",
        "info",
      );

      // If auto was running, offer to resume
      if (wasAutoRunning) {
        const { startAuto } = await import("./auto.js");
        await startAuto(ctx, pi, basePath, false);
      }
      break;
    }

    case "fix-later": {
      ctx.ui.notify(
        "Results saved. You can:\n" +
        "  • Run /gsd test results to review\n" +
        "  • Fix issues manually and run /gsd test again\n" +
        "  • Run /gsd auto to continue the pipeline",
        "info",
      );
      break;
    }

    case "ignore": {
      // Mark the session as complete (accepted with known issues)
      session.status = "complete";
      try {
        updateManualTestSessionStatus(session.milestoneId, session.startedAt, "complete");
      } catch (e) { process.stderr.write(`gsd-manual-test: status update to complete failed: ${(e as Error).message}\n`); }

      ctx.ui.notify("Failures accepted as known issues. Pipeline can continue.", "info");

      if (wasAutoRunning) {
        ctx.ui.notify("Run /gsd auto to resume.", "info");
      }
      break;
    }
  }
}

// ─── Results Display ──────────────────────────────────────────────────────────

async function showResults(
  ctx: ExtensionCommandContext,
  basePath: string,
): Promise<void> {
  const state = await deriveState(basePath);
  if (!state.activeMilestone) {
    ctx.ui.notify("No active milestone.", "warning");
    return;
  }

  const session = getLatestManualTestSession(state.activeMilestone.id);
  if (!session) {
    ctx.ui.notify("No manual test results found for this milestone.", "info");
    return;
  }

  const counts = sessionCounts(session);
  const verdict = counts.failed > 0 ? "FAIL" : counts.skipped > 0 ? "PARTIAL" : "PASS";

  const lines = [
    `Manual Test Results — ${session.milestoneId}${session.sliceId ? `/${session.sliceId}` : ""}`,
    `Status: ${session.status}  Verdict: ${verdict}`,
    `Date: ${session.startedAt}`,
    `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
    "",
  ];

  for (const c of session.checks) {
    const icon = c.verdict === "pass" ? "✓" : c.verdict === "fail" ? "✗" : c.verdict === "skip" ? "–" : "○";
    const notes = c.verdict === "fail" && c.notes ? ` — ${c.notes}` : "";
    lines.push(`  ${icon} ${c.name}${notes}`);
  }

  ctx.ui.notify(lines.join("\n"), "info");
}
