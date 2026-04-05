import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "packages/pi-coding-agent/src/core/extensions/loader.ts"), "utf-8");

test("loader: extension API forwards setModel options to runtime", () => {
	const start = source.indexOf("setModel(model, options) {");
	assert.ok(start >= 0, "missing ExtensionAPI setModel wrapper");
	const window = source.slice(start, start + 140);

	assert.ok(
		window.includes("return runtime.setModel(model, options);"),
		"ExtensionAPI setModel wrapper should forward options such as persist:false to the runtime",
	);
});
