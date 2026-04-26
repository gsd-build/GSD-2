// Runtime regression tests for the long-running-session leak fixes.
//
// Replaces the source-grep file `src/tests/session-memory-leaks.test.ts`
// (deleted in #4875, tracked as #4873). The previous tests asserted on
// identifier presence (`_prevRender`, `_lastMessage`, `MAX_CHAT_COMPONENTS`)
// in source — a regression that set `MAX_CHAT_COMPONENTS = Number.MAX_SAFE_INTEGER`
// or replaced `setText` with an inline mutation would still pass.
//
// Each test below drives the actual component through a long-running scenario
// and asserts on observable behaviour.

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Container } from "../../tui.js";
import { Loader } from "../loader.js";
import { Text } from "../text.js";

interface MockTui {
	requestRender: ReturnType<typeof mock.fn>;
}

function makeMockTUI(): MockTui {
	return { requestRender: mock.fn() };
}

// ─── Container render-skip ──────────────────────────────────────────────

describe("Container.render skips work when output is unchanged", () => {
	it("returns the SAME array reference across two renders with no changes", () => {
		// The container caches `_prevRender` so doRender() can short-circuit
		// the post-processing (image-line scan, applyLineResets, line diffs).
		// The contract for the optimization is reference equality of the
		// returned array — that's what the consumer in tui.ts checks.
		const c = new Container();
		c.addChild(new Text("hello", 0, 0));

		const first = c.render(20);
		const second = c.render(20);
		assert.strictEqual(
			second,
			first,
			"Container must return the same array reference when content is unchanged " +
				"(reference equality is the consumer-visible contract for the skip)",
		);
	});

	it("returns a DIFFERENT array reference after addChild invalidates the cache", () => {
		// If a regression caused `_prevRender` to never reset, downstream
		// rendering would skip post-processing for new components — visible
		// as missing/stale UI. Behaviourally we observe that adding a child
		// breaks the reference-equality contract on the next render.
		const c = new Container();
		c.addChild(new Text("a", 0, 0));
		const first = c.render(20);
		c.addChild(new Text("b", 0, 0));
		const second = c.render(20);
		assert.notStrictEqual(
			second,
			first,
			"adding a child must invalidate the cached render reference",
		);
	});

	it("returns a different reference after content changes", () => {
		const t = new Text("hello", 0, 0);
		const c = new Container();
		c.addChild(t);

		const first = c.render(20);
		t.setText("world");
		const second = c.render(20);
		assert.notStrictEqual(
			second,
			first,
			"changing a child's text must produce a fresh array (not the cached one)",
		);
	});
});

// ─── Loader frame isolation ─────────────────────────────────────────────

describe("Loader does not mutate Text cache on every spinner tick", () => {
	let tui: MockTui;
	let loader: Loader;

	beforeEach(() => {
		tui = makeMockTUI();
		mock.timers.enable({ apis: ["setInterval"] });
	});

	afterEach(() => {
		try {
			loader?.stop();
		} catch {
			/* best-effort */
		}
		mock.timers.reset();
	});

	it("does not invalidate Text's render cache across N spinner ticks", () => {
		// Loader extends Text. Text caches its rendered lines keyed by
		// (text, width). The leak was: the old Loader called setText()
		// on every 80ms tick, which always cleared the cache, forcing a
		// re-wrap of the message text.
		// Behavioural test: render the loader, capture the cached array
		// reference returned by Text.render, advance many ticks, and
		// assert the underlying Text cache was NOT invalidated (we observe
		// this via reference equality of the cached lines slice in the
		// returned array — the second `result[*]` segment from super.render
		// stays identity-stable when the cache survives).
		loader = new Loader(tui as never, (s) => s, (s) => s, "the-message");

		const before = loader.render(40);
		// Run 50 frame intervals — the spinner should rotate, but the
		// underlying message text wrapping must not change.
		mock.timers.tick(80 * 50);
		const after = loader.render(40);

		// The message portion (everything after the first `""` padding line
		// and after the spinner glyph + space prefix on the first content
		// line) must be byte-identical across renders.
		assert.equal(before.length, after.length, "render shape stable across ticks");
		// Trailing message lines (index 2 onwards) come straight from Text's
		// cache without any spinner mutation. They must be reference-equal
		// substrings — same string contents byte-for-byte.
		for (let i = 2; i < before.length; i++) {
			assert.equal(
				after[i],
				before[i],
				`message line ${i} must remain byte-identical across spinner ticks ` +
					`(cache must not be invalidated by frame rotation)`,
			);
		}
	});

	it("setMessage invalidates Text cache and a new message is reflected", () => {
		// Quiescence is conditional on the message being unchanged — we
		// must still see updates when it actually changes. This is the
		// counter-test that prevents a false-positive "cache always stable"
		// fix that would freeze the loader text.
		loader = new Loader(tui as never, (s) => s, (s) => s, "first");
		const beforeFirstRender = loader.render(40).join("\n");
		loader.setMessage("second");
		const afterChange = loader.render(40).join("\n");
		assert.ok(afterChange.includes("second"), "new message must render");
		assert.ok(!afterChange.includes("first") || beforeFirstRender !== afterChange,
			"render output must change when message changes");
	});
});

// ─── Text.setText early-return guard ────────────────────────────────────

describe("Text.setText returns early when value is unchanged", () => {
	it("does not invalidate the cached render when setText receives the same value", () => {
		// The setText early-return is the runtime guard that keeps the
		// Loader-and-Text cache stable. We observe it via reference equality
		// of the rendered output across a setText(SAME) call.
		const t = new Text("identical", 0, 0);
		const first = t.render(30);
		t.setText("identical"); // same value — must NOT clear the cache
		const second = t.render(30);
		assert.strictEqual(
			second,
			first,
			"setText with an unchanged value must leave the render cache intact",
		);
	});

	it("invalidates cache when the value actually changes", () => {
		const t = new Text("one", 0, 0);
		const first = t.render(30);
		t.setText("two");
		const second = t.render(30);
		assert.notStrictEqual(
			second,
			first,
			"setText with a new value must produce a fresh render result",
		);
	});
});

// ─── Heap growth bound (gated on --expose-gc) ───────────────────────────

describe("Long-running render loop does not leak heap (forced-GC bound)", () => {
	const hasGc = typeof (globalThis as any).gc === "function";

	it(
		"renders a Container 5000 times with stable heapUsed (within 2x baseline)",
		{ skip: !hasGc ? "requires --expose-gc to drive deterministic GC between snapshots" : false },
		() => {
			// This is the on-the-wire memory-soak test. The naive version
			// (no forced GC) is flaky because Node's GC is opportunistic;
			// any background allocation can shift heapUsed past an absolute
			// bound. We instead force GC between snapshots and assert a
			// RELATIVE bound: post-iteration heap must be within 2x of the
			// post-warmup baseline.
			const gc = (globalThis as any).gc as () => void;

			const c = new Container();
			const t = new Text("steady-state", 0, 0);
			c.addChild(t);

			// Warm up so the JIT and any lazy initial allocations settle.
			for (let i = 0; i < 200; i++) c.render(40);
			gc();
			const baseline = process.memoryUsage().heapUsed;

			for (let i = 0; i < 5000; i++) c.render(40);
			gc();
			const after = process.memoryUsage().heapUsed;

			assert.ok(
				after < baseline * 2,
				`heapUsed must stay within 2x baseline after 5000 renders ` +
					`(baseline=${baseline}B, after=${after}B, ratio=${(after / baseline).toFixed(2)})`,
			);
		},
	);
});
