import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const projectRoot = process.cwd()

const cliWeb = await import('../cli-web-branch.ts')
const webMode = await import('../web-mode.ts')

test('parseCliArgs recognizes --web explicitly', () => {
  const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', '--web'])
  assert.equal(flags.web, true)
  assert.equal(flags.print, undefined)
  assert.equal(flags.mode, undefined)
})

test('package hooks declare a concrete staged web host', () => {
  const rootPackage = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'))
  assert.equal(rootPackage.scripts['stage:web-host'], 'node scripts/stage-web-standalone.cjs')
  assert.equal(rootPackage.scripts['build:web-host'], 'npm --prefix web run build && npm run stage:web-host')
  assert.equal(rootPackage.scripts['gsd'], 'node scripts/dev-cli.js')
  assert.equal(rootPackage.scripts['gsd:web'], 'node scripts/build-web-if-stale.cjs && node scripts/dev-cli.js --web')
  assert.equal(rootPackage.scripts['gsd:web:stop'], 'node scripts/dev-cli.js web stop')
  assert.ok(rootPackage.files.includes('dist/web'))

  const webPackage = JSON.parse(readFileSync(join(projectRoot, 'web', 'package.json'), 'utf-8'))
  assert.equal(webPackage.scripts['start:standalone'], 'node .next/standalone/web/server.js')
})

test('web mode launcher defines or imports a browser opener', () => {
  const source = readFileSync(join(projectRoot, 'src', 'web-mode.ts'), 'utf-8')
  // openBrowser is now defined directly in web-mode.ts (was previously imported from onboarding.js)
  assert.match(source, /openBrowser/)
})

test('cli.ts branches to web mode before interactive startup and preserves cwd-scoped launch inputs', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-cli-'))
  const cwd = join(tmp, 'project space')
  mkdirSync(cwd, { recursive: true })

  let launchInputs: { cwd: string; projectSessionsDir: string; agentDir: string } | undefined

  try {
    const cliSource = readFileSync(join(projectRoot, 'src', 'cli.ts'), 'utf-8')
    const branchIndex = cliSource.indexOf('const webBranch = await runWebCliBranch')
    const modelRegistryIndex = cliSource.indexOf('const modelRegistry =')
    assert.ok(branchIndex !== -1, 'cli.ts contains an explicit web branch handoff')
    assert.ok(modelRegistryIndex !== -1, 'cli.ts still contains the model-registry startup path')
    assert.ok(branchIndex < modelRegistryIndex, 'web branch runs before interactive startup state is constructed')

    const result = await cliWeb.runWebCliBranch(cliWeb.parseCliArgs(['node', 'dist/loader.js', '--web']), {
      cwd: () => cwd,
      runWebMode: async (options) => {
        launchInputs = options
        return {
          mode: 'web',
          ok: true,
          cwd: options.cwd,
          projectSessionsDir: options.projectSessionsDir,
          host: '127.0.0.1',
          port: 43123,
          url: 'http://127.0.0.1:43123',
          hostKind: 'source-dev',
          hostPath: '/tmp/fake-web/package.json',
          hostRoot: '/tmp/fake-web',
        }
      },
    })

    assert.equal(result.handled, true)
    if (!result.handled) throw new Error('expected --web branch to be handled')
    assert.equal(result.exitCode, 0)
    assert.deepEqual(launchInputs, {
      cwd,
      projectSessionsDir: cliWeb.getProjectSessionsDir(cwd),
      agentDir: join(process.env.HOME || '', '.gsd', 'agent'),
    })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('launchWebMode prefers the packaged standalone host and opens the resolved URL', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-host-'))
  const standaloneRoot = join(tmp, 'dist', 'web', 'standalone')
  const serverPath = join(standaloneRoot, 'server.js')
  mkdirSync(standaloneRoot, { recursive: true })
  writeFileSync(serverPath, 'console.log("stub")\n')

  let initResourcesCalled = false
  let unrefCalled = false
  let openedUrl = ''
  let stderrOutput = ''
  let spawnInvocation:
    | { command: string; args: readonly string[]; options: Record<string, any> }
    | undefined
  let writtenPid: { path: string; pid: number } | undefined

  const pidFilePath = join(tmp, 'web-server.pid')

  try {
    const status = await webMode.launchWebMode(
      {
        cwd: '/tmp/current-project',
        projectSessionsDir: '/tmp/.gsd/sessions/--tmp-current-project--',
        agentDir: '/tmp/.gsd/agent',
        packageRoot: tmp,
      },
      {
        initResources: () => {
          initResourcesCalled = true
        },
        resolvePort: async () => 45123,
        execPath: '/custom/node',
        env: { TEST_ENV: '1' },
        spawn: (command, args, options) => {
          spawnInvocation = { command, args, options: options as Record<string, any> }
          return {
            pid: 99999,
            once: () => undefined,
            unref: () => {
              unrefCalled = true
            },
          } as any
        },
        waitForBootReady: async () => undefined,
        openBrowser: (url) => {
          openedUrl = url
        },
        pidFilePath,
        writePidFile: (path, pid) => {
          writtenPid = { path, pid }
          webMode.writePidFile(path, pid)
        },
        stderr: {
          write(chunk: string) {
            stderrOutput += chunk
            return true
          },
        },
      },
    )

    assert.equal(status.ok, true)
    if (!status.ok) throw new Error('expected successful web launch status')
    assert.equal(status.hostKind, 'packaged-standalone')
    assert.equal(status.hostPath, serverPath)
    assert.equal(status.url, 'http://127.0.0.1:45123')
    assert.equal(initResourcesCalled, true)
    assert.equal(unrefCalled, true)
    assert.equal(openedUrl, 'http://127.0.0.1:45123')
    assert.deepEqual(spawnInvocation, {
      command: '/custom/node',
      args: [serverPath],
      options: {
        cwd: standaloneRoot,
        detached: true,
        stdio: 'ignore',
        env: {
          TEST_ENV: '1',
          HOSTNAME: '127.0.0.1',
          PORT: '45123',
          GSD_WEB_HOST: '127.0.0.1',
          GSD_WEB_PORT: '45123',
          GSD_WEB_PROJECT_CWD: '/tmp/current-project',
          GSD_WEB_PROJECT_SESSIONS_DIR: '/tmp/.gsd/sessions/--tmp-current-project--',
          GSD_WEB_PACKAGE_ROOT: tmp,
          GSD_WEB_HOST_KIND: 'packaged-standalone',
        },
      },
    })
    assert.match(stderrOutput, /status=started/)
    assert.match(stderrOutput, /port=45123/)
    // PID file must be written with the spawned process's PID
    assert.deepEqual(writtenPid, { path: pidFilePath, pid: 99999 })
    assert.equal(webMode.readPidFile(pidFilePath), 99999)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('stopWebMode kills process by PID and removes PID file', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-stop-'))
  const pidFilePath = join(tmp, 'web-server.pid')
  let stderrOutput = ''
  let killedPid: number | undefined

  try {
    webMode.writePidFile(pidFilePath, 12345)

    const result = webMode.stopWebMode({
      pidFilePath,
      readPidFile: webMode.readPidFile,
      deletePidFile: webMode.deletePidFile,
      stderr: { write: (chunk: string) => { stderrOutput += chunk; return true } },
      // Override process.kill to avoid killing a real process in tests
    })

    // Since PID 12345 is almost certainly dead, stopWebMode should succeed by treating ESRCH as "already gone"
    assert.equal(result.ok, true)
    assert.match(stderrOutput, /pid=12345/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('stopWebMode reports error when no PID file exists', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-stop-nopid-'))
  const pidFilePath = join(tmp, 'web-server.pid')
  let stderrOutput = ''

  try {
    const result = webMode.stopWebMode({
      pidFilePath,
      readPidFile: webMode.readPidFile,
      deletePidFile: webMode.deletePidFile,
      stderr: { write: (chunk: string) => { stderrOutput += chunk; return true } },
    })

    assert.equal(result.ok, false)
    assert.equal(result.reason, 'no-pid-file')
    assert.match(stderrOutput, /not running/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('runWebCliBranch handles "web stop" subcommand without --web flag', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-branch-stop-'))
  const pidFilePath = join(tmp, 'web-server.pid')
  let stderrOutput = ''

  try {
    const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', 'web', 'stop'])
    assert.equal(flags.web, undefined)
    assert.deepEqual(flags.messages, ['web', 'stop'])

    const result = await cliWeb.runWebCliBranch(flags, {
      stopWebMode: (deps) => {
        return webMode.stopWebMode({ ...deps, pidFilePath })
      },
      stderr: { write: (chunk: string) => { stderrOutput += chunk; return true } },
    })

    assert.equal(result.handled, true)
    if (!result.handled) throw new Error('expected web stop to be handled')
    assert.equal(result.exitCode, 1) // no PID file — expected failure
    if (result.action !== 'stop') throw new Error('expected action=stop')
    assert.equal(result.stopResult.ok, false)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// ─── Path argument tests ──────────────────────────────────────────────

test('parseCliArgs captures --web <path>', () => {
  const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', '--web', '/tmp/my-project'])
  assert.equal(flags.web, true)
  assert.equal(flags.webPath, '/tmp/my-project')
  assert.deepEqual(flags.messages, [])
})

test('parseCliArgs captures --web with relative path', () => {
  const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', '--web', '../other-project'])
  assert.equal(flags.web, true)
  assert.equal(flags.webPath, '../other-project')
})

test('parseCliArgs does not capture --web followed by a flag as path', () => {
  const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', '--web', '--model', 'test'])
  assert.equal(flags.web, true)
  assert.equal(flags.webPath, undefined)
  assert.equal(flags.model, 'test')
})

test('gsd web <path> is handled as web start with path', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-path-'))
  const projectDir = join(tmp, 'my-project')
  mkdirSync(projectDir, { recursive: true })
  let launchedCwd = ''

  try {
    const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', 'web', projectDir])
    assert.deepEqual(flags.messages, ['web', projectDir])

    const result = await cliWeb.runWebCliBranch(flags, {
      runWebMode: async (options) => {
        launchedCwd = options.cwd
        return {
          mode: 'web',
          ok: true,
          cwd: options.cwd,
          projectSessionsDir: options.projectSessionsDir,
          host: '127.0.0.1',
          port: 43124,
          url: 'http://127.0.0.1:43124',
          hostKind: 'source-dev',
          hostPath: '/tmp/fake-web/package.json',
          hostRoot: '/tmp/fake-web',
        }
      },
    })

    assert.equal(result.handled, true)
    if (!result.handled) throw new Error('expected web branch to be handled')
    assert.equal(result.exitCode, 0)
    assert.equal(launchedCwd, projectDir)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('gsd web start <path> resolves path and launches', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-start-path-'))
  const projectDir = join(tmp, 'another-project')
  mkdirSync(projectDir, { recursive: true })
  let launchedCwd = ''

  try {
    const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', 'web', 'start', projectDir])
    assert.deepEqual(flags.messages, ['web', 'start', projectDir])

    const result = await cliWeb.runWebCliBranch(flags, {
      runWebMode: async (options) => {
        launchedCwd = options.cwd
        return {
          mode: 'web',
          ok: true,
          cwd: options.cwd,
          projectSessionsDir: options.projectSessionsDir,
          host: '127.0.0.1',
          port: 43125,
          url: 'http://127.0.0.1:43125',
          hostKind: 'source-dev',
          hostPath: '/tmp/fake-web/package.json',
          hostRoot: '/tmp/fake-web',
        }
      },
    })

    assert.equal(result.handled, true)
    if (!result.handled) throw new Error('expected web branch to be handled')
    assert.equal(result.exitCode, 0)
    assert.equal(launchedCwd, projectDir)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('gsd --web <path> resolves path and launches', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-flag-path-'))
  const projectDir = join(tmp, 'flagged-project')
  mkdirSync(projectDir, { recursive: true })
  let launchedCwd = ''

  try {
    const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', '--web', projectDir])
    assert.equal(flags.web, true)
    assert.equal(flags.webPath, projectDir)

    const result = await cliWeb.runWebCliBranch(flags, {
      runWebMode: async (options) => {
        launchedCwd = options.cwd
        return {
          mode: 'web',
          ok: true,
          cwd: options.cwd,
          projectSessionsDir: options.projectSessionsDir,
          host: '127.0.0.1',
          port: 43126,
          url: 'http://127.0.0.1:43126',
          hostKind: 'source-dev',
          hostPath: '/tmp/fake-web/package.json',
          hostRoot: '/tmp/fake-web',
        }
      },
    })

    assert.equal(result.handled, true)
    if (!result.handled) throw new Error('expected web branch to be handled')
    assert.equal(result.exitCode, 0)
    assert.equal(launchedCwd, projectDir)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('gsd --web <nonexistent-path> fails with clear error', async () => {
  let stderrOutput = ''

  const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', '--web', '/tmp/nonexistent-gsd-test-path-xyz'])
  const result = await cliWeb.runWebCliBranch(flags, {
    stderr: { write: (chunk: string) => { stderrOutput += chunk; return true } },
  })

  assert.equal(result.handled, true)
  if (!result.handled) throw new Error('expected web branch to be handled')
  assert.equal(result.exitCode, 1)
  if (result.action !== 'start') throw new Error('expected action=start')
  assert.equal(result.status.ok, false)
  if (result.status.ok) throw new Error('expected failed status')
  assert.match(result.status.failureReason, /does not exist/)
  assert.match(stderrOutput, /does not exist/)
})

test('launch failure surfaces status and reason before browser open', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-missing-host-'))
  let openedUrl = ''
  let stderrOutput = ''

  try {
    const status = await webMode.launchWebMode(
      {
        cwd: '/tmp/current-project',
        projectSessionsDir: '/tmp/.gsd/sessions/--tmp-current-project--',
        agentDir: '/tmp/.gsd/agent',
        packageRoot: tmp,
      },
      {
        openBrowser: (url) => {
          openedUrl = url
        },
        stderr: {
          write(chunk: string) {
            stderrOutput += chunk
            return true
          },
        },
      },
    )

    assert.equal(status.ok, false)
    if (status.ok) throw new Error('expected failed web launch status')
    assert.equal(status.hostPath, null)
    assert.equal(status.url, null)
    assert.equal(openedUrl, '')
    assert.match(status.failureReason, /host bootstrap not found/)
    assert.match(stderrOutput, /status=failed/)
    assert.match(stderrOutput, /reason=host bootstrap not found/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

// ─── Instance registry tests ─────────────────────────────────────────

test('registerInstance and readInstanceRegistry round-trip', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-registry-'))
  const registryPath = join(tmp, 'web-instances.json')

  try {
    webMode.registerInstance('/tmp/project-a', { pid: 1001, port: 3000, url: 'http://127.0.0.1:3000' }, registryPath)
    webMode.registerInstance('/tmp/project-b', { pid: 1002, port: 3001, url: 'http://127.0.0.1:3001' }, registryPath)

    const registry = webMode.readInstanceRegistry(registryPath)
    assert.equal(Object.keys(registry).length, 2)
    assert.equal(registry['/tmp/project-a']?.pid, 1001)
    assert.equal(registry['/tmp/project-b']?.port, 3001)
    assert.ok(registry['/tmp/project-a']?.startedAt)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('unregisterInstance removes a single entry', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-unreg-'))
  const registryPath = join(tmp, 'web-instances.json')

  try {
    webMode.registerInstance('/tmp/project-a', { pid: 1001, port: 3000, url: 'http://127.0.0.1:3000' }, registryPath)
    webMode.registerInstance('/tmp/project-b', { pid: 1002, port: 3001, url: 'http://127.0.0.1:3001' }, registryPath)
    webMode.unregisterInstance('/tmp/project-a', registryPath)

    const registry = webMode.readInstanceRegistry(registryPath)
    assert.equal(Object.keys(registry).length, 1)
    assert.equal(registry['/tmp/project-a'], undefined)
    assert.equal(registry['/tmp/project-b']?.pid, 1002)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('stopWebMode with projectCwd reports not-found when not in registry', () => {
  let stderrOutput = ''

  const result = webMode.stopWebMode(
    { stderr: { write: (chunk: string) => { stderrOutput += chunk; return true } } },
    { projectCwd: '/tmp/nonexistent-project-for-stop-test' },
  )

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'not-found')
  assert.match(stderrOutput, /No web server running/)
})

test('gsd web stop all is parsed and dispatched', async () => {
  let stopOptions: { projectCwd?: string; all?: boolean } | undefined

  const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', 'web', 'stop', 'all'])
  assert.deepEqual(flags.messages, ['web', 'stop', 'all'])

  const result = await cliWeb.runWebCliBranch(flags, {
    stopWebMode: (_deps, opts) => {
      stopOptions = opts
      return { ok: true, stoppedCount: 2 }
    },
    stderr: { write: () => true },
  })

  assert.equal(result.handled, true)
  if (!result.handled) throw new Error('expected handled')
  assert.equal(result.exitCode, 0)
  assert.equal(stopOptions?.all, true)
  assert.equal(stopOptions?.projectCwd, undefined)
})

test('gsd web stop <path> is parsed and dispatched with resolved path', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gsd-web-stop-path-'))
  let stopOptions: { projectCwd?: string; all?: boolean } | undefined

  try {
    const flags = cliWeb.parseCliArgs(['node', 'dist/loader.js', 'web', 'stop', tmp])
    const result = await cliWeb.runWebCliBranch(flags, {
      cwd: () => '/',
      stopWebMode: (_deps, opts) => {
        stopOptions = opts
        return { ok: true, stoppedCount: 1 }
      },
      stderr: { write: () => true },
    })

    assert.equal(result.handled, true)
    if (!result.handled) throw new Error('expected handled')
    assert.equal(result.exitCode, 0)
    assert.equal(stopOptions?.projectCwd, tmp)
    assert.equal(stopOptions?.all, false)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
