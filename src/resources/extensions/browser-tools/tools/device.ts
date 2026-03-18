import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * Device emulation tool — full device simulation using Playwright's built-in device descriptors.
 */

export function registerDeviceTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_emulate_device",
		label: "Browser Emulate Device",
		description:
			"Simulate a specific device by setting viewport, user agent, device scale factor, touch, and mobile flag. " +
			"Uses Playwright's built-in device descriptors (~143 devices). Accepts fuzzy matching on device name. " +
			"Note: Full emulation (user agent, isMobile) requires a context restart — the current page state will be lost. " +
			"The tool recreates the context with the device profile applied.",
		parameters: Type.Object({
			device: Type.String({
				description:
					"Device name (e.g., 'iPhone 15', 'Pixel 7', 'iPad Pro 11'). " +
					"Case-insensitive fuzzy matching. Use 'list' to see all available devices.",
			}),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { chromium, devices } = await import("playwright");
				const allDeviceNames = Object.keys(devices);

				// Handle 'list' request
				if (params.device.toLowerCase() === "list") {
					// Group by base device name (remove landscape variants for cleaner display)
					const baseNames = allDeviceNames.filter((n) => !n.endsWith(" landscape"));
					return {
						content: [{
							type: "text",
							text: `Available devices (${allDeviceNames.length} total, ${baseNames.length} base):\n${baseNames.join("\n")}`,
						}],
						details: { devices: baseNames, total: allDeviceNames.length },
					};
				}

				// Fuzzy match device name
				const needle = params.device.toLowerCase();
				let exactMatch = allDeviceNames.find((n) => n.toLowerCase() === needle);
				if (!exactMatch) {
					// Try contains match
					const containsMatches = allDeviceNames.filter((n) => n.toLowerCase().includes(needle));
					if (containsMatches.length === 1) {
						exactMatch = containsMatches[0];
					} else if (containsMatches.length > 1) {
						// Pick the shortest match (most specific)
						containsMatches.sort((a, b) => a.length - b.length);
						exactMatch = containsMatches[0];
						const suggestions = containsMatches.slice(0, 5).join(", ");
						// Continue with best match but mention alternatives
					} else {
						// No match at all — suggest closest
						const suggestions = allDeviceNames
							.map((n) => ({ name: n, score: fuzzyScore(needle, n.toLowerCase()) }))
							.sort((a, b) => b.score - a.score)
							.slice(0, 5)
							.map((s) => s.name);

						return {
							content: [{
								type: "text",
								text: `No device matching "${params.device}". Did you mean:\n${suggestions.map((s) => `  - ${s}`).join("\n")}`,
							}],
							details: { error: "no_match", suggestions },
							isError: true,
						};
					}
				}

				const deviceDescriptor = devices[exactMatch!];
				if (!deviceDescriptor) {
					return {
						content: [{ type: "text", text: `Device descriptor not found for "${exactMatch}"` }],
						details: { error: "descriptor_not_found" },
						isError: true,
					};
				}

				// Context restart required for full emulation.
				// Save current URL to navigate back after restart.
				const { page: currentPage, context: currentCtx } = await deps.ensureBrowser();
				const currentUrl = currentPage.url();

				// Close existing browser and relaunch with device profile
				await deps.closeBrowser();

				// Re-launch — ensureBrowser doesn't accept device params, so we do it manually.
				// This is a one-off context creation with device emulation.
				const needsHeadless = process.platform === "linux" && !process.env.DISPLAY;
				const launchOptions: Record<string, unknown> = {
					headless: needsHeadless || process.env.FORCE_HEADLESS === "true",
				};
				const customPath = process.env.BROWSER_PATH;
				if (customPath) launchOptions.executablePath = customPath;

				const browser = await chromium.launch(launchOptions);
				const context = await browser.newContext({
					...deviceDescriptor,
				});

				// Inject evaluate helpers
				const { EVALUATE_HELPERS_SOURCE } = await import("../evaluate-helpers.js");
				await context.addInitScript(EVALUATE_HELPERS_SOURCE);

				// Wire up state
				const {
					setBrowser, setContext, pageRegistry, setSessionStartedAt,
					setSessionArtifactDir, resetAllState,
				} = await import("../state.js");
				const { registryAddPage, registrySetActive } = await import("../core.js");

				// Reset state for new session
				resetAllState();
				setBrowser(browser);
				setContext(context);
				setSessionStartedAt(Date.now());

				const page = await context.newPage();
				const entry = registryAddPage(pageRegistry, {
					page,
					title: "",
					url: "about:blank",
					opener: null,
				});
				registrySetActive(pageRegistry, entry.id);
				deps.attachPageListeners(page, entry.id);

				// Navigate back to previous URL if it wasn't about:blank
				if (currentUrl && currentUrl !== "about:blank") {
					await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch((e) => { if (process.env.GSD_DEBUG) console.error("[browser-tools] device goto restore failed:", e.message); });
				}

				const viewport = deviceDescriptor.viewport;
				const vpText = viewport ? `${viewport.width}x${viewport.height}` : "unknown";

				return {
					content: [{
						type: "text",
						text: `Device emulation active: ${exactMatch}\nViewport: ${vpText}\nUser Agent: ${deviceDescriptor.userAgent?.slice(0, 80) ?? "default"}...\nMobile: ${deviceDescriptor.isMobile ?? false}\nTouch: ${deviceDescriptor.hasTouch ?? false}\nScale Factor: ${deviceDescriptor.deviceScaleFactor ?? 1}\n\nContext was restarted for full emulation. Page state was reset.`,
					}],
					details: {
						device: exactMatch,
						viewport: vpText,
						isMobile: deviceDescriptor.isMobile ?? false,
						hasTouch: deviceDescriptor.hasTouch ?? false,
						deviceScaleFactor: deviceDescriptor.deviceScaleFactor ?? 1,
						userAgent: deviceDescriptor.userAgent,
						restoredUrl: currentUrl,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Device emulation failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}

/**
 * Simple fuzzy scoring — counts matching characters in order.
 */
function fuzzyScore(needle: string, haystack: string): number {
	let score = 0;
	let hi = 0;
	for (let ni = 0; ni < needle.length && hi < haystack.length; ni++) {
		const idx = haystack.indexOf(needle[ni], hi);
		if (idx >= 0) {
			score++;
			hi = idx + 1;
		}
	}
	return score / Math.max(needle.length, 1);
}
