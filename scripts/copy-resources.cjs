#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { copyFileSync, mkdirSync, readdirSync, rmSync } = require('fs');
const { dirname, join } = require('path');

function copyNonTsFiles(srcDir, destDir) {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyNonTsFiles(srcPath, destPath);
      continue;
    }

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      continue;
    }

    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
  }
}

rmSync('dist/resources', { recursive: true, force: true });

const tscBin = require.resolve('typescript/bin/tsc');
const compile = spawnSync(process.execPath, [tscBin, '--project', 'tsconfig.resources.json'], {
  stdio: 'inherit',
});

if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

copyNonTsFiles('src/resources', 'dist/resources');
