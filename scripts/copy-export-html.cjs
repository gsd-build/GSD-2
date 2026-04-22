#!/usr/bin/env node
const { existsSync, mkdirSync, cpSync } = require('fs');
const { resolve } = require('path');

const candidates = [
  resolve(__dirname, '..', 'packages', 'gsd-agent-core', 'dist', 'export-html'),
  resolve(__dirname, '..', 'packages', 'pi-coding-agent', 'dist', 'core', 'export-html'),
];

const src = candidates.find((path) => existsSync(path));
if (!src) {
  throw new Error(`copy-export-html: no export-html directory found. Checked:\n${candidates.join('\n')}`);
}

mkdirSync('pkg/dist/core/export-html', { recursive: true });
cpSync(src, 'pkg/dist/core/export-html', { recursive: true });
