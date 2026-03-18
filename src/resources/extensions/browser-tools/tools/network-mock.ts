import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * Network interception & mocking tools — mock API responses, block URLs, simulate errors.
 */

interface ActiveRoute {
	id: number;
	pattern: string;
	type: "mock" | "block";
	status?: number;
	delay?: number;
	description: string;
}

let nextRouteId = 1;
const activeRoutes: ActiveRoute[] = [];
const routeCleanups: Map<number, () => Promise<void>> = new Map();

export function registerNetworkMockTools(pi: ExtensionAPI, deps: ToolDeps): void {
	// -------------------------------------------------------------------------
	// browser_mock_route
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_mock_route",
		label: "Browser Mock Route",
		description:
			"Intercept network requests matching a URL pattern and respond with custom status, body, and headers. " +
			"Supports simulating slow responses via delay parameter. " +
			"Routes survive page navigation within the same context. Use browser_clear_routes to remove all mocks.",
		parameters: Type.Object({
			url: Type.String({
				description: "URL pattern to intercept. Supports glob patterns (e.g., '**/api/users*') or exact URLs.",
			}),
			status: Type.Optional(
				Type.Number({ description: "HTTP status code for the mock response (default: 200)." }),
			),
			body: Type.Optional(
				Type.String({ description: "Response body string. For JSON responses, pass a JSON string." }),
			),
			contentType: Type.Optional(
				Type.String({ description: "Content-Type header (default: 'application/json' if body looks like JSON, else 'text/plain')." }),
			),
			headers: Type.Optional(
				Type.Record(Type.String(), Type.String(), {
					description: "Additional response headers as key-value pairs.",
				}),
			),
			delay: Type.Optional(
				Type.Number({ description: "Delay in milliseconds before sending the response. Simulates slow responses." }),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { page: p } = await deps.ensureBrowser();
				const routeId = nextRouteId++;

				const status = params.status ?? 200;
				const body = params.body ?? "";
				const delay = params.delay ?? 0;

				// Auto-detect content type
				let contentType = params.contentType;
				if (!contentType) {
					try {
						JSON.parse(body);
						contentType = "application/json";
					} catch {
						contentType = "text/plain";
					}
				}

				const headers: Record<string, string> = {
					"content-type": contentType,
					"access-control-allow-origin": "*",
					...(params.headers ?? {}),
				};

				const handler = async (route: any) => {
					if (delay > 0) {
						await new Promise((resolve) => setTimeout(resolve, delay));
					}
					await route.fulfill({
						status,
						body,
						headers,
					});
				};

				await p.route(params.url, handler);

				const cleanup = async () => {
					try {
						await p.unroute(params.url, handler);
					} catch {
						// Page may be closed
					}
				};

				const routeInfo: ActiveRoute = {
					id: routeId,
					pattern: params.url,
					type: "mock",
					status,
					delay: delay > 0 ? delay : undefined,
					description: `Mock ${params.url} → ${status}${delay > 0 ? ` (${delay}ms delay)` : ""}`,
				};

				activeRoutes.push(routeInfo);
				routeCleanups.set(routeId, cleanup);

				return {
					content: [{
						type: "text",
						text: `Route mocked: ${routeInfo.description}\nRoute ID: ${routeId}\nActive routes: ${activeRoutes.length}`,
					}],
					details: { routeId, ...routeInfo, activeRouteCount: activeRoutes.length },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Mock route failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});

	// -------------------------------------------------------------------------
	// browser_block_urls
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_block_urls",
		label: "Browser Block URLs",
		description:
			"Block network requests matching URL patterns. Useful for blocking analytics, ads, or third-party scripts. " +
			"Accepts glob patterns. Routes survive page navigation.",
		parameters: Type.Object({
			patterns: Type.Array(Type.String(), {
				description: "URL patterns to block (glob syntax, e.g., ['**/analytics*', '**/ads*']).",
			}),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const { page: p } = await deps.ensureBrowser();
				const results: ActiveRoute[] = [];

				for (const pattern of params.patterns) {
					const routeId = nextRouteId++;

					const handler = async (route: any) => {
						await route.abort("blockedbyclient");
					};

					await p.route(pattern, handler);

					const cleanup = async () => {
						try {
							await p.unroute(pattern, handler);
						} catch { /* cleanup — route may already be removed or page closed */ }
					};

					const routeInfo: ActiveRoute = {
						id: routeId,
						pattern,
						type: "block",
						description: `Block ${pattern}`,
					};

					activeRoutes.push(routeInfo);
					routeCleanups.set(routeId, cleanup);
					results.push(routeInfo);
				}

				return {
					content: [{
						type: "text",
						text: `Blocked ${results.length} URL pattern(s):\n${results.map((r) => `  - ${r.description} (ID: ${r.id})`).join("\n")}\nActive routes: ${activeRoutes.length}`,
					}],
					details: { blocked: results, activeRouteCount: activeRoutes.length },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Block URLs failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});

	// -------------------------------------------------------------------------
	// browser_clear_routes
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_clear_routes",
		label: "Browser Clear Routes",
		description:
			"Remove all active route mocks and URL blocks. Also lists currently active routes if called with no routes active.",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			try {
				await deps.ensureBrowser();
				const count = activeRoutes.length;

				if (count === 0) {
					return {
						content: [{ type: "text", text: "No active routes to clear." }],
						details: { cleared: 0 },
					};
				}

				const routeDescriptions = activeRoutes.map((r) => r.description);

				// Clean up all routes
				for (const [id, cleanup] of routeCleanups) {
					await cleanup();
				}

				activeRoutes.length = 0;
				routeCleanups.clear();

				return {
					content: [{
						type: "text",
						text: `Cleared ${count} route(s):\n${routeDescriptions.map((d) => `  - ${d}`).join("\n")}`,
					}],
					details: { cleared: count, routes: routeDescriptions },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Clear routes failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});
}
