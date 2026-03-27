# Debug Finding: JSON Parsing Error in gsd_complete_slice (#2882)

**Date:** 2026-03-27
**Issue:** https://github.com/gsd-build/gsd-2/issues/2882
**Status:** Root cause identified, fix not yet applied

## Error

```
gsd_complete_slice
No number after minus sign in JSON at position 2559 (line 1 column 2560)

Warning: Auto-mode paused due to provider error: No number after minus sign in JSON at position 2559
```

## Root Cause (HIGH confidence — 85%)

**Incomplete error classification** causes a recoverable stream corruption error to be treated as a permanent failure.

### Causal Chain

1. The Anthropic SDK's `streaming.ts:70` calls raw `JSON.parse()` on each SSE event data line
2. Stream corruption (network glitch, truncation) produces a malformed SSE line containing a bare minus sign without following digits
3. `JSON.parse` throws "No number after minus sign in JSON at position 2559"
4. The SDK re-throws (no recovery) and it propagates up through the agent loop
5. `error-classifier.ts:51` — the `STREAM_RE` regex **does NOT match** this error pattern:
   ```
   /Unexpected end of JSON|Unexpected token.*JSON|Expected double-quoted property name|SyntaxError.*JSON/i
   ```
6. Classification returns `{ kind: "unknown" }` instead of `{ kind: "stream" }`
7. `agent-end-recovery.ts:162` calls `pauseAutoForProviderError` with `isTransient: false` — **permanent pause**

### Contributing Factor

The `gsd_complete_slice` tool has the most complex schema in the system (23 params, 5 nested object arrays at db-tools.ts:748-802), producing the longest JSON payloads (~2000-3000+ bytes). Longer payloads = higher probability of hitting stream corruption mid-generation.

## Key Files

- `src/resources/extensions/gsd/error-classifier.ts:51` — STREAM_RE regex (the gap)
- `src/resources/extensions/gsd/bootstrap/agent-end-recovery.ts:162` — unknown errors cause permanent pause
- `src/resources/extensions/gsd/bootstrap/db-tools.ts:748-802` — gsd_complete_slice schema (25 params)
- `packages/pi-ai/src/providers/anthropic-shared.ts:555-706` — streaming loop consuming SDK events
- `packages/pi-agent-core/src/agent-loop.ts:203-224` — error catch converting to error message
- `node_modules/@anthropic-ai/sdk/src/core/streaming.ts:70-74` — SDK SSE JSON.parse with re-throw

## Recommended Fixes

### Fix 1 — Error classifier regex (minimal, directly resolves issue)

```typescript
// error-classifier.ts:51
// Before:
const STREAM_RE = /Unexpected end of JSON|Unexpected token.*JSON|Expected double-quoted property name|SyntaxError.*JSON/i;

// After — catch ALL JSON parse errors with the universal suffix:
const STREAM_RE = /Unexpected end of JSON|Unexpected token.*JSON|Expected double-quoted property name|SyntaxError.*JSON|in JSON at position/i;
```

The phrase `"in JSON at position"` appears in ALL Node.js JSON parse error messages — this future-proofs against other variants.

### Fix 2 — Schema simplification (defense in depth, optional)

Collapse the 5 nested object arrays in `gsd_complete_slice` into a single JSON string parameter. Parse internally in the tool execute function with error logging. Reduces payload size and LLM generation complexity.

### Fix 3 — SSE stream defense (defense in depth, optional)

Wrap the SSE streaming loop in `anthropic-shared.ts` with a try-catch that converts JSON parse errors into graceful error responses.

## Falsified Hypotheses

- **Model-router modifications**: Does not touch tool arguments or JSON at all
- **Schema complexity as sole cause**: Other tools with deep nesting (gsd_reassess_roadmap) don't exhibit this issue — complexity is a contributing factor, not root cause
