/**
 * Session pool — manages kernel sessions keyed by working directory.
 *
 * Features:
 * - Sessions keyed by cwd
 * - Max 4 concurrent sessions, oldest evicted on overflow
 * - 5-minute idle timeout
 * - Auto-restart on crash (once per session)
 * - Serialized execution per session via promise queue
 * - Prelude injection on kernel start
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { getAgentDir } from "../../../config.js";
import { ensureGateway } from "./gateway.js";
import { JupyterKernel, renderExecuteResult, type ExecuteResult } from "./kernel.js";
import { loadCustomModules } from "./modules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Maximum concurrent kernel sessions */
const MAX_SESSIONS = 4;
/** Idle timeout before a session is cleaned up (5 minutes) */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/** Heartbeat interval (30 seconds) */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface Session {
	kernel: JupyterKernel;
	cwd: string;
	lastUsed: number;
	/** Whether we've already auto-restarted once */
	hasRestarted: boolean;
	/** Idle timeout handle */
	idleTimer: ReturnType<typeof setTimeout> | null;
	/** Heartbeat interval handle */
	heartbeatTimer: ReturnType<typeof setInterval> | null;
	/** Promise queue for serialized execution */
	queue: Promise<unknown>;
	/** Whether prelude has been loaded */
	preludeLoaded: boolean;
}

/** Read the prelude Python code from the bundled file */
function readPrelude(): string {
	return readFileSync(join(__dirname, "prelude.py"), "utf-8");
}

/** Get the prelude cache path */
function getPreludeCachePath(preludeHash: string): string {
	const cacheDir = join(getAgentDir(), "pycache");
	return join(cacheDir, `${preludeHash}.json`);
}

/** Check if prelude is cached (already executed in a kernel with same hash) */
function isPreludeCached(preludeHash: string): boolean {
	return existsSync(getPreludeCachePath(preludeHash));
}

/** Mark prelude as cached */
function cachePrelude(preludeHash: string): void {
	const cacheDir = join(getAgentDir(), "pycache");
	if (!existsSync(cacheDir)) {
		mkdirSync(cacheDir, { recursive: true });
	}
	writeFileSync(getPreludeCachePath(preludeHash), JSON.stringify({ cachedAt: new Date().toISOString() }));
}

/**
 * Executor manages a pool of kernel sessions.
 */
export class PythonExecutor {
	private sessions = new Map<string, Session>();
	private pythonPath: string;
	private prelude: string;
	private preludeHash: string;
	private preludeDocs: string | null = null;
	private _shutdownRequested = false;

	constructor(pythonPath: string) {
		this.pythonPath = pythonPath;
		this.prelude = readPrelude();
		this.preludeHash = createHash("sha256").update(this.prelude).digest("hex").slice(0, 16);
	}

	/**
	 * Get the prelude documentation string (helper signatures and docstrings).
	 * Fetched on first kernel start and cached.
	 */
	get preludeDocumentation(): string | null {
		return this.preludeDocs;
	}

	/**
	 * Execute code in a session for the given working directory.
	 */
	async execute(
		code: string,
		options: {
			cwd: string;
			timeout?: number;
			signal?: AbortSignal;
		},
	): Promise<ExecuteResult> {
		const session = await this.getOrCreateSession(options.cwd);
		this.resetIdleTimer(session);

		// Serialize execution through promise queue
		const result = await this.enqueue(session, () =>
			session.kernel.execute(code, {
				timeout: options.timeout,
				signal: options.signal,
			}),
		);

		return result;
	}

	/**
	 * Restart the kernel for a given cwd.
	 */
	async restart(cwd: string): Promise<void> {
		const key = this.sessionKey(cwd);
		const session = this.sessions.get(key);
		if (!session) return;

		await session.kernel.restart();
		session.preludeLoaded = false;
		session.hasRestarted = false;

		// Re-inject prelude
		await this.loadPrelude(session);
	}

	/**
	 * Shutdown all sessions and clean up.
	 */
	async shutdown(): Promise<void> {
		this._shutdownRequested = true;
		const promises: Promise<void>[] = [];
		for (const session of this.sessions.values()) {
			this.clearTimers(session);
			promises.push(session.kernel.shutdown().catch(() => {}));
		}
		await Promise.all(promises);
		this.sessions.clear();
	}

	private sessionKey(cwd: string): string {
		return `cwd:${cwd}`;
	}

	private async getOrCreateSession(cwd: string): Promise<Session> {
		const key = this.sessionKey(cwd);
		let session = this.sessions.get(key);

		if (session) {
			// Check if kernel is still alive
			if (session.kernel.alive && (await session.kernel.isHealthy())) {
				return session;
			}

			// Kernel died — try auto-restart if we haven't already
			if (!session.hasRestarted) {
				session.hasRestarted = true;
				try {
					const gatewayUrl = await ensureGateway(this.pythonPath);
					const newKernel = await JupyterKernel.create(gatewayUrl);
					session.kernel = newKernel;
					session.preludeLoaded = false;
					await this.loadPrelude(session);
					return session;
				} catch {
					// Auto-restart failed, fall through to create fresh session
				}
			}

			// Remove dead session
			this.clearTimers(session);
			this.sessions.delete(key);
		}

		// Evict oldest session if at capacity
		if (this.sessions.size >= MAX_SESSIONS) {
			this.evictOldest();
		}

		// Create new session
		const gatewayUrl = await ensureGateway(this.pythonPath);
		const kernel = await JupyterKernel.create(gatewayUrl);

		session = {
			kernel,
			cwd,
			lastUsed: Date.now(),
			hasRestarted: false,
			idleTimer: null,
			heartbeatTimer: null,
			queue: Promise.resolve(),
			preludeLoaded: false,
		};

		this.sessions.set(key, session);
		this.startHeartbeat(session, key);
		await this.loadPrelude(session);

		return session;
	}

	private async loadPrelude(session: Session): Promise<void> {
		if (session.preludeLoaded) return;

		// Execute prelude
		const result = await session.kernel.execute(this.prelude, { silent: true, timeout: 30_000 });
		if (result.error) {
			const rendered = renderExecuteResult(result);
			console.error(`[python] Failed to load prelude: ${rendered.text.slice(0, 500)}`);
		}
		session.preludeLoaded = true;

		// Cache prelude hash so we know the prelude version loaded
		if (!isPreludeCached(this.preludeHash)) {
			cachePrelude(this.preludeHash);
		}

		// Fetch prelude docs on first session
		if (!this.preludeDocs) {
			try {
				const docsResult = await session.kernel.execute("__gsd_prelude_docs__()", {
					silent: true,
					timeout: 10_000,
				});
				if (!docsResult.error) {
					const rendered = renderExecuteResult(docsResult);
					if (rendered.text.trim()) {
						this.preludeDocs = rendered.text.trim();
					}
				}
			} catch {
				// Non-critical
			}
		}

		// Load custom modules
		await loadCustomModules(session.kernel, session.cwd);
	}

	private enqueue<T>(session: Session, fn: () => Promise<T>): Promise<T> {
		const promise = session.queue.then(fn, fn);
		session.queue = promise.catch(() => {});
		return promise;
	}

	private resetIdleTimer(session: Session): void {
		session.lastUsed = Date.now();
		if (session.idleTimer) {
			clearTimeout(session.idleTimer);
		}
		session.idleTimer = setTimeout(() => {
			this.destroySession(session);
		}, IDLE_TIMEOUT_MS);
	}

	private startHeartbeat(session: Session, key: string): void {
		session.heartbeatTimer = setInterval(async () => {
			if (this._shutdownRequested) return;
			const healthy = await session.kernel.isHealthy();
			if (!healthy) {
				// Kernel died unexpectedly — remove session so next call creates a fresh one
				this.clearTimers(session);
				this.sessions.delete(key);
			}
		}, HEARTBEAT_INTERVAL_MS);
	}

	private clearTimers(session: Session): void {
		if (session.idleTimer) clearTimeout(session.idleTimer);
		if (session.heartbeatTimer) clearInterval(session.heartbeatTimer);
		session.idleTimer = null;
		session.heartbeatTimer = null;
	}

	private destroySession(session: Session): void {
		this.clearTimers(session);
		session.kernel.shutdown().catch(() => {});
		for (const [key, s] of this.sessions) {
			if (s === session) {
				this.sessions.delete(key);
				break;
			}
		}
	}

	private evictOldest(): void {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;

		for (const [key, session] of this.sessions) {
			if (session.lastUsed < oldestTime) {
				oldestTime = session.lastUsed;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			const session = this.sessions.get(oldestKey)!;
			this.destroySession(session);
		}
	}
}
