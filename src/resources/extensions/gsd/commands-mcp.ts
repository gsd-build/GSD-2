import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import {
  formatMcpDiagnosticsReport,
  runMcpDiagnostics,
} from "../mcp-client/shared.js";

function usage(): string {
  return [
    "Usage: /gsd mcp [server-name] [--verbose] [--refresh]",
    "",
    "Examples:",
    "  /gsd mcp",
    "  /gsd mcp --verbose",
    "  /gsd mcp context7",
    "  /gsd mcp context7 --refresh --verbose",
  ].join("\n");
}

export async function handleMcp(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parts = args.trim() ? args.trim().split(/\s+/) : [];
  let verbose = false;
  let refresh = false;
  let server: string | undefined;

  for (const part of parts) {
    if (part === "--help" || part === "-h") {
      ctx.ui.notify(usage(), "info");
      return;
    }
    if (part === "--verbose" || part === "-v") {
      verbose = true;
      continue;
    }
    if (part === "--refresh") {
      refresh = true;
      continue;
    }
    if (!server) {
      server = part;
      continue;
    }

    ctx.ui.notify(usage(), "warning");
    return;
  }

  const report = await runMcpDiagnostics({
    server,
    refresh,
    verbose,
  });

  const hasErrors = report.summary.error > 0
    || report.config.issues.some((issue) => issue.severity === "error")
    || (!!report.requestedServer && !report.requestedServerFound);

  ctx.ui.notify(
    formatMcpDiagnosticsReport(report, { verbose }),
    hasErrors ? "warning" : "info",
  );
}
