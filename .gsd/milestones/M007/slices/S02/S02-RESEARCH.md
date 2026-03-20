# M007: Telemetry, Metrics, and Experiment Fixtures — Research

## Summary

This slice focuses on **Metrics Aggregation & Reporting (S02)**, which relies on the durable JSONL telemetry captured in S01. We need to implement a summary utility that transforms these raw dispatch metrics into human-readable comparison tables. The goal is to enable "Evidence Grounded Analysis" by allowing the user to compare baseline and treatment runs, proving the effectiveness of the telemetry harness.

## Recommendation

Leverage the existing `summarize-metrics.ts` utility and `metrics.js` ledger logic as the foundation. Implement a new CLI script that reads multiple `.jsonl` files from `.gsd/activity/`, parses them into `MetricsLedger` objects, and formats the comparison table. This keeps the reporting layer decoupled from the runtime telemetry collection, ensuring the dispatch loop remains lightweight while providing rich analysis off-line.

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/summarize-metrics.ts` — The reporting and data transformation logic. Needs to be verified and exposed via CLI.
- `src/resources/extensions/gsd/metrics.ts` — Shared metric aggregation logic.
- `src/resources/extensions/gsd/tests/summarize-metrics.test.ts` — The verification path for metric summaries.

### Build Order

1. **Reporting Logic Verification**: Ensure `summarize-metrics.ts` correctly aggregates the new telemetry fields (fact-check stats, wall-clock duration) defined in S01.
2. **CLI Integration**: Create a bridge or CLI entry point (e.g., `gsd-report`) that allows running the summarizer against specific log files or current directory activity logs.
3. **End-to-End Test**: Use mock JSONL data matching the S01 schema to verify the table output is accurate and formatted correctly.

### Verification Approach

- **Summary Accuracy**: Build a test case using three units with diverse metrics (e.g., one with blockers, one with fact-checks, one with large token counts) and assert that `formatComparisonTable` reflects the sums accurately.
- **Durable Metric Reads**: Ensure the reader utility correctly ignores malformed JSONL lines (robustness against partial writes from interrupted dispatches).

## Common Pitfalls

- **Instrumentation Bloom**: Adding too much detail to reporting makes the tables unreadable. Enforce a columnar limit based on standard terminal widths.
- **Duration Drift**: Wall-clock time recorded at the unit level may differ from aggregate session time. We must ensure the metrics aggregator uses the unit-level events consistently.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Metrics Aggregation | `gsd-extension` | Available |

## Sources

- [Telemetry Schema Definition (Internal)](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/telemetry-standards.md) (source: [Telemetry Standards])
