// GSD-FSM Extension — Entry Point
// Registers FSM analysis tools for GSD project state machines.

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { registerStatusTool } from "./status-tool.js";
import { registerVerifyTool } from "./verify-tool.js";
import { registerHistoryTool } from "./history-tool.js";

export default function (pi: ExtensionAPI): void {
  registerStatusTool(pi);
  registerVerifyTool(pi);
  registerHistoryTool(pi);
}
