// ensureDbOpen — Tests that the lazy DB opener creates + migrates the database
// when .gsd/ exists with Markdown content but no gsd.db file.
//
// This covers the bug where interactive (non-auto) sessions got
// "GSD database is not available" because ensureDbOpen only opened
// existing DB files but never created them.

import { createTestContext } from './test-helpers.ts';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { closeDatabase, isDbAvailable, getDecisionById } from '../gsd-db.ts';

const { assertEq, assertTrue, report } = createTestContext();

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-ensure-db-'));
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* swallow */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// ensureDbOpen creates DB + migrates when .gsd/ has Markdown
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── ensureDbOpen: creates DB from Markdown ──');

{
  const tmpDir = makeTmpDir();
  const gsdDir = path.join(tmpDir, '.gsd');
  fs.mkdirSync(gsdDir, { recursive: true });

  // Write a minimal DECISIONS.md so migration has content
  const decisionsContent = `# Decisions

| # | When | Scope | Decision | Choice | Rationale | Revisable |
|---|------|-------|----------|--------|-----------|-----------|
| D001 | M001 | architecture | Use SQLite | SQLite | Sync API | Yes |
`;
  fs.writeFileSync(path.join(gsdDir, 'DECISIONS.md'), decisionsContent);

  // Verify no DB file exists yet
  const dbPath = path.join(gsdDir, 'gsd.db');
  assertTrue(!fs.existsSync(dbPath), 'DB file should not exist before ensureDbOpen');

  // Close any previously open DB
  try { closeDatabase(); } catch { /* ok */ }

  // Override process.cwd to point at tmpDir for ensureDbOpen
  const origCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    // Dynamic import to get the freshest version
    const { ensureDbOpen } = await import('../bootstrap/dynamic-tools.ts');

    const result = await ensureDbOpen();

    assertTrue(result === true, 'ensureDbOpen should return true when .gsd/ has Markdown');
    assertTrue(fs.existsSync(dbPath), 'DB file should be created after ensureDbOpen');
    assertTrue(isDbAvailable(), 'DB should be available after ensureDbOpen');

    // Verify that Markdown migration actually ran
    const decision = getDecisionById('D001');
    assertTrue(decision !== null, 'D001 should be migrated from DECISIONS.md');
    if (decision) {
      assertEq(decision.scope, 'architecture', 'Migrated decision scope should match');
      assertEq(decision.choice, 'SQLite', 'Migrated decision choice should match');
    }
  } finally {
    process.cwd = origCwd;
    closeDatabase();
    cleanupDir(tmpDir);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ensureDbOpen returns false when no .gsd/ exists
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── ensureDbOpen: no .gsd/ returns false ──');

{
  const tmpDir = makeTmpDir();
  // No .gsd/ directory at all

  try { closeDatabase(); } catch { /* ok */ }
  const origCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const { ensureDbOpen } = await import('../bootstrap/dynamic-tools.ts');
    const result = await ensureDbOpen();
    assertTrue(result === false, 'ensureDbOpen should return false when no .gsd/ exists');
    assertTrue(!isDbAvailable(), 'DB should not be available');
  } finally {
    process.cwd = origCwd;
    cleanupDir(tmpDir);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ensureDbOpen opens existing DB without re-migration
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── ensureDbOpen: opens existing DB ──');

{
  const tmpDir = makeTmpDir();
  const gsdDir = path.join(tmpDir, '.gsd');
  fs.mkdirSync(gsdDir, { recursive: true });

  // Create a DB file first
  const dbPath = path.join(gsdDir, 'gsd.db');
  const { openDatabase } = await import('../gsd-db.ts');
  openDatabase(dbPath);
  closeDatabase();

  assertTrue(fs.existsSync(dbPath), 'DB file should exist from manual create');

  const origCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const { ensureDbOpen } = await import('../bootstrap/dynamic-tools.ts');
    const result = await ensureDbOpen();
    assertTrue(result === true, 'ensureDbOpen should open existing DB');
    assertTrue(isDbAvailable(), 'DB should be available');
  } finally {
    process.cwd = origCwd;
    closeDatabase();
    cleanupDir(tmpDir);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ensureDbOpen returns false for empty .gsd/ (no Markdown, no DB)
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── ensureDbOpen: empty .gsd/ returns false ──');

{
  const tmpDir = makeTmpDir();
  fs.mkdirSync(path.join(tmpDir, '.gsd'), { recursive: true });
  // .gsd/ exists but no DECISIONS.md, REQUIREMENTS.md, or milestones/

  try { closeDatabase(); } catch { /* ok */ }
  const origCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const { ensureDbOpen } = await import('../bootstrap/dynamic-tools.ts');
    const result = await ensureDbOpen();
    assertTrue(result === false, 'ensureDbOpen should return false for empty .gsd/');
  } finally {
    process.cwd = origCwd;
    cleanupDir(tmpDir);
  }
}

// ═══════════════════════════════════════════════════════════════════════════

report();
