# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | library | SQLite library for Node.js | better-sqlite3 | Sync API matches existing sync prompt-building code. Prebuilt binaries for all LTS Node versions. Both TS and Rust can read the same file. | No |
| D002 | M001 | arch | DB file location | .gsd/gsd.db (gitignored) | DB is derived local state, not source-controlled. Each clone rebuilds from markdown or creates fresh. | No |
| D003 | M001 | arch | Fallback strategy | Graceful degradation to markdown loading | better-sqlite3 native addon may fail on exotic platforms. System must not crash — falls back transparently. | No |
| D004 | M001 | arch | Markdown file fate after migration | Dual-write (DB + markdown) | Preserves human-readable file trail, git history, and rollback path. Delete gsd.db to revert. | Yes — if DB proves fully reliable after extended use |
| D005 | M001 | arch | Worktree DB strategy | Own gsd.db per worktree with row-level merge reconciliation | Git can't merge binary SQLite files. Each worktree needs isolation. Merge uses deterministic PK strategy. | No |
| D006 | M001 | arch | Structured LLM output mechanism | Custom extension tools (gsd_save_decision, etc.) | Lightweight tool calls that write to DB and trigger dual-write. Eliminates markdown-then-parse roundtrip. User emphasized "whatever is fastest and most lightweight." | Yes — if tool reliability proves insufficient |
| D007 | M001 | convention | DB inspection | /gsd inspect slash command inside pi | Slash command, not standalone CLI. Dumps table counts, recent entries, schema version. | No |
| D008 | M001 | arch | SQLite journal mode | WAL (Write-Ahead Logging) | Faster for read-heavy workload, allows concurrent readers. Standard best practice. | No |
| D009 | M001 | arch | Migration UX | Silent auto-migration on first run | Zero friction. Detect markdown files without gsd.db → import atomically → log one-line summary. | No |
| D010 | M001/S01 | library | SQLite provider strategy (amends D001) | node:sqlite → better-sqlite3 → markdown (tiered fallback) | node:sqlite available on Node 22.20.0 with full sync API (DatabaseSync), zero dependencies, no native addon. better-sqlite3 retained as fallback for Node <22.5.0. Thin abstraction layer (~80 LOC) hides provider choice. | No |
| D011 | M001/S01 | impl | Module loading in ESM context | createRequire(import.meta.url) instead of bare require() | Files loaded via --experimental-strip-types run as ESM where require() is undefined. createRequire provides CJS require in ESM. Discovered during T01 test failures. | No |
| D012 | M001/S02 | impl | Requirements dedup strategy during import | Deduplicate by ID with field merging | REQUIREMENTS.md lists same requirement in Active and Validated sections. INSERT OR REPLACE would lose fuller Active data. Instead, merge non-empty fields from later entries into existing. | No |
| D013 | M001/S02 | convention | gsdDir parameter convention | gsdDir = project basePath, not .gsd/ directory | Matches paths.ts conventions where basePath is the project root. md-importer joins basePath + '.gsd/' internally. Consistent across migrateFromMarkdown and auto-migration. | No |
| D014 | M001/S02 | arch | Auto-migration module loading | Dynamic import() for gsd-db and md-importer in startAuto() | Avoids top-level dependency on SQLite in auto.ts. If SQLite unavailable, the import() fails inside try/catch and auto-mode continues. Preserves D003 graceful degradation. | No |
| D015 | M001/S04 | arch | deriveState DB scope | DB replaces content-reading only, not file discovery | resolveMilestoneFile/resolveSliceFile still require files on disk for path resolution. DB populates fileContentCache; findMilestoneIds() remains directory-scan based. Keeps file system as canonical source for project structure. | No |
| D016 | M001/S04 | impl | Prompt measurement via module-scoped vars | Module-scoped lastPromptCharCount/lastBaselineCharCount in auto.ts | Avoids threading measurement through 13 snapshotUnitMetrics call sites. Reset at top of dispatchNextUnit prevents stale data. Optional opts bag on snapshotUnitMetrics for extensibility. | No |
