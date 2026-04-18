// GSD Extension — Notify Interceptor
// Wraps ctx.ui.notify() in-place to persist every notification through the
// notification store. Uses a WeakSet to prevent double-wrapping and handle
// UI context replacement on /reload gracefully.

import type { ExtensionContext } from "@gsd/pi-coding-agent";

import { sendRemoteNotification } from "../../remote-questions/notify.js";
import { appendNotification, type NotifySeverity } from "../notification-store.js";

// Track which ui context objects have been wrapped to prevent double-install.
// WeakSet allows GC to collect replaced uiContext instances after /reload.
const _wrappedContexts = new WeakSet<object>();
const REMOTE_DEDUP_WINDOW_MS = 30_000;
const REMOTE_DEDUP_PRUNE_THRESHOLD = 200;
const _recentRemoteNotificationTimestamps = new Map<string, number>();

function shouldSendRemote(message: string): boolean {
  const normalized = String(message ?? "").trim();
  if (!normalized) return false;
  return true;
}

function buildRemoteTitle(type?: "info" | "warning" | "error" | "success"): string {
  switch (type) {
    case "error":
      return "GSD Error";
    case "warning":
      return "GSD Warning";
    case "success":
      return "GSD Success";
    case "info":
    default:
      return "GSD Update";
  }
}

function isDuplicateRemote(message: string, type?: "info" | "warning" | "error" | "success"): boolean {
  const severity = type ?? "info";
  const normalized = String(message ?? "").trim();
  const dedupKey = `${severity}:${normalized}`;
  const now = Date.now();
  const lastSeen = _recentRemoteNotificationTimestamps.get(dedupKey);
  return lastSeen !== undefined && now - lastSeen < REMOTE_DEDUP_WINDOW_MS;
}

function recordRemoteDelivery(message: string, type?: "info" | "warning" | "error" | "success"): void {
  const severity = type ?? "info";
  const normalized = String(message ?? "").trim();
  const dedupKey = `${severity}:${normalized}`;
  const now = Date.now();

  _recentRemoteNotificationTimestamps.set(dedupKey, now);
  if (_recentRemoteNotificationTimestamps.size > REMOTE_DEDUP_PRUNE_THRESHOLD) {
    for (const [key, ts] of _recentRemoteNotificationTimestamps) {
      if (now - ts > REMOTE_DEDUP_WINDOW_MS) _recentRemoteNotificationTimestamps.delete(key);
    }
  }
}

/**
 * Install the notify interceptor on a context's UI object.
 * Mutates ctx.ui.notify in place — the original is called after persistence.
 * Safe to call multiple times; no-ops if already installed on the same ui object.
 */
export function installNotifyInterceptor(ctx: ExtensionContext): void {
  if (_wrappedContexts.has(ctx.ui)) return;

  const originalNotify = ctx.ui.notify.bind(ctx.ui);

  (ctx.ui as any).notify = (message: string, type?: "info" | "warning" | "error" | "success"): void => {
    try {
      appendNotification(message, (type ?? "info") as NotifySeverity, "notify");
    } catch {
      // Non-fatal — never let persistence break the UI
    }

    if (shouldSendRemote(message) && !isDuplicateRemote(message, type)) {
      void (async () => {
        try {
          const delivered = await sendRemoteNotification(buildRemoteTitle(type), String(message ?? ""));
          if (delivered) {
            recordRemoteDelivery(message, type);
          }
        } catch {
          // Non-fatal — remote notifications are best-effort
        }
      })();
    }

    originalNotify(message, type);
  };

  _wrappedContexts.add(ctx.ui);
}
