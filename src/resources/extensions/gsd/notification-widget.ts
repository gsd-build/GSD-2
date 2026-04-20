// GSD Extension — Notification Status
// Always-on ambient notification chip surfaced as an extension status on the
// footer pwd row. Refreshes on store change + on a 30s timer. Hidden when
// unread=0. Key sorts late so the chip renders to the right of other
// extension statuses.

import type { ExtensionContext } from "@gsd/pi-coding-agent";

import { getUnreadCount, onNotificationStoreChange, readNotifications } from "./notification-store.js";
import { formattedShortcutPair } from "./shortcut-defs.js";

// Key chosen to sort after alphabetic extension keys so the chip lands on the
// far right of the extension-status block.
const STATUS_KEY = "zz-notifications";

export function buildNotificationChip(): string {
  const unread = getUnreadCount();
  if (unread === 0) return "";

  const entries = readNotifications();
  const latest = entries[0];
  if (!latest) return "";

  const icon = latest.severity === "error" ? "✗" : latest.severity === "warning" ? "⚠" : "●";
  const badge = `${unread} unread`;
  const msgMax = 80;
  const flat = latest.message.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  const truncated = flat.length > msgMax
    ? flat.slice(0, msgMax - 1) + "…"
    : flat;

  return `${icon} [${badge}]  ${truncated}  (${formattedShortcutPair("notifications")})`;
}

// Retained for backwards compatibility with tests and the RPC fallback path
// that still expected a line-array widget. Returns empty when no unread.
export function buildNotificationWidgetLines(): string[] {
  const chip = buildNotificationChip();
  return chip ? [`  ${chip}`] : [];
}

const REFRESH_INTERVAL_MS = 30_000;

export function initNotificationWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  const push = () => {
    const chip = buildNotificationChip();
    ctx.ui.setStatus(STATUS_KEY, chip.length > 0 ? chip : undefined);
  };
  push();

  onNotificationStoreChange(push);
  setInterval(push, REFRESH_INTERVAL_MS).unref?.();
}
