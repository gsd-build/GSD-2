/**
 * Shared fetch-mocking utilities for test files that need to intercept
 * globalThis.fetch and inspect request headers/body.
 */

export function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (headers == null) return undefined;
  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((v, k) => { result[k] = v; });
    return result;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

export function parseJsonBody(body: BodyInit | null | undefined): Record<string, unknown> | undefined {
  if (body == null || typeof body !== "string") return undefined;
  try { return JSON.parse(body); } catch { return undefined; }
}
