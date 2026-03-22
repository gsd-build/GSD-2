#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const srcLoaderPath = resolve(root, 'src', 'loader.ts')
const resolveTsPath = resolve(root, 'src', 'resources', 'extensions', 'gsd', 'tests', 'resolve-ts.mjs')

const child = spawn(
  process.execPath,
  ['--import', resolveTsPath, '--experimental-strip-types', srcLoaderPath, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  },
)

child.on('error', (error) => {
  console.error(`[gsd] Failed to launch local dev CLI: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
