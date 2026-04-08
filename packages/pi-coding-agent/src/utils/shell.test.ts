import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCustomShellConfig } from "./shell.js";

describe("resolveCustomShellConfig", () => {
	it("returns a shell config when the custom shell probe succeeds", () => {
		const result = resolveCustomShellConfig("/custom/bash", {
			existsSyncImpl: () => true,
			spawnSyncImpl: () =>
				({
					status: 0,
					signal: null,
					stdout: "",
					stderr: "",
				}) as any,
			settingsPath: "/tmp/settings.json",
		});

		assert.deepEqual(result, { shell: "/custom/bash", args: ["-c"] });
	});

	it("throws a not found error when the custom shell path does not exist", () => {
		assert.throws(
			() =>
				resolveCustomShellConfig("/missing/bash", {
					existsSyncImpl: () => false,
					settingsPath: "/tmp/settings.json",
				}),
			(error: unknown) => {
				assert.ok(error instanceof Error);
				assert.match(error.message, /Custom shell path not found: \/missing\/bash/);
				assert.match(error.message, /Please update shellPath in \/tmp\/settings\.json/);
				return true;
			},
		);
	});

	it("throws a compatibility error when the executable exists but does not support '-c'", () => {
		assert.throws(
			() =>
				resolveCustomShellConfig("/custom/not-a-shell", {
					existsSyncImpl: () => true,
					spawnSyncImpl: () =>
						({
							status: 1,
							signal: null,
							stdout: "",
							stderr: "Node.js v24.13.1",
						}) as any,
					settingsPath: "/tmp/settings.json",
				}),
			(error: unknown) => {
				assert.ok(error instanceof Error);
				assert.match(error.message, /not a compatible shell/);
				assert.match(error.message, /accepts '-c <command>'/);
				assert.match(error.message, /Node\.js v24\.13\.1/);
				assert.match(error.message, /update or remove shellPath in \/tmp\/settings\.json/);
				return true;
			},
		);
	});
});
