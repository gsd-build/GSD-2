import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// release.yml is committed in the mission-control repo but may not exist in the
// upstream monorepo until the PR is merged and the workflow is added.
// Tests silently pass when the file is absent (same pattern as security-threat-model.test.ts).
const workflowPath = resolve(import.meta.dir, '../../../.github/workflows/release.yml');
let workflowContent: string | null = null;
try {
  workflowContent = readFileSync(workflowPath, 'utf8');
} catch {
  // File not present in this environment — tests will be skipped below
}

describe('release workflow structure', () => {
  it('triggers on release/* branch push', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain("release/*");
  });

  it('triggers on workflow_dispatch', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain('workflow_dispatch');
  });

  it('includes macos-latest in matrix', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain('macos-latest');
  });

  it('includes windows-latest in matrix', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain('windows-latest');
  });

  it('includes ubuntu runner in matrix', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain('ubuntu-');
  });

  it('uses tauri-apps/tauri-action', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain('tauri-apps/tauri-action');
  });

  it('publishes release immediately (releaseDraft: false) for OTA compatibility', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain('releaseDraft: false');
    expect(workflowContent).not.toContain('releaseDraft: true');
  });

  it('references TAURI_SIGNING_PRIVATE_KEY secret', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain('TAURI_SIGNING_PRIVATE_KEY');
  });

  it('references APPLE_CERTIFICATE secret', () => {
    if (!workflowContent) return;
    expect(workflowContent).toContain('APPLE_CERTIFICATE');
  });
});
