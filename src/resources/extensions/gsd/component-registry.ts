/**
 * Skill-only component registry.
 *
 * This slice intentionally limits the registry to skills. Agents, pipelines,
 * marketplace, and runtime wiring land in later PRs.
 */

import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import {
	ECOSYSTEM_PROJECT_SKILLS_DIR,
	ECOSYSTEM_SKILLS_DIR,
	loadSkillsFromDir,
	type Skill,
} from '@gsd/pi-coding-agent';
import type {
	Component,
	ComponentDiagnostic,
	ComponentFilter,
	ComponentSource,
	SkillSpec,
} from './component-types.js';
import { computeComponentId } from './component-types.js';
import { scanComponentDir } from './component-loader.js';

export interface ComponentRegistryLoadOptions {
	includeDefaults?: boolean;
	skillPaths?: string[];
}

export class ComponentRegistry {
	private components = new Map<string, Component>();
	private loadDiagnostics: ComponentDiagnostic[] = [];
	private loaded = false;
	private readonly cwd: string;
	private readonly realPathSet = new Set<string>();

	constructor(cwd = process.cwd()) {
		this.cwd = cwd;
	}

	load(options: ComponentRegistryLoadOptions = {}): void {
		const includeDefaults = options.includeDefaults ?? true;
		const skillPaths = options.skillPaths ?? [];
		this.components.clear();
		this.loadDiagnostics = [];
		this.realPathSet.clear();
		this.loaded = true;

		if (includeDefaults) {
			this.addSkillDir(ECOSYSTEM_SKILLS_DIR, 'user');
			this.addSkillDir(resolve(this.cwd, ECOSYSTEM_PROJECT_SKILLS_DIR, 'skills'), 'project');

			const legacyDir = join(homedir(), '.gsd', 'agent', 'skills');
			if (shouldLoadLegacySkillsDir(legacyDir, ECOSYSTEM_SKILLS_DIR)) {
				this.addSkillDir(legacyDir, 'user');
			}
		}

		for (const rawPath of skillPaths) {
			const resolvedPath = resolveComponentSkillPath(rawPath, this.cwd);
			const source = this.getSkillPathSource(resolvedPath, includeDefaults);
			this.addSkillDir(resolvedPath, source);
		}
	}

	reload(): void {
		this.load();
	}

	ensureLoaded(): void {
		if (!this.loaded) this.load();
	}

	get(id: string): Component | undefined {
		this.ensureLoaded();
		return this.components.get(id);
	}

	resolve(idOrName: string): Component | undefined {
		this.ensureLoaded();
		const exact = this.components.get(idOrName);
		if (exact) return exact;
		if (idOrName.includes(':')) return undefined;

		const matches = Array.from(this.components.values()).filter(
			component => component.metadata.name === idOrName,
		);
		return matches.length === 1 ? matches[0] : undefined;
	}

	list(filter: ComponentFilter = {}): Component[] {
		this.ensureLoaded();
		let results = Array.from(this.components.values());

		if (filter.enabledOnly !== false) {
			results = results.filter(component => component.enabled);
		}
		if (filter.kind) {
			const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
			results = results.filter(component => kinds.includes(component.kind));
		}
		if (filter.source) {
			const sources = Array.isArray(filter.source) ? filter.source : [filter.source];
			results = results.filter(component => sources.includes(component.source));
		}
		if (filter.namespace !== undefined) {
			results = results.filter(component => component.metadata.namespace === filter.namespace);
		}
		if (filter.tags && filter.tags.length > 0) {
			results = results.filter(component =>
				component.metadata.tags?.some(tag => filter.tags!.includes(tag)),
			);
		}
		if (filter.search) {
			const q = filter.search.toLowerCase();
			results = results.filter(component =>
				component.metadata.name.toLowerCase().includes(q)
				|| component.metadata.description.toLowerCase().includes(q),
			);
		}

		return results;
	}

	skills(): Component[] {
		return this.list({ kind: 'skill' });
	}

	has(id: string): boolean {
		this.ensureLoaded();
		return this.components.has(id);
	}

	get size(): number {
		this.ensureLoaded();
		return this.components.size;
	}

	diagnostics(): ComponentDiagnostic[] {
		return [...this.loadDiagnostics];
	}

	getDiagnostics(): ComponentDiagnostic[] {
		return this.diagnostics();
	}

	register(component: Component): ComponentDiagnostic | undefined {
		const existing = this.components.get(component.id);
		if (existing) {
			const diagnostic: ComponentDiagnostic = {
				type: 'collision',
				message: `component "${component.id}" collision`,
				componentId: component.id,
				path: component.filePath,
				collision: {
					name: component.metadata.name,
					winnerPath: existing.filePath,
					loserPath: component.filePath,
					winnerSource: existing.source,
					loserSource: component.source,
				},
			};
			this.loadDiagnostics.push(diagnostic);
			return diagnostic;
		}

		this.components.set(component.id, component);
		return undefined;
	}

	setEnabled(id: string, enabled: boolean): boolean {
		const component = this.components.get(id);
		if (!component) return false;
		component.enabled = enabled;
		return true;
	}

	getSkillsForPrompt(): Skill[] {
		return this.skills().map(component => ({
			name: component.metadata.name,
			description: component.metadata.description,
			filePath: component.filePath,
			baseDir: component.dirPath,
			source: component.source,
			disableModelInvocation: (component.spec as SkillSpec).disableModelInvocation === true,
		}));
	}

	private addSkillDir(dir: string, source: ComponentSource): void {
		this.addLegacySkills(loadSkillsFromDir({ dir, source: source === 'project' ? 'project' : 'user' }));

		const componentResult = scanComponentDir(dir, source, 'skill');
		this.loadDiagnostics.push(...componentResult.diagnostics);
		for (const component of componentResult.components) {
			if (component.format === 'component-yaml') this.register(component);
		}
	}

	private addLegacySkills(result: ReturnType<typeof loadSkillsFromDir>): void {
		this.loadDiagnostics.push(
			...result.diagnostics.map(diagnostic => ({
				type: diagnostic.type === 'collision' ? 'collision' as const : 'warning' as const,
				message: diagnostic.message,
				path: diagnostic.path,
				collision: diagnostic.collision,
			})),
		);

		for (const skill of result.skills) {
			let realPath = skill.filePath;
			try {
				realPath = realpathSync(skill.filePath);
			} catch {
				// Keep original path when the file cannot be resolved.
			}
			if (this.realPathSet.has(realPath)) continue;

			const component = skillToComponent(skill);
			const diagnostic = this.register(component);
			if (!diagnostic) this.realPathSet.add(realPath);
		}
	}

	private getSkillPathSource(resolvedPath: string, includeDefaults: boolean): ComponentSource {
		if (includeDefaults) return 'path';
		if (isUnderPath(resolvedPath, ECOSYSTEM_SKILLS_DIR)) return 'user';
		if (isUnderPath(resolvedPath, resolve(this.cwd, ECOSYSTEM_PROJECT_SKILLS_DIR, 'skills'))) {
			return 'project';
		}
		return 'path';
	}
}

function skillToComponent(skill: Skill): Component {
	return {
		id: computeComponentId(skill.name),
		kind: 'skill',
		metadata: {
			name: skill.name,
			description: skill.description,
		},
		spec: {
			prompt: basename(skill.filePath),
			disableModelInvocation: skill.disableModelInvocation,
		},
		dirPath: skill.baseDir,
		filePath: skill.filePath,
		source: skill.source === 'user' || skill.source === 'project' ? skill.source : 'path',
		format: 'skill-md',
		enabled: true,
	};
}

function isUnderPath(target: string, root: string): boolean {
	const normalizedRoot = resolve(root);
	if (target === normalizedRoot) return true;
	const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
	return target.startsWith(prefix);
}

export function resolveComponentSkillPath(rawPath: string, cwd: string, homeDir = homedir()): string {
	const expanded = rawPath === '~'
		? homeDir
		: rawPath.startsWith('~/')
			? join(homeDir, rawPath.slice(2))
			: rawPath;
	return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

export function shouldLoadLegacySkillsDir(legacyDir: string, ecosystemDir: string): boolean {
	return legacyDir !== ecosystemDir
		&& existsSync(legacyDir)
		&& !existsSync(join(legacyDir, '.migrated-to-agents'));
}
