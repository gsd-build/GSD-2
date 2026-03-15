// GSD Workflow + Git Integration Test
//
// Verifies the complete GSD workflow with real git operations:
// state machine transitions + branch-per-slice lifecycle + squash merges.
// Each step simulates what the LLM would produce (files + git ops) and
// verifies both state derivation AND git history are correct.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

import { deriveState, invalidateStateCache } from '../state.ts';
import { clearParseCache } from '../files.ts';
import { clearPathCache } from '../paths.ts';
import {
  GitServiceImpl,
  writeIntegrationBranch,
  type MergeSliceResult,
} from '../git-service.ts';
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, assertMatch, report } = createTestContext();

// ─── Helpers ────────────────────────────────────────────────────────────────

function git(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' }).trim();
}

function createFile(base: string, relativePath: string, content: string = 'x'): void {
  const full = join(base, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gsd-lifecycle-git-'));
  git('git init -b main', dir);
  git('git config user.name "GSD Test"', dir);
  git('git config user.email "test@gsd.dev"', dir);
  createFile(dir, '.gitkeep', '');
  git('git add -A', dir);
  git('git commit -m "init"', dir);
  // Create .gsd/milestones structure
  mkdirSync(join(dir, '.gsd', 'milestones'), { recursive: true });
  return dir;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

/** Invalidate all caches before deriving state */
async function freshState(basePath: string) {
  invalidateStateCache();
  clearParseCache();
  clearPathCache();
  return deriveState(basePath);
}

// ─── GSD file writers ───────────────────────────────────────────────────────

function writeContextDraft(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT-DRAFT.md`), content);
}

function writeContext(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT.md`), content);
}

function writeRoadmap(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-ROADMAP.md`), content);
}

function writePlan(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid);
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(join(dir, `${sid}-PLAN.md`), content);
}

function writeTaskSummary(base: string, mid: string, sid: string, tid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid, 'tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${tid}-SUMMARY.md`), content);
}

function writeSliceSummary(base: string, mid: string, sid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid, 'slices', sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-SUMMARY.md`), content);
}

function writeMilestoneSummary(base: string, mid: string, content: string): void {
  const dir = join(base, '.gsd', 'milestones', mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-SUMMARY.md`), content);
}

function makeTaskSummary(tid: string): string {
  return `---
id: ${tid}
blocker_discovered: false
---

# ${tid}: Done

**Completed.**
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: Full Lifecycle — State Machine + Git Branch-Per-Slice
  //
  // Walks through a complete milestone with 2 slices:
  //   discuss → plan → S01 branch → execute tasks → squash merge →
  //   S02 branch → execute → squash merge → complete
  //
  // Verifies git history has exactly 2 clean merge commits on main.
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: Full Lifecycle with Git Branch-Per-Slice');
  console.log('═'.repeat(70));
  {
    const repo = initRepo();
    const svc = new GitServiceImpl(repo);

    try {
      // ── Phase 1: Discuss ──────────────────────────────────────────────
      console.log('\n── Phase 1: Seed discussion');
      writeContextDraft(repo, 'M001', '# M001: Build CLI Tool\n\nA simple CLI.');
      git('git add -A', repo);
      git('git commit -m "gsd: seed M001 discussion"', repo);
      {
        const state = await freshState(repo);
        assertEq(state.phase, 'needs-discussion', 'git-t1-p1: needs-discussion');
        assertEq(state.activeMilestone?.id, 'M001', 'git-t1-p1: active M001');
      }

      // ── Phase 2: Discussion complete, create roadmap ──────────────────
      console.log('\n── Phase 2: Discussion → pre-planning → roadmap');
      writeContext(repo, 'M001', '# M001 Context\n\nDecisions: Use TypeScript, Node 22.');
      writeRoadmap(repo, 'M001', `# M001: Build CLI Tool

**Vision:** A CLI tool that does things.

## Slices

- [ ] **S01: Core Parser** \`risk:low\` \`depends:[]\`
  > After this: CLI can parse arguments.

- [ ] **S02: Output Formatter** \`risk:low\` \`depends:[S01]\`
  > After this: CLI formats output nicely.
`);
      git('git add -A', repo);
      git('git commit -m "gsd: discuss + roadmap for M001"', repo);
      {
        const state = await freshState(repo);
        assertEq(state.phase, 'planning', 'git-t1-p2: planning');
        assertEq(state.activeSlice?.id, 'S01', 'git-t1-p2: S01 needs plan');
      }

      // ── Phase 3: Plan S01 ────────────────────────────────────────────
      console.log('\n── Phase 3: Plan S01');
      writePlan(repo, 'M001', 'S01', `# S01: Core Parser

**Goal:** Parse CLI arguments.
**Demo:** \`cli --name foo\` prints "Hello foo".

## Tasks

- [ ] **T01: Arg parser** \`est:15m\`
  Build argument parser.

- [ ] **T02: Parser tests** \`est:10m\`
  Test the parser.
`);
      git('git add -A', repo);
      git('git commit -m "gsd: plan S01"', repo);
      {
        const state = await freshState(repo);
        assertEq(state.phase, 'executing', 'git-t1-p3: executing');
        assertEq(state.activeTask?.id, 'T01', 'git-t1-p3: T01 first');
      }

      // ── Phase 4: Execute S01 on slice branch ─────────────────────────
      console.log('\n── Phase 4: Create S01 branch, execute tasks');

      // GSD creates the slice branch
      const s01Created = svc.ensureSliceBranch('M001', 'S01');
      assertTrue(s01Created, 'git-t1-p4: S01 branch created');
      assertEq(svc.getCurrentBranch(), 'gsd/M001/S01', 'git-t1-p4: on slice branch');

      // T01: LLM writes code
      createFile(repo, 'src/parser.ts', `
export function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    result[args[i].replace('--', '')] = args[i + 1];
  }
  return result;
}
`);
      writeTaskSummary(repo, 'M001', 'S01', 'T01', makeTaskSummary('T01'));
      writePlan(repo, 'M001', 'S01', `# S01: Core Parser

**Goal:** Parse CLI arguments.
**Demo:** \`cli --name foo\` prints "Hello foo".

## Tasks

- [x] **T01: Arg parser** \`est:15m\`
  Build argument parser.

- [ ] **T02: Parser tests** \`est:10m\`
  Test the parser.
`);
      svc.commit({ message: 'feat(S01/T01): implement argument parser' });

      // Verify T01 committed on slice branch
      const t01Log = git('git log --oneline -1', repo);
      assertTrue(t01Log.includes('feat(S01/T01)'), 'git-t1-p4: T01 commit on slice branch');

      {
        const state = await freshState(repo);
        assertEq(state.phase, 'executing', 'git-t1-p4: still executing');
        assertEq(state.activeTask?.id, 'T02', 'git-t1-p4: T02 next');
      }

      // T02: LLM writes tests
      createFile(repo, 'src/parser.test.ts', `
import { parseArgs } from './parser';
import assert from 'assert';
assert.deepStrictEqual(parseArgs(['--name', 'foo']), { name: 'foo' });
console.log('Parser tests passed');
`);
      writeTaskSummary(repo, 'M001', 'S01', 'T02', makeTaskSummary('T02'));
      writePlan(repo, 'M001', 'S01', `# S01: Core Parser

**Goal:** Parse CLI arguments.
**Demo:** \`cli --name foo\` prints "Hello foo".

## Tasks

- [x] **T01: Arg parser** \`est:15m\`
  Build argument parser.

- [x] **T02: Parser tests** \`est:10m\`
  Test the parser.
`);
      svc.commit({ message: 'test(S01/T02): add parser tests' });

      {
        const state = await freshState(repo);
        assertEq(state.phase, 'summarizing', 'git-t1-p4: summarizing (all S01 tasks done)');
      }

      // Verify 2 commits on slice branch (ahead of main)
      const s01Commits = git('git log --oneline gsd/M001/S01 --not main', repo);
      const s01CommitCount = s01Commits.split('\n').filter(Boolean).length;
      assertTrue(s01CommitCount >= 2, `git-t1-p4: at least 2 commits on S01 branch (got ${s01CommitCount})`);

      // ── Phase 5: Complete S01 — summary + squash merge ────────────────
      console.log('\n── Phase 5: Complete S01, squash merge to main');
      writeSliceSummary(repo, 'M001', 'S01', '# S01 Summary\n\nParser built and tested.');
      writeRoadmap(repo, 'M001', `# M001: Build CLI Tool

**Vision:** A CLI tool that does things.

## Slices

- [x] **S01: Core Parser** \`risk:low\` \`depends:[]\`
  > After this: CLI can parse arguments.

- [ ] **S02: Output Formatter** \`risk:low\` \`depends:[S01]\`
  > After this: CLI formats output nicely.
`);
      svc.commit({ message: 'gsd: complete S01 summary' });

      // Switch to main and squash merge
      svc.switchToMain();
      assertEq(svc.getCurrentBranch(), 'main', 'git-t1-p5: back on main');

      const s01Merge = svc.mergeSliceToMain('M001', 'S01', 'Core Parser');
      assertEq(s01Merge.deletedBranch, true, 'git-t1-p5: S01 branch deleted');
      assertMatch(s01Merge.mergedCommitMessage, /feat\(M001\/S01\)/, 'git-t1-p5: merge commit format correct');

      // Verify merged files on main
      const mainFiles = git('git ls-files', repo);
      assertTrue(mainFiles.includes('src/parser.ts'), 'git-t1-p5: parser.ts on main');
      assertTrue(mainFiles.includes('src/parser.test.ts'), 'git-t1-p5: parser.test.ts on main');

      // Verify S01 branch is gone
      const branchesAfterS01 = git('git branch', repo);
      assertTrue(!branchesAfterS01.includes('gsd/M001/S01'), 'git-t1-p5: S01 branch deleted');

      {
        const state = await freshState(repo);
        assertEq(state.phase, 'planning', 'git-t1-p5: planning S02 (deps satisfied)');
        assertEq(state.activeSlice?.id, 'S02', 'git-t1-p5: S02 active');
        assertEq(state.progress?.slices?.done, 1, 'git-t1-p5: 1 slice done');
      }

      // ── Phase 6: Plan + execute S02 on slice branch ───────────────────
      console.log('\n── Phase 6: Plan + execute S02');
      writePlan(repo, 'M001', 'S02', `# S02: Output Formatter

**Goal:** Format CLI output.
**Demo:** Output is pretty.

## Tasks

- [ ] **T01: Formatter** \`est:10m\`
  Build formatter.
`);
      git('git add -A', repo);
      git('git commit -m "gsd: plan S02"', repo);

      const s02Created = svc.ensureSliceBranch('M001', 'S02');
      assertTrue(s02Created, 'git-t1-p6: S02 branch created');
      assertEq(svc.getCurrentBranch(), 'gsd/M001/S02', 'git-t1-p6: on S02 branch');

      // S02 branch should have S01's merged content
      const s02Files = git('git ls-files', repo);
      assertTrue(s02Files.includes('src/parser.ts'), 'git-t1-p6: S02 inherits S01 content');

      // Execute T01
      createFile(repo, 'src/formatter.ts', `
export function format(data: Record<string, string>): string {
  return Object.entries(data).map(([k, v]) => \`\${k}: \${v}\`).join('\\n');
}
`);
      writeTaskSummary(repo, 'M001', 'S02', 'T01', makeTaskSummary('T01'));
      writePlan(repo, 'M001', 'S02', `# S02: Output Formatter

**Goal:** Format CLI output.
**Demo:** Output is pretty.

## Tasks

- [x] **T01: Formatter** \`est:10m\`
  Build formatter.
`);
      svc.commit({ message: 'feat(S02/T01): implement output formatter' });

      {
        const state = await freshState(repo);
        assertEq(state.phase, 'summarizing', 'git-t1-p6: summarizing S02');
      }

      // ── Phase 7: Complete S02 — summary + squash merge ────────────────
      console.log('\n── Phase 7: Complete S02, squash merge');
      writeSliceSummary(repo, 'M001', 'S02', '# S02 Summary\n\nFormatter built.');
      writeRoadmap(repo, 'M001', `# M001: Build CLI Tool

**Vision:** A CLI tool that does things.

## Slices

- [x] **S01: Core Parser** \`risk:low\` \`depends:[]\`
  > After this: CLI can parse arguments.

- [x] **S02: Output Formatter** \`risk:low\` \`depends:[S01]\`
  > After this: CLI formats output nicely.
`);
      svc.commit({ message: 'gsd: complete S02 summary' });

      svc.switchToMain();
      const s02Merge = svc.mergeSliceToMain('M001', 'S02', 'Output Formatter');
      assertEq(s02Merge.deletedBranch, true, 'git-t1-p7: S02 branch deleted');

      // Verify all content on main
      const finalFiles = git('git ls-files', repo);
      assertTrue(finalFiles.includes('src/parser.ts'), 'git-t1-p7: parser.ts on main');
      assertTrue(finalFiles.includes('src/formatter.ts'), 'git-t1-p7: formatter.ts on main');

      {
        const state = await freshState(repo);
        assertEq(state.phase, 'completing-milestone', 'git-t1-p7: completing-milestone');
        assertEq(state.progress?.slices?.done, 2, 'git-t1-p7: 2 slices done');
        assertEq(state.progress?.slices?.total, 2, 'git-t1-p7: 2 total');
      }

      // ── Phase 8: Complete milestone ───────────────────────────────────
      console.log('\n── Phase 8: Complete milestone');
      writeMilestoneSummary(repo, 'M001', '# M001 Summary\n\nCLI tool built with parser and formatter.');
      git('git add -A', repo);
      git('git commit -m "gsd: complete M001"', repo);

      {
        const state = await freshState(repo);
        assertEq(state.phase, 'complete', 'git-t1-p8: complete');
        assertEq(state.progress?.milestones?.done, 1, 'git-t1-p8: 1 milestone done');
      }

      // ── Verify final git history ──────────────────────────────────────
      console.log('\n── Verify final git history');
      const mainLog = git('git log --oneline main', repo);
      const mainLogLines = mainLog.split('\n').filter(Boolean);

      // Should have: init, seed, discuss+roadmap, plan S01, feat(M001/S01), plan S02, feat(M001/S02), complete M001
      assertTrue(mainLogLines.length >= 5, `git-t1-final: at least 5 commits on main (got ${mainLogLines.length})`);

      // Verify the two slice merge commits exist
      assertTrue(
        mainLogLines.some(l => l.includes('feat(M001/S01)')),
        'git-t1-final: S01 merge commit on main'
      );
      assertTrue(
        mainLogLines.some(l => l.includes('feat(M001/S02)')),
        'git-t1-final: S02 merge commit on main'
      );

      // Verify no slice branches remain
      const finalBranches = git('git branch', repo);
      assertTrue(!finalBranches.includes('gsd/M001/S01'), 'git-t1-final: no S01 branch');
      assertTrue(!finalBranches.includes('gsd/M001/S02'), 'git-t1-final: no S02 branch');
      assertTrue(finalBranches.includes('main'), 'git-t1-final: main branch exists');

      // Verify source files exist and have correct content
      const parserContent = readFileSync(join(repo, 'src/parser.ts'), 'utf-8');
      assertTrue(parserContent.includes('parseArgs'), 'git-t1-final: parser.ts has parseArgs');
      const formatterContent = readFileSync(join(repo, 'src/formatter.ts'), 'utf-8');
      assertTrue(formatterContent.includes('format'), 'git-t1-final: formatter.ts has format');

    } finally {
      cleanup(repo);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: Feature Branch Workflow — GSD on non-main branch
  //
  // User starts GSD from a feature branch. Slice branches fork from feature,
  // merge back to feature. Main is untouched.
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: Feature Branch Workflow');
  console.log('═'.repeat(70));
  {
    const repo = initRepo();

    try {
      // Create feature branch
      git('git checkout -b feature/auth', repo);
      createFile(repo, 'src/auth-stub.ts', '// auth placeholder');
      git('git add -A', repo);
      git('git commit -m "chore: auth placeholder"', repo);

      // Record integration branch (auto.ts does this at startup)
      writeIntegrationBranch(repo, 'M001', 'feature/auth');

      const svc = new GitServiceImpl(repo);
      svc.setMilestoneId('M001');

      // Verify integration branch
      assertEq(svc.getMainBranch(), 'feature/auth', 'git-t2: main is feature/auth');

      // Setup milestone
      console.log('\n── Setup milestone on feature branch');
      writeRoadmap(repo, 'M001', `# M001: Auth

**Vision:** Authentication.

## Slices

- [ ] **S01: JWT** \`risk:low\` \`depends:[]\`
  > After this: JWT works.
`);
      writePlan(repo, 'M001', 'S01', `# S01: JWT

**Goal:** JWT auth.
**Demo:** Tokens work.

## Tasks

- [ ] **T01: Implement** \`est:15m\`
  Build JWT.
`);
      git('git add -A', repo);
      git('git commit -m "gsd: plan M001/S01"', repo);

      {
        const state = await freshState(repo);
        assertEq(state.phase, 'executing', 'git-t2: executing');
      }

      // Execute on slice branch
      console.log('\n── Execute on slice branch');
      svc.ensureSliceBranch('M001', 'S01');
      assertEq(svc.getCurrentBranch(), 'gsd/M001/S01', 'git-t2: on slice branch');

      // Slice should have feature branch content
      assertTrue(
        existsSync(join(repo, 'src/auth-stub.ts')),
        'git-t2: slice inherits feature branch content'
      );

      // Do work
      createFile(repo, 'src/jwt.ts', 'export function sign() { return "token"; }');
      writeTaskSummary(repo, 'M001', 'S01', 'T01', makeTaskSummary('T01'));
      writePlan(repo, 'M001', 'S01', `# S01: JWT

**Goal:** JWT auth.
**Demo:** Tokens work.

## Tasks

- [x] **T01: Implement** \`est:15m\`
  Build JWT.
`);
      svc.commit({ message: 'feat(S01/T01): implement JWT signing' });

      // Complete slice
      console.log('\n── Complete slice, merge to feature branch');
      writeSliceSummary(repo, 'M001', 'S01', '# S01 Done');
      writeRoadmap(repo, 'M001', `# M001: Auth

**Vision:** Authentication.

## Slices

- [x] **S01: JWT** \`risk:low\` \`depends:[]\`
  > After this: JWT works.
`);
      svc.commit({ message: 'gsd: complete S01' });

      // Merge to feature branch (not main!)
      svc.switchToMain();
      assertEq(svc.getCurrentBranch(), 'feature/auth', 'git-t2: switchToMain → feature/auth');

      const mergeResult = svc.mergeSliceToMain('M001', 'S01', 'JWT implementation');
      assertEq(mergeResult.deletedBranch, true, 'git-t2: S01 branch deleted');

      // Verify merge landed on feature branch
      const featureFiles = git('git ls-files', repo);
      assertTrue(featureFiles.includes('src/jwt.ts'), 'git-t2: jwt.ts on feature branch');

      // Verify main does NOT have the work
      git('git checkout main', repo);
      const mainFiles = git('git ls-files', repo);
      assertTrue(!mainFiles.includes('src/jwt.ts'), 'git-t2: jwt.ts NOT on main');
      assertTrue(!mainFiles.includes('src/auth-stub.ts'), 'git-t2: auth-stub NOT on main');

      // Go back to feature branch for state check
      git('git checkout feature/auth', repo);
      {
        const state = await freshState(repo);
        assertEq(state.phase, 'completing-milestone', 'git-t2: completing-milestone');
      }

    } finally {
      cleanup(repo);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3: Task Commits — Atomic per-task commits on slice branch
  //
  // Verifies each task produces its own commit and the slice branch
  // accumulates them before squash merge.
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: Atomic Per-Task Commits');
  console.log('═'.repeat(70));
  {
    const repo = initRepo();
    const svc = new GitServiceImpl(repo);

    try {
      // Setup milestone with 3 tasks
      writeRoadmap(repo, 'M001', `# M001: API

**Vision:** API endpoints.

## Slices

- [ ] **S01: Endpoints** \`risk:low\` \`depends:[]\`
  > After this: API works.
`);
      writePlan(repo, 'M001', 'S01', `# S01: Endpoints

**Goal:** Build endpoints.
**Demo:** API responds.

## Tasks

- [ ] **T01: GET /health** \`est:5m\`
  Health endpoint.

- [ ] **T02: GET /users** \`est:10m\`
  Users endpoint.

- [ ] **T03: POST /users** \`est:15m\`
  Create user endpoint.
`);
      git('git add -A', repo);
      git('git commit -m "gsd: plan M001/S01"', repo);

      // Create slice branch
      svc.ensureSliceBranch('M001', 'S01');

      // T01
      console.log('\n── T01: GET /health');
      createFile(repo, 'src/routes/health.ts', 'export const health = () => ({ status: "ok" });');
      writeTaskSummary(repo, 'M001', 'S01', 'T01', makeTaskSummary('T01'));
      svc.commit({ message: 'feat(S01/T01): GET /health endpoint' });

      // T02
      console.log('\n── T02: GET /users');
      createFile(repo, 'src/routes/users.ts', 'export const getUsers = () => [];');
      writeTaskSummary(repo, 'M001', 'S01', 'T02', makeTaskSummary('T02'));
      svc.commit({ message: 'feat(S01/T02): GET /users endpoint' });

      // T03
      console.log('\n── T03: POST /users');
      createFile(repo, 'src/routes/create-user.ts', 'export const createUser = (data: any) => ({ id: 1, ...data });');
      writeTaskSummary(repo, 'M001', 'S01', 'T03', makeTaskSummary('T03'));
      svc.commit({ message: 'feat(S01/T03): POST /users endpoint' });

      // Verify 3 task commits on slice branch
      const sliceLog = git('git log --oneline gsd/M001/S01 --not main', repo);
      const sliceCommits = sliceLog.split('\n').filter(Boolean);
      assertTrue(sliceCommits.length >= 3, `git-t3: at least 3 commits on slice branch (got ${sliceCommits.length})`);
      assertTrue(sliceCommits.some(c => c.includes('T01')), 'git-t3: T01 commit exists');
      assertTrue(sliceCommits.some(c => c.includes('T02')), 'git-t3: T02 commit exists');
      assertTrue(sliceCommits.some(c => c.includes('T03')), 'git-t3: T03 commit exists');

      // Complete and squash merge
      console.log('\n── Squash merge: 3 task commits → 1 merge commit');
      writeSliceSummary(repo, 'M001', 'S01', '# S01 Done\n\n3 endpoints built.');
      writeRoadmap(repo, 'M001', `# M001: API

**Vision:** API endpoints.

## Slices

- [x] **S01: Endpoints** \`risk:low\` \`depends:[]\`
  > After this: API works.
`);
      svc.commit({ message: 'gsd: complete S01' });

      svc.switchToMain();
      const merge = svc.mergeSliceToMain('M001', 'S01', 'API Endpoints');

      // Verify squash merge produced a single commit
      assertEq(merge.deletedBranch, true, 'git-t3: branch deleted');
      assertMatch(merge.mergedCommitMessage, /feat\(M001\/S01\)/, 'git-t3: squash commit format');

      // Main log should NOT have individual T01/T02/T03 commits (they were squashed)
      const mainLog = git('git log --oneline main', repo);
      assertTrue(mainLog.includes('feat(M001/S01)'), 'git-t3: squash commit on main');

      // All 3 route files should exist on main
      const mainFiles = git('git ls-files', repo);
      assertTrue(mainFiles.includes('src/routes/health.ts'), 'git-t3: health.ts on main');
      assertTrue(mainFiles.includes('src/routes/users.ts'), 'git-t3: users.ts on main');
      assertTrue(mainFiles.includes('src/routes/create-user.ts'), 'git-t3: create-user.ts on main');

    } finally {
      cleanup(repo);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4: S02 Inherits S01 Content After Merge
  //
  // After S01 merges to main, S02's branch should have all of S01's files.
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 4: Slice Content Inheritance');
  console.log('═'.repeat(70));
  {
    const repo = initRepo();
    const svc = new GitServiceImpl(repo);

    try {
      writeRoadmap(repo, 'M001', `# M001: Stack

**Vision:** Full stack.

## Slices

- [ ] **S01: Backend** \`risk:low\` \`depends:[]\`
  > After this: API works.

- [ ] **S02: Frontend** \`risk:low\` \`depends:[S01]\`
  > After this: UI works.
`);
      git('git add -A', repo);
      git('git commit -m "gsd: roadmap"', repo);

      // S01: create backend files
      console.log('\n── S01: Backend on slice branch');
      svc.ensureSliceBranch('M001', 'S01');
      createFile(repo, 'src/api/server.ts', 'export const app = express();');
      createFile(repo, 'src/api/routes.ts', 'export const routes = [];');
      git('git add -A', repo);
      git('git commit -m "feat(S01/T01): backend"', repo);

      // Merge S01
      svc.switchToMain();
      writeRoadmap(repo, 'M001', `# M001: Stack

**Vision:** Full stack.

## Slices

- [x] **S01: Backend** \`risk:low\` \`depends:[]\`
  > After this: API works.

- [ ] **S02: Frontend** \`risk:low\` \`depends:[S01]\`
  > After this: UI works.
`);
      git('git add -A', repo);
      git('git commit -m "gsd: mark S01 done"', repo);
      svc.mergeSliceToMain('M001', 'S01', 'Backend API');

      // S02: verify it has S01's content
      console.log('\n── S02: Frontend branch has backend files');
      svc.ensureSliceBranch('M001', 'S02');
      assertEq(svc.getCurrentBranch(), 'gsd/M001/S02', 'git-t4: on S02 branch');

      assertTrue(
        existsSync(join(repo, 'src/api/server.ts')),
        'git-t4: S02 has S01 server.ts'
      );
      assertTrue(
        existsSync(join(repo, 'src/api/routes.ts')),
        'git-t4: S02 has S01 routes.ts'
      );

      // S02 can build on S01's work
      createFile(repo, 'src/ui/app.tsx', 'import { routes } from "../api/routes";');
      git('git add -A', repo);
      git('git commit -m "feat(S02/T01): frontend"', repo);

      svc.switchToMain();
      svc.mergeSliceToMain('M001', 'S02', 'Frontend UI');

      // Main has both backend and frontend
      const finalFiles = git('git ls-files', repo);
      assertTrue(finalFiles.includes('src/api/server.ts'), 'git-t4: server.ts on main');
      assertTrue(finalFiles.includes('src/api/routes.ts'), 'git-t4: routes.ts on main');
      assertTrue(finalFiles.includes('src/ui/app.tsx'), 'git-t4: app.tsx on main');

    } finally {
      cleanup(repo);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 5: Runtime Files Excluded from Commits
  //
  // .gsd/ runtime files (STATE.md, auto.lock, metrics.json) should never
  // appear in git commits via smart staging.
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(70));
  console.log('TEST 5: Runtime File Exclusion During Workflow');
  console.log('═'.repeat(70));
  {
    const repo = initRepo();
    const svc = new GitServiceImpl(repo);

    try {
      writeRoadmap(repo, 'M001', `# M001: Test

**Vision:** Test.

## Slices

- [ ] **S01: Work** \`risk:low\` \`depends:[]\`
  > After this: Done.
`);
      git('git add -A', repo);
      git('git commit -m "gsd: roadmap"', repo);

      svc.ensureSliceBranch('M001', 'S01');

      // Simulate runtime files that auto-mode creates
      createFile(repo, '.gsd/STATE.md', '# State\nphase: executing');
      createFile(repo, '.gsd/auto.lock', JSON.stringify({ pid: 12345 }));
      createFile(repo, '.gsd/metrics.json', '{"cost": 0.50}');
      createFile(repo, '.gsd/activity/log-001.jsonl', '{"event":"start"}');
      createFile(repo, '.gsd/runtime/session.json', '{"id":"abc"}');

      // Also create real work
      createFile(repo, 'src/work.ts', 'export const work = true;');

      const commitMsg = svc.commit({ message: 'feat: do work' });
      assertEq(commitMsg, 'feat: do work', 'git-t5: commit succeeded');

      // Verify runtime files NOT in commit
      const showStat = git('git show --stat --format= HEAD', repo);
      assertTrue(showStat.includes('src/work.ts'), 'git-t5: work.ts in commit');
      assertTrue(!showStat.includes('STATE.md'), 'git-t5: STATE.md excluded');
      assertTrue(!showStat.includes('auto.lock'), 'git-t5: auto.lock excluded');
      assertTrue(!showStat.includes('metrics.json'), 'git-t5: metrics.json excluded');
      assertTrue(!showStat.includes('activity'), 'git-t5: activity/ excluded');
      assertTrue(!showStat.includes('runtime'), 'git-t5: runtime/ excluded');

    } finally {
      cleanup(repo);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════════════════════════════════

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
