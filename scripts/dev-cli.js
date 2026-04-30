#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const devCliPath = fileURLToPath(import.meta.url)
const root = resolve(__dirname, '..')
const srcLoaderPath = resolve(root, 'src', 'loader.ts')
const resolveTsPath = resolve(root, 'src', 'resources', 'extensions', 'gsd', 'tests', 'resolve-ts.mjs')

const child = spawn(
  process.execPath,
  ['--import', resolveTsPath, '--experimental-strip-types', srcLoaderPath, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      // Child GSD processes (subagents, parallel workers, workflow MCP)
      // must re-enter through this wrapper so source-mode TS imports keep
      // using resolve-ts. Pointing them at src/loader.ts directly makes Node
      // resolve .js specifiers without the TS resolver.
      GSD_DEV_CLI_PATH: devCliPath,
      GSD_CLI_PATH: devCliPath,
      GSD_BIN_PATH: devCliPath,
    },
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
