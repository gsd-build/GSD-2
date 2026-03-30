/**
 * ANSI-aware text measurement and slicing.
 *
 * High-performance UTF-16 native implementation with ASCII fast-paths,
 * single-pass ANSI scanning, and proper Unicode grapheme cluster support.
 */

import { native } from "../native.js";
import type { ExtractSegmentsResult, SliceResult } from "./types.js";

export type { ExtractSegmentsResult, SliceResult };
export { EllipsisKind } from "./types.js";

/**
 * Pure-JS fallback for wrapTextWithAnsi.
 * Does not handle ANSI codes — plain character-count wrap.
 * Used only when the native addon is unavailable (e.g., linux-arm64
 * devcontainers — #3212).
 */
function wrapTextWithAnsiJs(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= width) {
      lines.push(rawLine);
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > width) {
      // Prefer breaking at a space boundary within the width
      let breakAt = width;
      const lastSpace = remaining.lastIndexOf(" ", width - 1);
      if (lastSpace > 0) breakAt = lastSpace;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).replace(/^ /, "");
    }
    if (remaining.length > 0) lines.push(remaining);
  }
  return lines.length > 0 ? lines : [""];
}

/**
 * Word-wrap text to a visible width, preserving ANSI escape codes across
 * line breaks.
 *
 * Active SGR codes (colors, bold, etc.) are carried to continuation lines.
 * Underline and strikethrough are reset at line ends and restored on the
 * next line.
 *
 * Delegates to the native Rust implementation when available.
 * Falls back to a plain JS implementation on platforms where the native
 * addon is not built (e.g., linux-arm64 devcontainers — #3212).
 */
export function wrapTextWithAnsi(
  text: string,
  width: number,
  tabWidth?: number,
): string[] {
  try {
    return (native as Record<string, Function>).wrapTextWithAnsi(
      text,
      width,
      tabWidth,
    ) as string[];
  } catch {
    return wrapTextWithAnsiJs(text, width);
  }
}

/**
 * Truncate text to a visible width with an optional ellipsis.
 *
 * @param text       Input string (may contain ANSI codes).
 * @param maxWidth   Maximum visible width in terminal cells.
 * @param ellipsisKind  0 = "\u2026", 1 = "...", 2 = none.
 * @param pad        When true, pad with spaces to exactly `maxWidth`.
 * @param tabWidth   Tab stop width (default 3, range 1-16).
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  ellipsisKind: number,
  pad: boolean,
  tabWidth?: number,
): string {
  return (native as Record<string, Function>).truncateToWidth(
    text,
    maxWidth,
    ellipsisKind,
    pad,
    tabWidth,
  ) as string;
}

/**
 * Slice a range of visible columns from a line.
 *
 * Counts terminal cells (skipping ANSI escapes). When `strict` is true,
 * wide characters that would exceed the range are excluded.
 */
export function sliceWithWidth(
  line: string,
  startCol: number,
  length: number,
  strict: boolean,
  tabWidth?: number,
): SliceResult {
  return (native as Record<string, Function>).sliceWithWidth(
    line,
    startCol,
    length,
    strict,
    tabWidth,
  ) as SliceResult;
}

/**
 * Extract the before/after segments around an overlay region.
 *
 * ANSI state is tracked so the `after` segment renders correctly even when
 * the overlay truncates styled text.
 */
export function extractSegments(
  line: string,
  beforeEnd: number,
  afterStart: number,
  afterLen: number,
  strictAfter: boolean,
  tabWidth?: number,
): ExtractSegmentsResult {
  return (native as Record<string, Function>).extractSegments(
    line,
    beforeEnd,
    afterStart,
    afterLen,
    strictAfter,
    tabWidth,
  ) as ExtractSegmentsResult;
}

/**
 * Strip ANSI escape sequences, remove control characters and lone
 * surrogates, and normalize line endings (CR removed).
 *
 * Returns the original string when no changes are needed (zero-copy).
 */
export function sanitizeText(text: string): string {
  return (native as Record<string, Function>).sanitizeText(text) as string;
}

/**
 * Calculate visible width of text excluding ANSI escape sequences.
 *
 * Tabs count as `tabWidth` cells (default 3).
 */
export function visibleWidth(text: string, tabWidth?: number): number {
  return (native as Record<string, Function>).visibleWidth(
    text,
    tabWidth,
  ) as number;
}
