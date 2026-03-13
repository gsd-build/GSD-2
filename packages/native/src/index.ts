/**
 * @gsd/native — High-performance Rust modules exposed via N-API.
 *
 * Modules:
 * - clipboard: native clipboard access (text + image)
 * - grep: ripgrep-backed regex search (content + filesystem)
 * - ps: cross-platform process tree management
 * - glob: gitignore-respecting filesystem discovery with scan caching
 * - highlight: syntect-based syntax highlighting
 */

export {
  copyToClipboard,
  readTextFromClipboard,
  readImageFromClipboard,
} from "./clipboard/index.js";
export type { ClipboardImage } from "./clipboard/index.js";

export {
  highlightCode,
  supportsLanguage,
  getSupportedLanguages,
} from "./highlight/index.js";
export type { HighlightColors } from "./highlight/index.js";

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

export {
  killTree,
  listDescendants,
  processGroupId,
  killProcessGroup,
} from "./ps/index.js";

export { glob, invalidateFsScanCache } from "./glob/index.js";
export type {
  FileType,
  GlobMatch,
  GlobOptions,
  GlobResult,
} from "./glob/index.js";
