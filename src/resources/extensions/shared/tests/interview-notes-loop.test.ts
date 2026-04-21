// GSD2 — Regression test for interview-ui "None of the above" notes loop
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Regression test for bug #3502:
 *
 * Selecting "None of the above" opens the notes field, but pressing Enter
 * after typing a note called goNextOrSubmit() which saw the cursor still
 * on the "None of the above" slot and re-opened notes — trapping the user
 * in an infinite loop.
 *
 * The fix adds a `!states[currentIdx].notes` guard so auto-open only fires
 * when notes are still empty.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { showInterviewRound, type Question, type RoundResult } from "../interview-ui.js";

// Raw terminal sequences that matchesKey() recognises
const ENTER = "\r";
const DOWN = "\x1b[B";
const TAB = "\t";

/**
 * Drive showInterviewRound with a scripted sequence of key inputs.
 * We mock ctx.ui.custom() to capture the widget, feed it inputs, and
 * resolve when done() is called.
 */
function runWithInputs(
	questions: Question[],
	inputs: string[],
): Promise<RoundResult> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Timed out — likely stuck in infinite loop")), 3000);

		const mockCtx = {
			ui: {
				custom: (factory: any) => {
					const mockTui = {
						requestRender: () => {},
					};
					const mockTheme = {
						// Minimal theme stubs — render output is not asserted
						fg: (_c: string, t: string) => t,
						bold: (t: string) => t,
						dim: (t: string) => t,
						italic: (t: string) => t,
						strikethrough: (t: string) => t,
						accent: (t: string) => t,
						success: (t: string) => t,
						warning: (t: string) => t,
						error: (t: string) => t,
						info: (t: string) => t,
						muted: (t: string) => t,
						dimmed: (t: string) => t,
					};
					const mockKb = {};

					const widget = factory(mockTui, mockTheme, mockKb, (result: RoundResult) => {
						clearTimeout(timeout);
						resolve(result);
					});

					// Feed each input sequentially
					for (const input of inputs) {
						widget.handleInput(input);
					}
				},
			},
		};

		showInterviewRound(questions, {}, mockCtx as any).catch(reject);
	});
}

describe("interview-ui notes loop regression (#3502)", () => {
	const questions: Question[] = [
		{
			id: "q1",
			header: "Project Type",
			question: "What type of project?",
			options: [
				{ label: "Web App", description: "Frontend or full-stack" },
				{ label: "CLI Tool", description: "Command-line utility" },
			],
		},
	];

	it("does not loop when Enter is pressed after typing a note on 'None of the above'", async () => {
		// With 2 options, "None of the above" is index 2 (0-based)
		// Cursor starts at 0, so press Down twice to reach it
		const result = await runWithInputs(questions, [
			DOWN,        // cursor → index 1 (CLI Tool)
			DOWN,        // cursor → index 2 (None of the above)
			ENTER,       // commit → auto-opens notes field
			"u", "n", "s", "u", "r", "e",  // type "unsure"
			ENTER,       // should advance to review, NOT reopen notes
			ENTER,       // submit from review screen
		]);

		// If we get here, the loop did not occur (timeout would have fired)
		assert.ok(result, "should return a result");
		assert.equal(result.endInterview, false);

		const answer = result.answers.q1;
		assert.ok(answer, "answer for q1 should exist");
		assert.equal(answer.notes, "unsure", "notes should contain typed text");
		assert.equal(answer.selected, "None of the above");
	});

	it("empty notes on 'None of the above' advances instead of looping (#3449)", async () => {
		// Press Down twice to "None of the above", Enter to select → auto-opens notes.
		// Then immediately Enter (empty notes) → should advance to review, NOT re-open.
		// The notesVisible guard prevents the loop even with empty notes.
		const result = await runWithInputs(questions, [
			DOWN,        // cursor → 1
			DOWN,        // cursor → 2 (None of the above)
			ENTER,       // commit → auto-opens notes (notesVisible was false)
			ENTER,       // empty notes → notesVisible is true → skip auto-open → advance to review
			ENTER,       // submit
		]);

		assert.ok(result, "should return a result");
		const answer = result.answers.q1;
		assert.ok(answer, "answer for q1 should exist");
		assert.equal(answer.selected, "None of the above");
	});

	it("normal option selection is unaffected", async () => {
		const result = await runWithInputs(questions, [
			ENTER,       // select first option (Web App) and advance to review
			ENTER,       // submit from review screen
		]);

		assert.ok(result, "should return a result");
		const answer = result.answers.q1;
		assert.ok(answer, "answer for q1 should exist");
		assert.equal(answer.selected, "Web App");
	});

	// ─── Reviewer-requested regression coverage on #3551 ──────────────────
	//
	// Tab→notes→Enter from a NORMAL option (cursor not on "None of the above")
	// must commit the normal option, not the done-sentinel. The prior fix in
	// this PR set `st.committedIndex = st.cursorIndex` in the notes-Enter
	// handler, which is correct ONLY if the invariant "committedIndex is null
	// only when cursorIndex === noneOrDoneIdx" holds — and Tab-from-normal is
	// the one reachable path where that invariant does NOT hold, so it must
	// be exercised here.

	it("Tab→notes→Enter from a normal option commits the normal option (#3449)", async () => {
		// Cursor starts at 0 (Web App). Press Tab to open notes without
		// committing, type nothing, press Enter — must commit index 0 (Web App),
		// not silently jump to "None of the above".
		const result = await runWithInputs(questions, [
			TAB,         // open notes from cursor=0, committedIndex still null
			ENTER,       // commit cursor=0 (Web App) and advance
			ENTER,       // submit from review screen
		]);

		assert.ok(result, "should return a result");
		const answer = result.answers.q1;
		assert.ok(answer, "answer for q1 should exist");
		assert.equal(answer.selected, "Web App", "Tab→Enter on Web App must commit Web App, not None of the above");
	});

	it("Tab→notes→Enter from a normal option preserves typed notes", async () => {
		// Same path but user types notes before Enter — ensures notes content
		// is captured even when opened via Tab on a normal option.
		const result = await runWithInputs(questions, [
			TAB,         // open notes from cursor=0
			"w", "h", "y",  // type "why"
			ENTER,       // commit cursor=0 with notes and advance
			ENTER,       // submit
		]);

		assert.ok(result, "should return a result");
		const answer = result.answers.q1;
		assert.ok(answer, "answer for q1 should exist");
		assert.equal(answer.selected, "Web App");
		assert.equal(answer.notes, "why", "notes typed via Tab on a normal option must be preserved");
	});

	it("Tab→notes→Enter from CLI Tool commits CLI Tool, not None of the above", async () => {
		// Move cursor to index 1 (CLI Tool), Tab open notes, Enter → commit 1.
		const result = await runWithInputs(questions, [
			DOWN,        // cursor → 1 (CLI Tool)
			TAB,         // open notes from cursor=1
			"c", "l", "i",
			ENTER,       // commit cursor=1 (CLI Tool)
			ENTER,       // submit
		]);

		assert.ok(result, "should return a result");
		const answer = result.answers.q1;
		assert.equal(answer.selected, "CLI Tool", "Tab→Enter must commit cursor position (CLI Tool), not the done sentinel");
		assert.equal(answer.notes, "cli");
	});
});
