import type { ExtensionAPI } from "@gsd/pi-coding-agent";

export function getDisplayThinkingLevel(api: Pick<ExtensionAPI, "getThinkingLevel">): string {
  return api.getThinkingLevel();
}
