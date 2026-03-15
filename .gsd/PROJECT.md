# GSD Memory Database

## What This Is

A SQLite-backed context store that replaces GSD's markdown-file artifact loading with selective, context-aware queries. Each dispatch unit gets only the data it needs — active decisions scoped to the current milestone, requirements mapped to the current slice, forward intelligence from dependency summaries — instead of loading entire markdown files into every prompt.

## Core Value

Selective context injection: the TS system becomes the context curator, using its knowledge of the current milestone/slice/task/phase to query structured data and build minimal, precise prompts.

## Current State

S01 (DB Foundation + Decisions + Requirements) and S02 (Markdown Importers + Auto-Migration) are complete. The SQLite abstraction layer (`gsd-db.ts`), context store query layer (`context-store.ts`), and markdown import pipeline (`md-importer.ts`) are built, tested (284 tests, 70 import-specific assertions), and ready for consumption by downstream slices. Schema is at version 2 with `decisions`, `requirements`, `artifacts`, and `schema_version` tables. Auto-migration is wired into `startAuto()` — existing projects silently create `gsd.db` on first run. Provider chain uses `node:sqlite` on Node 22+, falls back to `better-sqlite3`, then null. Graceful fallback ensures no crash when DB unavailable.

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
