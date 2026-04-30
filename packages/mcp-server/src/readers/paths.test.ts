// GSD MCP Server — .gsd/ path cache tests

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  _resetReaderCaches,
  findMilestoneIds,
  findSliceIds,
  findTaskFiles,
} from './paths.js';

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

function writeFixture(base: string, relPath: string, content: string): void {
  const full = join(base, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

describe('reader path caches', () => {
  beforeEach(() => {
    _resetReaderCaches();
  });

  it('returns defensive copies of cached milestone and slice ids', () => {
    const tmp = makeTempDir('gsd-path-cache');
    try {
      const gsdRoot = join(tmp, '.gsd');
      mkdirSync(join(gsdRoot, 'milestones', 'M001', 'slices', 'S01'), { recursive: true });
      mkdirSync(join(gsdRoot, 'milestones', 'M002'), { recursive: true });

      const milestoneIds = findMilestoneIds(gsdRoot);
      milestoneIds.push('M999');
      assert.deepEqual(findMilestoneIds(gsdRoot), ['M001', 'M002']);

      const sliceIds = findSliceIds(gsdRoot, 'M001');
      sliceIds.push('S99');
      assert.deepEqual(findSliceIds(gsdRoot, 'M001'), ['S01']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns defensive copies of cached task file objects', () => {
    const tmp = makeTempDir('gsd-path-task-cache');
    try {
      const gsdRoot = join(tmp, '.gsd');
      writeFixture(gsdRoot, 'milestones/M001/slices/S01/tasks/T01-PLAN.md', '# T01');

      const taskFiles = findTaskFiles(gsdRoot, 'M001', 'S01');
      taskFiles[0].hasSummary = true;
      taskFiles.push({ id: 'T99', hasPlan: true, hasSummary: true });

      assert.deepEqual(findTaskFiles(gsdRoot, 'M001', 'S01'), [
        { id: 'T01', hasPlan: true, hasSummary: false },
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
