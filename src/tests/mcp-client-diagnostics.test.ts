import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";

import {
  discoverMcpServerTools,
  formatMcpDiagnosticsReport,
  getMcpConfigSnapshot,
  invalidateMcpState,
  runMcpDiagnostics,
} from "../resources/extensions/mcp-client/shared.ts";
import { cleanup, createFile, makeTempDir } from "../resources/extensions/gsd/tests/test-utils.ts";

function writeMockMcpServer(dir: string): string {
  const scriptPath = join(dir, "mock-mcp-server.mjs");
  const repoRoot = process.cwd();
  const serverModuleUrl = pathToFileURL(join(repoRoot, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", "server", "index.js")).href;
  const stdioModuleUrl = pathToFileURL(join(repoRoot, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", "server", "stdio.js")).href;
  const typesModuleUrl = pathToFileURL(join(repoRoot, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", "types.js")).href;

  writeFileSync(
    scriptPath,
    `import { Server } from ${JSON.stringify(serverModuleUrl)};
import { StdioServerTransport } from ${JSON.stringify(stdioModuleUrl)};
import { CallToolRequestSchema, ListToolsRequestSchema } from ${JSON.stringify(typesModuleUrl)};

const server = new Server(
  { name: "mock-mcp", version: "0.0.0-test" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ping",
      description: "Return pong",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "ping") {
    return { isError: true, content: [{ type: "text", text: "unknown tool" }] };
  }
  return { content: [{ type: "text", text: "pong" }] };
});

await server.connect(new StdioServerTransport());
await new Promise(() => {});
`,
    "utf-8",
  );

  return scriptPath;
}

test("MCP config parsing reports malformed files and shadowed server definitions", async () => {
  const dir = makeTempDir("gsd-mcp-config-");

  try {
    createFile(
      dir,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          shared: {
            command: "node",
            args: ["server.js"],
          },
        },
      }, null, 2),
    );
    createFile(
      dir,
      ".gsd/mcp.json",
      JSON.stringify({
        mcpServers: {
          shared: {
            url: "http://localhost:9999/mcp",
          },
          broken: 42,
        },
      }, null, 2),
    );

    const snapshot = getMcpConfigSnapshot({ refresh: true, baseDir: dir });
    assert.equal(snapshot.servers.length, 1, "only the winning server definition should remain active");
    assert.equal(snapshot.servers[0].name, "shared");
    assert.equal(snapshot.servers[0].transport, "stdio");
    assert.equal(snapshot.shadowed.length, 1, "duplicate definition should be reported as shadowed");
    assert.equal(snapshot.shadowed[0].name, "shared");
    assert.ok(
      snapshot.issues.some((issue) => issue.message.includes("must be a JSON object")),
      "invalid server entries should surface as config issues",
    );
  } finally {
    await invalidateMcpState({ closeConnections: true });
    cleanup(dir);
  }
});

test("MCP diagnostics report invalid JSON without hiding other valid config", async () => {
  const dir = makeTempDir("gsd-mcp-json-");

  try {
    createFile(dir, ".mcp.json", "{ not-valid-json }");
    createFile(
      dir,
      ".gsd/mcp.json",
      JSON.stringify({
        mcpServers: {
          local: {
            command: "definitely-missing-gsd-mcp-binary",
          },
        },
      }, null, 2),
    );

    const report = await runMcpDiagnostics({ refresh: true, baseDir: dir });
    assert.ok(
      report.config.issues.some((issue) => issue.message === "Invalid JSON."),
      "malformed JSON should appear in config issues",
    );
    assert.equal(report.summary.total, 1, "valid server definitions from other config files should still be checked");
    assert.equal(report.summary.error, 1, "the surviving server should still be diagnosed");
  } finally {
    await invalidateMcpState({ closeConnections: true });
    cleanup(dir);
  }
});

test("MCP diagnostics perform a real stdio handshake and list tools", async () => {
  const dir = makeTempDir("gsd-mcp-stdio-");

  try {
    const serverScript = writeMockMcpServer(dir);
    createFile(
      dir,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          mock: {
            command: process.execPath,
            args: [serverScript],
          },
        },
      }, null, 2),
    );

    const report = await runMcpDiagnostics({ refresh: true, baseDir: dir, verbose: true });
    assert.equal(report.summary.ok, 1, "mock server should connect successfully");
    assert.equal(report.summary.error, 0, "mock server should not report an error");
    assert.equal(report.servers[0].toolCount, 1, "tool count should come from a real tools/list response");
    assert.equal(report.servers[0].tools?.[0]?.name, "ping", "tool metadata should be preserved");

    const discovered = await discoverMcpServerTools("mock", { baseDir: dir, useCache: true });
    assert.equal(discovered.tools.length, 1, "tool discovery should work after diagnostics");

    const formatted = formatMcpDiagnosticsReport(report, { verbose: true });
    assert.match(formatted, /mock/);
    assert.match(formatted, /ping/);
  } finally {
    await invalidateMcpState({ closeConnections: true });
    cleanup(dir);
  }
});

test("MCP diagnostics classify missing stdio commands clearly", async () => {
  const dir = makeTempDir("gsd-mcp-missing-");

  try {
    createFile(
      dir,
      ".mcp.json",
      JSON.stringify({
        mcpServers: {
          missing: {
            command: "definitely-missing-gsd-mcp-binary",
          },
        },
      }, null, 2),
    );

    const report = await runMcpDiagnostics({ refresh: true, baseDir: dir });
    assert.equal(report.summary.error, 1, "missing command should produce an error result");
    assert.equal(report.servers[0].summary, "NOT FOUND on PATH");

    const formatted = formatMcpDiagnosticsReport(report);
    assert.match(formatted, /NOT FOUND on PATH/);
  } finally {
    await invalidateMcpState({ closeConnections: true });
    cleanup(dir);
  }
});
