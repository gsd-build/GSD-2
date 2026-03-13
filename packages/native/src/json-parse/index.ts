/**
 * Streaming JSON parser via native Rust bindings with JS fallback.
 *
 * Provides fast JSON parsing with recovery for incomplete/partial JSON,
 * used during LLM streaming tool call argument parsing.
 *
 * Falls back to pure-JS implementation when native functions are not
 * available (e.g. addon was compiled before json-parse was added).
 */

import { native } from "../native.js";

const hasNativeJson = typeof native.parseStreamingJson === "function";

/**
 * JS fallback: attempt JSON.parse, return {} on failure.
 */
function jsFallbackStreamingJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Try to salvage partial JSON by closing open structures
    let patched = text.trim();
    // Close unclosed strings
    const quotes = (patched.match(/"/g) || []).length;
    if (quotes % 2 !== 0) patched += '"';
    // Close unclosed brackets/braces
    const opens = (patched.match(/[{[]/g) || []).length;
    const closes = (patched.match(/[}\]]/g) || []).length;
    for (let i = 0; i < opens - closes; i++) {
      // Guess which closer based on last opener
      const lastOpen = patched.lastIndexOf("{") > patched.lastIndexOf("[") ? "}" : "]";
      patched += lastOpen;
    }
    try {
      return JSON.parse(patched) as T;
    } catch {
      return {} as T;
    }
  }
}

/**
 * Parse a complete JSON string. Throws on invalid JSON.
 */
export function parseJson<T = unknown>(text: string): T {
  if (hasNativeJson) {
    return native.parseJson(text) as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Parse potentially incomplete JSON by closing unclosed structures.
 * Handles unclosed strings, objects, arrays, trailing commas, and truncated literals.
 */
export function parsePartialJson<T = unknown>(text: string): T {
  if (hasNativeJson) {
    return native.parsePartialJson(text) as T;
  }
  return jsFallbackStreamingJson<T>(text);
}

/**
 * Try full JSON parse first; fall back to partial parse.
 * Returns `{}` on total failure. Drop-in replacement for the JS streaming parser.
 */
export function parseStreamingJson<T = unknown>(text: string | undefined): T {
  if (!text || text.trim() === "") {
    return {} as T;
  }
  if (hasNativeJson) {
    return native.parseStreamingJson(text) as T;
  }
  return jsFallbackStreamingJson<T>(text);
}
