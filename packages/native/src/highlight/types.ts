/** Theme colors for syntax highlighting as ANSI escape sequences. */
export interface HighlightColors {
  /** ANSI color for comments. */
  comment: string;
  /** ANSI color for keywords. */
  keyword: string;
  /** ANSI color for function names. */
  function: string;
  /** ANSI color for variables and identifiers. */
  variable: string;
  /** ANSI color for string literals. */
  string: string;
  /** ANSI color for numeric literals. */
  number: string;
  /** ANSI color for type identifiers. */
  type: string;
  /** ANSI color for operators. */
  operator: string;
  /** ANSI color for punctuation tokens. */
  punctuation: string;
  /** ANSI color for diff inserted lines. */
  inserted?: string;
  /** ANSI color for diff deleted lines. */
  deleted?: string;
}
