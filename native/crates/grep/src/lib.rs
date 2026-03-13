//! Ripgrep-backed search library for GSD.
//!
//! Provides two search modes:
//! - `search_content()`: search in-memory content (a byte slice).
//! - `search_path()`: search files on disk with glob/gitignore filtering.
//!
//! Built on the `grep-*` family of crates (the same internals as ripgrep).

use std::{
    fs::File,
    io::{self, Cursor, Read},
    path::PathBuf,
};

use grep_regex::RegexMatcherBuilder;
use grep_searcher::{
    BinaryDetection, Searcher, SearcherBuilder, Sink, SinkContext, SinkContextKind, SinkMatch,
};
use ignore::WalkBuilder;
use rayon::prelude::*;

/// Maximum file size to search (4 MiB). Files larger than this are skipped.
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;

// ── Public types ──────────────────────────────────────────────────────

/// A single match result.
#[derive(Debug, Clone)]
pub struct SearchMatch {
    /// 1-indexed line number.
    pub line_number: u64,
    /// The matched line content (trailing newline stripped).
    pub line: String,
    /// Context lines before the match.
    pub context_before: Vec<ContextLine>,
    /// Context lines after the match.
    pub context_after: Vec<ContextLine>,
    /// Whether the line was truncated due to `max_columns`.
    pub truncated: bool,
}

/// A context line adjacent to a match.
#[derive(Debug, Clone)]
pub struct ContextLine {
    pub line_number: u64,
    pub line: String,
}

/// Result of an in-memory content search.
#[derive(Debug, Clone)]
pub struct ContentSearchResult {
    pub matches: Vec<SearchMatch>,
    pub match_count: u64,
    pub limit_reached: bool,
}

/// A match from a filesystem search, including the file path.
#[derive(Debug, Clone)]
pub struct FileMatch {
    /// Relative path from the search root.
    pub path: String,
    pub line_number: u64,
    pub line: String,
    pub context_before: Vec<ContextLine>,
    pub context_after: Vec<ContextLine>,
    pub truncated: bool,
}

/// Result of a filesystem search.
#[derive(Debug, Clone)]
pub struct FileSearchResult {
    pub matches: Vec<FileMatch>,
    pub total_matches: u64,
    pub files_with_matches: u32,
    pub files_searched: u32,
    pub limit_reached: bool,
}

/// Options controlling search behavior.
#[derive(Debug, Clone, Default)]
pub struct SearchOptions {
    /// Regex pattern.
    pub pattern: String,
    /// Case-insensitive matching.
    pub ignore_case: bool,
    /// Enable multiline regex mode.
    pub multiline: bool,
    /// Maximum number of matches to collect.
    pub max_count: Option<u64>,
    /// Lines of context before each match.
    pub context_before: u32,
    /// Lines of context after each match.
    pub context_after: u32,
    /// Truncate lines longer than this many characters.
    pub max_columns: Option<usize>,
}

/// Options for filesystem search (extends `SearchOptions`).
#[derive(Debug, Clone, Default)]
pub struct GrepOptions {
    /// Regex pattern.
    pub pattern: String,
    /// Root directory or file to search.
    pub path: String,
    /// Glob filter for filenames (e.g. `"*.ts"`).
    pub glob: Option<String>,
    /// Case-insensitive matching.
    pub ignore_case: bool,
    /// Enable multiline regex mode.
    pub multiline: bool,
    /// Include hidden files (default: false).
    pub hidden: bool,
    /// Respect `.gitignore` files (default: true).
    pub gitignore: bool,
    /// Maximum number of matches to collect.
    pub max_count: Option<u64>,
    /// Lines of context before each match.
    pub context_before: u32,
    /// Lines of context after each match.
    pub context_after: u32,
    /// Truncate lines longer than this many characters.
    pub max_columns: Option<usize>,
}

// ── Internal collector ────────────────────────────────────────────────

struct MatchCollector {
    matches: Vec<SearchMatch>,
    match_count: u64,
    collected_count: u64,
    max_count: Option<u64>,
    limit_reached: bool,
    pending_context_before: Vec<ContextLine>,
    max_columns: Option<usize>,
}

impl MatchCollector {
    fn new(max_count: Option<u64>, max_columns: Option<usize>) -> Self {
        Self {
            matches: Vec::new(),
            match_count: 0,
            collected_count: 0,
            max_count,
            limit_reached: false,
            pending_context_before: Vec::new(),
            max_columns,
        }
    }

    fn truncate_line(&self, line: &str) -> (String, bool) {
        match self.max_columns {
            Some(max) if line.len() > max => {
                let cut = max.saturating_sub(3);
                // Find a valid char boundary
                let mut boundary = cut;
                while boundary > 0 && !line.is_char_boundary(boundary) {
                    boundary -= 1;
                }
                let truncated = format!("{}...", &line[..boundary]);
                (truncated, true)
            }
            _ => (line.to_string(), false),
        }
    }
}

fn bytes_to_trimmed_string(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.trim_end().to_string(),
        Err(_) => String::from_utf8_lossy(bytes).trim_end().to_string(),
    }
}

impl Sink for MatchCollector {
    type Error = io::Error;

    fn matched(
        &mut self,
        _searcher: &Searcher,
        mat: &SinkMatch<'_>,
    ) -> Result<bool, Self::Error> {
        self.match_count += 1;

        if self.limit_reached {
            return Ok(false);
        }

        let raw_line = bytes_to_trimmed_string(mat.bytes());
        let (line, truncated) = self.truncate_line(&raw_line);
        let line_number = mat.line_number().unwrap_or(0);

        self.matches.push(SearchMatch {
            line_number,
            line,
            context_before: std::mem::take(&mut self.pending_context_before),
            context_after: Vec::new(),
            truncated,
        });

        self.collected_count += 1;

        if let Some(max) = self.max_count {
            if self.collected_count >= max {
                self.limit_reached = true;
            }
        }

        Ok(true)
    }

    fn context(
        &mut self,
        _searcher: &Searcher,
        ctx: &SinkContext<'_>,
    ) -> Result<bool, Self::Error> {
        let raw_line = bytes_to_trimmed_string(ctx.bytes());
        let (line, _) = self.truncate_line(&raw_line);
        let line_number = ctx.line_number().unwrap_or(0);

        match ctx.kind() {
            SinkContextKind::Before => {
                self.pending_context_before.push(ContextLine { line_number, line });
            }
            SinkContextKind::After => {
                if let Some(last_match) = self.matches.last_mut() {
                    last_match.context_after.push(ContextLine { line_number, line });
                }
            }
            SinkContextKind::Other => {}
        }

        Ok(true)
    }
}

// ── Core search functions ─────────────────────────────────────────────

fn build_matcher(
    pattern: &str,
    ignore_case: bool,
    multiline: bool,
) -> Result<grep_regex::RegexMatcher, String> {
    RegexMatcherBuilder::new()
        .case_insensitive(ignore_case)
        .multi_line(multiline)
        .build(pattern)
        .map_err(|err| format!("Regex error: {err}"))
}

fn build_searcher(before_context: u32, after_context: u32) -> Searcher {
    SearcherBuilder::new()
        .binary_detection(BinaryDetection::quit(b'\x00'))
        .line_number(true)
        .before_context(before_context as usize)
        .after_context(after_context as usize)
        .build()
}

fn search_reader<R: Read>(
    matcher: &grep_regex::RegexMatcher,
    reader: R,
    max_count: Option<u64>,
    before_context: u32,
    after_context: u32,
    max_columns: Option<usize>,
) -> io::Result<(Vec<SearchMatch>, u64, bool)> {
    let mut searcher = build_searcher(before_context, after_context);
    let mut collector = MatchCollector::new(max_count, max_columns);
    searcher.search_reader(matcher, reader, &mut collector)?;
    Ok((collector.matches, collector.match_count, collector.limit_reached))
}

/// Search in-memory content for a regex pattern.
pub fn search_content(content: &[u8], options: &SearchOptions) -> Result<ContentSearchResult, String> {
    let matcher = build_matcher(&options.pattern, options.ignore_case, options.multiline)?;
    let (matches, match_count, limit_reached) = search_reader(
        &matcher,
        Cursor::new(content),
        options.max_count,
        options.context_before,
        options.context_after,
        options.max_columns,
    )
    .map_err(|e| e.to_string())?;

    Ok(ContentSearchResult {
        matches,
        match_count,
        limit_reached,
    })
}

/// Search files on disk for a regex pattern.
///
/// Walks the directory tree respecting `.gitignore` rules and optional glob filters.
/// Uses rayon for parallel file searching.
pub fn search_path(options: &GrepOptions) -> Result<FileSearchResult, String> {
    let search_root = PathBuf::from(&options.path);
    if !search_root.exists() {
        return Err(format!("Path not found: {}", options.path));
    }

    let matcher = build_matcher(&options.pattern, options.ignore_case, options.multiline)?;

    // Single file search
    if search_root.is_file() {
        let file = File::open(&search_root).map_err(|e| e.to_string())?;
        let reader = file.take(MAX_FILE_BYTES);
        let (matches, match_count, limit_reached) = search_reader(
            &matcher,
            reader,
            options.max_count,
            options.context_before,
            options.context_after,
            options.max_columns,
        )
        .map_err(|e| e.to_string())?;

        let path_str = search_root.to_string_lossy().into_owned();
        let file_matches: Vec<FileMatch> = matches
            .into_iter()
            .map(|m| FileMatch {
                path: path_str.clone(),
                line_number: m.line_number,
                line: m.line,
                context_before: m.context_before,
                context_after: m.context_after,
                truncated: m.truncated,
            })
            .collect();

        let has_matches = !file_matches.is_empty();
        return Ok(FileSearchResult {
            matches: file_matches,
            total_matches: match_count,
            files_with_matches: if has_matches { 1 } else { 0 },
            files_searched: 1,
            limit_reached,
        });
    }

    // Directory search — collect files using ignore crate's WalkBuilder
    let mut walk_builder = WalkBuilder::new(&search_root);
    walk_builder
        .hidden(!options.hidden)
        .git_ignore(options.gitignore)
        .git_global(options.gitignore)
        .git_exclude(options.gitignore);

    if let Some(ref glob_pattern) = options.glob {
        walk_builder.add_custom_ignore_filename("");
        let mut overrides = ignore::overrides::OverrideBuilder::new(&search_root);
        overrides
            .add(glob_pattern)
            .map_err(|e| format!("Invalid glob: {e}"))?;
        let built = overrides.build().map_err(|e| format!("Glob build error: {e}"))?;
        walk_builder.overrides(built);
    }

    let entries: Vec<PathBuf> = walk_builder
        .build()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().map_or(false, |ft| ft.is_file()))
        .map(|entry| entry.into_path())
        .collect();

    let files_searched = entries.len() as u32;

    // Parallel search across all files
    struct PerFileResult {
        relative_path: String,
        matches: Vec<SearchMatch>,
        match_count: u64,
    }

    let root_path = search_root.clone();
    let mut results: Vec<PerFileResult> = entries
        .par_iter()
        .filter_map(|file_path| {
            let file = File::open(file_path).ok()?;
            let reader = file.take(MAX_FILE_BYTES);
            let (matches, match_count, _) = search_reader(
                &matcher,
                reader,
                None, // no per-file limit in parallel mode
                options.context_before,
                options.context_after,
                options.max_columns,
            )
            .ok()?;

            if match_count == 0 {
                return None;
            }

            let relative = file_path
                .strip_prefix(&root_path)
                .unwrap_or(file_path)
                .to_string_lossy()
                .into_owned();

            Some(PerFileResult {
                relative_path: relative,
                matches,
                match_count,
            })
        })
        .collect();

    results.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    // Aggregate results, applying global max_count
    let mut all_matches = Vec::new();
    let mut total_matches = 0u64;
    let mut files_with_matches = 0u32;
    let mut limit_reached = false;

    for result in results {
        files_with_matches += 1;
        total_matches = total_matches.saturating_add(result.match_count);

        for m in result.matches {
            if let Some(max) = options.max_count {
                if all_matches.len() as u64 >= max {
                    limit_reached = true;
                    break;
                }
            }
            all_matches.push(FileMatch {
                path: result.relative_path.clone(),
                line_number: m.line_number,
                line: m.line,
                context_before: m.context_before,
                context_after: m.context_after,
                truncated: m.truncated,
            });
        }

        if limit_reached {
            break;
        }
    }

    Ok(FileSearchResult {
        matches: all_matches,
        total_matches,
        files_with_matches,
        files_searched,
        limit_reached,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_content_basic() {
        let content = b"hello world\nfoo bar\nhello rust\n";
        let options = SearchOptions {
            pattern: "hello".to_string(),
            ..Default::default()
        };
        let result = search_content(content, &options).unwrap();
        assert_eq!(result.match_count, 2);
        assert_eq!(result.matches.len(), 2);
        assert_eq!(result.matches[0].line, "hello world");
        assert_eq!(result.matches[0].line_number, 1);
        assert_eq!(result.matches[1].line, "hello rust");
        assert_eq!(result.matches[1].line_number, 3);
    }

    #[test]
    fn search_content_case_insensitive() {
        let content = b"Hello World\nhello world\n";
        let options = SearchOptions {
            pattern: "hello".to_string(),
            ignore_case: true,
            ..Default::default()
        };
        let result = search_content(content, &options).unwrap();
        assert_eq!(result.match_count, 2);
    }

    #[test]
    fn search_content_max_count() {
        let content = b"aaa\naaa\naaa\naaa\n";
        let options = SearchOptions {
            pattern: "aaa".to_string(),
            max_count: Some(2),
            ..Default::default()
        };
        let result = search_content(content, &options).unwrap();
        assert_eq!(result.matches.len(), 2);
        assert!(result.limit_reached);
    }

    #[test]
    fn search_content_with_context() {
        let content = b"line1\nline2\nmatch_here\nline4\nline5\n";
        let options = SearchOptions {
            pattern: "match_here".to_string(),
            context_before: 1,
            context_after: 1,
            ..Default::default()
        };
        let result = search_content(content, &options).unwrap();
        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.matches[0].context_before.len(), 1);
        assert_eq!(result.matches[0].context_before[0].line, "line2");
        assert_eq!(result.matches[0].context_after.len(), 1);
        assert_eq!(result.matches[0].context_after[0].line, "line4");
    }

    #[test]
    fn search_content_truncation() {
        let content = b"this is a very long line that should be truncated\n";
        let options = SearchOptions {
            pattern: "long".to_string(),
            max_columns: Some(20),
            ..Default::default()
        };
        let result = search_content(content, &options).unwrap();
        assert_eq!(result.matches.len(), 1);
        assert!(result.matches[0].truncated);
        assert!(result.matches[0].line.ends_with("..."));
    }

    #[test]
    fn search_content_invalid_regex() {
        let content = b"hello";
        let options = SearchOptions {
            pattern: "[invalid".to_string(),
            ..Default::default()
        };
        let result = search_content(content, &options);
        assert!(result.is_err());
    }
}
