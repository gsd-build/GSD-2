#!/usr/bin/env node
const { mkdirSync, cpSync, copyFileSync, readdirSync } = require('fs');
const { join } = require('path');

/**
 * Recursive directory copy using copyFileSync — workaround for cpSync failures
 * on Windows paths containing non-ASCII characters (#1178).
 */
function safeCpSync(src, dest, options) {
  try {
    cpSync(src, dest, options);
  } catch {
    if (options && options.recursive) {
      copyDirRecursive(src, dest, options && options.filter);
    } else {
      copyFileSync(src, dest);
    }
  }
}

function copyDirRecursive(src, dest, filter) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (filter && !filter(srcPath)) continue;
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, filter);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Theme assets
mkdirSync('dist/modes/interactive/theme', { recursive: true });
safeCpSync('src/modes/interactive/theme', 'dist/modes/interactive/theme', {
  recursive: true,
  filter: (s) => !s.endsWith('.ts'),
});

// Export HTML templates and vendor files
mkdirSync('dist/core/export-html/vendor', { recursive: true });
safeCpSync('src/core/export-html/template.html', 'dist/core/export-html/template.html');
safeCpSync('src/core/export-html/template.css', 'dist/core/export-html/template.css');
safeCpSync('src/core/export-html/template.js', 'dist/core/export-html/template.js');
safeCpSync('src/core/export-html/vendor', 'dist/core/export-html/vendor', {
  recursive: true,
  filter: (s) => !s.endsWith('.ts'),
});

// LSP defaults
mkdirSync('dist/core/lsp', { recursive: true });
safeCpSync('src/core/lsp/defaults.json', 'dist/core/lsp/defaults.json');
safeCpSync('src/core/lsp/lsp.md', 'dist/core/lsp/lsp.md');
