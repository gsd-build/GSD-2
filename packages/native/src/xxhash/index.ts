/**
 * Native xxHash32 — Rust implementation via napi-rs.
 *
 * Drop-in replacement for the pure-JS xxHash32 in hashline.ts.
 * Hashes the UTF-8 representation of the input string with the given seed.
 */

import { native } from "../native.js";

/**
 * Compute xxHash32 of a UTF-8 string.
 *
 * @param input  The string to hash (encoded as UTF-8 internally).
 * @param seed   32-bit seed value.
 * @returns      32-bit unsigned hash.
 */
export function xxHash32(input: string, seed: number): number {
  return (native as Record<string, Function>).xxHash32(input, seed) as number;
}
