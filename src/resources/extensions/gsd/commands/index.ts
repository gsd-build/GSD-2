import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { GSD_COMMAND_DESCRIPTION, getGsdArgumentCompletions } from "./catalog.js";

export function registerGSDCommand(pi: ExtensionAPI): void {
  pi.registerCommand("gsd", {
    description: GSD_COMMAND_DESCRIPTION,
    getArgumentCompletions: getGsdArgumentCompletions,
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const { handleGSDCommand } = await import("./dispatcher.js");
      await handleGSDCommand(args, ctx, pi);
    },
  });
}
