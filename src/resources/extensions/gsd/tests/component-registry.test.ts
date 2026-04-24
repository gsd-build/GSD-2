/**
 * Skill component registry tests.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSkills } from '@gsd/pi-coding-agent';
import {
	ComponentRegistry,
	resolveComponentSkillPath,
	shouldLoadLegacySkillsDir,
} from '../component-registry.js';

let testDir: string;

function setupTestDir(): string {
	const dir = join(tmpdir(), `gsd-component-registry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writeSkill(dir: string, name: string, description: string, body = `Use ${name}.`): string {
	const skillDir = join(dir, name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, 'SKILL.md'), `---
name: ${name}
description: ${description}
---

${body}
`, 'utf-8');
	return join(skillDir, 'SKILL.md');
}

function writeComponentSkill(dir: string, name: string, namespace?: string): void {
	const skillDir = join(dir, name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, 'component.yaml'), `
apiVersion: gsd/v1
kind: skill
metadata:
  name: ${name}
${namespace ? `  namespace: ${namespace}\n` : ''}  description: "New format skill"
spec:
  prompt: SKILL.md
`, 'utf-8');
	writeFileSync(join(skillDir, 'SKILL.md'), `Use ${name}.`, 'utf-8');
}

describe('ComponentRegistry (skills)', () => {
	beforeEach(() => {
		testDir = setupTestDir();
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it('loads, lists, resolves, and disables skills from real SKILL.md files', () => {
		const skillsDir = join(testDir, '.agents', 'skills');
		writeSkill(skillsDir, 'review', 'Reviews code');

		const registry = new ComponentRegistry(testDir);
		registry.load({ includeDefaults: false, skillPaths: [skillsDir] });

		assert.strictEqual(registry.size, 1);
		assert.strictEqual(registry.resolve('review')?.id, 'review');
		assert.strictEqual(registry.list({ kind: 'skill' }).length, 1);
		assert.strictEqual(registry.setEnabled('review', false), true);
		assert.strictEqual(registry.list().length, 0);
		assert.strictEqual(registry.list({ enabledOnly: false }).length, 1);
	});

	it('keeps first loaded skill and records duplicate-name collisions from load()', () => {
		const firstDir = join(testDir, 'first-skills');
		const secondDir = join(testDir, 'second-skills');
		const firstPath = writeSkill(firstDir, 'review', 'First review skill');
		const secondPath = writeSkill(secondDir, 'review', 'Second review skill');

		const registry = new ComponentRegistry(testDir);
		registry.load({ includeDefaults: false, skillPaths: [firstDir, secondDir] });

		assert.strictEqual(registry.size, 1);
		assert.strictEqual(registry.resolve('review')?.filePath, firstPath);
		const collision = registry.diagnostics().find(diagnostic => diagnostic.type === 'collision');
		assert.ok(collision);
		assert.strictEqual(collision.collision?.winnerPath, firstPath);
		assert.strictEqual(collision.collision?.loserPath, secondPath);
	});

	it('resolves namespace-qualified skills and rejects ambiguous shorthand from loaded components', () => {
		const alphaDir = join(testDir, 'alpha-skills');
		const betaDir = join(testDir, 'beta-skills');
		writeComponentSkill(alphaDir, 'review', 'alpha');
		writeComponentSkill(betaDir, 'review', 'beta');

		const registry = new ComponentRegistry(testDir);
		registry.load({ includeDefaults: false, skillPaths: [alphaDir, betaDir] });

		assert.strictEqual(registry.resolve('alpha:review')?.id, 'alpha:review');
		assert.strictEqual(registry.resolve('review'), undefined);
	});

	it('loads new-format skill components from explicit skill paths', () => {
		const skillsDir = join(testDir, '.agents', 'skills');
		writeComponentSkill(skillsDir, 'new-review');

		const registry = new ComponentRegistry(testDir);
		registry.load({ includeDefaults: false, skillPaths: [skillsDir] });

		assert.strictEqual(registry.skills().length, 1);
		assert.strictEqual(registry.resolve('new-review')?.format, 'component-yaml');
	});

	it('matches legacy .agents/skills loading shape through getSkillsForPrompt', () => {
		const skillsDir = join(testDir, '.agents', 'skills');
		writeSkill(skillsDir, 'review', 'Reviews code');
		writeSkill(skillsDir, 'security-audit', 'Checks security issues');

		const current = loadSkills({
			cwd: testDir,
			includeDefaults: false,
			skillPaths: [skillsDir],
		}).skills;
		const registry = new ComponentRegistry(testDir);
		registry.load({ includeDefaults: false, skillPaths: [skillsDir] });

		assert.deepStrictEqual(
			registry.getSkillsForPrompt().map(skill => ({
				name: skill.name,
				description: skill.description,
				filePath: skill.filePath,
				baseDir: skill.baseDir,
				source: skill.source,
				disableModelInvocation: skill.disableModelInvocation,
			})).sort((a, b) => a.name.localeCompare(b.name)),
			current.map(skill => ({
				name: skill.name,
				description: skill.description,
				filePath: skill.filePath,
				baseDir: skill.baseDir,
				source: skill.source,
				disableModelInvocation: skill.disableModelInvocation,
			})).sort((a, b) => a.name.localeCompare(b.name)),
		);
	});

	it('expands ~ and ~/ skill paths against the supplied home directory helper', () => {
		const fakeHome = join(testDir, 'home');

		assert.strictEqual(resolveComponentSkillPath('~', testDir, fakeHome), fakeHome);
		assert.strictEqual(
			resolveComponentSkillPath('~/skills', testDir, fakeHome),
			join(fakeHome, 'skills'),
		);
		assert.strictEqual(
			resolveComponentSkillPath('relative-skills', testDir, fakeHome),
			join(testDir, 'relative-skills'),
		);
	});

	it('skips migrated legacy skill directories', () => {
		const legacyDir = join(testDir, 'legacy', 'agent', 'skills');
		mkdirSync(legacyDir, { recursive: true });
		assert.strictEqual(shouldLoadLegacySkillsDir(legacyDir, join(testDir, '.agents', 'skills')), true);

		writeFileSync(join(legacyDir, '.migrated-to-agents'), '', 'utf-8');
		assert.strictEqual(shouldLoadLegacySkillsDir(legacyDir, join(testDir, '.agents', 'skills')), false);
		assert.strictEqual(shouldLoadLegacySkillsDir(legacyDir, legacyDir), false);
	});
});
