/**
 * @gsd/native — High-performance Rust modules exposed via N-API.
 *
 * Modules:
 * - grep: ripgrep-backed regex search (content + filesystem)
 */

export { searchContent, grep } from "./grep/index.js";
export type {
  ContextLine,
  GrepMatch,
  GrepOptions,
  GrepResult,
  SearchMatch,
  SearchOptions,
  SearchResult,
} from "./grep/index.js";
