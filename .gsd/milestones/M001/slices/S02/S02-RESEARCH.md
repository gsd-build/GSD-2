# S02: Markdown Importers + Auto-Migration — Research

**Date:** 2026-03-15

## Summary

S02 builds the bridge between existing markdown artifacts and the SQLite database from S01. The work decomposes into three parts: (1) parsing DECISIONS.md and REQUIREMENTS.md into structured rows — these are the only two root-level files with PRD-table structure that needs field-level extraction, (2) importing hierarchy artifacts (roadmaps, plans, summaries, continues, contexts, research, secrets manifests, project, queue) as whole-content rows keyed by file path, and (3) wiring auto-migration into `startAuto()` so it fires silently on first run.

Existing parsers in `files.ts` cover roadmaps, plans, summaries, continues, secrets manifests, requirement counts, and context frontmatter — but **none of them produce the typed structures needed for DB insertion**. The parsers return domain objects (e.g. `Roadmap`, `SlicePlan`, `Summary`) designed for state derivation, not DB row mapping. DECISIONS.md has no parser at all — it's a raw markdown table that gets inlined verbatim via `inlineGsdRootFile()`. REQUIREMENTS.md has only `parseRequirementCounts()` which counts H3 headings per section, not a per-requirement structured extractor.

The recommended approach is: write new import functions in `md-importer.ts` that handle DECISIONS.md table parsing and REQUIREMENTS.md section parsing as field-level extraction, add schema v2 migration with tables for the remaining artifact types (storing `full_content` + metadata columns), and use `INSERT OR REPLACE` everywhere since the existing `insertDecision`/`insertRequirement` use plain `INSERT` which throws on re-import. Auto-migration hooks into `startAuto()` between `.gsd/` bootstrap (line ~630) and `deriveState()` (line ~666).

## Recommendation

**Two-tier import strategy:**

1. **Structured import** for decisions and requirements — field-level parsing into existing S01 tables. Write a DECISIONS.md table parser (regex-based row extraction) and a REQUIREMENTS.md section parser (H3 heading + bullet field extraction). Use `INSERT OR REPLACE` to make imports idempotent.

2. **Content-keyed import** for hierarchy artifacts (roadmaps, plans, summaries, continues, contexts, research, UATs, assessments, secrets manifests, project, queue) — store `full_content` plus path-derived metadata (milestone_id, slice_id, task_id, artifact_type) in a generic `artifacts` table. This avoids needing 10+ specialized tables now while still enabling S03 query functions to pull content from DB instead of disk. The existing parsers in `files.ts` can parse these blobs on read — the DB just replaces the filesystem as the storage layer.

**Why not specialized tables for every artifact type?** The PRD's injection matrix (Section 5) shows that most hierarchy artifacts are injected as whole text blocks — roadmaps, plans, summaries, and contexts are loaded entirely, not filtered by field. Structured tables would add schema complexity (10+ tables, typed wrappers, migration logic) with no query benefit until S03/S04 actually need field-level filtering. The `artifacts` table approach lets S02 deliver full migration fidelity with minimal schema surface, and S03 can add specialized tables when the query patterns demand it.

**Schema migration:** Bump `SCHEMA_VERSION` from 1 to 2. Add migration logic in `initSchema()` (or a new `migrateSchema()`) that checks current version and applies DDL for new tables. The `artifacts` table schema:

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,        -- relative path from .gsd/ root, e.g. "milestones/M001/M001-ROADMAP.md"
  artifact_type TEXT NOT NULL,      -- "roadmap", "plan", "summary", "continue", "context", "research", "uat", "assessment", "secrets", "project", "queue"
  milestone_id TEXT,                -- e.g. "M001", NULL for root files
  slice_id TEXT,                    -- e.g. "S01", NULL for milestone-level
  task_id TEXT,                     -- e.g. "T01", NULL for slice-level
  full_content TEXT NOT NULL,       -- raw markdown content
  imported_at TEXT NOT NULL         -- ISO timestamp
)
```

**Auto-migration detection:** In `startAuto()`, after `.gsd/` directory confirmed to exist but before `deriveState()`: check `!existsSync(join(gsdDir, 'gsd.db'))` AND directory has markdown files → call `migrateFromMarkdown(gsdDir)` → log one-line summary. This matches D009 (silent auto-migration).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Roadmap parsing | `parseRoadmap()` in `files.ts` | Handles native parser fallback, boundary maps, slice extraction. Use for validation/round-trip testing, not for DB row mapping. |
| Plan parsing | `parsePlan()` in `files.ts` | Extracts tasks, must-haves, files touched. Same — use for round-trip verification. |
| Summary parsing | `parseSummary()` in `files.ts` | Handles YAML frontmatter + body extraction. Reuse `splitFrontmatter()` + `parseFrontmatterMap()` for metadata. |
| Continue parsing | `parseContinue()` in `files.ts` | Handles frontmatter + section extraction. Same reuse pattern. |
| Secrets manifest | `parseSecretsManifest()` in `files.ts` | Extracts structured entries. Use for round-trip verification. |
| Context frontmatter | `parseContextDependsOn()` in `files.ts` | Extracts `depends_on` from YAML. Reuse for `artifacts` metadata. |
| YAML frontmatter extraction | `splitFrontmatter()` + `parseFrontmatterMap()` in `files.ts` | Proven YAML-lite parser. Use for extracting metadata from summaries, continues, contexts. |
| File path resolution | `paths.ts` resolver functions | `resolveMilestoneFile()`, `resolveSliceFile()`, `resolveTaskFile()` handle legacy naming. Use to discover files. |
| Milestone discovery | `findMilestoneIds()` in `guided-flow.ts` | Scans `.gsd/milestones/` and returns sorted IDs. Reuse for walking the hierarchy. |
| SQLite provider abstraction | `gsd-db.ts` DbAdapter | Normalizes `node:sqlite` vs `better-sqlite3`. All SQL goes through this. |
| Transaction wrapping | `transaction()` in `gsd-db.ts` | Wraps import in atomic transaction. Critical for all-or-nothing migration. |

## Existing Code and Patterns

- `src/resources/extensions/gsd/gsd-db.ts` — S01 foundation. `openDatabase()`, `initSchema()`, typed wrappers. **Key constraint:** `insertDecision()` and `insertRequirement()` use plain `INSERT INTO` which throws on UNIQUE constraint violation. S02 must add `INSERT OR REPLACE` variants or use raw adapter for import SQL.
- `src/resources/extensions/gsd/context-store.ts` — S01 query layer. `queryDecisions()`, `queryRequirements()`, format functions. S02 doesn't modify this but must ensure imported data is queryable through these existing functions.
- `src/resources/extensions/gsd/files.ts` — 857-line parser module. Key exports: `parseRoadmap`, `parsePlan`, `parseSummary`, `parseContinue`, `parseSecretsManifest`, `parseRequirementCounts`, `parseContextDependsOn`, `splitFrontmatter`, `parseFrontmatterMap`, `extractSection`, `extractBoldField`, `parseBullets`, `loadFile`. **No DECISIONS.md parser exists.** `parseRequirementCounts()` only counts requirements, doesn't extract them.
- `src/resources/extensions/gsd/paths.ts` — File discovery. `GSD_ROOT_FILES` constant maps keys to filenames: `PROJECT.md`, `DECISIONS.md`, `QUEUE.md`, `STATE.md`, `REQUIREMENTS.md`. Legacy name support via prefix matching in `resolveFile()`.
- `src/resources/extensions/gsd/roadmap-slices.ts` — Slice entry parser for `## Slices` section. Called by `parseRoadmap()`. Pattern to follow for structured section extraction.
- `src/resources/extensions/gsd/auto.ts` — `startAuto()` (line ~551) is the hookup point. Auto-migration goes after `.gsd/` bootstrap block (line ~619-630) and before `deriveState()` (line ~666). Detection: `existsSync(gsdDir)` + `!existsSync(join(gsdDir, 'gsd.db'))` + has markdown files.
- `src/resources/extensions/gsd/types.ts` — `Decision` and `Requirement` interfaces (lines 300-330) define the DB row shape. These are already aligned with the S01 schema columns.
- `src/resources/extensions/gsd/guided-flow.ts` — `findMilestoneIds()` for discovering milestone directories. Reuse for file tree walking.
- `src/resources/extensions/gsd/tests/test-helpers.ts` — `createTestContext()` provides `assertEq`, `assertTrue`, `report`. Follow this pattern for S02 tests.

## Constraints

- **`INSERT INTO` throws on duplicate keys** — S01's `insertDecision()` and `insertRequirement()` use plain INSERT. The importer needs `INSERT OR REPLACE` for idempotent re-import (e.g., delete gsd.db and re-migrate). Either add upsert wrappers to `gsd-db.ts` or use `_getAdapter()` for raw SQL in the importer.
- **Schema migration from v1 to v2** — S01 set `SCHEMA_VERSION = 1`. Adding the `artifacts` table requires a v2 migration path. The existing `initSchema()` runs DDL in a transaction but has no version-check upgrade logic. Need to add `migrateSchema()` that reads current version and applies incremental DDL.
- **Named colon-prefixed parameters required** — `node:sqlite` compatibility requires `:param` style, not `?` positional (S01 forward intelligence). All new SQL must use named params.
- **`node:sqlite` null-prototype rows** — Rows from `node:sqlite` have `Object.create(null)` prototype. Must spread into plain objects or access via bracket notation only. S01's `DbAdapter.normalizeRow` handles this, but any raw SQL via `_getAdapter()` must go through `prepare().all()` which returns normalized rows.
- **ESM context** — `createRequire(import.meta.url)` for any native module loading (D011). The importer itself is pure TS so this doesn't apply, but don't use `require()` if adding dependencies.
- **Transaction boundaries** — Migration should wrap all inserts in a single transaction for atomicity. The `transaction()` helper in `gsd-db.ts` supports this. If any import fails, the entire migration rolls back.
- **File encoding** — All markdown files are UTF-8. `fs.readFileSync` with `'utf8'` encoding is standard.

## Common Pitfalls

- **DECISIONS.md pipe-delimited table parsing is fragile** — Table cells can contain pipes within backtick code spans (e.g., `node:sqlite → better-sqlite3 → null`). A naive `line.split('|')` will break on these. Must handle the separator row (`|---|---|...`) to skip it, and be aware of leading/trailing pipes. Recommend: strip leading/trailing `|`, then split on `|` that aren't inside backticks. In practice, examining the actual DECISIONS.md data shows no pipes inside cells, but the parser should handle edge cases gracefully.
- **Supersession detection in DECISIONS.md** — `(amends D001)` appears in the Decision column text. The regex `\(amends\s+(D\d+)\)` extracts the superseded ID. When D010 amends D001, the importer must set `superseded_by = 'D010'` on D001's row. This is a two-pass operation: first insert all decisions, then update superseded_by on amended decisions.
- **REQUIREMENTS.md section structure** — Requirements are grouped under `## Active`, `## Validated`, `## Deferred`, `## Out of Scope`. Each requirement is an `### RXXX — Title` heading followed by `- Field: value` bullets. The `status` field in the bullet may differ from the section heading (e.g., a requirement under `## Active` has `- Status: active`). Trust the bullet field, not the section heading — but they should match. If they don't, the bullet takes precedence.
- **`full_content` for requirements** — The `Requirement` interface has a `full_content` field. For import, this should be the raw markdown text of the entire requirement block (from `### RXXX` to the next `###` or section end). This preserves data for round-trip fidelity even if some fields aren't parsed.
- **Re-import idempotency** — If a user deletes `gsd.db` to reset, the next startup must re-import cleanly. `INSERT OR REPLACE` on UNIQUE keys (decision `id`, requirement `id`, artifact `path`) handles this. Don't use plain `INSERT`.
- **Empty/missing files** — Not all projects have all artifact types. `QUEUE.md` doesn't exist in this project. `SECRETS-MANIFEST.md` may not exist. Importers must handle missing files gracefully (skip, no error).
- **ASSESSMENT.md and UAT.md lack structured data** — These files have no PRD-defined table format. They're text blobs that go into the `artifacts` table as `full_content`. No field extraction needed for S02.

## Open Risks

- **Schema migration path untested** — S01 has no migration code (only `initSchema` for v1). S02 must add forward-only migration from v1→v2. If the migration logic has bugs, existing DBs from S01 testing could be in a bad state. Mitigation: migration checks `schema_version` table; if version < 2, apply DDL; if version >= 2, skip.
- **Round-trip fidelity for decisions** — DECISIONS.md uses markdown table formatting with exact column alignment. Exporting from DB back to markdown table format may produce slightly different whitespace. For S02, round-trip testing should compare field values, not byte-exact file content.
- **Supersession chain depth** — If D020 amends D010 which amends D001, we need to chase the chain. Current schema has `superseded_by` on the superseded row, not the superseding row. So D001 gets `superseded_by = 'D010'`, and D010 gets `superseded_by = 'D020'`. The `active_decisions` view filters `WHERE superseded_by IS NULL`, which correctly shows only D020. The importer must handle the case where a decision amends another that was already amended.
- **Large file import performance** — A mature project could have 50+ markdown files. All imports within one transaction should be fast (SQLite handles thousands of inserts per second), but worth validating.
- **Auto-migration timing in `startAuto()`** — Migration runs before `deriveState()`, which means the DB must be opened before state derivation. Currently `openDatabase()` is not called anywhere in the dispatch pipeline. S02 must add the `openDatabase(join(gsdDir, 'gsd.db'))` call to `startAuto()` and ensure it's paired with `closeDatabase()` on shutdown.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| SQLite | `martinholovsky/claude-skills-generator@sqlite database expert` | available (552 installs) |
| better-sqlite3 | none found | none found |

No skills are directly relevant to this slice's work — it's primarily markdown parsing and SQLite insertion using the already-established S01 abstraction layer. The sqlite skill is generic and wouldn't add value over the existing `gsd-db.ts` patterns.

## Sources

- S01 implementation establishes DbAdapter pattern, named params, null-prototype normalization (source: `src/resources/extensions/gsd/gsd-db.ts`)
- Existing parsers cover 7 of 11 artifact types but return domain objects, not DB rows (source: `src/resources/extensions/gsd/files.ts`)
- `startAuto()` flow shows hookup point between .gsd/ bootstrap and deriveState() (source: `src/resources/extensions/gsd/auto.ts`, lines 619-666)
- DECISIONS.md uses pipe-delimited markdown table with `(amends DXXX)` for supersession (source: `.gsd/DECISIONS.md`)
- REQUIREMENTS.md uses H2 status sections with H3 per-requirement blocks and `- Field: value` bullets (source: `.gsd/REQUIREMENTS.md`)
- D009 specifies silent auto-migration with zero user interaction (source: `.gsd/DECISIONS.md`)
- D010/D011 establish ESM loading and provider chain patterns that importers must follow (source: `.gsd/DECISIONS.md`)
