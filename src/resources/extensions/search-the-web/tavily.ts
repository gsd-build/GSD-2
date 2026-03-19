/**
 * Tavily API types and helper functions for normalizing Tavily search results
 * into the shared SearchResultFormatted shape.
 *
 * Consumed by: tool-search.ts (S02), search_and_read Tavily path (S03).
 * All exports are pure functions with no side effects.
 */

import type { SearchResultFormatted } from "./format.js";

// =============================================================================
// Tavily API Types
// =============================================================================

/** A single result from the Tavily Search API. */
export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string | null;
  published_date?: string | null;
  favicon?: string | null;
}

/** Top-level response from POST https://api.tavily.com/search */
export interface TavilySearchResponse {
  query: string;
  answer?: string | null;
  results: TavilyResult[];
  response_time: string | number;
  usage?: { credits: number } | null;
  request_id?: string | null;
}

// =============================================================================
// Result Normalization
// =============================================================================

/**
 * Map a single Tavily result to the shared SearchResultFormatted shape.
 *
 * - `content` → `description` (Tavily puts NLP summary or chunks inline)
 * - `published_date` → `age` via publishedDateToAge()
 * - No `extra_snippets` — Tavily's content already includes chunk data
 */
export function normalizeTavilyResult(r: TavilyResult): SearchResultFormatted {
  return {
    title: r.title || "(untitled)",
    url: r.url,
    description: r.content || "",
    age: r.published_date ? publishedDateToAge(r.published_date) : undefined,
  };
}

// =============================================================================
// Date-to-Age Conversion
// =============================================================================

/**
 * Convert an ISO 8601 date string to a human-readable relative age string.
 *
 * Examples: "3 days ago", "2 hours ago", "1 month ago", "just now"
 * Returns undefined for unparseable dates or dates in the future.
 */
export function publishedDateToAge(isoDate: string): string | undefined {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return undefined;

  const now = Date.now();
  const diffMs = now - date.getTime();

  // Future dates — return undefined rather than negative ages
  if (diffMs < 0) return undefined;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;

  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

// =============================================================================
// Freshness Format Mapping
// =============================================================================

/** Brave freshness string → Tavily time_range value mapping. */
const BRAVE_TO_TAVILY_FRESHNESS: Record<string, string> = {
  pd: "day",
  pw: "week",
  pm: "month",
  py: "year",
};

/**
 * Convert a Brave-format freshness string (pd/pw/pm/py) to a Tavily
 * `time_range` value (day/week/month/year).
 *
 * Returns null if input is null or not a recognized Brave freshness value.
 */
export function mapFreshnessToTavily(braveFreshness: string | null): string | null {
  if (braveFreshness === null) return null;
  return BRAVE_TO_TAVILY_FRESHNESS[braveFreshness] ?? null;
}
