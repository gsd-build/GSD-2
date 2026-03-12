/**
 * Unit tests for Tavily helper functions and classifyError fix.
 *
 * Covers:
 * - normalizeTavilyResult: full result, minimal result, empty/untitled result
 * - publishedDateToAge: various time deltas, invalid input
 * - mapFreshnessToTavily: all 4 Brave values, null passthrough
 * - classifyError: 401/403 messages are provider-generic (no "BRAVE_API_KEY")
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeTavilyResult,
  publishedDateToAge,
  mapFreshnessToTavily,
  type TavilyResult,
} from "../resources/extensions/search-the-web/tavily.ts";

import {
  classifyError,
  HttpError,
} from "../resources/extensions/search-the-web/http.ts";

// ═══════════════════════════════════════════════════════════════════════════
// 1. normalizeTavilyResult
// ═══════════════════════════════════════════════════════════════════════════

test("normalizeTavilyResult maps a full Tavily result to SearchResultFormatted", () => {
  // Use a fixed date relative to "now" so the age string is deterministic
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const tavily: TavilyResult = {
    title: "TypeScript 5.8 Release Notes",
    url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-8/",
    content: "TypeScript 5.8 brings several new features including...",
    score: 0.92,
    raw_content: "Full page content here...",
    published_date: threeDaysAgo,
    favicon: "https://devblogs.microsoft.com/favicon.ico",
  };

  const result = normalizeTavilyResult(tavily);

  assert.equal(result.title, "TypeScript 5.8 Release Notes");
  assert.equal(result.url, "https://devblogs.microsoft.com/typescript/announcing-typescript-5-8/");
  assert.equal(result.description, "TypeScript 5.8 brings several new features including...");
  assert.equal(result.age, "3 days ago");
  assert.equal(result.extra_snippets, undefined, "Tavily results should not have extra_snippets");
});

test("normalizeTavilyResult handles minimal result (no published_date, no raw_content)", () => {
  const tavily: TavilyResult = {
    title: "Simple Result",
    url: "https://example.com/page",
    content: "A brief description of the page.",
    score: 0.75,
  };

  const result = normalizeTavilyResult(tavily);

  assert.equal(result.title, "Simple Result");
  assert.equal(result.url, "https://example.com/page");
  assert.equal(result.description, "A brief description of the page.");
  assert.equal(result.age, undefined, "No published_date → no age");
});

test("normalizeTavilyResult handles empty/untitled result", () => {
  const tavily: TavilyResult = {
    title: "",
    url: "https://example.com/untitled",
    content: "",
    score: 0.1,
  };

  const result = normalizeTavilyResult(tavily);

  assert.equal(result.title, "(untitled)", "Empty title falls back to (untitled)");
  assert.equal(result.description, "", "Empty content maps to empty description");
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. publishedDateToAge
// ═══════════════════════════════════════════════════════════════════════════

test("publishedDateToAge returns correct relative strings for various offsets", () => {
  const now = Date.now();

  // Seconds ago → "just now"
  const secondsAgo = new Date(now - 30 * 1000).toISOString();
  assert.equal(publishedDateToAge(secondsAgo), "just now");

  // Minutes ago
  const minutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(minutesAgo), "5 minutes ago");

  // 1 minute ago (singular)
  const oneMinAgo = new Date(now - 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(oneMinAgo), "1 minute ago");

  // Hours ago
  const hoursAgo = new Date(now - 7 * 60 * 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(hoursAgo), "7 hours ago");

  // 1 hour ago (singular)
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(oneHourAgo), "1 hour ago");

  // Days ago
  const daysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(daysAgo), "10 days ago");

  // 1 day ago (singular)
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(oneDayAgo), "1 day ago");

  // Months ago (35 days → 1 month)
  const monthsAgo = new Date(now - 65 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(monthsAgo), "2 months ago");

  // Years ago
  const yearsAgo = new Date(now - 400 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(yearsAgo), "1 year ago");
});

test("publishedDateToAge returns undefined for invalid date string", () => {
  assert.equal(publishedDateToAge("not-a-date"), undefined);
  assert.equal(publishedDateToAge(""), undefined);
  assert.equal(publishedDateToAge("2024-13-45T99:99:99Z"), undefined);
});

test("publishedDateToAge returns undefined for future dates", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  assert.equal(publishedDateToAge(future), undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. mapFreshnessToTavily
// ═══════════════════════════════════════════════════════════════════════════

test("mapFreshnessToTavily converts all 4 Brave freshness values", () => {
  assert.equal(mapFreshnessToTavily("pd"), "day");
  assert.equal(mapFreshnessToTavily("pw"), "week");
  assert.equal(mapFreshnessToTavily("pm"), "month");
  assert.equal(mapFreshnessToTavily("py"), "year");
});

test("mapFreshnessToTavily passes null through unchanged", () => {
  assert.equal(mapFreshnessToTavily(null), null);
});

test("mapFreshnessToTavily returns null for unrecognized values", () => {
  assert.equal(mapFreshnessToTavily("unknown"), null);
  assert.equal(mapFreshnessToTavily("day"), null, "Tavily format is not a valid input");
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. classifyError — provider-generic auth message
// ═══════════════════════════════════════════════════════════════════════════

test("classifyError for HttpError(401) does NOT contain BRAVE_API_KEY", () => {
  const err = new HttpError("Unauthorized", 401);
  const result = classifyError(err);

  assert.equal(result.kind, "auth_error");
  assert.ok(!result.message.includes("BRAVE_API_KEY"), `Auth error message should be provider-generic, got: "${result.message}"`);
  assert.ok(result.message.includes("secure_env_collect"), "Should mention secure_env_collect");
  assert.ok(result.message.includes("401"), "Should include status code");
});

test("classifyError for HttpError(403) does NOT contain BRAVE_API_KEY", () => {
  const err = new HttpError("Forbidden", 403);
  const result = classifyError(err);

  assert.equal(result.kind, "auth_error");
  assert.ok(!result.message.includes("BRAVE_API_KEY"), `Auth error message should be provider-generic, got: "${result.message}"`);
  assert.ok(result.message.includes("secure_env_collect"), "Should mention secure_env_collect");
  assert.ok(result.message.includes("403"), "Should include status code");
});
