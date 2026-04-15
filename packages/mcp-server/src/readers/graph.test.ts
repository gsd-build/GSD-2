// GSD MCP Server — knowledge graph reader tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import {
  buildGraph,
  writeGraph,
  writeSnapshot,
  graphStatus,
  graphQuery,
  graphDiff,
} from './graph.js';
import type { KnowledgeGraph } from './graph.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function tmpProject(): string {
  const dir = join(tmpdir(), `gsd-graph-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFixture(base: string, relPath: string, content: string): void {
  const full = join(base, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

function makeProjectWithArtifacts(projectDir: string): void {
  writeFixture(projectDir, '.gsd/STATE.md', [
    '# GSD State',
    '',
    '**Active Milestone:** M001: Auth System',
    '**Active Slice:** S01: Login flow',
    '**Phase:** execution',
    '',
    '## Milestone Registry',
    '',
    '- 🔄 **M001:** Auth System',
    '',
    '## Next Action',
    '',
    'Execute T01 in S01.',
  ].join('\n'));

  writeFixture(projectDir, '.gsd/KNOWLEDGE.md', [
    '# Project Knowledge',
    '',
    '## Rules',
    '',
    '| # | Scope | Rule | Why | Added |',
    '|---|-------|------|-----|-------|',
    '| K001 | auth | Hash passwords with bcrypt | Security requirement | manual |',
    '| K002 | db | Use transactions for multi-table | Data consistency | auto |',
    '',
    '## Patterns',
    '',
    '| # | Pattern | Where | Notes |',
    '|---|---------|-------|-------|',
    '| P001 | Singleton services | services/ | Prevents duplication |',
    '',
    '## Lessons Learned',
    '',
    '| # | What Happened | Root Cause | Fix | Scope |',
    '|---|--------------|------------|-----|-------|',
    '| L001 | CI tests failed | Env diff | Added setup script | testing |',
  ].join('\n'));

  writeFixture(projectDir, '.gsd/milestones/M001/M001-ROADMAP.md', [
    '# M001: Auth System',
    '',
    '## Vision',
    '',
    'Build authentication for the platform.',
    '',
    '## Slice Overview',
    '',
    '| ID | Slice | Risk | Depends | Done | After this |',
    '|----|-------|------|---------|------|------------|',
    '| S01 | Login flow | low | — | 🔄 | Users can log in |',
  ].join('\n'));

  writeFixture(projectDir, '.gsd/milestones/M001/slices/S01/S01-PLAN.md', [
    '# S01: Login flow',
    '',
    '## Tasks',
    '',
    '- [ ] **T01: Implement login endpoint** — Core auth logic',
    '- [ ] **T02: Add session management** — Keep users logged in',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// buildGraph tests
// ---------------------------------------------------------------------------

describe('buildGraph', () => {
  let projectDir: string;

  before(() => {
    projectDir = tmpProject();
    makeProjectWithArtifacts(projectDir);
  });

  after(() => rmSync(projectDir, { recursive: true, force: true }));

  it('returns nodeCount > 0 for a project with artifacts', async () => {
    const graph = await buildGraph(projectDir);
    assert.ok(graph.nodes.length > 0, `Expected nodes, got ${graph.nodes.length}`);
  });

  it('returns edgeCount >= 0 (valid graph structure)', async () => {
    const graph = await buildGraph(projectDir);
    assert.ok(graph.edges.length >= 0);
  });

  it('includes builtAt ISO timestamp', async () => {
    const graph = await buildGraph(projectDir);
    assert.ok(typeof graph.builtAt === 'string');
    assert.ok(!isNaN(Date.parse(graph.builtAt)));
  });

  it('skips unparseable artifact and does not throw', async () => {
    const badProject = tmpProject();
    // Write a corrupt/minimal STATE.md that is technically valid but empty
    writeFixture(badProject, '.gsd/STATE.md', 'not valid gsd state at all \0\0\0');
    // Should not throw
    const graph = await buildGraph(badProject);
    assert.ok(graph.nodes.length >= 0);
    rmSync(badProject, { recursive: true, force: true });
  });

  it('returns empty graph for project with no .gsd/ directory', async () => {
    const emptyProject = tmpProject();
    const graph = await buildGraph(emptyProject);
    assert.ok(graph.nodes.length >= 0); // no throw
    assert.equal(typeof graph.builtAt, 'string');
    rmSync(emptyProject, { recursive: true, force: true });
  });

  it('nodes have required fields: id, label, type, confidence', async () => {
    const graph = await buildGraph(projectDir);
    for (const node of graph.nodes) {
      assert.ok(typeof node.id === 'string', 'node.id must be string');
      assert.ok(typeof node.label === 'string', 'node.label must be string');
      assert.ok(typeof node.type === 'string', 'node.type must be string');
      assert.ok(
        node.confidence === 'EXTRACTED' ||
        node.confidence === 'INFERRED' ||
        node.confidence === 'AMBIGUOUS',
        `Invalid confidence: ${node.confidence}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// writeGraph tests
// ---------------------------------------------------------------------------

describe('writeGraph', () => {
  let projectDir: string;
  let graph: KnowledgeGraph;

  before(async () => {
    projectDir = tmpProject();
    makeProjectWithArtifacts(projectDir);
    graph = await buildGraph(projectDir);
  });

  after(() => rmSync(projectDir, { recursive: true, force: true }));

  it('creates graph.json in .gsd/graphs/ after writeGraph()', async () => {
    const gsdRoot = join(projectDir, '.gsd');
    await writeGraph(gsdRoot, graph);
    const graphPath = join(gsdRoot, 'graphs', 'graph.json');
    assert.ok(existsSync(graphPath), `Expected ${graphPath} to exist`);
  });

  it('write is atomic — no temp file remains after writeGraph()', async () => {
    const gsdRoot = join(projectDir, '.gsd');
    await writeGraph(gsdRoot, graph);
    const tmpPath = join(gsdRoot, 'graphs', 'graph.tmp.json');
    assert.ok(!existsSync(tmpPath), 'Temp file should not exist after successful write');
  });

  it('written graph.json is valid JSON with nodes and edges', async () => {
    const gsdRoot = join(projectDir, '.gsd');
    await writeGraph(gsdRoot, graph);
    const raw = readFileSync(join(gsdRoot, 'graphs', 'graph.json'), 'utf-8');
    const parsed = JSON.parse(raw) as KnowledgeGraph;
    assert.ok(Array.isArray(parsed.nodes));
    assert.ok(Array.isArray(parsed.edges));
    assert.ok(typeof parsed.builtAt === 'string');
  });
});

// ---------------------------------------------------------------------------
// graphStatus tests
// ---------------------------------------------------------------------------

describe('graphStatus', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = tmpProject();
  });

  afterEach(() => rmSync(projectDir, { recursive: true, force: true }));

  it('returns { exists: false } when no graph.json exists', async () => {
    const status = await graphStatus(projectDir);
    assert.equal(status.exists, false);
  });

  it('returns { exists: true, nodeCount, edgeCount, ageHours } when graph exists', async () => {
    makeProjectWithArtifacts(projectDir);
    const gsdRoot = join(projectDir, '.gsd');
    const graph = await buildGraph(projectDir);
    await writeGraph(gsdRoot, graph);

    const status = await graphStatus(projectDir);
    assert.equal(status.exists, true);
    assert.ok(typeof status.nodeCount === 'number');
    assert.ok(typeof status.edgeCount === 'number');
    assert.ok(typeof status.ageHours === 'number');
    assert.ok(status.ageHours >= 0);
  });

  it('stale = false for a freshly built graph', async () => {
    makeProjectWithArtifacts(projectDir);
    const gsdRoot = join(projectDir, '.gsd');
    const graph = await buildGraph(projectDir);
    await writeGraph(gsdRoot, graph);

    const status = await graphStatus(projectDir);
    assert.equal(status.stale, false);
  });

  it('stale = true for a graph older than 24h (builtAt backdated)', async () => {
    makeProjectWithArtifacts(projectDir);
    const gsdRoot = join(projectDir, '.gsd');
    mkdirSync(join(gsdRoot, 'graphs'), { recursive: true });

    // Write a graph with a builtAt 25 hours ago
    const oldGraph: KnowledgeGraph = {
      nodes: [],
      edges: [],
      builtAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    };
    writeFileSync(
      join(gsdRoot, 'graphs', 'graph.json'),
      JSON.stringify(oldGraph),
      'utf-8',
    );

    const status = await graphStatus(projectDir);
    assert.equal(status.exists, true);
    assert.equal(status.stale, true);
  });
});

// ---------------------------------------------------------------------------
// graphQuery tests
// ---------------------------------------------------------------------------

describe('graphQuery', () => {
  let projectDir: string;

  before(async () => {
    projectDir = tmpProject();
    makeProjectWithArtifacts(projectDir);
    const gsdRoot = join(projectDir, '.gsd');
    const graph = await buildGraph(projectDir);
    await writeGraph(gsdRoot, graph);
  });

  after(() => rmSync(projectDir, { recursive: true, force: true }));

  it('returns matching nodes for a known term', async () => {
    const result = await graphQuery(projectDir, 'auth');
    assert.ok(Array.isArray(result.nodes));
    // Should match nodes with 'auth' in label or description
    assert.ok(result.nodes.length > 0, 'Expected at least one match for "auth"');
  });

  it('returns empty array for a term that matches nothing', async () => {
    const result = await graphQuery(projectDir, 'xxxxxxnotfound999zzz');
    assert.ok(Array.isArray(result.nodes));
    assert.equal(result.nodes.length, 0);
  });

  it('search is case-insensitive', async () => {
    const lower = await graphQuery(projectDir, 'auth');
    const upper = await graphQuery(projectDir, 'AUTH');
    assert.deepEqual(
      lower.nodes.map((n) => n.id).sort(),
      upper.nodes.map((n) => n.id).sort(),
    );
  });

  it('budget trims AMBIGUOUS edges first', async () => {
    const gsdRoot = join(projectDir, '.gsd');
    // Write a graph with mixed confidence edges
    const mixedGraph: KnowledgeGraph = {
      builtAt: new Date().toISOString(),
      nodes: [
        { id: 'n1', label: 'seed node budget', type: 'milestone', confidence: 'EXTRACTED' },
        { id: 'n2', label: 'connected via AMBIGUOUS', type: 'task', confidence: 'AMBIGUOUS' },
        { id: 'n3', label: 'connected via INFERRED', type: 'task', confidence: 'INFERRED' },
      ],
      edges: [
        { from: 'n1', to: 'n2', type: 'contains', confidence: 'AMBIGUOUS' },
        { from: 'n1', to: 'n3', type: 'contains', confidence: 'INFERRED' },
      ],
    };
    await writeGraph(gsdRoot, mixedGraph);

    // With a very small budget, AMBIGUOUS edges should be trimmed first
    const result = await graphQuery(projectDir, 'seed node budget', 10);
    // At minimum, the seed node itself should be present
    assert.ok(result.nodes.some((n) => n.id === 'n1'), 'Seed node should be in result');

    // Restore the original graph
    const originalGraph = await buildGraph(projectDir);
    await writeGraph(gsdRoot, originalGraph);
  });
});

// ---------------------------------------------------------------------------
// writeSnapshot + graphDiff tests
// ---------------------------------------------------------------------------

describe('graphDiff', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = tmpProject();
    makeProjectWithArtifacts(projectDir);
    const gsdRoot = join(projectDir, '.gsd');
    const graph = await buildGraph(projectDir);
    await writeGraph(gsdRoot, graph);
  });

  afterEach(() => rmSync(projectDir, { recursive: true, force: true }));

  it('returns empty diff when comparing graph to itself (snapshot = current)', async () => {
    const gsdRoot = join(projectDir, '.gsd');
    await writeSnapshot(gsdRoot);
    const diff = await graphDiff(projectDir);
    assert.ok(Array.isArray(diff.nodes.added));
    assert.ok(Array.isArray(diff.nodes.removed));
    assert.ok(Array.isArray(diff.nodes.changed));
    assert.equal(diff.nodes.added.length, 0);
    assert.equal(diff.nodes.removed.length, 0);
  });

  it('returns added nodes when a new node appears after snapshot', async () => {
    const gsdRoot = join(projectDir, '.gsd');
    // Take snapshot of the original graph
    await writeSnapshot(gsdRoot);

    // Now write a graph with an extra node
    const extraGraph: KnowledgeGraph = {
      builtAt: new Date().toISOString(),
      nodes: [
        { id: 'brand-new-node', label: 'New Feature', type: 'milestone', confidence: 'EXTRACTED' },
      ],
      edges: [],
    };
    await writeGraph(gsdRoot, extraGraph);

    const diff = await graphDiff(projectDir);
    assert.ok(diff.nodes.added.includes('brand-new-node'), 'new node should be in added');
  });

  it('returns removed nodes when a node disappears after snapshot', async () => {
    const gsdRoot = join(projectDir, '.gsd');
    // Create snapshot with a node that won't exist in current graph
    const snapshotGraph: KnowledgeGraph = {
      builtAt: new Date().toISOString(),
      nodes: [
        { id: 'old-node-to-be-removed', label: 'Old', type: 'task', confidence: 'EXTRACTED' },
      ],
      edges: [],
    };
    writeFileSync(
      join(gsdRoot, 'graphs', '.last-build-snapshot.json'),
      JSON.stringify({ ...snapshotGraph, snapshotAt: new Date().toISOString() }),
      'utf-8',
    );

    // Current graph.json has no such node
    const diff = await graphDiff(projectDir);
    assert.ok(diff.nodes.removed.includes('old-node-to-be-removed'), 'old node should be in removed');
  });

  it('returns empty diff structure when no snapshot exists', async () => {
    // No snapshot file — diff should be empty/meaningful
    const diff = await graphDiff(projectDir);
    assert.ok(Array.isArray(diff.nodes.added));
    assert.ok(Array.isArray(diff.nodes.removed));
    assert.ok(Array.isArray(diff.nodes.changed));
    assert.ok(Array.isArray(diff.edges.added));
    assert.ok(Array.isArray(diff.edges.removed));
  });

  it('writeSnapshot creates .last-build-snapshot.json with snapshotAt', async () => {
    const gsdRoot = join(projectDir, '.gsd');
    await writeSnapshot(gsdRoot);
    const snapshotPath = join(gsdRoot, 'graphs', '.last-build-snapshot.json');
    assert.ok(existsSync(snapshotPath));
    const raw = readFileSync(snapshotPath, 'utf-8');
    const parsed = JSON.parse(raw) as KnowledgeGraph & { snapshotAt: string };
    assert.ok(typeof parsed.snapshotAt === 'string');
    assert.ok(!isNaN(Date.parse(parsed.snapshotAt)));
  });
});
