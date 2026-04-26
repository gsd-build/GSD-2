// GSD2 — Tests for input-controller image pasting behavior
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import test from "node:test";
import { setupEditorSubmitHandler } from "./input-controller.js";
import { ContextualTips } from "../../../core/contextual-tips.js";
import type { InteractiveModeStateHost } from "../interactive-mode-state.js";
import type { ImageContent } from "@gsd/pi-ai";

/** Minimal mock host satisfying InteractiveModeStateHost + setupEditorSubmitHandler extras. */
function createMockHost() {
	const promptCalls: Array<{ text: string; options?: any }> = [];
	const historyCalls: string[] = [];
	let editorText = "";

	const host = {
		defaultEditor: {
			onSubmit: undefined as ((text: string) => Promise<void>) | undefined,
			addToHistory: (text: string) => { historyCalls.push(text); },
			setText: (text: string) => { editorText = text; },
			getText: () => editorText,
		},
		editor: {
			setText: (text: string) => { editorText = text; },
			getText: () => editorText,
			addToHistory: (text: string) => { historyCalls.push(text); },
		},
		session: {
			isStreaming: false,
			isCompacting: false,
			isBashRunning: false,
			thinkingLevel: undefined,
			prompt: async (text: string, options?: any) => { promptCalls.push({ text, options }); },
		},
		ui: { requestRender: () => {} },
		footer: {},
		keybindings: {},
		statusContainer: {},
		chatContainer: {},
		pinnedMessageContainer: {},
		settingsManager: {},
		pendingTools: new Map(),
		toolOutputExpanded: false,
		hideThinkingBlock: false,
		isBashMode: false,
		onInputCallback: undefined,
		isInitialized: true,
		loadingAnimation: undefined,
		pendingWorkingMessage: undefined,
		defaultWorkingMessage: "Working...",
		streamingComponent: undefined,
		streamingMessage: undefined,
		retryEscapeHandler: undefined,
		retryLoader: undefined,
		autoCompactionLoader: undefined,
		autoCompactionEscapeHandler: undefined,
		compactionQueuedMessages: [] as Array<{ text: string; mode: "steer" | "followUp" }>,
		extensionSelector: undefined,
		extensionInput: undefined,
		extensionEditor: undefined,
		editorContainer: {},
		keybindingsManager: undefined,
		pendingImages: [] as ImageContent[],

		// Extra methods required by setupEditorSubmitHandler
		getSlashCommandContext: () => ({}),
		handleBashCommand: async (_command: string, _excludeFromContext?: boolean) => {},
		showWarning: (_message: string) => {},
		showError: (_message: string) => {},
		showTip: (_message: string) => {},
		updateEditorBorderColor: () => {},
		isExtensionCommand: (_text: string) => false,
		isKnownSlashCommand: (_text: string) => false,
		queueCompactionMessage: (_text: string, _mode: "steer" | "followUp") => {},
		updatePendingMessagesDisplay: () => {},
		flushPendingBashComponents: () => {},
		contextualTips: new ContextualTips(),
		getContextPercent: () => undefined,
		options: { submitPromptsDirectly: true },
	} satisfies InteractiveModeStateHost & Parameters<typeof setupEditorSubmitHandler>[0];

	return { host, promptCalls, historyCalls };
}

const TEST_IMAGE: ImageContent = {
	type: "image",
	data: "iVBORw0KGgo=",
	mimeType: "image/png",
};

describe("input-controller pending images", () => {
	let host: ReturnType<typeof createMockHost>["host"];
	let promptCalls: ReturnType<typeof createMockHost>["promptCalls"];

	beforeEach(() => {
		const mock = createMockHost();
		host = mock.host;
		promptCalls = mock.promptCalls;
		setupEditorSubmitHandler(host);
	});

	it("passes pending images to session.prompt on submit", async () => {
		host.pendingImages.push({ ...TEST_IMAGE });
		await host.defaultEditor.onSubmit!("describe this image");

		assert.equal(promptCalls.length, 1);
		assert.equal(promptCalls[0].text, "describe this image");
		assert.ok(promptCalls[0].options?.images);
		assert.equal(promptCalls[0].options.images.length, 1);
		assert.equal(promptCalls[0].options.images[0].mimeType, "image/png");
	});

	it("clears pending images after submit", async () => {
		host.pendingImages.push({ ...TEST_IMAGE });
		await host.defaultEditor.onSubmit!("describe this image");

		assert.equal(host.pendingImages.length, 0);
	});

	it("passes undefined images when no images are pending", async () => {
		await host.defaultEditor.onSubmit!("hello");

		assert.equal(promptCalls.length, 1);
		assert.equal(promptCalls[0].options?.images, undefined);
	});

	it("passes multiple images in order", async () => {
		const img1: ImageContent = { type: "image", data: "aaa=", mimeType: "image/png" };
		const img2: ImageContent = { type: "image", data: "bbb=", mimeType: "image/jpeg" };
		host.pendingImages.push(img1, img2);

		await host.defaultEditor.onSubmit!("describe these images");

		assert.equal(promptCalls[0].options.images.length, 2);
		assert.equal(promptCalls[0].options.images[0].data, "aaa=");
		assert.equal(promptCalls[0].options.images[1].data, "bbb=");
	});

	it("discards pending images on bash command", async () => {
		host.pendingImages.push({ ...TEST_IMAGE });
		await host.defaultEditor.onSubmit!("! ls -la");

		assert.equal(host.pendingImages.length, 0);
		assert.equal(promptCalls.length, 0); // bash commands don't go through prompt
	});
});

type HostOptions = {
	knownSlashCommands?: string[];
};

function getSlashCommandName(text: string): string {
	const trimmed = text.trim();
	const spaceIndex = trimmed.indexOf(" ");
	return spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex);
}

function createHost(options: HostOptions = {}) {
	const prompted: string[] = [];
	const errors: string[] = [];
	const warnings: string[] = [];
	const tips: string[] = [];
	const history: string[] = [];
	const knownSlashCommands = new Set(options.knownSlashCommands ?? []);
	let editorText = "";
	let settingsOpened = 0;

	const editor = {
		setText(text: string) {
			editorText = text;
		},
		getText() {
			return editorText;
		},
		addToHistory(text: string) {
			history.push(text);
		},
	};

	const host = {
		defaultEditor: editor as typeof editor & { onSubmit?: (text: string) => Promise<void> },
		editor,
		session: {
			isBashRunning: false,
			isCompacting: false,
			isStreaming: false,
			prompt: async (text: string) => {
				prompted.push(text);
			},
		},
		ui: {
			requestRender() {},
		},
		pendingImages: [] as ImageContent[],
		getSlashCommandContext: () => ({
			showSettingsSelector: () => {
				settingsOpened += 1;
			},
		}),
		handleBashCommand: async () => {},
		showWarning(message: string) {
			warnings.push(message);
		},
		showError(message: string) {
			errors.push(message);
		},
		showTip(message: string) {
			tips.push(message);
		},
		updateEditorBorderColor() {},
		isExtensionCommand() {
			return false;
		},
		isKnownSlashCommand(text: string) {
			return knownSlashCommands.has(getSlashCommandName(text));
		},
		queueCompactionMessage() {},
		updatePendingMessagesDisplay() {},
		flushPendingBashComponents() {},
		contextualTips: {
			recordBashIncluded() {},
			evaluate() {
				return undefined;
			},
		},
		getContextPercent() {
			return undefined;
		},
	};

	setupEditorSubmitHandler(host as any);

	return {
		host: host as typeof host & { defaultEditor: typeof editor & { onSubmit: (text: string) => Promise<void> } },
		prompted,
		errors,
		warnings,
		tips,
		history,
		getEditorText: () => editorText,
		getSettingsOpened: () => settingsOpened,
	};
}

test("input-controller: built-in slash commands stay in TUI dispatch", async () => {
	const { host, prompted, errors, getSettingsOpened, getEditorText } = createHost();

	await host.defaultEditor.onSubmit("/settings");

	assert.equal(getSettingsOpened(), 1, "built-in /settings should open the settings selector");
	assert.deepEqual(prompted, [], "built-in slash commands should not reach session.prompt");
	assert.deepEqual(errors, [], "built-in slash commands should not show errors");
	assert.equal(getEditorText(), "", "built-in slash commands should clear the editor after handling");
});

test("input-controller: extension slash commands fall through to session.prompt", async () => {
	const { host, prompted, errors, history } = createHost({ knownSlashCommands: ["gsd"] });

	await host.defaultEditor.onSubmit("/gsd help");

	assert.deepEqual(prompted, ["/gsd help"], "known extension slash commands should reach session.prompt");
	assert.deepEqual(errors, [], "known extension slash commands should not show unknown-command errors");
	assert.deepEqual(history, ["/gsd help"], "known extension slash commands should still be added to history");
});

test("input-controller: prompt template slash commands fall through to session.prompt", async () => {
	const { host, prompted, errors } = createHost({ knownSlashCommands: ["daily"] });

	await host.defaultEditor.onSubmit("/daily focus area");

	assert.deepEqual(prompted, ["/daily focus area"]);
	assert.deepEqual(errors, []);
});

test("input-controller: skill slash commands fall through to session.prompt", async () => {
	const { host, prompted, errors } = createHost({ knownSlashCommands: ["skill:create-skill"] });

	await host.defaultEditor.onSubmit("/skill:create-skill routing bug");

	assert.deepEqual(prompted, ["/skill:create-skill routing bug"]);
	assert.deepEqual(errors, []);
});

test("input-controller: disabled skill slash commands stay unknown", async () => {
	const { host, prompted, errors } = createHost();

	await host.defaultEditor.onSubmit("/skill:create-skill routing bug");

	assert.deepEqual(prompted, []);
	assert.deepEqual(errors, ["Unknown command: /skill:create-skill. Use slash autocomplete to see available commands."]);
});

test("input-controller: /export prefix does not swallow unrelated slash commands", async () => {
	const { host, prompted, errors } = createHost();

	await host.defaultEditor.onSubmit("/exportfoo");

	assert.deepEqual(prompted, []);
	assert.deepEqual(errors, ["Unknown command: /exportfoo. Use slash autocomplete to see available commands."]);
});

test("input-controller: truly unknown slash commands stop before session.prompt", async () => {
	const { host, prompted, errors, getEditorText } = createHost();

	await host.defaultEditor.onSubmit("/definitely-not-a-command");

	assert.deepEqual(prompted, [], "unknown slash commands should not reach session.prompt");
	assert.deepEqual(
		errors,
		["Unknown command: /definitely-not-a-command. Use slash autocomplete to see available commands."],
	);
	assert.equal(getEditorText(), "", "unknown slash commands should clear the editor after showing the error");
});

test("input-controller: absolute file paths are not treated as slash commands (#3478)", async () => {
	const { host, prompted, errors } = createHost();

	await host.defaultEditor.onSubmit("/Users/name/Desktop/screenshot.png");

	assert.deepEqual(errors, [], "file paths should not trigger unknown command error");
	assert.deepEqual(prompted, ["/Users/name/Desktop/screenshot.png"], "file paths should be sent as plain input");
});

test("input-controller: Linux absolute paths are not treated as slash commands (#3478)", async () => {
	const { host, prompted, errors } = createHost();

	await host.defaultEditor.onSubmit("/home/user/documents/file.txt");

	assert.deepEqual(errors, [], "Linux paths should not trigger unknown command error");
	assert.deepEqual(prompted, ["/home/user/documents/file.txt"], "Linux paths should be sent as plain input");
});

test("input-controller: /tmp paths are not treated as slash commands (#3478)", async () => {
	const { host, prompted, errors } = createHost();

	await host.defaultEditor.onSubmit("/tmp/some-file.log");

	assert.deepEqual(errors, []);
	assert.deepEqual(prompted, ["/tmp/some-file.log"]);
});
