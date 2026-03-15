# GSD Memory Database

## What This Is

A SQLite-backed context store that replaces GSD's markdown-file artifact loading with selective, context-aware queries. Each dispatch unit gets only the data it needs — active decisions scoped to the current milestone, requirements mapped to the current slice, forward intelligence from dependency summaries — instead of loading entire markdown files into every prompt.

## Core Value

Selective context injection: the TS system becomes the context curator, using its knowledge of the current milestone/slice/task/phase to query structured data and build minimal, precise prompts.

## Current State

S01 (DB Foundation), S02 (Markdown Importers + Auto-Migration), S03 (Core Hierarchy + Full Query Layer + Prompt Rewiring), and S04 (Token Measurement + State Derivation from DB) are complete. All 9 prompt builders are rewired from `inlineGsdRootFile` to scoped DB queries. Token measurement wired into all dispatch paths with promptCharCount/baselineCharCount in UnitMetrics. deriveState() reads from DB with filesystem fallback. Fixture-proven ≥30% character savings: 52.2% plan-slice, 66.3% decisions-only, 32.2% research composite. 287 tests pass, 0 failures. 15 of 21 requirements validated.

## Architecture / Key Patterns

- **DB layer** (`gsd-db.ts`): SQLite via `better-sqlite3`, sync API, schema versioning, WAL mode
- **Query layer** (`context-store.ts`): typed queries that return only relevant subsets for each dispatch unit type
- **Import layer** (`md-importer.ts`): reuses existing parsers from `files.ts` to migrate markdown → DB rows
- **Dual-write**: markdown files continue to be written alongside DB for human readability and rollback
- **Graceful fallback**: if `better-sqlite3` fails to load, system falls back to current markdown loading
- **Structured LLM tools**: lightweight tool calls for decisions/requirements/summaries to eliminate markdown roundtrip
- Lives at `.gsd/gsd.db`, gitignored (derived local state)

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Memory Database — SQLite-backed context store with selective injection, full prompt rewiring, and structured LLM tools
