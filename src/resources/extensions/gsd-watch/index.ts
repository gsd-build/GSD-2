// GSD Watch Extension — Live TUI dashboard for monitoring project progress
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import type { ExtensionAPI } from "@gsd/pi-coding-agent";

export default function gsdWatch(pi: ExtensionAPI) {
  pi.registerCommand("watch", {
    description: "Live TUI dashboard: /watch [stop]",

    getArgumentCompletions: (prefix: string) => {
      const subs = ["stop"];
      const parts = prefix.trim().split(/\s+/);
      if (parts.length <= 1) {
        return subs
          .filter((s) => s.startsWith(parts[0] ?? ""))
          .map((s) => ({ value: s, label: s }));
      }
      return [];
    },

    handler: async (args, ctx) => {
      const { handleWatch } = await import("./orchestrator.js");
      await handleWatch(args.trim(), ctx);
    },
  });
}
