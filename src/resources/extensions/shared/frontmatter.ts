// Shared frontmatter parsing utilities
// Canonical implementation for splitting and parsing YAML-like frontmatter.

import { parse } from "yaml";

/**
 * Split markdown content into frontmatter (YAML-like) and body.
 * Returns [frontmatterLines, body] where frontmatterLines is null if no frontmatter.
 */
export function splitFrontmatter(content: string): [string[] | null, string] {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return [null, content];

  const afterFirst = trimmed.indexOf('\n');
  if (afterFirst === -1) return [null, content];

  const rest = trimmed.slice(afterFirst + 1);
  const endIdx = rest.indexOf('\n---');
  if (endIdx === -1) return [null, content];

  const fmLines = rest.slice(0, endIdx).split('\n');
  const body = rest.slice(endIdx + 4).replace(/^\n+/, '');
  return [fmLines, body];
}

/**
 * Parse YAML frontmatter lines into a key-value map.
 * Uses the yaml library with failsafe schema to preserve string values as-is
 * (e.g. `001` stays `"001"`, not `1`).
 */
export function parseFrontmatterMap(lines: string[]): Record<string, unknown> {
  const raw = lines.join("\n");
  if (!raw.trim()) return {};
  const result = parse(raw, { schema: "failsafe" });
  return result && typeof result === "object" ? result : {};
}
