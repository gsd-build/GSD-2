import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const cssPath = new URL('../src/renderer/src/styles/index.css', import.meta.url)
const tokensPath = new URL('../src/renderer/src/lib/theme/tokens.ts', import.meta.url)

test('theme CSS defines required color tokens and font-display block', async () => {
  const css = await readFile(cssPath, 'utf8')

  for (const token of [
    '--color-bg-primary',
    '--color-bg-secondary',
    '--color-bg-tertiary',
    '--color-bg-hover',
    '--color-border',
    '--color-border-active',
    '--color-text-primary',
    '--color-text-secondary',
    '--color-text-tertiary',
    '--color-accent',
    '--color-accent-hover',
    '--color-accent-muted',
    '--font-sans',
    '--font-mono'
  ]) {
    assert.match(css, new RegExp(token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')))
  }

  const blockMatches = css.match(/font-display:\s*block;/g) ?? []
  assert.equal(blockMatches.length, 5)
})

test('token module exports key theme primitives', async () => {
  const tokensFile = await readFile(tokensPath, 'utf8')
  assert.match(tokensFile, /accent: '#d4a04e'/)
  assert.match(tokensFile, /mono: "'JetBrains Mono'/)
  assert.match(tokensFile, /body: '0\.9375rem'/)
})
