#!/usr/bin/env node

const { cpSync, existsSync, mkdirSync, readdirSync, rmSync } = require('node:fs')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '..')
const webRoot = join(root, 'web')
const standaloneRoot = join(webRoot, '.next', 'standalone')
const standaloneAppRoot = join(standaloneRoot, 'web')
const standaloneNodeModulesRoot = join(standaloneRoot, 'node_modules')
const staticRoot = join(webRoot, '.next', 'static')
const publicRoot = join(webRoot, 'public')
const distWebRoot = join(root, 'dist', 'web')
const distStandaloneRoot = join(distWebRoot, 'standalone')
const sourceNodePtyRoot = join(webRoot, 'node_modules', 'node-pty')

const COPY_OPTIONS = {
  recursive: true,
  force: true,
  dereference: true,
}

function overlayNodePty(targetRoot) {
  if (!existsSync(sourceNodePtyRoot)) return []

  const hydrated = []
  const directTarget = join(targetRoot, 'node_modules', 'node-pty')
  mkdirSync(join(targetRoot, 'node_modules'), { recursive: true })
  cpSync(sourceNodePtyRoot, directTarget, COPY_OPTIONS)
  hydrated.push(directTarget)

  const hashedNodeModulesRoot = join(targetRoot, '.next', 'node_modules')
  if (!existsSync(hashedNodeModulesRoot)) return hydrated

  for (const entry of readdirSync(hashedNodeModulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('node-pty-')) continue
    const target = join(hashedNodeModulesRoot, entry.name)
    cpSync(sourceNodePtyRoot, target, COPY_OPTIONS)
    hydrated.push(target)
  }

  return hydrated
}

if (!existsSync(standaloneAppRoot)) {
  console.error('[gsd] Web standalone build not found at web/.next/standalone/web. Run `npm --prefix web run build` first.')
  process.exit(1)
}

rmSync(distWebRoot, { recursive: true, force: true })
mkdirSync(distStandaloneRoot, { recursive: true })

cpSync(standaloneAppRoot, distStandaloneRoot, COPY_OPTIONS)

if (existsSync(standaloneNodeModulesRoot)) {
  cpSync(standaloneNodeModulesRoot, join(distStandaloneRoot, 'node_modules'), COPY_OPTIONS)
}

if (existsSync(staticRoot)) {
  mkdirSync(join(distStandaloneRoot, '.next'), { recursive: true })
  cpSync(staticRoot, join(distStandaloneRoot, '.next', 'static'), COPY_OPTIONS)
}

if (existsSync(publicRoot)) {
  cpSync(publicRoot, join(distStandaloneRoot, 'public'), COPY_OPTIONS)
}

const hydratedTargets = overlayNodePty(distStandaloneRoot)

console.log(`[gsd] Staged web standalone host at ${distStandaloneRoot}`)
if (hydratedTargets.length > 0) {
  console.log(`[gsd] Hydrated node-pty native assets in ${hydratedTargets.length} location(s).`)
}
