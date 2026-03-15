---
estimated_steps: 6
estimated_files: 2
---

# T01: Markdown generators + DB-first write helpers

**Slice:** S06 — Structured LLM Tools + /gsd inspect
**Milestone:** M001

## Description

Create `db-writer.ts` with functions that generate DECISIONS.md and REQUIREMENTS.md from DB state, compute next decision IDs, and write to DB + regenerate markdown in one operation. This is the missing DB→markdown direction — S03 established markdown→DB, but the structured LLM tools need DB→markdown. Round-trip fidelity through the existing parsers is the critical acceptance criterion.

## Steps

1. Create `db-writer.ts` with `generateDecisionsMd(decisions: Decision[]): string` — produces the full DECISIONS.md file content: `# Decisions Register` header, the HTML comment block (`<!-- Append-only... -->`), table header row, separator row, and one data row per decision. Pipe-delimit cells matching the existing column order: #, When, Scope, Decision, Choice, Rationale, Revisable?.

2. Add `generateRequirementsMd(requirements: Requirement[]): string` — groups requirements by status into sections (`## Active`, `## Validated`, `## Deferred`, `## Out of Scope`), each containing `### RXXX — Description` headings with bullet fields (Class, Status, Description, Why it matters, Source, Primary owning slice, Supporting slices, Validation, Notes). Only emit sections and bullets that have content. Emit the Traceability table and Coverage Summary sections at the bottom.

3. Add `nextDecisionId(): string` — queries `SELECT MAX(CAST(SUBSTR(id, 2) AS INTEGER)) FROM decisions` via dynamic import of gsd-db.js, returns `D{max+1}` zero-padded to 3 digits. Returns `D001` if no decisions exist.

4. Add `saveDecisionToDb(fields: {scope, decision, choice, rationale, revisable?, when_context?}, basePath: string): Promise<{id: string}>` — auto-assigns ID via `nextDecisionId()`, calls `upsertDecision()`, fetches all active decisions via `getActiveDecisions()`, regenerates DECISIONS.md, writes to disk via `saveFile()`. Returns the assigned ID.

5. Add `updateRequirementInDb(id: string, updates: Partial<Requirement>, basePath: string): Promise<void>` — fetches existing requirement via `getRequirementById()`, merges updates, calls `upsertRequirement()`, fetches all requirements (active + non-active since REQUIREMENTS.md includes all sections), regenerates REQUIREMENTS.md, writes to disk.

6. Add `saveArtifactToDb(opts: {path, artifact_type, content, milestone_id?, slice_id?, task_id?}, basePath: string): Promise<void>` — calls `insertArtifact()` for DB write, computes the full file path from basePath + `.gsd/` + path, writes content to disk via `saveFile()`.

## Must-Haves

- [ ] `generateDecisionsMd` produces markdown parseable by `parseDecisionsTable`
- [ ] `generateRequirementsMd` produces markdown parseable by `parseRequirementsSections`
- [ ] `nextDecisionId` returns correct next ID after existing decisions
- [ ] All DB imports are dynamic inside try/catch (D014)
- [ ] Round-trip test: generate → parse → compare fields match

## Verification

- `npm run test:unit -- --test-name-pattern "db-writer"` — all assertions pass
- Round-trip: `generateDecisionsMd(decisions)` → `parseDecisionsTable(output)` → fields match original decisions
- Round-trip: `generateRequirementsMd(reqs)` → `parseRequirementsSections(output)` → fields match original requirements
- `npx tsc --noEmit` — clean compilation

## Inputs

- `src/resources/extensions/gsd/gsd-db.ts` — upsertDecision, upsertRequirement, insertArtifact, getActiveDecisions, getActiveRequirements, getRequirementById, _getAdapter
- `src/resources/extensions/gsd/md-importer.ts` — parseDecisionsTable, parseRequirementsSections (for round-trip verification in tests)
- `src/resources/extensions/gsd/types.ts` — Decision, Requirement interfaces
- `src/resources/extensions/gsd/paths.ts` — resolveGsdRootFile, gsdRoot
- `src/resources/extensions/gsd/files.ts` — saveFile

## Expected Output

- `src/resources/extensions/gsd/db-writer.ts` — new module with 6 exports: generateDecisionsMd, generateRequirementsMd, nextDecisionId, saveDecisionToDb, updateRequirementInDb, saveArtifactToDb
- `src/resources/extensions/gsd/tests/db-writer.test.ts` — round-trip fidelity tests + next-ID tests + write helper tests
