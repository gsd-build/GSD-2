/**
 * Shared JSONL parsing utilities.
 *
 * Both forensics.ts and session-forensics.ts need to parse JSONL activity logs
 * with an upper byte limit to prevent V8 OOM on bloated files. This module
 * provides the single canonical implementation and constant.
 */

/** Max bytes to parse from a JSONL source. Prevents V8 OOM on bloated activity logs. */
export const MAX_JSONL_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Parse a raw JSONL string into an array of parsed objects.
 * If the input exceeds MAX_JSONL_BYTES, only the tail is parsed (most recent entries).
 */
export function parseJSONL(raw: string): unknown[] {
  const source = raw.length > MAX_JSONL_BYTES ? raw.slice(-MAX_JSONL_BYTES) : raw;
  return source.trim().split("\n").map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean) as unknown[];
}
