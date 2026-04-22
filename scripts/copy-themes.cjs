#!/usr/bin/env node
const { existsSync, mkdirSync, cpSync } = require('fs');
const { resolve } = require('path');

const candidates = [
  resolve(__dirname, '..', 'packages', 'pi-coding-agent', 'dist', 'modes', 'interactive', 'theme'),
  resolve(__dirname, '..', 'packages', 'pi-coding-agent', 'dist', 'core', 'theme'),
];

const src = candidates.find((path) => existsSync(path));
if (!src) {
  throw new Error(`copy-themes: no theme directory found. Checked:\n${candidates.join('\n')}`);
}

mkdirSync('pkg/dist/modes/interactive/theme', { recursive: true });
cpSync(src, 'pkg/dist/modes/interactive/theme', { recursive: true });
