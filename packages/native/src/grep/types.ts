/** A context line adjacent to a match. */
export interface ContextLine {
  /** 1-indexed line number. */
  lineNumber: number;
  /** Line content (trailing newline stripped). */
  line: string;
}

/** A single match from in-memory content search. */
export interface SearchMatch {
  /** 1-indexed line number. */
  lineNumber: number;
  /** The matched line content. */
  line: string;
  /** Context lines before the match. */
  contextBefore: ContextLine[];
  /** Context lines after the match. */
  contextAfter: ContextLine[];
  /** Whether the line was truncated due to maxColumns. */
  truncated: boolean;
}

/** Result of searching in-memory content. */
export interface SearchResult {
  /** All matches found. */
  matches: SearchMatch[];
  /** Total number of matches (may exceed matches.length due to limit). */
  matchCount: number;
  /** Whether the limit was reached. */
  limitReached: boolean;
  /** Error message, if any. */
  error?: string;
}

/** Options for in-memory content search. */
export interface SearchOptions {
  /** Regex pattern to search for. */
  pattern: string;
  /** Case-insensitive matching. */
  ignoreCase?: boolean;
  /** Enable multiline regex mode. */
  multiline?: boolean;
  /** Maximum number of matches to return. */
  maxCount?: number;
  /** Lines of context before matches. */
  contextBefore?: number;
  /** Lines of context after matches. */
  contextAfter?: number;
  /** Truncate lines longer than this (characters). */
  maxColumns?: number;
}

/** A single match from filesystem search. */
export interface GrepMatch {
  /** File path (relative for directory searches). */
  path: string;
  /** 1-indexed line number. */
  lineNumber: number;
  /** The matched line content. */
  line: string;
  /** Context lines before the match. */
  contextBefore: ContextLine[];
  /** Context lines after the match. */
  contextAfter: ContextLine[];
  /** Whether the line was truncated. */
  truncated: boolean;
}

/** Result of a filesystem search. */
export interface GrepResult {
  /** All matches found. */
  matches: GrepMatch[];
  /** Total matches across all files. */
  totalMatches: number;
  /** Number of files with at least one match. */
  filesWithMatches: number;
  /** Number of files searched. */
  filesSearched: number;
  /** Whether the limit stopped the search early. */
  limitReached: boolean;
}

/** Options for filesystem search. */
export interface GrepOptions {
  /** Regex pattern to search for. */
  pattern: string;
  /** Directory or file to search. */
  path: string;
  /** Glob filter for filenames (e.g. "*.ts"). */
  glob?: string;
  /** Case-insensitive matching. */
  ignoreCase?: boolean;
  /** Enable multiline regex mode. */
  multiline?: boolean;
  /** Include hidden files (default: false). */
  hidden?: boolean;
  /** Respect .gitignore files (default: true). */
  gitignore?: boolean;
  /** Maximum number of matches to return. */
  maxCount?: number;
  /** Lines of context before matches. */
  contextBefore?: number;
  /** Lines of context after matches. */
  contextAfter?: number;
  /** Truncate lines longer than this (characters). */
  maxColumns?: number;
}
