/**
 * Sanitize error messages by redacting token-like strings before surfacing.
 * Also provides maskEditorLine for masking sensitive TUI editor input.
 */

import { CURSOR_MARKER } from "@gsd/pi-tui";

const TOKEN_PATTERNS = [
  /xoxb-[A-Za-z0-9\-]+/g,    // Slack bot tokens
  /xoxp-[A-Za-z0-9\-]+/g,    // Slack user tokens
  /xoxa-[A-Za-z0-9\-]+/g,    // Slack app tokens
  /\d{8,10}:[A-Za-z0-9_-]{35}/g, // Telegram bot tokens
  /[A-Za-z0-9_\-.]{20,}/g,   // Long opaque secrets (Discord tokens, etc.)
];

export function sanitizeError(msg: string): string {
  let sanitized = msg;
  for (const pattern of TOKEN_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

/**
 * Replace editor visible text with masked characters while preserving
 * ANSI cursor/sequencer codes. Keeps border/metadata lines readable.
 */
export function maskEditorLine(line: string): string {
  if (line.startsWith("─")) {
    return line;
  }

  let output = "";
  let i = 0;
  while (i < line.length) {
    if (line.startsWith(CURSOR_MARKER, i)) {
      output += CURSOR_MARKER;
      i += CURSOR_MARKER.length;
      continue;
    }

    const ansiMatch = /^\x1b\[[0-9;]*m/.exec(line.slice(i));
    if (ansiMatch) {
      output += ansiMatch[0];
      i += ansiMatch[0].length;
      continue;
    }

    const ch = line[i] as string;
    output += ch === " " ? " " : "*";
    i += 1;
  }

  return output;
}
