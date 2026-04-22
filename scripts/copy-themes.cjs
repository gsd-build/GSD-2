#!/usr/bin/env node
const { mkdirSync, cpSync } = require('fs');
const { resolve } = require('path');
const src = resolve(__dirname, '..', 'packages', 'pi-coding-agent', 'dist', 'modes', 'interactive', 'theme');
mkdirSync('pkg/dist/modes/interactive/theme', { recursive: true });
cpSync(src, 'pkg/dist/modes/interactive/theme', { recursive: true });
