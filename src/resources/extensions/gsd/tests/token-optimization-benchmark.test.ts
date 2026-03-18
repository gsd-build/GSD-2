/**
 * Token Optimization Benchmark -- measures actual savings from all modules
 * using realistic GSD prompt content.
 *
 * This test validates that the optimization suite achieves its documented
 * savings targets and reports precise metrics.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatDecisionsCompact,
  formatRequirementsCompact,
  measureSavings,
} from "../structured-data-formatter.js";
import { compressPrompt, compressToTarget } from "../prompt-compressor.js";
import { chunkByRelevance } from "../semantic-chunker.js";
import { distillSummaries } from "../summary-distiller.js";
import {
  optimizeForCaching,
  section,
  estimateCacheSavings,
} from "../prompt-cache-optimizer.js";
import {
  estimateTokensForProvider,
  getCharsPerToken,
} from "../token-counter.js";
import { computeBudgets } from "../context-budget.js";

// ---------------------------------------------------------------------------
// Fixture: Decisions (8 entries with 200-400 chars each)
// ---------------------------------------------------------------------------

function buildDecisions() {
  return [
    {
      id: "D001",
      when_context: "M001/S01",
      scope: "architecture",
      decision:
        "Select a database engine for artifact storage that supports embedded operation without requiring a separate server process, while providing ACID guarantees and WAL mode for concurrent reads during background indexing operations",
      choice:
        "SQLite with WAL mode enabled and PRAGMA journal_mode=WAL; connection pool size of 1 writer + 4 readers to prevent lock contention while maximizing read throughput",
      rationale:
        "Eliminates external dependency on PostgreSQL or MySQL server, reducing deployment complexity. SQLite WAL mode provides concurrent read access during writes, which is critical for background indexing while the user interacts with the system",
      revisable: "no",
    },
    {
      id: "D002",
      when_context: "M001/S02",
      scope: "testing",
      decision:
        "Establish the testing framework and assertion library for all unit and integration tests across the project, ensuring compatibility with TypeScript and ESM module resolution",
      choice:
        "Use node:test as the primary test runner with node:assert/strict for assertions; avoid Jest due to ESM compatibility issues and excessive configuration overhead for TypeScript projects",
      rationale:
        "Built-in Node.js test runner requires zero external dependencies, supports TypeScript via --experimental-strip-types, and produces TAP output compatible with CI systems. This reduces package install time by ~15 seconds",
      revisable: "yes",
    },
    {
      id: "D003",
      when_context: "M001/S03",
      scope: "observability",
      decision:
        "Define the observability strategy for tracking token usage, cache hit rates, and prompt compression efficiency across all provider integrations in the dispatch pipeline",
      choice:
        "Structured JSON logging with JSONL format to stderr; metrics collected in-memory with periodic flush to SQLite metrics table; no external APM dependency required for core functionality",
      rationale:
        "JSONL format enables easy parsing by external tools (jq, Datadog agent) without coupling the core system to any specific observability vendor. In-memory accumulation prevents I/O bottlenecks during rapid dispatch cycles",
      revisable: "yes",
    },
    {
      id: "D004",
      when_context: "M001/S04",
      scope: "security",
      decision:
        "Implement access control for environment variable injection into executor prompts, preventing accidental exposure of secrets like API keys, database credentials, and signing tokens",
      choice:
        "Allowlist-based environment variable filter with pattern matching; only variables matching GSD_*, NODE_ENV, and explicitly configured patterns are passed to executor prompts; all others are redacted",
      rationale:
        "Allowlist approach is safer than denylist because new environment variables are blocked by default. Pattern matching allows project-specific overrides via preferences without modifying core code",
      revisable: "no",
    },
    {
      id: "D005",
      when_context: "M002/S01",
      scope: "performance",
      decision:
        "Optimize prompt assembly latency for the dispatch pipeline to ensure sub-100ms total preparation time including context gathering, compression, and template rendering",
      choice:
        "Lazy evaluation with memoized context sections; compress only when content exceeds budget threshold; cache compiled templates in memory across dispatch cycles within the same session",
      rationale:
        "Profiling showed that eager compression of all sections added 40ms overhead even when total content was within budget. Lazy evaluation skips unnecessary work in the common case where context fits without compression",
      revisable: "yes",
    },
    {
      id: "D006",
      when_context: "M002/S02",
      scope: "architecture",
      decision:
        "Design the plugin system architecture to support third-party extensions for custom skill definitions, prompt templates, and model routing rules without modifying core GSD code",
      choice:
        "File-based plugin discovery with JSON manifest validation; plugins loaded from .gsd/plugins/ directory with sandboxed execution context; no dynamic require() or eval() permitted",
      rationale:
        "File-based discovery avoids npm registry dependency for plugin distribution. Sandboxed execution prevents plugins from modifying core state or accessing the file system outside their declared scope",
      revisable: "yes",
    },
    {
      id: "D007",
      when_context: "M002/S03",
      scope: "testing",
      decision:
        "Establish integration test patterns for verifying end-to-end dispatch flows including context gathering, prompt assembly, provider API calls, and response processing",
      choice:
        "Recorded HTTP fixtures with deterministic replay; test harness intercepts provider API calls and returns pre-recorded responses; fixture files stored alongside test files in tests/fixtures/ directory",
      rationale:
        "Recorded fixtures eliminate flaky tests caused by network issues or API rate limits. Deterministic replay ensures tests produce identical results across environments and CI runs",
      revisable: "yes",
    },
    {
      id: "D008",
      when_context: "M002/S04",
      scope: "observability",
      decision:
        "Implement cost tracking and projection for token usage across multiple providers, enabling budget alerts and automated throttling when spending approaches configured limits",
      choice:
        "Per-request cost calculation using model cost table with provider-specific pricing; rolling 24-hour window for budget tracking; configurable alert thresholds at 50%, 75%, and 90% of daily budget",
      rationale:
        "Rolling window prevents budget resets at midnight from causing spending spikes. Per-request calculation ensures accurate cost attribution even when switching between models mid-session",
      revisable: "no",
    },
  ];
}

// ---------------------------------------------------------------------------
// Fixture: Requirements (6 entries with 300-500 chars each)
// ---------------------------------------------------------------------------

function buildRequirements() {
  return [
    {
      id: "R001",
      class: "non-functional",
      status: "active",
      description:
        "Response latency for prompt assembly must remain below 100ms at the 99th percentile under normal operating conditions with up to 200K tokens of context window utilization",
      why: "Users experience noticeable delay when prompt assembly exceeds 100ms, compounding with network latency to the provider API. Sub-100ms assembly ensures total round-trip time stays under 2 seconds for interactive workflows",
      primary_owner: "S01",
      validation:
        "Benchmark test measures P99 assembly latency across 1000 iterations with realistic context sizes. Alert triggers if P99 exceeds 80ms to provide early warning before the 100ms threshold is breached",
    },
    {
      id: "R002",
      class: "functional",
      status: "active",
      description:
        "Token optimization pipeline must achieve at least 30% character savings on structured data (decisions, requirements) when using compact format versus standard markdown table format",
      why: "Context window capacity is the primary constraint for complex multi-task dispatches. A 30% savings on structured data frees approximately 15K characters for additional code context or dependency summaries",
      primary_owner: "S02",
      validation:
        "End-to-end benchmark test with realistic decision and requirement fixtures validates savings percentage. Test fails if any optimization module falls below its documented savings target",
    },
    {
      id: "R003",
      class: "constraint",
      status: "active",
      description:
        "All prompt compression transformations must be deterministic: identical input must always produce identical output regardless of execution environment, timing, or system state",
      why: "Non-deterministic compression would break prompt caching strategies that rely on prefix stability. Anthropic cache hits require exact prefix matches, so any variation in compressed output wastes cache credits",
      primary_owner: "S03",
      validation:
        "Property-based test generates 500 random inputs and verifies that compressing each input twice produces byte-identical output. Additional test verifies cross-platform consistency",
    },
    {
      id: "R004",
      class: "non-functional",
      status: "active",
      description:
        "Semantic chunking must select relevant code sections with at least 80% precision: selected chunks should contain query-relevant content, and the total selected content should be less than 60% of the original",
      why: "Including irrelevant code sections wastes context budget and can confuse the executor model with unrelated implementation details. Precision above 80% ensures the context is focused and actionable",
      primary_owner: "S04",
      validation:
        "Benchmark test with annotated code fixtures measures precision and recall of chunk selection. Query terms are chosen to target specific functions, and chunk scores are validated against expected relevance ordering",
    },
    {
      id: "R005",
      class: "functional",
      status: "active",
      description:
        "Summary distillation must preserve all structured metadata fields (provides, requires, key_files, key_decisions) while achieving at least 40% size reduction from full SUMMARY.md content",
      why: "Dependency summaries are injected into every task dispatch prompt. Reducing their size by 40% while preserving structured fields saves approximately 3-5K characters per dispatch across 3-4 dependency summaries",
      primary_owner: "S05",
      validation:
        "Benchmark test creates realistic SUMMARY.md fixtures with full YAML frontmatter and prose sections. Distilled output is verified to contain all structured fields and meet the 40% savings target",
    },
    {
      id: "R006",
      class: "non-functional",
      status: "active",
      description:
        "Cache optimization must achieve at least 60% cacheable prefix ratio by correctly classifying prompt sections as static, semi-static, or dynamic and ordering them for maximum cache hit potential",
      why: "Anthropic charges 90% less for cached tokens. A 60% cacheable prefix with 90% cache discount yields approximately 54% cost savings on input tokens, which dominate the total cost for long-context prompts",
      primary_owner: "S01",
      validation:
        "Benchmark test constructs a realistic prompt with system instructions, templates, slice context, and task-specific content. Cache optimizer output is verified to have cacheable prefix above 60% threshold",
    },
  ];
}

// ---------------------------------------------------------------------------
// Fixture: Markdown table format for decisions (baseline)
// ---------------------------------------------------------------------------

function formatDecisionsAsMarkdownTable(
  decisions: ReturnType<typeof buildDecisions>,
): string {
  // Simulate a padded markdown table (typical of human-authored or tool-generated tables)
  const lines: string[] = [
    "# Decisions Register",
    "",
    "<!-- Append-only. Never edit or remove existing rows. -->",
    "",
    "| #      | When Context   | Scope           | Decision                                                                                                                                                       | Choice                                                                                                                                                       | Rationale                                                                                                                                                    | Revisable? |",
    "|--------|----------------|-----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|",
  ];
  for (const d of decisions) {
    lines.push(
      `| ${d.id.padEnd(6)} | ${d.when_context.padEnd(14)} | ${d.scope.padEnd(15)} | ${d.decision.padEnd(160)} | ${d.choice.padEnd(160)} | ${d.rationale.padEnd(160)} | ${d.revisable.padEnd(10)} |`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Fixture: Markdown format for requirements (baseline)
// ---------------------------------------------------------------------------

function formatRequirementsAsMarkdown(
  requirements: ReturnType<typeof buildRequirements>,
): string {
  const lines: string[] = ["# Requirements", "", "## Active", ""];
  for (const r of requirements) {
    lines.push(`### ${r.id} -- ${r.description}`);
    lines.push("");
    lines.push(`- Class: ${r.class}`);
    lines.push(`- Status: ${r.status}`);
    lines.push(`- Why it matters: ${r.why}`);
    lines.push(`- Primary owning slice: ${r.primary_owner}`);
    lines.push(`- Validation: ${r.validation}`);
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Fixture: Realistic TypeScript code file (200+ lines, 8+ functions)
// ---------------------------------------------------------------------------

const SAMPLE_CODE = `import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";

// ---- Types ----

interface Config {
  basePath: string;
  maxRetries: number;
  timeout: number;
  logLevel: "debug" | "info" | "warn" | "error";
  database: {
    host: string;
    port: number;
    name: string;
    poolSize: number;
  };
}

interface User {
  id: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  createdAt: Date;
  lastLogin: Date | null;
}

interface AuthToken {
  token: string;
  userId: string;
  expiresAt: Date;
  scopes: string[];
}

interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  context: Record<string, unknown>;
}

interface DatabaseConnection {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
  execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number }>;
  close(): Promise<void>;
}

// ---- Config Module ----

export function loadConfig(path: string): Config {
  if (!existsSync(path)) {
    throw new Error(\`Config file not found: \${path}\`);
  }
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw);
  return validateConfig(parsed);
}

export function validateConfig(config: unknown): Config {
  if (typeof config !== "object" || config === null) {
    throw new Error("Config must be a non-null object");
  }
  const c = config as Record<string, unknown>;
  if (typeof c.basePath !== "string" || !c.basePath) {
    throw new Error("Config.basePath must be a non-empty string");
  }
  if (typeof c.maxRetries !== "number" || c.maxRetries < 0) {
    throw new Error("Config.maxRetries must be a non-negative number");
  }
  if (typeof c.timeout !== "number" || c.timeout <= 0) {
    throw new Error("Config.timeout must be a positive number");
  }
  return c as unknown as Config;
}

export function mergeConfigs(base: Config, overrides: Partial<Config>): Config {
  return {
    ...base,
    ...overrides,
    database: {
      ...base.database,
      ...(overrides.database ?? {}),
    },
  };
}

// ---- Database Module ----

export async function connectDatabase(config: Config): Promise<DatabaseConnection> {
  const db = config.database;
  const connectionString = \`\${db.host}:\${db.port}/\${db.name}\`;
  let connected = false;
  let attempts = 0;

  while (!connected && attempts < config.maxRetries) {
    try {
      attempts++;
      // Simulated connection logic
      connected = true;
    } catch (err) {
      if (attempts >= config.maxRetries) {
        throw new Error(\`Failed to connect to \${connectionString} after \${attempts} attempts\`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
    }
  }

  return {
    async query(sql: string, params?: unknown[]): Promise<unknown[]> {
      return [];
    },
    async execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number }> {
      return { affectedRows: 0 };
    },
    async close(): Promise<void> {
      connected = false;
    },
  };
}

export async function runMigrations(db: DatabaseConnection, migrationsDir: string): Promise<number> {
  const files = existsSync(migrationsDir) ? [] : [];
  let applied = 0;
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    await db.execute(sql);
    applied++;
  }
  return applied;
}

// ---- Auth Module ----

export function hashPassword(password: string, salt: string): string {
  return createHash("sha256")
    .update(password + salt)
    .digest("hex");
}

export function generateAuthToken(user: User, scopes: string[]): AuthToken {
  const token = createHash("sha256")
    .update(user.id + Date.now().toString() + Math.random().toString())
    .digest("hex");

  return {
    token,
    userId: user.id,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    scopes,
  };
}

export function validateAuthToken(token: AuthToken): boolean {
  if (!token.token || token.token.length < 32) return false;
  if (new Date() > token.expiresAt) return false;
  if (!token.scopes || token.scopes.length === 0) return false;
  return true;
}

export function checkPermission(user: User, requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
  };
  const userLevel = roleHierarchy[user.role] ?? 0;
  const requiredLevel = roleHierarchy[requiredRole] ?? 999;
  return userLevel >= requiredLevel;
}

// ---- Logging Module ----

export function createLogger(config: Config) {
  const levels: Record<string, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  const minLevel = levels[config.logLevel] ?? 1;

  return {
    log(level: string, message: string, context: Record<string, unknown> = {}): void {
      if ((levels[level] ?? 0) < minLevel) return;
      const entry: LogEntry = {
        timestamp: new Date(),
        level,
        message,
        context,
      };
      console.error(JSON.stringify(entry));
    },
    debug(message: string, context?: Record<string, unknown>): void {
      this.log("debug", message, context);
    },
    info(message: string, context?: Record<string, unknown>): void {
      this.log("info", message, context);
    },
    warn(message: string, context?: Record<string, unknown>): void {
      this.log("warn", message, context);
    },
    error(message: string, context?: Record<string, unknown>): void {
      this.log("error", message, context);
    },
  };
}

// ---- Formatting Module ----

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return ms + "ms";
  if (ms < 60_000) return (ms / 1000).toFixed(1) + "s";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return minutes + "m " + seconds + "s";
}

export function truncateString(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

// ---- Parsing Module ----

export function parseKeyValuePairs(input: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = input.split("\\n");
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && value) {
        result.set(key, value);
      }
    }
  }
  return result;
}

export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ---- Utility Module ----

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

export function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = async () => {
      try {
        attempts++;
        const result = await fn();
        resolve(result);
      } catch (err) {
        if (attempts >= maxAttempts) {
          reject(err);
        } else {
          setTimeout(attempt, delayMs);
        }
      }
    };
    attempt();
  });
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}
`;

// ---------------------------------------------------------------------------
// Fixture: Realistic SUMMARY.md contents (4 entries, 800-1200 chars each)
// ---------------------------------------------------------------------------

function buildSummaries(): string[] {
  return [
    `---
id: S01
provides:
  - database-schema
  - migration-engine
  - connection-pool
requires: []
key_files:
  - src/db/schema.ts
  - src/db/migrations/001-init.sql
  - src/db/connection.ts
  - src/db/pool.ts
key_decisions:
  - D001
  - D004
patterns_established:
  - WAL-mode for all SQLite connections
  - Migration files numbered sequentially
  - Connection pool with 1 writer + N readers
---

# S01: Database Foundation

This slice establishes the core database infrastructure used by all subsequent slices.
The SQLite database uses WAL mode for concurrent read access during background operations.

## Implementation Details

The schema defines tables for artifacts (decisions, requirements, tasks), metrics,
and session state. Each table includes created_at and updated_at timestamps with
automatic trigger-based updates.

The migration engine supports forward-only migrations with checksum verification
to detect tampering. Each migration runs in a transaction with automatic rollback
on failure.

## Testing Approach

Integration tests use an in-memory SQLite database to avoid filesystem side effects.
Each test creates a fresh database, applies all migrations, and verifies the schema
matches expected structure.

## Performance Characteristics

Schema initialization takes approximately 5ms on modern hardware. Query latency
for typical operations (insert, select by ID, range scan) is under 1ms. The WAL
checkpoint runs automatically every 1000 pages or when the connection closes.`,

    `---
id: S02
provides:
  - prompt-compressor
  - token-counter
  - context-budget
requires:
  - database-schema
key_files:
  - src/extensions/gsd/prompt-compressor.ts
  - src/extensions/gsd/token-counter.ts
  - src/extensions/gsd/context-budget.ts
  - src/extensions/gsd/structured-data-formatter.ts
key_decisions:
  - D002
  - D003
  - D005
patterns_established:
  - Deterministic compression with no LLM calls
  - Three compression levels (light/moderate/aggressive)
  - Provider-aware token estimation
---

# S02: Token Optimization Pipeline

This slice implements the complete token optimization pipeline that reduces prompt
size while preserving semantic content. All transformations are deterministic and
require no external API calls.

## Compression Strategy

The pipeline applies transformations in order of increasing aggressiveness:
light (whitespace normalization, comment removal), moderate (phrase abbreviation,
boilerplate removal), and aggressive (emphasis removal, line truncation).

Code blocks and markdown headings are preserved by default to maintain structural
readability for the LLM executor.

## Budget Allocation

Context budgets are computed proportionally from the executor model's context window.
Summaries receive 15%, inline context receives 40%, and verification sections receive
10%. The remaining 35% is reserved for the model's response generation.

## Token Counting

Token counts are estimated using provider-specific chars-per-token ratios:
Anthropic at 3.5, OpenAI at 4.0, Google at 4.0. When tiktoken is available,
exact counts replace estimates for OpenAI-compatible models.`,

    `---
id: S03
provides:
  - semantic-chunker
  - summary-distiller
  - cache-optimizer
requires:
  - prompt-compressor
  - token-counter
key_files:
  - src/extensions/gsd/semantic-chunker.ts
  - src/extensions/gsd/summary-distiller.ts
  - src/extensions/gsd/prompt-cache-optimizer.ts
key_decisions:
  - D006
  - D007
patterns_established:
  - TF-IDF scoring for content relevance
  - Progressive field dropping for budget compliance
  - Static-first section ordering for cache efficiency
---

# S03: Advanced Context Selection

This slice builds on the token optimization pipeline to provide intelligent content
selection and cache-aware prompt assembly. It includes semantic chunking for code
files, summary distillation for dependency context, and cache-optimized section ordering.

## Semantic Chunking

The chunker splits code files at semantic boundaries (function/class/interface
declarations) and scores each chunk against the task query using TF-IDF relevance.
Only the top-scoring chunks are included in the prompt, typically reducing code
context by 40-60%.

## Summary Distillation

SUMMARY.md files from dependency slices are distilled to their essential structured
data: provides, requires, key_files, and key_decisions. Verbose prose descriptions
are dropped to save context budget. Progressive field dropping ensures output fits
within any budget constraint.

## Cache Optimization

Prompt sections are classified as static (system prompt, templates), semi-static
(slice plan, decisions), or dynamic (task plan, file contents). Sections are reordered
to place static content first, maximizing the cacheable prefix length for both
Anthropic and OpenAI prompt caching strategies.`,

    `---
id: S04
provides:
  - dispatch-pipeline
  - task-routing
  - verification-gate
requires:
  - database-schema
  - prompt-compressor
  - semantic-chunker
  - cache-optimizer
key_files:
  - src/extensions/gsd/auto-dispatch.ts
  - src/extensions/gsd/model-router.ts
  - src/extensions/gsd/verification-gate.ts
  - src/extensions/gsd/auto-supervisor.ts
key_decisions:
  - D008
patterns_established:
  - Budget-aware dispatch with automatic compression
  - Model routing based on task complexity
  - Evidence-based verification before task completion
---

# S04: Dispatch Pipeline

This slice implements the end-to-end dispatch pipeline that takes a task plan,
assembles an optimized prompt, routes it to the appropriate model, and verifies
the executor's output before marking the task complete.

## Prompt Assembly

The dispatch pipeline collects context from multiple sources: decisions and
requirements from the database, dependency summaries from prior slices, code
context from the workspace index, and task-specific instructions from the plan.
All content passes through the optimization pipeline before assembly.

## Model Routing

Tasks are routed to models based on complexity classification: simple tasks go
to smaller/faster models, complex tasks go to larger models with bigger context
windows. The router considers available context budget, estimated token usage,
and historical success rates for each model-task combination.

## Verification

Each completed task passes through a verification gate that checks for evidence
of completion: modified files, passing tests, and explicit verification commands
defined in the task plan. Tasks without sufficient evidence are flagged for
review rather than silently accepted.`,
  ];
}

// ---------------------------------------------------------------------------
// Fixture: Verbose prompt content (5000+ chars) for compression benchmark
// ---------------------------------------------------------------------------

function buildVerbosePrompt(): string {
  return `# Executor Instructions

<!-- These instructions are generated automatically by the GSD dispatch system. -->
<!-- Version: 2.4.1 -->
<!-- Generated: 2026-03-17T10:00:00Z -->
<!-- Template: executor-v3 -->

---

## Context and Background


In order to complete this task successfully, it is important to note that the system architecture follows a modular design pattern. The following sections describe the relevant context for your work.

As mentioned previously, the database layer uses SQLite with WAL mode enabled. In addition to the database configuration, you should be aware of the caching strategy that has been implemented.

Due to the fact that we need to maintain backward compatibility, all API changes must be additive. At this point in time, we do not support breaking changes to the public API surface.

For the purpose of maintaining consistency, all new code should follow the established patterns documented in the architecture decision records. In the event that you encounter a conflict between patterns, prefer the most recent decision.

With regard to testing, all new functionality must include unit tests with at least 80% branch coverage. Prior to submitting your changes, run the full test suite to verify no regressions.

Subsequent to completing the implementation, update the SUMMARY.md file with any new patterns or decisions established during development.


---


## Technical Requirements

In accordance with the project standards, the implementation must satisfy the following requirements:

(none)
N/A
(not applicable)
(empty)

A number of performance constraints apply to this module. In the case of database operations, queries must complete within 10ms at the 95th percentile. On the basis of our load testing results, the system handles approximately 500 concurrent requests.

In order to ensure proper error handling, all async functions must use try-catch blocks. In the event that an error occurs, it is important to note that the error should be logged before re-throwing.

The following code patterns should be followed:

\`\`\`typescript
// Always use strict null checks
interface Result<T> {
  data: T | null;
  error: string | null;
}

// Prefer explicit return types
export function processItem(item: unknown): Result<ProcessedItem> {
  if (!isValid(item)) {
    return { data: null, error: "Invalid item format" };
  }
  return { data: transform(item), error: null };
}
\`\`\`

---

## Dependencies

- **Database module** (src/db/connection.ts): Provides connection pool management
- **Auth module** (src/auth/tokens.ts): Handles token validation and refresh
- **Logger** (src/utils/logger.ts): Structured logging with context propagation
- **Config module** (src/config/loader.ts): Configuration loading and validation

> Note: The database module is currently being refactored as part of M002/S03.
> Use the stable API surface and avoid internal implementation details.
> In order to avoid breakage, do not import from internal paths.

---

## Task Plan

In order to implement the requested changes, you should follow these steps:

1. Review the existing implementation in the target files
2. Implement the changes described in the task description
3. Write unit tests covering all new code paths
4. Update documentation if any public APIs change
5. Run the verification commands listed below



## Carry-Forward Context

In order to understand the current state of the codebase, it is important to note that the following decisions were made in prior slices:

- In the event that a database connection fails, the system should retry with exponential backoff. Due to the fact that connection failures are transient, this approach works well.
- Due to the fact that we use SQLite, all write operations are serialized through a single writer connection. In order to prevent lock contention, the pool is configured with 1 writer and 4 readers.
- As mentioned previously, the token optimization pipeline processes content in three stages: light, moderate, and aggressive compression. In order to preserve semantic meaning, code blocks are excluded from compression.
- For the purpose of maintaining cache efficiency, static prompt sections are always placed before dynamic sections. In the event that sections are reordered, cache hit rates drop significantly.
- At this point in time, the system supports three providers: Anthropic, OpenAI, and Google. In order to add a new provider, implement the ProviderAdapter interface.
- In accordance with the security policy, all environment variables are filtered through an allowlist. For the purpose of preventing accidental exposure, unknown variables are redacted.
- With regard to the plugin system, plugins are loaded from the .gsd/plugins/ directory. Prior to loading, each plugin manifest is validated against the JSON schema.
- Subsequent to task completion, the verification gate checks for evidence of completion. In the case of missing evidence, the task is flagged for review.

N/A
(none)
(not applicable)
(empty)

---

## Verification Commands

\`\`\`bash
npm run test -- --grep "database"
npm run lint
npm run build
\`\`\`

<!-- End of generated instructions -->
<!-- Do not modify below this line -->`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("Token Optimization Benchmark", () => {
  // -----------------------------------------------------------------------
  // Test 1: Structured Data Savings
  // -----------------------------------------------------------------------
  it("structured data savings benchmark", () => {
    const decisions = buildDecisions();
    const requirements = buildRequirements();

    const markdownDecisions = formatDecisionsAsMarkdownTable(decisions);
    const compactDecisions = formatDecisionsCompact(decisions);

    const decisionSavings = measureSavings(compactDecisions, markdownDecisions);

    console.log(
      `  Decisions compact: ${decisionSavings.toFixed(1)}% savings (${markdownDecisions.length} -> ${compactDecisions.length} chars)`,
    );
    assert.ok(
      decisionSavings > 15,
      `Decisions savings should be >15%, got ${decisionSavings.toFixed(1)}%`,
    );

    const markdownReqs = formatRequirementsAsMarkdown(requirements);
    const compactReqs = formatRequirementsCompact(requirements);

    const reqSavings = measureSavings(compactReqs, markdownReqs);

    console.log(
      `  Requirements compact: ${reqSavings.toFixed(1)}% savings (${markdownReqs.length} -> ${compactReqs.length} chars)`,
    );
    assert.ok(
      reqSavings > 5,
      `Requirements savings should be >5%, got ${reqSavings.toFixed(1)}%`,
    );
  });

  // -----------------------------------------------------------------------
  // Test 2: Prompt Compression
  // -----------------------------------------------------------------------
  it("prompt compression benchmark", () => {
    const verbose = buildVerbosePrompt();

    const light = compressPrompt(verbose, { level: "light" });
    console.log(
      `  Compression light: ${light.savingsPercent.toFixed(1)}% savings (${light.originalChars} -> ${light.compressedChars} chars, ${light.transformationsApplied} transforms)`,
    );
    assert.ok(
      light.savingsPercent > 5,
      `Light compression should save >5%, got ${light.savingsPercent}%`,
    );

    const moderate = compressPrompt(verbose, { level: "moderate" });
    console.log(
      `  Compression moderate: ${moderate.savingsPercent.toFixed(1)}% savings (${moderate.originalChars} -> ${moderate.compressedChars} chars, ${moderate.transformationsApplied} transforms)`,
    );
    assert.ok(
      moderate.savingsPercent > 10,
      `Moderate compression should save >10%, got ${moderate.savingsPercent}%`,
    );

    const aggressive = compressPrompt(verbose, { level: "aggressive" });
    console.log(
      `  Compression aggressive: ${aggressive.savingsPercent.toFixed(1)}% savings (${aggressive.originalChars} -> ${aggressive.compressedChars} chars, ${aggressive.transformationsApplied} transforms)`,
    );
    assert.ok(
      aggressive.savingsPercent > 15,
      `Aggressive compression should save >15%, got ${aggressive.savingsPercent}%`,
    );

    // Verify code blocks are preserved
    assert.ok(
      aggressive.content.includes("interface Result<T>"),
      "Code blocks should be preserved through all compression levels",
    );
  });

  // -----------------------------------------------------------------------
  // Test 3: Semantic Chunking
  // -----------------------------------------------------------------------
  it("semantic chunking benchmark", () => {
    const query = "database connection config validation";
    const result = chunkByRelevance(SAMPLE_CODE, query, {
      maxChunks: 5,
      minScore: 0.05,
    });

    console.log(
      `  Semantic chunking: ${result.totalChunks} total chunks, ${result.chunks.length} selected, ${result.omittedChunks} omitted`,
    );
    console.log(
      `  Chunking savings: ${result.savingsPercent}% of content omitted`,
    );

    assert.ok(
      result.totalChunks >= 4,
      `Should produce at least 4 chunks, got ${result.totalChunks}`,
    );
    assert.ok(
      result.savingsPercent > 40,
      `Should omit >40% of content, got ${result.savingsPercent}%`,
    );

    // Verify that chunks relevant to the query score higher
    const scores = result.chunks.map((c) => c.score);
    const hasHighScorer = scores.some((s) => s > 0.5);
    assert.ok(hasHighScorer, "At least one chunk should score above 0.5");

    // Verify selected content contains query-relevant terms
    const selectedText = result.chunks.map((c) => c.content).join("\n");
    const hasRelevantContent =
      selectedText.includes("Config") ||
      selectedText.includes("config") ||
      selectedText.includes("database") ||
      selectedText.includes("connect") ||
      selectedText.includes("validate");
    assert.ok(
      hasRelevantContent,
      "Selected chunks should contain query-relevant content",
    );
  });

  // -----------------------------------------------------------------------
  // Test 4: Summary Distillation
  // -----------------------------------------------------------------------
  it("summary distillation benchmark", () => {
    const summaries = buildSummaries();
    const originalTotalChars = summaries.reduce((s, c) => s + c.length, 0);

    // Use a generous budget so we can measure natural distillation savings
    const result = distillSummaries(summaries, 100_000);

    console.log(
      `  Summary distillation: ${result.savingsPercent}% savings (${result.originalChars} -> ${result.distilledChars} chars, ${result.summaryCount} summaries)`,
    );

    assert.ok(
      result.savingsPercent > 40,
      `Summary distillation should save >40%, got ${result.savingsPercent}%`,
    );
    assert.equal(result.summaryCount, 4, "Should process all 4 summaries");

    // Verify key structured fields are preserved
    assert.ok(
      result.content.includes("provides:"),
      "Distilled output should preserve 'provides' field",
    );
    assert.ok(
      result.content.includes("key_files:"),
      "Distilled output should preserve 'key_files' field",
    );
    assert.ok(
      result.content.includes("key_decisions:"),
      "Distilled output should preserve 'key_decisions' field",
    );

    // Verify slice IDs are preserved
    assert.ok(result.content.includes("S01"), "Should preserve S01 reference");
    assert.ok(result.content.includes("S02"), "Should preserve S02 reference");
    assert.ok(result.content.includes("S03"), "Should preserve S03 reference");
    assert.ok(result.content.includes("S04"), "Should preserve S04 reference");
  });

  // -----------------------------------------------------------------------
  // Test 5: Combined Pipeline
  // -----------------------------------------------------------------------
  it("combined pipeline benchmark", () => {
    const decisions = buildDecisions();
    const requirements = buildRequirements();
    const summaries = buildSummaries();
    const knowledgeFile = SAMPLE_CODE;
    const carryForward = buildVerbosePrompt();

    // --- Unoptimized baseline ---
    const unoptDecisions = formatDecisionsAsMarkdownTable(decisions);
    const unoptRequirements = formatRequirementsAsMarkdown(requirements);
    const unoptSummaries = summaries.join("\n\n---\n\n");
    const unoptKnowledge = knowledgeFile;
    const unoptCarry = carryForward;

    const unoptimizedTotal =
      unoptDecisions.length +
      unoptRequirements.length +
      unoptSummaries.length +
      unoptKnowledge.length +
      unoptCarry.length;

    // --- Optimized pipeline ---
    // 1. Compact format for decisions and requirements
    const optDecisions = formatDecisionsCompact(decisions);
    const optRequirements = formatRequirementsCompact(requirements);

    // 2. Distill summaries
    const distilled = distillSummaries(summaries, 100_000);

    // 3. Chunk knowledge file
    const chunked = chunkByRelevance(knowledgeFile, "database config validation", {
      maxChunks: 5,
      minScore: 0.05,
    });
    const optKnowledge = chunked.chunks.map((c) => c.content).join("\n\n");

    // 4. Compress carry-forward
    const compressed = compressPrompt(carryForward, { level: "moderate" });

    const optimizedTotal =
      optDecisions.length +
      optRequirements.length +
      distilled.distilledChars +
      optKnowledge.length +
      compressed.compressedChars;

    const totalSavingsPercent =
      ((unoptimizedTotal - optimizedTotal) / unoptimizedTotal) * 100;

    console.log(
      `  Combined pipeline: ${totalSavingsPercent.toFixed(1)}% total savings (${unoptimizedTotal} -> ${optimizedTotal} chars)`,
    );
    console.log(
      `    Decisions:    ${unoptDecisions.length} -> ${optDecisions.length} chars`,
    );
    console.log(
      `    Requirements: ${unoptRequirements.length} -> ${optRequirements.length} chars`,
    );
    console.log(
      `    Summaries:    ${unoptSummaries.length} -> ${distilled.distilledChars} chars`,
    );
    console.log(
      `    Knowledge:    ${unoptKnowledge.length} -> ${optKnowledge.length} chars`,
    );
    console.log(
      `    Carry-fwd:    ${unoptCarry.length} -> ${compressed.compressedChars} chars`,
    );

    assert.ok(
      totalSavingsPercent > 30,
      `Combined pipeline should save >30%, got ${totalSavingsPercent.toFixed(1)}%`,
    );
  });

  // -----------------------------------------------------------------------
  // Test 6: Cache Efficiency Analysis
  // -----------------------------------------------------------------------
  it("cache efficiency analysis", () => {
    const sections_input = [
      section(
        "system-prompt",
        "You are a GSD executor agent. Follow the task plan precisely. Report evidence of completion. Do not deviate from the assigned scope. Always verify your work before reporting done.",
      ),
      section(
        "template-executor",
        "## Output Format\n\nProvide your response in the following structure:\n1. Analysis of the task requirements\n2. Implementation plan\n3. Code changes with file paths\n4. Verification evidence\n5. Summary of changes made\n\nDo not include preamble or meta-commentary.",
      ),
      section(
        "slice-plan",
        "## Slice S03: Advanced Context Selection\n\nTasks:\n- T01: Implement semantic chunker with TF-IDF scoring\n- T02: Build summary distiller with progressive dropping\n- T03: Create cache optimizer with section classification\n- T04: Write benchmark tests for all optimization modules\n- T05: Integration test for combined pipeline",
      ),
      section(
        "decisions",
        formatDecisionsCompact(buildDecisions()),
      ),
      section(
        "requirements",
        formatRequirementsCompact(buildRequirements()),
      ),
      section(
        "task-plan",
        "## T04: Write benchmark tests\n\nCreate comprehensive benchmark tests that measure token savings from each optimization module. Include realistic fixture data and conservative assertion targets.\n\nFiles: src/extensions/gsd/tests/token-optimization-benchmark.test.ts\nVerify: npm run test -- --grep benchmark",
      ),
      section(
        "task-context",
        "Current implementation status: all optimization modules are complete and passing unit tests. This task adds end-to-end validation.\n\nRecent changes:\n- prompt-compressor.ts: added aggressive level\n- semantic-chunker.ts: improved boundary detection\n- summary-distiller.ts: added progressive field dropping",
      ),
    ];

    const optimized = optimizeForCaching(sections_input);

    console.log(
      `  Cache efficiency: ${(optimized.cacheEfficiency * 100).toFixed(1)}% cacheable prefix (${optimized.cacheablePrefixChars} / ${optimized.totalChars} chars)`,
    );
    console.log(
      `    Static sections: ${optimized.sectionCounts.static}, Semi-static: ${optimized.sectionCounts["semi-static"]}, Dynamic: ${optimized.sectionCounts.dynamic}`,
    );

    assert.ok(
      optimized.cacheEfficiency > 0.6,
      `Cache efficiency should be >60%, got ${(optimized.cacheEfficiency * 100).toFixed(1)}%`,
    );

    const anthropicSavings = estimateCacheSavings(optimized, "anthropic");
    console.log(
      `    Estimated Anthropic savings: ${(anthropicSavings * 100).toFixed(1)}%`,
    );
    assert.ok(
      anthropicSavings > 0.5,
      `Anthropic cache savings should be >50%, got ${(anthropicSavings * 100).toFixed(1)}%`,
    );

    const openaiSavings = estimateCacheSavings(optimized, "openai");
    console.log(
      `    Estimated OpenAI savings: ${(openaiSavings * 100).toFixed(1)}%`,
    );
    assert.ok(
      anthropicSavings > openaiSavings,
      "Anthropic savings should exceed OpenAI savings (90% vs 50% discount)",
    );
  });

  // -----------------------------------------------------------------------
  // Test 7: Provider-Aware Budget Accuracy
  // -----------------------------------------------------------------------
  it("provider-aware budget accuracy", () => {
    const contextWindow = 200_000;

    const anthropicBudget = computeBudgets(contextWindow, "anthropic");
    const openaiBudget = computeBudgets(contextWindow, "openai");

    const anthropicCharsPerToken = getCharsPerToken("anthropic");
    const openaiCharsPerToken = getCharsPerToken("openai");

    console.log(
      `  Anthropic: ${anthropicCharsPerToken} chars/token, inline budget: ${anthropicBudget.inlineContextBudgetChars} chars`,
    );
    console.log(
      `  OpenAI:    ${openaiCharsPerToken} chars/token, inline budget: ${openaiBudget.inlineContextBudgetChars} chars`,
    );

    // OpenAI has higher chars-per-token (4.0 vs 3.5), so it gets more chars per budget
    const charsDifference =
      openaiBudget.inlineContextBudgetChars -
      anthropicBudget.inlineContextBudgetChars;
    const percentDifference =
      (charsDifference / anthropicBudget.inlineContextBudgetChars) * 100;

    console.log(
      `  OpenAI gets ${percentDifference.toFixed(1)}% more chars per budget unit (${charsDifference} chars difference)`,
    );

    // OpenAI should get ~14% more chars (4.0/3.5 = 1.143)
    assert.ok(
      percentDifference > 10,
      `OpenAI should get >10% more chars, got ${percentDifference.toFixed(1)}%`,
    );
    assert.ok(
      percentDifference < 20,
      `Difference should be <20%, got ${percentDifference.toFixed(1)}%`,
    );

    // Verify token estimates differ for the same content
    const sampleContent = SAMPLE_CODE;
    const anthropicTokens = estimateTokensForProvider(sampleContent, "anthropic");
    const openaiTokens = estimateTokensForProvider(sampleContent, "openai");

    console.log(
      `  Same content (${sampleContent.length} chars): Anthropic estimates ${anthropicTokens} tokens, OpenAI estimates ${openaiTokens} tokens`,
    );

    assert.ok(
      anthropicTokens > openaiTokens,
      "Anthropic should estimate more tokens (smaller chars-per-token ratio)",
    );
  });
});
