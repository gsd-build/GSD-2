/**
 * ANSI-aware TUI layout utilities that depend on @gsd/pi-tui.
 *
 * Separated from format-utils.ts so that modules needing only pure
 * formatting (e.g. HTML report generation) can import format-utils
 * without pulling in the @gsd/pi-tui dependency — which fails when
 * loaded outside jiti's alias resolution context.
 */

import { truncateToWidth, visibleWidth } from "@gsd/pi-tui";

// ─── Layout Helpers ───────────────────────────────────────────────────────────

/** Pad a string with trailing spaces to fill `width` (ANSI-aware). */
export function padRight(content: string, width: number): string {
  const vis = visibleWidth(content);
  return content + " ".repeat(Math.max(0, width - vis));
}

/** Build a line with left-aligned and right-aligned content. */
export function joinColumns(left: string, right: string, width: number): string {
  const leftW = visibleWidth(left);
  const rightW = visibleWidth(right);
  if (leftW + rightW + 2 > width) {
    return truncateToWidth(`${left}  ${right}`, width);
  }
  return left + " ".repeat(width - leftW - rightW) + right;
}

/** Center content within `width` (ANSI-aware). */
export function centerLine(content: string, width: number): string {
  const vis = visibleWidth(content);
  if (vis >= width) return truncateToWidth(content, width);
  const leftPad = Math.floor((width - vis) / 2);
  return " ".repeat(leftPad) + content;
}

/** Join as many parts as fit within `width`, separated by `separator`. */
export function fitColumns(parts: string[], width: number, separator = "  "): string {
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return "";
  let result = filtered[0];
  for (let i = 1; i < filtered.length; i++) {
    const candidate = `${result}${separator}${filtered[i]}`;
    if (visibleWidth(candidate) > width) break;
    result = candidate;
  }
  return truncateToWidth(result, width);
}
