/**
 * manual-test-ui.ts — TUI overlay for interactive manual test runner.
 *
 * Renders one test case at a time with pass/fail/skip controls.
 * Uses the shared UI design system for consistent styling.
 *
 * Navigation:
 *   p / P / Enter   Pass — mark current check as passed, advance
 *   f / F           Fail — open notes input, then advance
 *   s / S           Skip — mark as skipped, advance
 *   ← / →           Navigate between checks (review previous)
 *   q / Esc          Quit early (saves partial progress)
 *   ?               Show commands
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { type Theme } from "@gsd/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi, type TUI } from "@gsd/pi-tui";
import { makeUI, GLYPH } from "../shared/ui.js";

import type { ManualTestCheck, ManualTestSession, TestVerdict } from "./manual-test.js";
import { sessionCounts } from "./manual-test.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManualTestUIResult {
  /** Whether the session completed (all checks seen) or was quit early */
  completed: boolean;
  /** The session with verdicts filled in */
  session: ManualTestSession;
}

type UIMode = "check" | "fail-notes" | "help" | "summary";

// ─── Overlay ──────────────────────────────────────────────────────────────────

/**
 * Show the interactive manual test runner overlay.
 * Returns the session with verdicts filled in, or null if UI was unavailable.
 *
 * Options:
 *   onVerdictRecorded — called after each verdict and on session finish, for incremental persistence
 *   startIndex — resume from this check index (clamped to valid range)
 */
export async function showManualTestRunner(
  ctx: ExtensionCommandContext,
  session: ManualTestSession,
  options?: { onVerdictRecorded?: (session: ManualTestSession) => void; startIndex?: number },
): Promise<ManualTestUIResult | null> {
  if (!ctx.hasUI || session.checks.length === 0) return null;

  const initialIndex = Math.max(0, Math.min(options?.startIndex ?? 0, session.checks.length - 1));

  return ctx.ui.custom<ManualTestUIResult>(
    (tui: TUI, theme: Theme, _kb, done) => {
      let currentIndex = initialIndex;
      let mode: UIMode = "check";
      let failNotesBuffer = "";
      let cachedLines: string[] | undefined;

      function refresh() {
        cachedLines = undefined;
        tui.requestRender();
      }

      function currentCheck(): ManualTestCheck {
        return session.checks[currentIndex];
      }

      function recordVerdict(verdict: TestVerdict, notes = "") {
        const check = currentCheck();
        check.verdict = verdict;
        check.notes = notes;
        check.timestamp = new Date().toISOString();
        options?.onVerdictRecorded?.(session);
      }

      function advance() {
        if (currentIndex < session.checks.length - 1) {
          currentIndex++;
          mode = "check";
          failNotesBuffer = "";
          refresh();
        } else {
          mode = "summary";
          refresh();
        }
      }

      function finishSession(completed: boolean) {
        session.status = completed ? "complete" : "abandoned";
        session.completedAt = new Date().toISOString();
        options?.onVerdictRecorded?.(session);
        done({ completed, session });
      }

      function handleInput(data: string) {
        // ── Help mode ────────────────────────────────────────────────────
        if (mode === "help") {
          mode = "check";
          refresh();
          return;
        }

        // ── Summary mode ─────────────────────────────────────────────────
        if (mode === "summary") {
          if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape) || data === "q" || data === "Q") {
            finishSession(true);
          }
          return;
        }

        // ── Fail-notes mode (simple inline text buffer) ──────────────────
        if (mode === "fail-notes") {
          if (matchesKey(data, Key.enter)) {
            const notes = failNotesBuffer.trim() || "(no details provided)";
            recordVerdict("fail", notes);
            failNotesBuffer = "";
            advance();
            return;
          }
          if (matchesKey(data, Key.escape)) {
            failNotesBuffer = "";
            mode = "check";
            refresh();
            return;
          }
          if (matchesKey(data, Key.backspace) || data === "\x7f") {
            if (failNotesBuffer.length > 0) {
              failNotesBuffer = failNotesBuffer.slice(0, -1);
              refresh();
            }
            return;
          }
          // Printable characters
          if (data.length === 1 && data.charCodeAt(0) >= 32) {
            failNotesBuffer += data;
            refresh();
            return;
          }
          return;
        }

        // ── Check mode ───────────────────────────────────────────────────
        if (data === "p" || data === "P" || matchesKey(data, Key.enter)) {
          recordVerdict("pass");
          advance();
          return;
        }
        if (data === "f" || data === "F") {
          mode = "fail-notes";
          failNotesBuffer = "";
          refresh();
          return;
        }
        if (data === "s" || data === "S") {
          recordVerdict("skip");
          advance();
          return;
        }
        if (matchesKey(data, Key.left) && currentIndex > 0) {
          currentIndex--;
          refresh();
          return;
        }
        if (matchesKey(data, Key.right) && currentIndex < session.checks.length - 1) {
          currentIndex++;
          refresh();
          return;
        }
        if (data === "?" || data === "h" || data === "H") {
          mode = "help";
          refresh();
          return;
        }
        if (data === "q" || data === "Q" || matchesKey(data, Key.escape)) {
          finishSession(false);
          return;
        }
      }

      function render(width: number): string[] {
        if (cachedLines) return cachedLines;

        const ui = makeUI(theme, width);
        const lines: string[] = [];
        const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };

        const sliceLabel = session.sliceId ?? "All Slices";

        // ── Help screen ─────────────────────────────────────────────────
        if (mode === "help") {
          push(ui.bar(), ui.blank());
          push(ui.header("  Manual Testing — Help"));
          push(ui.blank());
          lines.push(truncateToWidth(theme.fg("text", "  Keyboard:"), width));
          lines.push(truncateToWidth(theme.fg("muted", "    P / Enter    Mark as PASS and advance"), width));
          lines.push(truncateToWidth(theme.fg("muted", "    F           Mark as FAIL (enter notes)"), width));
          lines.push(truncateToWidth(theme.fg("muted", "    S           Skip this check"), width));
          lines.push(truncateToWidth(theme.fg("muted", "    ← / →       Navigate between checks"), width));
          lines.push(truncateToWidth(theme.fg("muted", "    Q / Esc     Quit (saves partial progress)"), width));
          lines.push(truncateToWidth(theme.fg("muted", "    ?           Show this help"), width));
          push(ui.blank());
          push(ui.hints(["any key to return"]));
          push(ui.bar());
          cachedLines = lines;
          return lines;
        }

        // ── Summary screen ──────────────────────────────────────────────
        if (mode === "summary") {
          const counts = sessionCounts(session);
          push(ui.bar(), ui.blank());
          push(ui.header("  Manual Testing Complete"));
          push(ui.blank());

          const verdict = counts.failed > 0 ? "FAIL" : counts.skipped > 0 ? "PARTIAL" : "PASS";
          const verdictColor = verdict === "PASS" ? "success" : verdict === "FAIL" ? "error" : "warning";
          lines.push(truncateToWidth(`  ${theme.fg(verdictColor, theme.bold(`Verdict: ${verdict}`))}`, width));
          push(ui.blank());
          lines.push(truncateToWidth(`  ${theme.fg("success", `${GLYPH.check} ${counts.passed} passed`)}  ${theme.fg("error", `${GLYPH.statusFailed} ${counts.failed} failed`)}  ${theme.fg("dim", `${GLYPH.statusSkipped} ${counts.skipped} skipped`)}`, width));
          push(ui.blank());

          const failed = session.checks.filter(c => c.verdict === "fail");
          if (failed.length > 0) {
            lines.push(truncateToWidth(theme.fg("text", "  Failed:"), width));
            for (const c of failed) {
              lines.push(truncateToWidth(`    ${theme.fg("error", GLYPH.statusFailed)} ${theme.fg("text", c.name)} ${theme.fg("dim", `— ${c.notes}`)}`, width));
            }
            push(ui.blank());
          }

          push(ui.hints(["Enter to finish"]));
          push(ui.bar());
          cachedLines = lines;
          return lines;
        }

        // ── Main check screen ───────────────────────────────────────────
        push(ui.bar(), ui.blank());
        push(ui.header(`  Manual Testing: ${sliceLabel}`));
        push(ui.blank());

        // Progress bar
        const progressDone = session.checks.filter(c => c.verdict !== null).length;
        const progressTotal = session.checks.length;
        const barWidth = Math.max(10, Math.min(30, width - 30));
        const filledCount = Math.round((progressDone / progressTotal) * barWidth);
        const progressBar = GLYPH.squareFilled.repeat(filledCount) + GLYPH.squareEmpty.repeat(barWidth - filledCount);
        lines.push(truncateToWidth(`  Test ${currentIndex + 1} of ${progressTotal}  ${theme.fg("accent", progressBar)}  ${Math.round((progressDone / progressTotal) * 100)}%`, width));
        push(ui.blank());

        const check = currentCheck();

        // Category badge
        const categoryBadge = check.category === "smoke" ? theme.fg("warning", "[SMOKE]")
          : check.category === "edge-case" ? theme.fg("accent", "[EDGE]")
          : theme.fg("dim", "[TEST]");
        lines.push(truncateToWidth(`  ${categoryBadge} ${theme.bold(theme.fg("text", check.name))}`, width));
        push(ui.blank());

        if (check.preconditions) {
          lines.push(truncateToWidth(theme.fg("muted", `  Preconditions: ${check.preconditions.split("\n")[0]}`), width));
          push(ui.blank());
        }

        if (check.steps.length > 0) {
          lines.push(truncateToWidth(theme.fg("text", "  Steps:"), width));
          for (let i = 0; i < check.steps.length; i++) {
            const wrapped = wrapTextWithAnsi(`    ${theme.fg("muted", `${i + 1}. ${check.steps[i]}`)}`, width);
            lines.push(...wrapped);
          }
          push(ui.blank());
        }

        if (check.expected) {
          const wrapped = wrapTextWithAnsi(`  ${theme.fg("text", "Expected: ")}${theme.fg("accent", check.expected)}`, width);
          lines.push(...wrapped);
          push(ui.blank());
        }

        // Current verdict (if navigating back to an already-judged check)
        if (check.verdict !== null) {
          const vIcon = check.verdict === "pass" ? theme.fg("success", `${GLYPH.check} PASS`)
            : check.verdict === "fail" ? theme.fg("error", `${GLYPH.statusFailed} FAIL`)
            : theme.fg("dim", `${GLYPH.statusSkipped} SKIP`);
          lines.push(truncateToWidth(`  Current: ${vIcon}${check.notes ? theme.fg("dim", ` — ${check.notes}`) : ""}`, width));
          push(ui.blank());
        }

        // Separator
        lines.push(truncateToWidth(theme.fg("dim", `  ${GLYPH.separator.repeat(Math.max(1, width - 4))}`), width));

        if (mode === "fail-notes") {
          lines.push(truncateToWidth(theme.fg("error", "  What went wrong?"), width));
          push(ui.blank());
          const displayText = failNotesBuffer || theme.fg("dim", "(type your notes)");
          lines.push(truncateToWidth(`   ${displayText}${theme.fg("accent", "▎")}`, width));
          push(ui.blank());
          push(ui.hints(["Enter to submit", "Esc to cancel"]));
        } else {
          push(ui.hints(["[P]ass", "[F]ail", "[S]kip", "[Q]uit", "[?] Help"]));
        }

        // Recent results (last 3)
        const recent = session.checks
          .slice(0, currentIndex)
          .filter(c => c.verdict !== null)
          .slice(-3);
        if (recent.length > 0) {
          push(ui.blank());
          lines.push(truncateToWidth(theme.fg("dim", "  Recent:"), width));
          for (const r of recent) {
            const icon = r.verdict === "pass" ? theme.fg("success", GLYPH.check)
              : r.verdict === "fail" ? theme.fg("error", GLYPH.statusFailed)
              : theme.fg("dim", GLYPH.statusSkipped);
            const note = r.verdict === "fail" && r.notes ? theme.fg("dim", ` (${r.notes})`) : "";
            lines.push(truncateToWidth(`    ${icon} ${theme.fg("dim", r.name)}${note}`, width));
          }
        }

        push(ui.bar());
        cachedLines = lines;
        return lines;
      }

      return { handleInput, render, invalidate: () => { cachedLines = undefined; } };
    },
    {
      overlay: true,
      overlayOptions: {
        width: "70%",
        minWidth: 50,
        maxHeight: "90%",
        anchor: "center",
      },
    },
  );
}

// ─── Post-test Action Picker ──────────────────────────────────────────────────

export type PostTestAction = "fix-now" | "fix-later" | "ignore";

/**
 * Show the post-test action picker when failures exist.
 * Returns the user's chosen action.
 */
export async function showPostTestActionPicker(
  ctx: ExtensionCommandContext,
  failCount: number,
): Promise<PostTestAction> {
  if (!ctx.hasUI) return "fix-later";

  const result = await ctx.ui.custom<PostTestAction>(
    (tui: TUI, theme: Theme, _kb, done) => {
      let cursor = 0;
      let cachedLines: string[] | undefined;
      const options: Array<{ key: PostTestAction; label: string; desc: string }> = [
        { key: "fix-now", label: "Fix now", desc: "Agent analyzes failures and fixes them before continuing" },
        { key: "fix-later", label: "Fix later", desc: "Save results, you can resume fixing manually" },
        { key: "ignore", label: "Accept as-is", desc: "Mark failures as known issues, continue pipeline" },
      ];

      function refresh() { cachedLines = undefined; tui.requestRender(); }

      function handleInput(data: string) {
        if (matchesKey(data, Key.up) && cursor > 0) { cursor--; refresh(); return; }
        if (matchesKey(data, Key.down) && cursor < options.length - 1) { cursor++; refresh(); return; }
        if (data === "1") { done("fix-now"); return; }
        if (data === "2") { done("fix-later"); return; }
        if (data === "3") { done("ignore"); return; }
        if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) { done(options[cursor].key); return; }
        if (matchesKey(data, Key.escape)) { done("fix-later"); return; }
      }

      function render(width: number): string[] {
        if (cachedLines) return cachedLines;
        const ui = makeUI(theme, width);
        const lines: string[] = [];
        const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };

        push(ui.bar(), ui.blank());
        push(ui.header(`  ${failCount} test(s) failed`));
        push(ui.blank());
        push(ui.question("  What would you like to do?"));
        push(ui.blank());

        for (let i = 0; i < options.length; i++) {
          if (i === cursor) {
            push(ui.optionSelected(i + 1, options[i].label, options[i].desc));
          } else {
            push(ui.optionUnselected(i + 1, options[i].label, options[i].desc));
          }
        }

        push(ui.blank());
        push(ui.hints(["↑/↓ to move", "Enter to select"]));
        push(ui.bar());
        cachedLines = lines;
        return lines;
      }

      return { handleInput, render, invalidate: () => { cachedLines = undefined; } };
    },
    {
      overlay: true,
      overlayOptions: {
        width: "60%",
        minWidth: 40,
        maxHeight: "60%",
        anchor: "center",
      },
    },
  );

  return result ?? "fix-later";
}
