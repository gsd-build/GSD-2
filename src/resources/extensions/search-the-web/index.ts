/**
 * Web Search Extension v3
 *
 * Provides three tools for grounding the agent in real-world web content:
 *
 *   search-the-web   — Rich web search with extra snippets, freshness filtering,
 *                      domain scoping, AI summarizer, and compact output format.
 *                      Returns links and snippets for selective browsing.
 *
 *   fetch_page       — Extract clean markdown from any URL via Jina Reader.
 *                      Supports offset-based continuation, CSS selector targeting,
 *                      and content-type-aware extraction.
 *
 *   search_and_read  — Single-call search + content extraction via Brave LLM Context API.
 *                      Returns pre-extracted, relevance-scored page content.
 *                      Best when you need content, not just links.
 *
 * v3 improvements over v2:
 * - search_and_read: New tool — Brave LLM Context API (search + read in one call)
 * - Structured error taxonomy: auth_error, rate_limited, network_error, etc.
 * - Spellcheck surfacing: query corrections from Brave shown to agent
 * - Latency tracking: API call timing in details for observability
 * - Rate limit info: remaining quota surfaced when available
 * - more_results_available: pagination hints from Brave
 * - Adaptive snippet budget: snippet count adapts to result count
 * - fetch_page offset: continuation reading for long pages
 * - fetch_page selector: CSS selector targeting via Jina X-Target-Selector
 * - fetch_page diagnostics: Jina failure reasons surfaced in details
 * - Content-type awareness: JSON passthrough, PDF detection
 * - Cache timer cleanup: purge timers use unref() to not block process exit
 *
 * Environment variables:
 *   BRAVE_API_KEY  — Required for search. Get one at brave.com/search/api
 *   JINA_API_KEY   — Optional. Higher rate limits for page extraction.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSearchTool } from "./tool-search";
import { registerFetchPageTool } from "./tool-fetch-page";
import { registerLLMContextTool } from "./tool-llm-context";
import { registerSearchProviderCommand } from "./command-search-provider.ts";

export default function (pi: ExtensionAPI) {
  // Register all tools
  registerSearchTool(pi);
  registerFetchPageTool(pi);
  registerLLMContextTool(pi);

  // Register slash commands
  registerSearchProviderCommand(pi);

  // Startup diagnostics
  pi.on("session_start", async (_event, ctx) => {
    const hasBrave = !!process.env.BRAVE_API_KEY;
    const hasTavily = !!process.env.TAVILY_API_KEY;
    const hasJina = !!process.env.JINA_API_KEY;
    const hasAnswers = !!process.env.BRAVE_ANSWERS_KEY;

    if (!hasBrave && !hasTavily) {
      ctx.ui.notify(
        "Web search: Set BRAVE_API_KEY or TAVILY_API_KEY for web search capability",
        "warning"
      );
    }

    const parts: string[] = ["Web search v3"];
    if (hasTavily) parts.push("Tavily ✓");
    if (hasBrave) parts.push("Search ✓");
    if (hasAnswers) parts.push("Answers ✓");
    if (hasJina) parts.push("Jina ✓");

    ctx.ui.notify(parts.join(" · "), "info");
  });
}
