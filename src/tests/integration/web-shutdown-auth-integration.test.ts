/**
 * Integration test for /api/shutdown auth protection.
 *
 * Verifies that the middleware actually protects the shutdown endpoint.
 * Tests bearer token and _token query parameter authentication.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  killProcessOnPort,
  launchPackagedWebHost,
  runtimeAuthHeaders,
  waitForHttpOk,
} from "./web-mode-runtime-harness.ts";

const repoRoot = process.cwd();

test.describe("/api/shutdown auth integration", () => {
  let port: number | null = null;
  let tempRoot: string;
  let tempHome: string;
  let browserLogPath: string;

  test.before(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "gsd-shutdown-auth-"));
    tempHome = tempRoot;
    browserLogPath = join(tempRoot, "browser-open.log");
  });

  test.after(async () => {
    if (port !== null) {
      await killProcessOnPort(port);
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("rejects shutdown request without auth token", async () => {
    const launch = await launchPackagedWebHost({
      launchCwd: repoRoot,
      tempHome,
      browserLogPath,
    });
    port = launch.port;

    const auth = runtimeAuthHeaders(launch);
    await waitForHttpOk(`${launch.url}/api/boot`, undefined, auth);

    const response = await fetch(`${launch.url}/api/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    assert.equal(response.status, 401, "should return 401 without auth");
    const body = await response.text();
    assert.ok(body.includes("Unauthorized") || body.includes("unauthorized"));
  });

  test("rejects shutdown request with invalid token", async () => {
    const launch = await launchPackagedWebHost({
      launchCwd: repoRoot,
      tempHome,
      browserLogPath,
    });
    port = launch.port;

    const auth = runtimeAuthHeaders(launch);
    await waitForHttpOk(`${launch.url}/api/boot`, undefined, auth);

    // Use a different token that won't match
    const response = await fetch(`${launch.url}/api/shutdown`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      signal: AbortSignal.timeout(10_000),
    });

    assert.equal(response.status, 401, "should return 401 with wrong token");
  });

  test("allows shutdown request with valid Bearer token", async () => {
    const launch = await launchPackagedWebHost({
      launchCwd: repoRoot,
      tempHome,
      browserLogPath,
    });
    port = launch.port;

    const auth = runtimeAuthHeaders(launch);
    await waitForHttpOk(`${launch.url}/api/boot`, undefined, auth);

    const response = await fetch(`${launch.url}/api/shutdown`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...auth,
      },
      signal: AbortSignal.timeout(10_000),
    });

    assert.equal(response.status, 200, "should return 200 with valid token");
    const body = await response.text();
    assert.ok(body.includes("ok") || body.includes("OK"));
  });

  test("allows shutdown request with valid _token parameter", async () => {
    const launch = await launchPackagedWebHost({
      launchCwd: repoRoot,
      tempHome,
      browserLogPath,
    });
    port = launch.port;

    const auth = runtimeAuthHeaders(launch);
    await waitForHttpOk(`${launch.url}/api/boot`, undefined, auth);

    // Use _token query parameter instead of header
    const url = new URL(`${launch.url}/api/shutdown`);
    if (launch.authToken) {
      url.searchParams.set("_token", launch.authToken);
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    assert.equal(response.status, 200, "should return 200 with valid _token");
    const body = await response.text();
    assert.ok(body.includes("ok") || body.includes("OK"));
  });

  test("rejects shutdown request with non-matching origin", async () => {
    const launch = await launchPackagedWebHost({
      launchCwd: repoRoot,
      tempHome,
      browserLogPath,
    });
    port = launch.port;

    const auth = runtimeAuthHeaders(launch);
    await waitForHttpOk(`${launch.url}/api/boot`, undefined, auth);

    const response = await fetch(`${launch.url}/api/shutdown`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...auth,
        Origin: "http://evil.com",
      },
      signal: AbortSignal.timeout(10_000),
    });

    assert.equal(response.status, 403, "should return 403 for bad origin");
  });
});
