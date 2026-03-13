/**
 * Syntect-based syntax highlighting via N-API.
 *
 * Provides ANSI-colored output for code blocks using semantic scope matching
 * across 11 token categories.
 */

import { native } from "../native.js";
import type { HighlightColors } from "./types.js";

export type { HighlightColors };

/**
 * Highlight source code and return ANSI-colored output.
 *
 * @param code - The source code to highlight
 * @param lang - Language identifier (e.g., "rust", "typescript", "python"), or null for plain text
 * @param colors - Theme colors as ANSI escape sequences
 * @returns Highlighted code with ANSI color codes
 */
export function highlightCode(
  code: string,
  lang: string | null,
  colors: HighlightColors,
): string {
  return native.highlightCode(code, lang, colors) as string;
}

/**
 * Check if a language is supported for highlighting.
 *
 * Returns true if the language has either direct syntect support or a
 * fallback alias mapping.
 */
export function supportsLanguage(lang: string): boolean {
  return native.supportsLanguage(lang) as boolean;
}

/**
 * Get list of all supported language names from syntect's default syntax set.
 */
export function getSupportedLanguages(): string[] {
  return native.getSupportedLanguages() as string[];
}
