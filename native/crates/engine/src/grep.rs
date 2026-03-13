//! N-API bindings for the grep module.
//!
//! Wraps `gsd_grep` functions and exposes them as JS-callable N-API exports.

use napi::bindgen_prelude::*;
use napi_derive::napi;

// ── N-API types (mirroring gsd_grep types for the JS boundary) ────────

#[napi(object)]
pub struct NapiContextLine {
    #[napi(js_name = "lineNumber")]
    pub line_number: u32,
    pub line: String,
}

#[napi(object)]
pub struct NapiSearchMatch {
    #[napi(js_name = "lineNumber")]
    pub line_number: u32,
    pub line: String,
    #[napi(js_name = "contextBefore")]
    pub context_before: Vec<NapiContextLine>,
    #[napi(js_name = "contextAfter")]
    pub context_after: Vec<NapiContextLine>,
    pub truncated: bool,
}

#[napi(object)]
pub struct NapiSearchResult {
    pub matches: Vec<NapiSearchMatch>,
    #[napi(js_name = "matchCount")]
    pub match_count: u32,
    #[napi(js_name = "limitReached")]
    pub limit_reached: bool,
    pub error: Option<String>,
}

#[napi(object)]
pub struct NapiSearchOptions {
    pub pattern: String,
    #[napi(js_name = "ignoreCase")]
    pub ignore_case: Option<bool>,
    pub multiline: Option<bool>,
    #[napi(js_name = "maxCount")]
    pub max_count: Option<u32>,
    #[napi(js_name = "contextBefore")]
    pub context_before: Option<u32>,
    #[napi(js_name = "contextAfter")]
    pub context_after: Option<u32>,
    #[napi(js_name = "maxColumns")]
    pub max_columns: Option<u32>,
}

#[napi(object)]
pub struct NapiGrepMatch {
    pub path: String,
    #[napi(js_name = "lineNumber")]
    pub line_number: u32,
    pub line: String,
    #[napi(js_name = "contextBefore")]
    pub context_before: Vec<NapiContextLine>,
    #[napi(js_name = "contextAfter")]
    pub context_after: Vec<NapiContextLine>,
    pub truncated: bool,
}

#[napi(object)]
pub struct NapiGrepResult {
    pub matches: Vec<NapiGrepMatch>,
    #[napi(js_name = "totalMatches")]
    pub total_matches: u32,
    #[napi(js_name = "filesWithMatches")]
    pub files_with_matches: u32,
    #[napi(js_name = "filesSearched")]
    pub files_searched: u32,
    #[napi(js_name = "limitReached")]
    pub limit_reached: bool,
}

#[napi(object)]
pub struct NapiGrepOptions {
    pub pattern: String,
    pub path: String,
    pub glob: Option<String>,
    #[napi(js_name = "ignoreCase")]
    pub ignore_case: Option<bool>,
    pub multiline: Option<bool>,
    pub hidden: Option<bool>,
    pub gitignore: Option<bool>,
    #[napi(js_name = "maxCount")]
    pub max_count: Option<u32>,
    #[napi(js_name = "contextBefore")]
    pub context_before: Option<u32>,
    #[napi(js_name = "contextAfter")]
    pub context_after: Option<u32>,
    #[napi(js_name = "maxColumns")]
    pub max_columns: Option<u32>,
}

// ── Conversion helpers ────────────────────────────────────────────────

fn clamp_u32(value: u64) -> u32 {
    value.min(u32::MAX as u64) as u32
}

fn convert_context_line(cl: gsd_grep::ContextLine) -> NapiContextLine {
    NapiContextLine {
        line_number: clamp_u32(cl.line_number),
        line: cl.line,
    }
}

fn convert_search_match(m: gsd_grep::SearchMatch) -> NapiSearchMatch {
    NapiSearchMatch {
        line_number: clamp_u32(m.line_number),
        line: m.line,
        context_before: m.context_before.into_iter().map(convert_context_line).collect(),
        context_after: m.context_after.into_iter().map(convert_context_line).collect(),
        truncated: m.truncated,
    }
}

fn convert_file_match(m: gsd_grep::FileMatch) -> NapiGrepMatch {
    NapiGrepMatch {
        path: m.path,
        line_number: clamp_u32(m.line_number),
        line: m.line,
        context_before: m.context_before.into_iter().map(convert_context_line).collect(),
        context_after: m.context_after.into_iter().map(convert_context_line).collect(),
        truncated: m.truncated,
    }
}

// ── Exported N-API functions ──────────────────────────────────────────

/// Search in-memory content for a regex pattern.
///
/// Accepts a Buffer/Uint8Array or a string. Returns matches with line numbers
/// and optional context lines.
#[napi(js_name = "search")]
pub fn search(content: Buffer, options: NapiSearchOptions) -> NapiSearchResult {
    let opts = gsd_grep::SearchOptions {
        pattern: options.pattern,
        ignore_case: options.ignore_case.unwrap_or(false),
        multiline: options.multiline.unwrap_or(false),
        max_count: options.max_count.map(u64::from),
        context_before: options.context_before.unwrap_or(0),
        context_after: options.context_after.unwrap_or(0),
        max_columns: options.max_columns.map(|v| v as usize),
    };

    match gsd_grep::search_content(content.as_ref(), &opts) {
        Ok(result) => NapiSearchResult {
            matches: result.matches.into_iter().map(convert_search_match).collect(),
            match_count: clamp_u32(result.match_count),
            limit_reached: result.limit_reached,
            error: None,
        },
        Err(err) => NapiSearchResult {
            matches: Vec::new(),
            match_count: 0,
            limit_reached: false,
            error: Some(err),
        },
    }
}

/// Search files on disk for a regex pattern.
///
/// Walks the directory tree respecting `.gitignore` and optional glob filters.
/// Returns matches with file paths, line numbers, and optional context.
#[napi(js_name = "grep")]
pub fn grep(options: NapiGrepOptions) -> Result<NapiGrepResult> {
    let opts = gsd_grep::GrepOptions {
        pattern: options.pattern,
        path: options.path,
        glob: options.glob,
        ignore_case: options.ignore_case.unwrap_or(false),
        multiline: options.multiline.unwrap_or(false),
        hidden: options.hidden.unwrap_or(false),
        gitignore: options.gitignore.unwrap_or(true),
        max_count: options.max_count.map(u64::from),
        context_before: options.context_before.unwrap_or(0),
        context_after: options.context_after.unwrap_or(0),
        max_columns: options.max_columns.map(|v| v as usize),
    };

    match gsd_grep::search_path(&opts) {
        Ok(result) => Ok(NapiGrepResult {
            matches: result.matches.into_iter().map(convert_file_match).collect(),
            total_matches: clamp_u32(result.total_matches),
            files_with_matches: result.files_with_matches,
            files_searched: result.files_searched,
            limit_reached: result.limit_reached,
        }),
        Err(err) => Err(Error::from_reason(err)),
    }
}
