// GSD2 — Extension registration: wires all GSD tools, commands, and hooks into pi

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { registerGSDCommand } from "../commands.js";
import { registerExitCommand } from "../exit-command.js";
import { registerWorktreeCommand } from "../worktree-command.js";
import { registerDbTools } from "./db-tools.js";
import { registerDynamicTools } from "./dynamic-tools.js";
import { registerJournalTools } from "./journal-tools.js";
import { registerQueryTools } from "./query-tools.js";
import { registerHooks } from "./register-hooks.js";
import { registerShortcuts } from "./register-shortcuts.js";
import { writeCrashLog } from "./crash-log.js";

export { writeCrashLog } from "./crash-log.js";

export function handleRecoverableExtensionProcessError(err: Error): boolean {
  if ((err as NodeJS.ErrnoException).code === "EPIPE") {
    process.exit(0);
  }
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    const syscall = (err as NodeJS.ErrnoException).syscall;
    if (syscall?.startsWith("spawn")) {
      process.stderr.write(`[gsd] spawn ENOENT: ${(err as any).path ?? "unknown"} — command not found\n`);
      return true;
    }
    if (syscall === "uv_cwd") {
      process.stderr.write(`[gsd] ENOENT (${syscall}): ${err.message}\n`);
      return true;
    }
  }
  return false;
}

function installEpipeGuard(): void {
  if (!process.listeners("uncaughtException").some((listener) => listener.name === "_gsdEpipeGuard")) {
    const _gsdEpipeGuard = (err: Error): void => {
      if (handleRecoverableExtensionProcessError(err)) return;
      // Write crash log and exit cleanly for unrecoverable errors.
      // Logging and continuing was the original double-fault fix (#3163), but
      // continuing in an indeterminate state is worse than a clean exit (#3348).
      writeCrashLog(err, "uncaughtException");
      process.exit(1);
    };
    process.on("uncaughtException", _gsdEpipeGuard);
  }

  if (!process.listeners("unhandledRejection").some((listener) => listener.name === "_gsdRejectionGuard")) {
    const _gsdRejectionGuard = (reason: unknown, _promise: Promise<unknown>): void => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      if (handleRecoverableExtensionProcessError(err)) return;
      writeCrashLog(err, "unhandledRejection");
      process.exit(1);
    };
    process.on("unhandledRejection", _gsdRejectionGuard);
  }
}

export function registerGsdExtension(pi: ExtensionAPI): void {
  registerGSDCommand(pi);
  registerWorktreeCommand(pi);
  registerExitCommand(pi);

  installEpipeGuard();

  pi.registerCommand("kill", {
    description: "Exit GSD immediately (no cleanup)",
    handler: async (_args: string, _ctx: ExtensionCommandContext) => {
      process.exit(0);
    },
  });

  registerDynamicTools(pi);
  registerDbTools(pi);
  registerJournalTools(pi);
  registerQueryTools(pi);
  registerShortcuts(pi);
  registerHooks(pi);
}
