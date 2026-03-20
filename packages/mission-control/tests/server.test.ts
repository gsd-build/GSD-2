import { describe, expect, it, afterAll } from "bun:test";
import { join } from "path";

const MC_ROOT = join(import.meta.dir, "..");
// Use a unique random port to avoid conflicts with other parallel tests
const TEST_PORT = 14200 + Math.floor(Math.random() * 1000);
let serverProc: ReturnType<typeof Bun.spawn> | null = null;

const isCI = !!process.env.CI;

afterAll(() => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
});

describe("server", () => {
  // SERV-01: Skipped in CI — integration test requires full server spawn which is flaky under CI resource constraints. Runs locally.
  it.skipIf(isCI)(
    "SERV-01: starts and responds with HTML on dynamic port",
    async () => {
      serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
        cwd: MC_ROOT,
        env: { ...process.env, MC_PORT: String(TEST_PORT), MC_NO_HMR: "1" },
        stdout: "pipe",
        stderr: "pipe",
      });

      // Wait for server to be ready (poll for up to 25s — server may be slow under parallel test load)
      let ready = false;
      try {
        for (let i = 0; i < 50; i++) {
          try {
            const res = await fetch(`http://127.0.0.1:${TEST_PORT}`, {
              signal: AbortSignal.timeout(1000),
            });
            if (res.ok) {
              ready = true;
              break;
            }
          } catch {
            // Server not ready yet
          }
          await Bun.sleep(250);
        }

        if (!ready) {
          const stderr = await new Response(serverProc.stderr).text().catch(() => "");
          console.error("[SERV-01] Server failed to start. stderr:", stderr);
        }

        expect(ready).toBe(true);

        const response = await fetch(`http://127.0.0.1:${TEST_PORT}`);
        expect(response.status).toBe(200);

        const contentType = response.headers.get("content-type") || "";
        expect(contentType).toContain("text/html");

        const body = await response.text();
        expect(body).toContain("root");
      } finally {
        if (serverProc) {
          serverProc.kill();
          serverProc = null;
        }
      }
    },
    { timeout: 30000 }
  );
});
