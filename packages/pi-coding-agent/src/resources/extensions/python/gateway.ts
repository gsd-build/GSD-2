/**
 * Gateway coordinator — manages a single jupyter_kernel_gateway subprocess
 * shared across GSD instances.
 *
 * Lock file: <agentDir>/python-gateway/gateway.lock
 * Metadata:  <agentDir>/python-gateway/gateway.json
 *
 * External gateway mode: set GSD_PYTHON_GATEWAY_URL to skip local spawning.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "../../../config.js";
import { buildKernelEnv } from "./runtime.js";

/** Metadata persisted to gateway.json */
interface GatewayMetadata {
	url: string;
	pid: number;
	startedAt: string;
	pythonPath: string;
}

/** How long to wait for the gateway to become healthy */
const STARTUP_TIMEOUT_MS = 30_000;
/** Interval between health-check polls during startup */
const POLL_INTERVAL_MS = 500;

let gatewayProcess: ChildProcess | null = null;
let gatewayUrl: string | null = null;

function getGatewayDir(): string {
	return join(getAgentDir(), "python-gateway");
}

function getMetadataPath(): string {
	return join(getGatewayDir(), "gateway.json");
}

function getLockPath(): string {
	return join(getGatewayDir(), "gateway.lock");
}

/**
 * Read stored gateway metadata. Returns null if file doesn't exist or is invalid.
 */
function readMetadata(): GatewayMetadata | null {
	try {
		const raw = readFileSync(getMetadataPath(), "utf-8");
		return JSON.parse(raw) as GatewayMetadata;
	} catch {
		return null;
	}
}

/**
 * Write gateway metadata to disk.
 */
function writeMetadata(meta: GatewayMetadata): void {
	const dir = getGatewayDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(getMetadataPath(), JSON.stringify(meta, null, 2), "utf-8");
}

/**
 * Check if a process with the given PID is alive.
 */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Health check the gateway by hitting /api/kernelspecs.
 */
async function isGatewayHealthy(url: string): Promise<boolean> {
	try {
		const resp = await fetch(`${url}/api/kernelspecs`, {
			signal: AbortSignal.timeout(3000),
		});
		return resp.ok;
	} catch {
		return false;
	}
}

/**
 * Pick a random port in the ephemeral range.
 */
function randomPort(): number {
	return 10000 + Math.floor(Math.random() * 50000);
}

/**
 * Spawn a new kernel gateway process.
 */
async function spawnGateway(pythonPath: string): Promise<string> {
	const port = randomPort();
	const url = `http://127.0.0.1:${port}`;

	const dir = getGatewayDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const child = spawn(
		pythonPath,
		[
			"-m",
			"kernel_gateway",
			"--KernelGatewayApp.ip=127.0.0.1",
			`--KernelGatewayApp.port=${port}`,
			"--KernelGatewayApp.port_retries=0",
			"--KernelGatewayApp.allow_origin=*",
		],
		{
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
			env: buildKernelEnv(),
		},
	);

	// Unref so the gateway can outlive this process
	child.unref();

	// Capture stderr for debugging startup failures
	let stderrBuffer = "";
	child.stderr?.on("data", (chunk: Buffer) => {
		stderrBuffer += chunk.toString();
	});

	child.on("error", (err) => {
		console.error(`[python-gateway] spawn error: ${err.message}`);
	});

	gatewayProcess = child;

	// Poll for health
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

		// Check if process died
		if (child.exitCode !== null) {
			throw new Error(
				`kernel_gateway exited with code ${child.exitCode} during startup.\n${stderrBuffer.slice(0, 2000)}`,
			);
		}

		if (await isGatewayHealthy(url)) {
			// Write metadata so other GSD instances can find this gateway
			writeMetadata({
				url,
				pid: child.pid!,
				startedAt: new Date().toISOString(),
				pythonPath,
			});
			return url;
		}
	}

	// Timed out — kill and throw
	child.kill("SIGTERM");
	throw new Error(
		`kernel_gateway failed to become healthy within ${STARTUP_TIMEOUT_MS / 1000}s.\n${stderrBuffer.slice(0, 2000)}`,
	);
}

/**
 * Get or start the kernel gateway. Returns the gateway base URL.
 *
 * Resolution order:
 * 1. GSD_PYTHON_GATEWAY_URL env var (external gateway)
 * 2. Cached in-process URL
 * 3. Existing gateway from metadata file (if process still alive and healthy)
 * 4. Spawn a new gateway
 */
export async function ensureGateway(pythonPath: string): Promise<string> {
	// 1. External gateway
	const externalUrl = process.env.GSD_PYTHON_GATEWAY_URL;
	if (externalUrl) {
		if (await isGatewayHealthy(externalUrl)) {
			gatewayUrl = externalUrl;
			return externalUrl;
		}
		throw new Error(`External gateway at ${externalUrl} is not healthy`);
	}

	// 2. Cached in-process
	if (gatewayUrl && (await isGatewayHealthy(gatewayUrl))) {
		return gatewayUrl;
	}

	// 3. Existing gateway from metadata
	const meta = readMetadata();
	if (meta && isProcessAlive(meta.pid)) {
		if (await isGatewayHealthy(meta.url)) {
			gatewayUrl = meta.url;
			return meta.url;
		}
	}

	// Clean up stale metadata
	try {
		unlinkSync(getMetadataPath());
	} catch {
		// ignore
	}
	try {
		unlinkSync(getLockPath());
	} catch {
		// ignore
	}

	// 4. Spawn new gateway
	const url = await spawnGateway(pythonPath);
	gatewayUrl = url;
	return url;
}

/**
 * Shutdown the gateway process if we spawned it.
 */
export function shutdownGateway(): void {
	if (gatewayProcess && gatewayProcess.exitCode === null) {
		gatewayProcess.kill("SIGTERM");
		gatewayProcess = null;
	}
	gatewayUrl = null;
}
