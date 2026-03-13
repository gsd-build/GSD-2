/**
 * Jupyter kernel client — WebSocket-based communication with a Jupyter kernel
 * via the kernel gateway REST + WebSocket API.
 *
 * Protocol: Jupyter messaging spec v5.3
 * Transport: WebSocket at ws://host/api/kernels/:id/channels
 */

import { randomUUID } from "node:crypto";

/** MIME bundle from Jupyter display_data / execute_result */
export interface MimeBundle {
	"text/plain"?: string;
	"text/html"?: string;
	"text/markdown"?: string;
	"image/png"?: string;
	"image/jpeg"?: string;
	"image/svg+xml"?: string;
	"application/json"?: unknown;
	"application/x-gsd-status"?: unknown;
	[key: string]: unknown;
}

/** Single output from a cell execution */
export interface CellOutput {
	type: "stream" | "execute_result" | "display_data" | "error";
	text?: string;
	data?: MimeBundle;
	ename?: string;
	evalue?: string;
	traceback?: string[];
}

/** Result of executing code in the kernel */
export interface ExecuteResult {
	outputs: CellOutput[];
	/** True if execution produced an error */
	error: boolean;
	/** Execution count (In[N]) */
	executionCount?: number;
}

/** Options for code execution */
export interface ExecuteOptions {
	/** Timeout in milliseconds */
	timeout?: number;
	/** If true, don't record in execution history */
	silent?: boolean;
	/** Abort signal */
	signal?: AbortSignal;
}

/**
 * Create a Jupyter wire protocol message header.
 */
function createHeader(msgType: string, sessionId: string) {
	return {
		msg_id: randomUUID(),
		msg_type: msgType,
		username: "gsd",
		session: sessionId,
		date: new Date().toISOString(),
		version: "5.3",
	};
}

/**
 * Jupyter kernel client that communicates via WebSocket.
 */
export class JupyterKernel {
	private gatewayUrl: string;
	private kernelId: string;
	private ws: WebSocket | null = null;
	private sessionId: string;
	private _alive = true;

	constructor(gatewayUrl: string, kernelId: string) {
		this.gatewayUrl = gatewayUrl;
		this.kernelId = kernelId;
		this.sessionId = randomUUID();
	}

	get id(): string {
		return this.kernelId;
	}

	get alive(): boolean {
		return this._alive;
	}

	/**
	 * Create a new kernel on the gateway.
	 */
	static async create(gatewayUrl: string): Promise<JupyterKernel> {
		const resp = await fetch(`${gatewayUrl}/api/kernels`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			throw new Error(`Failed to create kernel: ${resp.status} ${text}`);
		}
		const data = (await resp.json()) as { id: string };
		return new JupyterKernel(gatewayUrl, data.id);
	}

	/**
	 * Open the WebSocket connection to the kernel.
	 */
	private async connect(): Promise<WebSocket> {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			return this.ws;
		}

		const wsUrl = this.gatewayUrl.replace(/^http/, "ws");
		const ws = new WebSocket(`${wsUrl}/api/kernels/${this.kernelId}/channels`);

		return new Promise<WebSocket>((resolve, reject) => {
			const timeout = setTimeout(() => {
				ws.close();
				reject(new Error("WebSocket connection timeout"));
			}, 10_000);

			ws.addEventListener("open", () => {
				clearTimeout(timeout);
				this.ws = ws;
				resolve(ws);
			});

			ws.addEventListener("error", () => {
				clearTimeout(timeout);
				reject(new Error("WebSocket connection error"));
			});

			ws.addEventListener("close", () => {
				if (this.ws === ws) {
					this.ws = null;
				}
			});
		});
	}

	/**
	 * Execute code in the kernel and collect all outputs.
	 */
	async execute(code: string, options?: ExecuteOptions): Promise<ExecuteResult> {
		const ws = await this.connect();
		const header = createHeader("execute_request", this.sessionId);
		const msgId = header.msg_id;

		const message = {
			header,
			parent_header: {},
			metadata: {},
			content: {
				code,
				silent: options?.silent ?? false,
				store_history: !(options?.silent ?? false),
				user_expressions: {},
				allow_stdin: false,
				stop_on_error: true,
			},
			channel: "shell",
		};

		ws.send(JSON.stringify(message));

		return new Promise<ExecuteResult>((resolve, reject) => {
			const outputs: CellOutput[] = [];
			let hasError = false;
			let executionCount: number | undefined;

			const timeoutMs = options?.timeout ?? 30_000;
			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`Execution timed out after ${timeoutMs / 1000}s`));
			}, timeoutMs);

			const onAbort = () => {
				cleanup();
				this.interrupt().catch(() => {});
				reject(new Error("Execution aborted"));
			};

			if (options?.signal) {
				if (options.signal.aborted) {
					clearTimeout(timer);
					this.interrupt().catch(() => {});
					reject(new Error("Execution aborted"));
					return;
				}
				options.signal.addEventListener("abort", onAbort, { once: true });
			}

			const cleanup = () => {
				clearTimeout(timer);
				options?.signal?.removeEventListener("abort", onAbort);
				ws.removeEventListener("message", onMessage);
			};

			const onMessage = (event: MessageEvent) => {
				let msg: any;
				try {
					msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
				} catch {
					return;
				}

				// Only process messages that are replies to our request
				if (msg.parent_header?.msg_id !== msgId) return;

				const msgType = msg.header?.msg_type ?? msg.msg_type;

				switch (msgType) {
					case "stream":
						outputs.push({
							type: "stream",
							text: msg.content?.text ?? "",
						});
						break;

					case "execute_result":
						executionCount = msg.content?.execution_count;
						outputs.push({
							type: "execute_result",
							data: msg.content?.data as MimeBundle,
						});
						break;

					case "display_data":
					case "update_display_data":
						outputs.push({
							type: "display_data",
							data: msg.content?.data as MimeBundle,
						});
						break;

					case "error":
						hasError = true;
						outputs.push({
							type: "error",
							ename: msg.content?.ename,
							evalue: msg.content?.evalue,
							traceback: msg.content?.traceback,
						});
						break;

					case "execute_reply": {
						const status = msg.content?.status;
						if (status === "error") {
							hasError = true;
							// Only add error output if we haven't already captured it from an error message
							const alreadyHasError = outputs.some(
								(o) => o.type === "error" && o.ename === msg.content?.ename,
							);
							if (!alreadyHasError) {
								outputs.push({
									type: "error",
									ename: msg.content?.ename,
									evalue: msg.content?.evalue,
									traceback: msg.content?.traceback,
								});
							}
						}
						executionCount = msg.content?.execution_count ?? executionCount;
						cleanup();
						resolve({ outputs, error: hasError, executionCount });
						return;
					}

					case "status":
						// Kernel status updates — ignore
						break;
				}
			};

			ws.addEventListener("message", onMessage);
		});
	}

	/**
	 * Interrupt the current execution.
	 */
	async interrupt(): Promise<void> {
		const resp = await fetch(`${this.gatewayUrl}/api/kernels/${this.kernelId}/interrupt`, {
			method: "POST",
		});
		if (!resp.ok) {
			throw new Error(`Failed to interrupt kernel: ${resp.status}`);
		}
	}

	/**
	 * Restart the kernel (clears all state).
	 */
	async restart(): Promise<void> {
		// Close existing WebSocket
		this.close();

		const resp = await fetch(`${this.gatewayUrl}/api/kernels/${this.kernelId}/restart`, {
			method: "POST",
		});
		if (!resp.ok) {
			throw new Error(`Failed to restart kernel: ${resp.status}`);
		}

		// Wait briefly for kernel to come back
		await new Promise((r) => setTimeout(r, 1000));
	}

	/**
	 * Shutdown and delete the kernel.
	 */
	async shutdown(): Promise<void> {
		this.close();
		this._alive = false;
		try {
			await fetch(`${this.gatewayUrl}/api/kernels/${this.kernelId}`, {
				method: "DELETE",
			});
		} catch {
			// Gateway might already be down
		}
	}

	/**
	 * Close the WebSocket connection without shutting down the kernel.
	 */
	close(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	/**
	 * Check if the kernel is still alive via the REST API.
	 */
	async isHealthy(): Promise<boolean> {
		try {
			const resp = await fetch(`${this.gatewayUrl}/api/kernels/${this.kernelId}`, {
				signal: AbortSignal.timeout(3000),
			});
			return resp.ok;
		} catch {
			return false;
		}
	}
}

/**
 * Render a MimeBundle to a text representation suitable for LLM consumption.
 *
 * Returns `{ text, images }` where images are base64-encoded PNG/JPEG strings.
 */
export function renderMimeBundle(data: MimeBundle): { text: string; images: string[] } {
	const parts: string[] = [];
	const images: string[] = [];

	// Prefer richer types first
	if (data["image/png"]) {
		images.push(data["image/png"]);
	}
	if (data["image/jpeg"]) {
		images.push(data["image/jpeg"]);
	}

	if (data["application/x-gsd-status"]) {
		const status = data["application/x-gsd-status"];
		if (typeof status === "object" && status !== null) {
			parts.push(JSON.stringify(status, null, 2));
		} else {
			parts.push(String(status));
		}
	} else if (data["application/json"] !== undefined) {
		parts.push("```json\n" + JSON.stringify(data["application/json"], null, 2) + "\n```");
	} else if (data["text/markdown"]) {
		parts.push(data["text/markdown"]);
	} else if (data["text/html"]) {
		// Strip HTML tags for LLM consumption
		parts.push(data["text/html"].replace(/<[^>]+>/g, ""));
	} else if (data["text/plain"]) {
		parts.push(data["text/plain"]);
	}

	return { text: parts.join("\n"), images };
}

/**
 * Render an ExecuteResult into a text summary for the LLM.
 */
export function renderExecuteResult(result: ExecuteResult): { text: string; images: string[] } {
	const textParts: string[] = [];
	const allImages: string[] = [];

	for (const output of result.outputs) {
		switch (output.type) {
			case "stream":
				if (output.text) textParts.push(output.text);
				break;
			case "execute_result":
			case "display_data":
				if (output.data) {
					const rendered = renderMimeBundle(output.data);
					if (rendered.text) textParts.push(rendered.text);
					allImages.push(...rendered.images);
				}
				break;
			case "error": {
				const tb = output.traceback?.join("\n") ?? `${output.ename}: ${output.evalue}`;
				// Strip ANSI escape codes from traceback
				textParts.push(tb.replace(/\x1b\[[0-9;]*m/g, ""));
				break;
			}
		}
	}

	return { text: textParts.join("\n"), images: allImages };
}
