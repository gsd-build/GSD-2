import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Key, Text } from "@gsd/pi-tui";

import { GSDDashboardOverlay } from "../dashboard-overlay.js";
import { shortcutDesc } from "../../shared/mod.js";

export const GSD_LOGO_LINES = [
  "   ██████╗ ███████╗██████╗ ",
  "  ██╔════╝ ██╔════╝██╔══██╗",
  "  ██║  ███╗███████╗██║  ██║",
  "  ██║   ██║╚════██║██║  ██║",
  "  ╚██████╔╝███████║██████╔╝",
  "   ╚═════╝ ╚══════╝╚═════╝ ",
];

export function registerShortcuts(pi: ExtensionAPI): void {
  pi.registerShortcut(Key.ctrlAlt("g"), {
    description: shortcutDesc("Open GSD dashboard", "/gsd status"),
    handler: async (ctx) => {
      if (!existsSync(join(process.cwd(), ".gsd"))) {
        ctx.ui.notify("No .gsd/ directory found. Run /gsd to start.", "info");
        return;
      }
      await ctx.ui.custom<void>(
        (tui, theme, _kb, done) => new GSDDashboardOverlay(tui, theme, () => done()),
        {
          overlay: true,
          overlayOptions: {
            width: "90%",
            minWidth: 80,
            maxHeight: "92%",
            anchor: "center",
          },
        },
      );
    },
  });
}

export function maybeRenderGsdHeader(ctx: { ui: any }): void {
  try {
    const theme = ctx.ui.theme;
    const version = process.env.GSD_VERSION || "0.0.0";
    const logoText = GSD_LOGO_LINES.map((line) => theme.fg("accent", line)).join("\n");
    const titleLine = `  ${theme.bold("Get Shit Done")} ${theme.fg("dim", `v${version}`)}`;
    const headerContent = `${logoText}\n${titleLine}`;
    ctx.ui.setHeader((_ui: unknown, _theme: unknown) => new Text(headerContent, 1, 0));
  } catch {
    // no TUI
  }
}

