---
name: code-optimizer
description: >
  Deep code optimization audit using parallel specialist agents. Each agent hunts for performance
  anti-patterns, inefficiencies, and suboptimal code using pattern-based detection (Grep/Glob)
  WITHOUT reading the full source code first — avoiding anchoring bias on existing implementations.
  Covers ALL optimization domains: database queries, memory leaks, algorithmic complexity,
  concurrency, bundle size, dead code, I/O & network, rendering/UI, data structures,
  error handling, caching, build config, security-performance, logging, and infrastructure.
  Use when asked to: "optimize my code", "find performance issues", "audit code quality",
  "speed up my app", "find bottlenecks", "code review for performance", "find anti-patterns",
  "improve code efficiency", "reduce latency", "optimize performance", "code smell detection",
  "find slow code", "optimize this project", "performance audit", "code optimization".
  Also triggers on: "optimizar codigo", "encontrar cuellos de botella", "mejorar rendimiento".
---

# Code Optimizer

Parallel multi-agent code optimization audit. Spawn 13 specialist agents simultaneously, each
hunting for a different class of performance problem using pattern-based detection.

## Critical Principle: No Code Reading Before Analysis

Agents MUST NOT read source files before searching for patterns. Reading the code first causes
anchoring bias — the agent accepts the existing implementation as "reasonable" and misses
better alternatives. Instead, each agent:

1. Read its assigned reference file from `references/` to load detection patterns
2. Use Grep/Glob to scan the codebase for anti-patterns
3. For each finding, ONLY THEN read the surrounding context (5-10 lines) to confirm the issue
4. Propose the optimal solution based on best practices, NOT based on the existing code

## Workflow

### Step 1: Detect Stack

Use Glob to identify the project's tech stack:
- `**/package.json` → Node.js/JS/TS (check for React, Next.js, Express, etc.)
- `**/requirements.txt`, `**/pyproject.toml`, `**/setup.py` → Python
- `**/go.mod` → Go
- `**/Cargo.toml` → Rust
- `**/pom.xml`, `**/build.gradle` → Java
- `**/Gemfile` → Ruby
- `**/Dockerfile` → Docker
- `**/*.sql` → SQL
- `**/webpack.config.*`, `**/vite.config.*`, `**/tsconfig.json` → Build tools

### Step 2: Spawn 13 Parallel Agents

Launch ALL agents simultaneously using the Agent tool. Each agent receives:
- Its domain name and reference file path
- The detected tech stack (so it can focus on relevant patterns)
- The project root path
- Instructions to NOT read code files, only Grep/Glob for patterns

**Agent definitions** (spawn all 13 in a single message):

| # | Agent Name | Reference File | Focus |
|---|-----------|----------------|-------|
| 1 | Database & Queries | `references/database-queries.md` | N+1 queries, SELECT *, missing indexes, ORM misuse, connection pooling |
| 2 | Memory & Resources | `references/memory-resources.md` | Memory leaks, unclosed resources, large allocations, string concat in loops |
| 3 | Algorithmic Complexity | `references/algorithmic-complexity.md` | O(n^2) patterns, unnecessary iterations, wrong data structures for lookups |
| 4 | Concurrency & Async | `references/concurrency-async.md` | Sequential awaits, blocking in async, race conditions, unbounded concurrency |
| 5 | Bundle & Dependencies | `references/bundle-dependencies.md` | Heavy imports, unused deps, duplicate libs, missing lazy loading |
| 6 | Dead Code & Redundancy | `references/dead-code-redundancy.md` | Unused exports, commented code, dead branches, duplicate logic |
| 7 | I/O & Network | `references/io-network.md` | Sequential requests, missing batching, no dedup, missing compression |
| 8 | Rendering & UI | `references/rendering-ui.md` | Re-renders, missing virtualization, layout thrashing, animation perf |
| 9 | Data Structures | `references/data-structures.md` | Wrong structures, unnecessary copies, inefficient serialization |
| 10 | Error & Resilience | `references/error-resilience.md` | Missing timeouts, swallowed errors, no retries, no circuit breakers |
| 11 | Caching & Memoization | `references/caching-memoization.md` | Missing memoization, cache without invalidation, redundant API calls |
| 12 | Build & Compilation | `references/build-compilation.md` | Dev code in prod, missing optimization flags, slow tests, Docker issues |
| 13 | Security-Performance | `references/security-performance.md` | Crypto misuse, missing rate limiting, ReDoS, SQL injection vectors |

**Optional agents** (spawn if relevant to detected stack):
- Logging & Observability (`references/logging-observability.md`) — if logging framework detected
- Config & Infrastructure (`references/config-infra.md`) — if Docker/deployment config detected

### Agent Prompt Template

Each agent MUST receive this prompt structure:

```
You are a {DOMAIN_NAME} optimization specialist. Your job is to find performance
anti-patterns in the codebase at {PROJECT_ROOT}.

CRITICAL RULES:
1. DO NOT read source code files before searching. This avoids anchoring bias.
2. First, read your reference file: {SKILL_DIR}/references/{REFERENCE_FILE}
3. Use Grep and Glob to search for the patterns described in the reference file.
4. Only read 5-10 lines of context around each finding to confirm it's a real issue.
5. Skip patterns that don't match the project's stack: {DETECTED_STACK}

Tech stack detected: {DETECTED_STACK}
Project root: {PROJECT_ROOT}

For each finding, report:
- **File**: path:line_number
- **Pattern**: what anti-pattern was detected
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW
- **Current code**: the problematic snippet (keep short)
- **Why it's slow**: brief explanation of the performance impact
- **Optimal fix**: the recommended solution (code snippet or approach)
- **Estimated impact**: qualitative improvement expected (e.g., "10x faster for large lists")

If you find 0 issues in your domain, report "No issues found" — this is a valid outcome.
Sort findings by severity (CRITICAL first).
```

### Step 3: Consolidate Report

After all agents complete, consolidate their findings into a single prioritized report:

1. Collect all findings from all agents
2. Deduplicate (different agents may flag the same code for different reasons)
3. Sort by severity: CRITICAL > HIGH > MEDIUM > LOW
4. Group by file (so the user can fix file-by-file)
5. Present the final report with:
   - Executive summary: total findings by severity, top 3 most impactful
   - Detailed findings table grouped by file
   - Improvement plan: ordered list of fixes from highest to lowest impact

### Report Format

```markdown
# Code Optimization Audit Report

## Executive Summary
- **X** critical issues, **Y** high, **Z** medium, **W** low
- Top 3 highest-impact fixes:
  1. [brief description] — [estimated impact]
  2. [brief description] — [estimated impact]
  3. [brief description] — [estimated impact]

## Findings by File

### `path/to/file.ts`

| # | Severity | Domain | Pattern | Fix | Impact |
|---|----------|--------|---------|-----|--------|
| 1 | CRITICAL | Database | N+1 query in loop | Use prefetch_related | 50x fewer queries |
| 2 | HIGH | Async | Sequential awaits | Use Promise.all | 3x faster |

[... for each file with findings ...]

## Improvement Plan

Priority-ordered steps to implement the fixes:

1. **[CRITICAL] Fix N+1 queries in `api/users.py`**
   - Current: loop queries user.posts for each user
   - Fix: add prefetch_related('posts') to queryset
   - Impact: reduces N+1 to 2 queries

2. **[HIGH] Parallelize API calls in `services/sync.ts`**
   - Current: 5 sequential await fetch() calls
   - Fix: Promise.all([fetch1, fetch2, ...])
   - Impact: ~5x faster sync operation

[... continue for all findings ...]
```
