import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const workflowPath = resolve(import.meta.dir, '../../../.github/workflows/release.yml');
const workflowContent = readFileSync(workflowPath, 'utf8');

describe('release workflow structure', () => {
  it('triggers on release/* branch push', () => {
    expect(workflowContent).toContain("release/*");
  });

  it('triggers on workflow_dispatch', () => {
    expect(workflowContent).toContain('workflow_dispatch');
  });

  it('includes macos-latest in matrix', () => {
    expect(workflowContent).toContain('macos-latest');
  });

  it('includes windows-latest in matrix', () => {
    expect(workflowContent).toContain('windows-latest');
  });

  it('includes ubuntu runner in matrix', () => {
    expect(workflowContent).toContain('ubuntu-');
  });

  it('uses tauri-apps/tauri-action', () => {
    expect(workflowContent).toContain('tauri-apps/tauri-action');
  });

  it('creates draft release', () => {
    expect(workflowContent).toContain('releaseDraft: true');
  });

  it('references TAURI_SIGNING_PRIVATE_KEY secret', () => {
    expect(workflowContent).toContain('TAURI_SIGNING_PRIVATE_KEY');
  });

  it('references APPLE_CERTIFICATE secret', () => {
    expect(workflowContent).toContain('APPLE_CERTIFICATE');
  });
});
