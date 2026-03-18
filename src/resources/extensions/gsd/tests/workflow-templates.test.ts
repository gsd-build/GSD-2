// GSD Workflow Templates — Unit Tests
//
// Tests registry loading, template resolution, auto-detection, and listing.

import { createTestContext } from './test-helpers.ts';
import {
  loadRegistry,
  resolveByName,
  autoDetect,
  listTemplates,
  getTemplateInfo,
  loadWorkflowTemplate,
} from '../workflow-templates.ts';

const { assertEq, assertTrue, assertMatch, report } = createTestContext();

// ═══════════════════════════════════════════════════════════════════════════
// Registry Loading
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── Registry Loading ──');

{
  const registry = loadRegistry();
  assertTrue(registry !== null, 'Registry should load');
  assertEq(registry.version, 1, 'Registry version should be 1');
  assertTrue(Object.keys(registry.templates).length >= 8, 'Should have at least 8 templates');

  // Verify required template keys exist
  const expectedIds = ['full-project', 'bugfix', 'small-feature', 'refactor', 'spike', 'hotfix', 'security-audit', 'dep-upgrade'];
  for (const id of expectedIds) {
    assertTrue(id in registry.templates, `Template "${id}" should exist in registry`);
  }

  // Verify each template has required fields
  for (const [id, entry] of Object.entries(registry.templates)) {
    assertTrue(typeof entry.name === 'string' && entry.name.length > 0, `${id}: name should be non-empty string`);
    assertTrue(typeof entry.description === 'string' && entry.description.length > 0, `${id}: description should be non-empty`);
    assertTrue(typeof entry.file === 'string' && entry.file.endsWith('.md'), `${id}: file should be a .md path`);
    assertTrue(Array.isArray(entry.phases) && entry.phases.length > 0, `${id}: phases should be non-empty array`);
    assertTrue(Array.isArray(entry.triggers) && entry.triggers.length > 0, `${id}: triggers should be non-empty array`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Resolve by Name
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── Resolve by Name ──');

{
  // Exact match
  const bugfix = resolveByName('bugfix');
  assertTrue(bugfix !== null, 'Should resolve "bugfix"');
  assertEq(bugfix!.id, 'bugfix', 'ID should be "bugfix"');
  assertEq(bugfix!.confidence, 'exact', 'Exact name should have exact confidence');

  // Case-insensitive name match
  const spike = resolveByName('Research Spike');
  assertTrue(spike !== null, 'Should resolve "Research Spike" by name');
  assertEq(spike!.id, 'spike', 'Should resolve to spike');

  // Alias match
  const bug = resolveByName('bug');
  assertTrue(bug !== null, 'Should resolve "bug" alias');
  assertEq(bug!.id, 'bugfix', 'Alias "bug" should map to bugfix');

  const feat = resolveByName('feat');
  assertTrue(feat !== null, 'Should resolve "feat" alias');
  assertEq(feat!.id, 'small-feature', 'Alias "feat" should map to small-feature');

  const deps = resolveByName('deps');
  assertTrue(deps !== null, 'Should resolve "deps" alias');
  assertEq(deps!.id, 'dep-upgrade', 'Alias "deps" should map to dep-upgrade');

  // No match
  const missing = resolveByName('nonexistent-template');
  assertTrue(missing === null, 'Should return null for unknown template');
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-Detection
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── Auto-Detection ──');

{
  // Should detect bugfix from "fix" keyword
  const fixMatches = autoDetect('fix the login button');
  assertTrue(fixMatches.length > 0, 'Should detect matches for "fix the login button"');
  assertTrue(fixMatches.some(m => m.id === 'bugfix'), 'Should include bugfix in matches');

  // Should detect spike from "research" keyword
  const researchMatches = autoDetect('research authentication libraries');
  assertTrue(researchMatches.length > 0, 'Should detect matches for "research"');
  assertTrue(researchMatches.some(m => m.id === 'spike'), 'Should include spike in matches');

  // Should detect hotfix from "urgent" keyword
  const urgentMatches = autoDetect('urgent production is down');
  assertTrue(urgentMatches.length > 0, 'Should detect matches for "urgent"');
  assertTrue(urgentMatches.some(m => m.id === 'hotfix'), 'Should include hotfix in matches');

  // Should detect dep-upgrade from "upgrade" keyword
  const upgradeMatches = autoDetect('upgrade react to v19');
  assertTrue(upgradeMatches.length > 0, 'Should detect matches for "upgrade"');
  assertTrue(upgradeMatches.some(m => m.id === 'dep-upgrade'), 'Should include dep-upgrade in matches');

  // Multi-word triggers should score higher
  const projectMatches = autoDetect('create a new project from scratch');
  const projectMatch = projectMatches.find(m => m.id === 'full-project');
  assertTrue(projectMatch !== undefined, 'Should detect full-project for "from scratch"');

  // Empty input should return no matches
  const emptyMatches = autoDetect('');
  assertEq(emptyMatches.length, 0, 'Empty input should return no matches');
}

// ═══════════════════════════════════════════════════════════════════════════
// List Templates
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── List Templates ──');

{
  const output = listTemplates();
  assertTrue(output.includes('Workflow Templates'), 'Should have header');
  assertTrue(output.includes('bugfix'), 'Should list bugfix');
  assertTrue(output.includes('spike'), 'Should list spike');
  assertTrue(output.includes('hotfix'), 'Should list hotfix');
  assertTrue(output.includes('/gsd start'), 'Should include usage hint');
}

// ═══════════════════════════════════════════════════════════════════════════
// Template Info
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── Template Info ──');

{
  const info = getTemplateInfo('bugfix');
  assertTrue(info !== null, 'Should return info for bugfix');
  assertTrue(info!.includes('Bug Fix'), 'Should include template name');
  assertTrue(info!.includes('triage'), 'Should include phase names');
  assertTrue(info!.includes('Triggers'), 'Should include triggers section');

  const missing = getTemplateInfo('nonexistent');
  assertTrue(missing === null, 'Should return null for unknown template');
}

// ═══════════════════════════════════════════════════════════════════════════
// Load Workflow Template Content
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n── Load Workflow Template ──');

{
  const content = loadWorkflowTemplate('bugfix');
  assertTrue(content !== null, 'Should load bugfix template');
  assertTrue(content!.includes('Bugfix Workflow'), 'Should contain workflow title');
  assertTrue(content!.includes('Phase 1: Triage'), 'Should contain triage phase');
  assertTrue(content!.includes('Phase 4: Ship'), 'Should contain ship phase');

  const hotfixContent = loadWorkflowTemplate('hotfix');
  assertTrue(hotfixContent !== null, 'Should load hotfix template');
  assertTrue(hotfixContent!.includes('Hotfix Workflow'), 'Should contain hotfix title');

  const missingContent = loadWorkflowTemplate('nonexistent');
  assertTrue(missingContent === null, 'Should return null for unknown template');
}

// ═══════════════════════════════════════════════════════════════════════════

report();
