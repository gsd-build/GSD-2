import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SettingsManager,
  SessionManager,
  createAgentSession,
  InteractiveMode,
  runPrintMode,
  runRpcMode,
} from '@gsd/pi-coding-agent'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agentDir, sessionsDir, authFilePath } from './app-paths.js'
import { initResources, buildResourceLoader, getNewerManagedResourceVersion } from './resource-loader.js'
import { ensureManagedTools } from './tool-bootstrap.js'
import { loadStoredEnvKeys } from './wizard.js'
import { getPiDefaultModelAndProvider, migratePiCredentials } from './pi-migration.js'
import { shouldRunOnboarding, runOnboarding } from './onboarding.js'
import chalk from 'chalk'
import { checkForUpdates } from './update-check.js'
import { printHelp, printSubcommandHelp } from './help-text.js'
import {
  parseCliArgs as parseWebCliArgs,
  runWebCliBranch,
  migrateLegacyFlatSessions,
} from './cli-web-branch.js'
import { stopWebMode } from './web-mode.js'
import { getProjectSessionsDir } from './project-sessions.js'
import { markStartup, printStartupTimings } from './startup-timings.js'

// ---------------------------------------------------------------------------
// Minimal CLI arg parser — detects print/subagent mode flags
// ---------------------------------------------------------------------------
interface CliFlags {
  mode?: 'text' | 'json' | 'rpc' | 'mcp'
  print?: boolean
  continue?: boolean
  noSession?: boolean
  worktree?: boolean | string
  model?: string
  listModels?: string | true
  extensions: string[]
  appendSystemPrompt?: string
  tools?: string[]
  messages: string[]
  web?: boolean
  webPath?: string

  /** Set by `gsd sessions` when the user picks a specific session to resume */
  _selectedSessionPath?: string
}

function exitIfManagedResourcesAreNewer(currentAgentDir: string): void {
  const currentVersion = process.env.GSD_VERSION || '0.0.0'
  const managedVersion = getNewerManagedResourceVersion(currentAgentDir, currentVersion)
  if (!managedVersion) {
    return
  }

  process.stderr.write(
    `[gsd] ${chalk.yellow('Version mismatch detected')}\n` +
    `[gsd] Synced resources are from ${chalk.bold(`v${managedVersion}`)}, but this \`gsd\` binary is ${chalk.dim(`v${currentVersion}`)}.\n` +
    `[gsd] Run ${chalk.bold('npm install -g gsd-pi@latest')} or ${chalk.bold('gsd update')}, then try again.\n`,
  )
  process.exit(1)
}

function parseCliArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { extensions: [], messages: [] }
  const args = argv.slice(2) // skip node + script
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--mode' && i + 1 < args.length) {
      const m = args[++i]
      if (m === 'text' || m === 'json' || m === 'rpc' || m === 'mcp') flags.mode = m
    } else if (arg === '--print' || arg === '-p') {
      flags.print = true
    } else if (arg === '--continue' || arg === '-c') {
      flags.continue = true
    } else if (arg === '--no-session') {
      flags.noSession = true
    } else if (arg === '--model' && i + 1 < args.length) {
      flags.model = args[++i]
    } else if (arg === '--extension' && i + 1 < args.length) {
      flags.extensions.push(args[++i])
    } else if (arg === '--append-system-prompt' && i + 1 < args.length) {
      flags.appendSystemPrompt = args[++i]
    } else if (arg === '--tools' && i + 1 < args.length) {
      flags.tools = args[++i].split(',')
    } else if (arg === '--list-models') {
      flags.listModels = (i + 1 < args.length && !args[i + 1].startsWith('-')) ? args[++i] : true
    } else if (arg === '--version' || arg === '-v') {
      process.stdout.write((process.env.GSD_VERSION || '0.0.0') + '\n')
      process.exit(0)
    } else if (arg === '--worktree' || arg === '-w') {
      // -w with no value → auto-generate name; -w <name> → use that name
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags.worktree = args[++i]
      } else {
        flags.worktree = true
      }
    } else if (arg === '--help' || arg === '-h') {
      printHelp(process.env.GSD_VERSION || '0.0.0')
      process.exit(0)
    } else if (arg === '--web') {
      flags.web = true
      // Capture optional project path after --web (not a flag)
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags.webPath = args[++i]
      }
    } else if (!arg.startsWith('--') && !arg.startsWith('-')) {
      flags.messages.push(arg)
    }
  }
  return flags
}

const cliFlags = parseCliArgs(process.argv)
const isPrintMode = cliFlags.print || cliFlags.mode !== undefined

// Early resource-skew check — must run before TTY gate so version mismatch
// errors surface even in non-TTY environments.
exitIfManagedResourcesAreNewer(agentDir)

// Early TTY check — must come before heavy initialization to avoid dangling
// handles that prevent process.exit() from completing promptly.
const hasSubcommand = cliFlags.messages.length > 0
if (!process.stdin.isTTY && !isPrintMode && !hasSubcommand && !cliFlags.listModels && !cliFlags.web) {
  process.stderr.write('[gsd] Error: Interactive mode requires a terminal (TTY).\n')
  process.stderr.write('[gsd] Non-interactive alternatives:\n')
  process.stderr.write('[gsd]   gsd --print "your message"     Single-shot prompt\n')
  process.stderr.write('[gsd]   gsd --mode rpc                 JSON-RPC over stdin/stdout\n')
  process.stderr.write('[gsd]   gsd --mode mcp                 MCP server over stdin/stdout\n')
  process.stderr.write('[gsd]   gsd --mode text "message"      Text output mode\n')
  process.exit(1)
}

// `gsd <subcommand> --help` — show subcommand-specific help
const subcommand = cliFlags.messages[0]
if (subcommand && process.argv.includes('--help')) {
  if (printSubcommandHelp(subcommand, process.env.GSD_VERSION || '0.0.0')) {
    process.exit(0)
  }
}

// `gsd config` — replay the setup wizard and exit
if (cliFlags.messages[0] === 'config') {
  const authStorage = AuthStorage.create(authFilePath)
  loadStoredEnvKeys(authStorage)
  await runOnboarding(authStorage)
  process.exit(0)
}

// `gsd update` — update to the latest version via npm
if (cliFlags.messages[0] === 'update') {
  const { runUpdate } = await import('./update-cmd.js')
  await runUpdate()
  process.exit(0)
}

// `gsd web stop [path|all]` — stop web server before anything else
if (cliFlags.messages[0] === 'web' && cliFlags.messages[1] === 'stop') {
  const webFlags = parseWebCliArgs(process.argv)
  const webBranch = await runWebCliBranch(webFlags, {
    stopWebMode,
    stderr: process.stderr,
    baseSessionsDir: sessionsDir,
    agentDir,
  })
  if (webBranch.handled) {
    process.exit(webBranch.exitCode)
  }
}

// `gsd --web [path]` or `gsd web [start] [path]` — launch browser-only web mode
if (cliFlags.web || (cliFlags.messages[0] === 'web' && cliFlags.messages[1] !== 'stop')) {
  const webFlags = parseWebCliArgs(process.argv)
  const webBranch = await runWebCliBranch(webFlags, {
    stderr: process.stderr,
    baseSessionsDir: sessionsDir,
    agentDir,
  })
  if (webBranch.handled) {
    process.exit(webBranch.exitCode)
  }
}


// ---------------------------------------------------------------------------
// Session picker — shared by `gsd sessions` subcommand and startup-without-args
// ---------------------------------------------------------------------------
/**
 * Display an interactive session picker for the current working directory.
 *
 * `exitOnCancel=true`  — used by `gsd sessions`: q/invalid/empty exits the process.
 * `exitOnCancel=false` — used at startup: q/empty/0 means "start a new session".
 *
 * On a valid pick, sets `cliFlags._selectedSessionPath` so the session manager
 * below opens that specific file instead of creating a new one.
 */
async function runSessionPicker(exitOnCancel: boolean): Promise<void> {
  const cwd = process.cwd()
  const pickerSessionsDir = getProjectSessionsDir(cwd)

  const sessions = await SessionManager.list(cwd, pickerSessionsDir)

  if (sessions.length === 0) {
    if (exitOnCancel) {
      process.stderr.write(chalk.yellow('No sessions found for this directory.\n'))
      process.exit(0)
    }
    return
  }

  const maxShow = exitOnCancel ? 20 : 10
  const toShow = sessions.slice(0, maxShow)

  // ── Layout helpers ────────────────────────────────────────────────────────
  // Sample a long date to get the real max width for this locale
  const _sampleDate = new Date(2026, 11, 31, 23, 59)
  function formatDate(d: Date): string {
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  }

  // Fixed column widths (never change regardless of terminal size)
  const COL_NUM  = 3   // right-aligned number: " 1" .. "10"
  const COL_MSGS = 4   // right-aligned: "  30"
  const COL_DATE = Math.max(formatDate(_sampleDate).length, 20)

  // getLayout() — reads terminal width at call time so resize is instant
  function getLayout() {
    const termWidth = process.stderr.columns || 80
    // Table row structure:
    //   "  │ " + NUM + " │ " + DATE + " │ " + MSGS + " │ " + TOPIC + " │"
    const TABLE_OVERHEAD = 2 + 1 + (COL_NUM + 2) + 1 + (COL_DATE + 2) + 1 + (COL_MSGS + 2) + 1 + 2
    const MIN_TABLE_WIDTH = TABLE_OVERHEAD + COL_NUM + COL_DATE + COL_MSGS + 12
    const useWide = termWidth >= MIN_TABLE_WIDTH
    const COL_TOPIC = Math.max(12, termWidth - TABLE_OVERHEAD - COL_NUM - COL_DATE - COL_MSGS)
    const compactWidth = Math.max(10, termWidth - 8)
    return { termWidth, useWide, COL_TOPIC, compactWidth }
  }

  const ESC = '\x1B'
  const HIDE_CURSOR  = `${ESC}[?25l`
  const SHOW_CURSOR  = `${ESC}[?25h`
  const CLEAR_LINE   = `${ESC}[2K\r`
  const MOVE_UP      = (n: number) => `${ESC}[${n}A`
  const ALT_SCREEN_ON  = `${ESC}[?1049h`
  const ALT_SCREEN_OFF = `${ESC}[?1049l`
  const CLEAR_SCREEN   = `${ESC}[2J${ESC}[H`

  /** Strip ANSI escape codes to get visible length. */
  function visLen(s: string): number {
    return s.replace(/\x1B\[[0-9;]*m/g, '').length
  }

  /** Pad/truncate to exact visible width. */
  function cell(text: string, len: number, align: 'left' | 'right' = 'left'): string {
    const vl = visLen(text)
    const diff = len - vl
    if (diff < 0) {
      let result = ''
      let count = 0
      for (const ch of text.replace(/\x1B\[[0-9;]*m/g, '')) {
        if (count >= len - 1) { result += '…'; break }
        result += ch; count++
      }
      return result
    }
    if (align === 'right') return ' '.repeat(diff) + text
    return text + ' '.repeat(diff)
  }

  // Wide layout: full table with 4 columns — uses live layout values
  function tableRow(num: string, date: string, msgs: string, topic: string, COL_TOPIC: number): string {
    return (
      '  │ ' + cell(num, COL_NUM, 'right') +
      ' │ ' + cell(date, COL_DATE) +
      ' │ ' + cell(msgs, COL_MSGS, 'right') +
      ' │ ' + cell(topic, COL_TOPIC) +
      ' │'
    )
  }

  function divider(l: string, m: string, r: string, COL_TOPIC: number): string {
    return (
      '  ' + l +
      '─'.repeat(COL_NUM + 2) + m +
      '─'.repeat(COL_DATE + 2) + m +
      '─'.repeat(COL_MSGS + 2) + m +
      '─'.repeat(COL_TOPIC + 2) + r
    )
  }

  // compactWidth is now derived inside getLayout() — placeholder kept for compactRow
  // compactWidth is derived from getLayout() on every render

  function compactRow(num: string | null, date: string, msgs: string, topic: string, isSelected: boolean, cw: number): string[] {
    const selector = isSelected ? chalk.cyan('▶') : ' '
    const numStr = num !== null ? chalk.bold(num.padStart(2)) : ' 0'
    const meta = `${date}  ${chalk.dim(`(${msgs} msgs)`)}`
    const topicLine = cell(topic, cw)
    const line1 = `  ${selector} ${numStr}  ${meta}`
    const line2 = `      ${chalk.dim('└─')} ${isSelected ? chalk.white(topicLine) : chalk.dim(topicLine)}`
    return [line1, line2]
  }


  // ── Build rows list ───────────────────────────────────────────────────────
  type PickerRow = { label: string; sessionIdx: number | null }
  const rows: PickerRow[] = []

  if (!exitOnCancel) {
    rows.push({ label: '[ new conversation ]', sessionIdx: null })
  }
  for (let i = 0; i < toShow.length; i++) {
    const s = toShow[i]
    const topic = s.name || (s.firstMessage ? s.firstMessage.replace(/\n/g, ' ') : '(empty)')
    rows.push({ label: topic, sessionIdx: i })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function renderTable(selectedIdx: number): string {
    // Re-read terminal dimensions on every render — picks up resize events instantly
    const { termWidth, useWide, COL_TOPIC, compactWidth } = getLayout()
    const out: string[] = []
    out.push(chalk.bold(`\n  Sessions for ${chalk.cyan(cwd)}\n`))

    if (useWide) {
      // ── Wide: full table ──
      out.push(divider('┌', '┬', '┐', COL_TOPIC))
      out.push(tableRow(chalk.bold(' # '), chalk.bold('Date'), chalk.bold('Msgs'), chalk.bold('Topic'), COL_TOPIC))
      out.push(divider('├', '┼', '┤', COL_TOPIC))

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const isSelected = i === selectedIdx

        if (r.sessionIdx === null) {
          const line = tableRow(' 0 ', '[ new conversation ]', '', '', COL_TOPIC)
          out.push(isSelected ? chalk.bgBlue(chalk.white(line)) : chalk.dim(line))
          out.push(divider('├', '┼', '┤', COL_TOPIC))
        } else {
          const s = toShow[r.sessionIdx]
          const numStr   = String(r.sessionIdx + 1)
          const dateStr  = formatDate(s.modified)
          const msgsStr  = String(s.messageCount)
          // Truncate/pad topic BEFORE applying chalk — cell() can't see through ANSI codes
          const topicRaw = cell(r.label, COL_TOPIC)
          const topicStr = isSelected ? topicRaw : (s.name ? chalk.cyan(topicRaw) : chalk.white(topicRaw))
          const dateColored  = isSelected ? dateStr : chalk.green(dateStr)
          const msgsColored  = isSelected ? msgsStr : chalk.cyan(msgsStr)
          const line = tableRow(numStr, dateColored, msgsColored, topicStr, COL_TOPIC)
          out.push(isSelected ? chalk.bgBlue(chalk.white(line)) : line)
        }
      }

      out.push(divider('└', '┴', '┘', COL_TOPIC))

    } else {
      // ── Compact: 2 lines per row ──
      out.push('  ' + '─'.repeat(Math.max(10, termWidth - 4)))

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const isSelected = i === selectedIdx

        if (r.sessionIdx === null) {
          const selector = isSelected ? chalk.cyan('▶') : ' '
          const line = `  ${selector}  0  ${isSelected ? chalk.white('[ new conversation ]') : chalk.dim('[ new conversation ]')}`
          out.push(line)
          out.push('  ' + '─'.repeat(Math.max(10, termWidth - 4)))
        } else {
          const s = toShow[r.sessionIdx]
          const lines = compactRow(
            String(r.sessionIdx + 1),
            isSelected ? formatDate(s.modified) : chalk.green(formatDate(s.modified)),
            String(s.messageCount),
            r.label,
            isSelected,
            compactWidth,
          )
          out.push(...lines)
        }
      }

      out.push('  ' + '─'.repeat(Math.max(10, termWidth - 4)))
    }

    if (sessions.length > maxShow) {
      const extra = sessions.length - maxShow
      const hint = exitOnCancel ? '' : `  · ${chalk.bold('gsd sessions')} to see all`
      out.push(chalk.dim(`\n  ... and ${extra} more${hint}`))
    }

    const hint = exitOnCancel
      ? chalk.dim('  ↑↓ navigate  ·  Enter select  ·  Esc/q quit')
      : chalk.dim('  ↑↓ navigate  ·  Enter select  ·  Esc = new conversation')
    out.push('\n' + hint + '\n')

    return out.join('\n')
  }

  // ── Interactive key loop ──────────────────────────────────────────────────
  // Returns: { chosen: selected row index or -1 }
  async function interactiveSelect(): Promise<{ chosen: number }> {
    return new Promise((resolve) => {
      let selected = 0
      // Enter alternate screen: picker lives here, original terminal is untouched
      process.stderr.write(ALT_SCREEN_ON + HIDE_CURSOR)

      function paint() {
        // Always clear from top and redraw — no line counting, no wrap math
        process.stderr.write(CLEAR_SCREEN + renderTable(selected))
      }

      paint()

      const stdin = process.stdin as NodeJS.ReadStream
      if (stdin.setRawMode) stdin.setRawMode(true)
      stdin.resume()
      stdin.setEncoding('utf8')

      function onKey(key: string) {
        if (key === '\x1B[A' || key === '\x1B[D') {
          // Up or Left
          selected = (selected - 1 + rows.length) % rows.length
          paint()
        } else if (key === '\x1B[B' || key === '\x1B[C') {
          // Down or Right
          selected = (selected + 1) % rows.length
          paint()
        } else if (key === '\r' || key === '\n') {
          // Enter — select
          cleanup()
          resolve({ chosen: selected })
        } else if (key === '\x1B' || key === 'q' || key === 'Q') {
          // Esc or q — cancel
          cleanup()
          resolve({ chosen: -1 })
        } else if (key === '\x03') {
          // Ctrl+C
          cleanup()
          process.stderr.write('\n')
          process.exit(0)
        }
      }

      // Polling fallback: Windows Terminal doesn't fire resize on maximize/restore
      let lastCols = process.stderr.columns || 80
      const resizePoll = setInterval(() => {
        const cols = process.stderr.columns || 80
        if (cols !== lastCols) {
          lastCols = cols
          paint()
        }
      }, 150)

      function onResize() { paint() }

      // Listen on both — Windows Terminal fires on stderr, others on stdout
      process.stdout.on('resize', onResize)
      process.stderr.on('resize', onResize)

      function cleanup() {
        clearInterval(resizePoll)
        process.stdout.removeListener('resize', onResize)
        process.stderr.removeListener('resize', onResize)
        stdin.removeListener('data', onKey)
        if (stdin.setRawMode) stdin.setRawMode(false)
        stdin.pause()
        process.stderr.write(ALT_SCREEN_OFF + SHOW_CURSOR)
      }

      stdin.on('data', onKey)
    })
  }

  const { chosen } = await interactiveSelect()

  // Alt screen already exited in cleanup() — terminal is restored automatically

  // Restore stdin for TUI
  process.stdin.removeAllListeners('data')
  process.stdin.removeAllListeners('keypress')
  if ((process.stdin as NodeJS.ReadStream).setRawMode) {
    (process.stdin as NodeJS.ReadStream).setRawMode(false)
  }
  process.stdin.pause()

  if (chosen === -1) {
    // Cancelled
    if (exitOnCancel) {
      process.stderr.write(chalk.dim('  Cancelled.\n\n'))
      process.exit(0)
    }
    // ESC at startup = start fresh silently
    return
  }

  const row = rows[chosen]

  if (row.sessionIdx === null) {
    // "New conversation" row selected
    process.stderr.write(chalk.dim('  Starting new conversation...\n\n'))
    return
  }

  const selected = toShow[row.sessionIdx]
  process.stderr.write(chalk.green(`  Resuming session from ${formatDate(selected.modified)}...\n\n`))
  cliFlags.continue = true
  cliFlags._selectedSessionPath = selected.path
}

// `gsd sessions` — explicit subcommand: show full picker, exit process on cancel
if (cliFlags.messages[0] === 'sessions') {
  await runSessionPicker(true)
}

// Startup without arguments — show compact picker so the user can choose a
// previous session or start fresh. Skip in non-interactive / subagent / print modes.
if (
  cliFlags.messages.length === 0 &&
  !cliFlags.continue &&
  !cliFlags.noSession &&
  !isPrintMode &&
  process.stdin.isTTY
) {
  await runSessionPicker(false)
}

// `gsd headless` — run auto-mode without TUI
if (cliFlags.messages[0] === 'headless') {
  const { runHeadless, parseHeadlessArgs } = await import('./headless.js')
  await runHeadless(parseHeadlessArgs(process.argv))
  process.exit(0)
}

// Pi's tool bootstrap can mis-detect already-installed fd/rg on some systems
// because spawnSync(..., ["--version"]) returns EPERM despite a zero exit code.
// Provision local managed binaries first so Pi sees them without probing PATH.
ensureManagedTools(join(agentDir, 'bin'))
markStartup('ensureManagedTools')

const authStorage = AuthStorage.create(authFilePath)
markStartup('AuthStorage.create')
loadStoredEnvKeys(authStorage)
migratePiCredentials(authStorage)

// Resolve models.json path with fallback to ~/.pi/agent/models.json
const { resolveModelsJsonPath } = await import('./models-resolver.js')
const modelsJsonPath = resolveModelsJsonPath()

const modelRegistry = new ModelRegistry(authStorage, modelsJsonPath)
markStartup('ModelRegistry')
const settingsManager = SettingsManager.create(agentDir)
markStartup('SettingsManager.create')

// Run onboarding wizard on first launch (no LLM provider configured)
if (!isPrintMode && shouldRunOnboarding(authStorage, settingsManager.getDefaultProvider())) {
  await runOnboarding(authStorage)

  // Clean up stdin state left by @clack/prompts.
  // readline.emitKeypressEvents() adds a permanent data listener and
  // readline.createInterface() may leave stdin paused. Remove stale
  // listeners and pause stdin so the TUI can start with a clean slate.
  process.stdin.removeAllListeners('data')
  process.stdin.removeAllListeners('keypress')
  if (process.stdin.setRawMode) process.stdin.setRawMode(false)
  process.stdin.pause()
}

// Update check — non-blocking banner check; interactive prompt deferred to avoid
// blocking startup. The passive checkForUpdates() prints a banner if an update is
// available (using cached data or a background fetch) without blocking the TUI.
if (!isPrintMode) {
  checkForUpdates().catch(() => {})
}

// Warn if terminal is too narrow for readable output
if (!isPrintMode && process.stdout.columns && process.stdout.columns < 40) {
  process.stderr.write(
    chalk.yellow(`[gsd] Terminal width is ${process.stdout.columns} columns (minimum recommended: 40). Output may be unreadable.\n`),
  )
}

// --list-models: print available models and exit (no TTY needed)
if (cliFlags.listModels !== undefined) {
  const models = modelRegistry.getAvailable()
  if (models.length === 0) {
    console.log('No models available. Set API keys in environment variables.')
    process.exit(0)
  }

  const searchPattern = typeof cliFlags.listModels === 'string' ? cliFlags.listModels : undefined
  let filtered = models
  if (searchPattern) {
    const q = searchPattern.toLowerCase()
    filtered = models.filter((m) => `${m.provider} ${m.id} ${m.name}`.toLowerCase().includes(q))
  }

  // Sort by name descending (newest first), then provider, then id
  filtered.sort((a, b) => {
    const nameCmp = b.name.localeCompare(a.name)
    if (nameCmp !== 0) return nameCmp
    const provCmp = a.provider.localeCompare(b.provider)
    if (provCmp !== 0) return provCmp
    return a.id.localeCompare(b.id)
  })

  const fmt = (n: number) => n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : `${n}`
  const rows = filtered.map((m) => [
    m.provider,
    m.id,
    m.name,
    fmt(m.contextWindow),
    fmt(m.maxTokens),
    m.reasoning ? 'yes' : 'no',
  ])
  const hdrs = ['provider', 'model', 'name', 'context', 'max-out', 'thinking']
  const widths = hdrs.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const pad = (s: string, w: number) => s.padEnd(w)
  console.log(hdrs.map((h, i) => pad(h, widths[i])).join('  '))
  for (const row of rows) {
    console.log(row.map((c, i) => pad(c, widths[i])).join('  '))
  }
  process.exit(0)
}

// Validate configured model on startup — catches stale settings from prior installs
// (e.g. grok-2 which no longer exists) and fresh installs with no settings.
// Only resets the default when the configured model no longer exists in the registry;
// never overwrites a valid user choice.
const configuredProvider = settingsManager.getDefaultProvider()
const configuredModel = settingsManager.getDefaultModel()
const allModels = modelRegistry.getAll()
const availableModels = modelRegistry.getAvailable()
const configuredExists = configuredProvider && configuredModel &&
  allModels.some((m) => m.provider === configuredProvider && m.id === configuredModel)
const configuredAvailable = configuredProvider && configuredModel &&
  availableModels.some((m) => m.provider === configuredProvider && m.id === configuredModel)

if (!configuredModel || !configuredExists) {
  // Model not configured at all, or removed from registry — pick a fallback.
  // Only fires when the model is genuinely unknown (not just temporarily unavailable).
  const piDefault = getPiDefaultModelAndProvider()
  const preferred =
    (piDefault
      ? availableModels.find((m) => m.provider === piDefault.provider && m.id === piDefault.model)
      : undefined) ||
    availableModels.find((m) => m.provider === 'openai' && m.id === 'gpt-5.4') ||
    availableModels.find((m) => m.provider === 'openai') ||
    availableModels.find((m) => m.provider === 'anthropic' && m.id === 'claude-opus-4-6') ||
    availableModels.find((m) => m.provider === 'anthropic' && m.id.includes('opus')) ||
    availableModels.find((m) => m.provider === 'anthropic') ||
    availableModels[0]
  if (preferred) {
    settingsManager.setDefaultModelAndProvider(preferred.provider, preferred.id)
  }
}

if (settingsManager.getDefaultThinkingLevel() !== 'off' && !configuredExists) {
  settingsManager.setDefaultThinkingLevel('off')
}

// GSD always uses quiet startup — the gsd extension renders its own branded header
if (!settingsManager.getQuietStartup()) {
  settingsManager.setQuietStartup(true)
}

// Collapse changelog by default — avoid wall of text on updates
if (!settingsManager.getCollapseChangelog()) {
  settingsManager.setCollapseChangelog(true)
}

// ---------------------------------------------------------------------------
// Print / subagent mode — single-shot execution, no TTY required
// ---------------------------------------------------------------------------
if (isPrintMode) {
  const sessionManager = cliFlags.noSession
    ? SessionManager.inMemory()
    : SessionManager.create(process.cwd())

  // Read --append-system-prompt file content (subagent writes agent system prompts to temp files)
  let appendSystemPrompt: string | undefined
  if (cliFlags.appendSystemPrompt) {
    try {
      appendSystemPrompt = readFileSync(cliFlags.appendSystemPrompt, 'utf-8')
    } catch {
      // If it's not a file path, treat it as literal text
      appendSystemPrompt = cliFlags.appendSystemPrompt
    }
  }

  exitIfManagedResourcesAreNewer(agentDir)
  initResources(agentDir)
  markStartup('initResources')
  const resourceLoader = new DefaultResourceLoader({
    agentDir,
    additionalExtensionPaths: cliFlags.extensions.length > 0 ? cliFlags.extensions : undefined,
    appendSystemPrompt,
  })
  await resourceLoader.reload()
  markStartup('resourceLoader.reload')

  const { session, extensionsResult } = await createAgentSession({
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager,
    resourceLoader,
  })
  markStartup('createAgentSession')

  if (extensionsResult.errors.length > 0) {
    for (const err of extensionsResult.errors) {
      // Downgrade conflicts with built-in tools to warnings (#1347)
      const isSuperseded = err.error.includes("supersedes");
      const prefix = isSuperseded ? "Extension conflict" : "Extension load error";
      process.stderr.write(`[gsd] ${prefix}: ${err.error}\n`)
    }
  }

  // Apply --model override if specified
  if (cliFlags.model) {
    const available = modelRegistry.getAvailable()
    const match =
      available.find((m) => m.id === cliFlags.model) ||
      available.find((m) => `${m.provider}/${m.id}` === cliFlags.model)
    if (match) {
      session.setModel(match)
    }
  }

  const mode = cliFlags.mode || 'text'

  if (mode === 'rpc') {
    printStartupTimings()
    await runRpcMode(session)
    process.exit(0)
  }

  if (mode === 'mcp') {
    printStartupTimings()
    const { startMcpServer } = await import('./mcp-server.js')
    await startMcpServer({
      tools: session.agent.state.tools ?? [],
      version: process.env.GSD_VERSION || '0.0.0',
    })
    // MCP server runs until the transport closes; keep alive
    await new Promise(() => {})
  }

  printStartupTimings()
  await runPrintMode(session, {
    mode: mode as 'text' | 'json',
    messages: cliFlags.messages,
  })
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Worktree subcommand — `gsd worktree <list|merge|clean|remove>`
// ---------------------------------------------------------------------------
if (cliFlags.messages[0] === 'worktree' || cliFlags.messages[0] === 'wt') {
  const { handleList, handleMerge, handleClean, handleRemove } = await import('./worktree-cli.js')
  const sub = cliFlags.messages[1]
  const subArgs = cliFlags.messages.slice(2)

  if (!sub || sub === 'list') {
    await handleList(process.cwd())
  } else if (sub === 'merge') {
    await handleMerge(process.cwd(), subArgs)
  } else if (sub === 'clean') {
    await handleClean(process.cwd())
  } else if (sub === 'remove' || sub === 'rm') {
    await handleRemove(process.cwd(), subArgs)
  } else {
    process.stderr.write(`Unknown worktree command: ${sub}\n`)
    process.stderr.write('Commands: list, merge [name], clean, remove <name>\n')
  }
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Worktree flag (-w) — create/resume a worktree for the interactive session
// ---------------------------------------------------------------------------
if (cliFlags.worktree) {
  const { handleWorktreeFlag } = await import('./worktree-cli.js')
  await handleWorktreeFlag(cliFlags.worktree)
}

// ---------------------------------------------------------------------------
// Active worktree banner — remind user of unmerged worktrees on normal launch
// ---------------------------------------------------------------------------
if (!cliFlags.worktree && !isPrintMode) {
  try {
    const { handleStatusBanner } = await import('./worktree-cli.js')
    await handleStatusBanner(process.cwd())
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Interactive mode — normal TTY session
// ---------------------------------------------------------------------------

// Per-directory session storage — same encoding as the upstream SDK so that
// /resume only shows sessions from the current working directory.
const cwd = process.cwd()
const projectSessionsDir = getProjectSessionsDir(cwd)

// Migrate legacy flat sessions: before per-directory scoping, all .jsonl session
// files lived directly in ~/.gsd/sessions/. Move them into the correct per-cwd
// subdirectory so /resume can find them.
migrateLegacyFlatSessions(sessionsDir, projectSessionsDir)

const sessionManager = cliFlags._selectedSessionPath
  ? SessionManager.open(cliFlags._selectedSessionPath, projectSessionsDir)
  : cliFlags.continue
    ? SessionManager.continueRecent(cwd, projectSessionsDir)
    : SessionManager.create(cwd, projectSessionsDir)

exitIfManagedResourcesAreNewer(agentDir)
initResources(agentDir)
markStartup('initResources')
const resourceLoader = buildResourceLoader(agentDir)
await resourceLoader.reload()
markStartup('resourceLoader.reload')

const { session, extensionsResult } = await createAgentSession({
  authStorage,
  modelRegistry,
  settingsManager,
  sessionManager,
  resourceLoader,
})
markStartup('createAgentSession')

if (extensionsResult.errors.length > 0) {
  for (const err of extensionsResult.errors) {
    const isSuperseded = err.error.includes("supersedes");
    const prefix = isSuperseded ? "Extension conflict" : "Extension load error";
    process.stderr.write(`[gsd] ${prefix}: ${err.error}\n`)
  }
}

// Restore scoped models from settings on startup.
// The upstream InteractiveMode reads enabledModels from settings when /scoped-models is opened,
// but doesn't apply them to the session at startup — so Ctrl+P cycles all models instead of
// just the saved selection until the user re-runs /scoped-models.
const enabledModelPatterns = settingsManager.getEnabledModels()
if (enabledModelPatterns && enabledModelPatterns.length > 0) {
  const availableModels = modelRegistry.getAvailable()
  const scopedModels: Array<{ model: (typeof availableModels)[number] }> = []
  const seen = new Set<string>()

  for (const pattern of enabledModelPatterns) {
    // Patterns are "provider/modelId" exact strings saved by /scoped-models
    const slashIdx = pattern.indexOf('/')
    if (slashIdx !== -1) {
      const provider = pattern.substring(0, slashIdx)
      const modelId = pattern.substring(slashIdx + 1)
      const model = availableModels.find((m) => m.provider === provider && m.id === modelId)
      if (model) {
        const key = `${model.provider}/${model.id}`
        if (!seen.has(key)) {
          seen.add(key)
          scopedModels.push({ model })
        }
      }
    } else {
      // Fallback: match by model id alone
      const model = availableModels.find((m) => m.id === pattern)
      if (model) {
        const key = `${model.provider}/${model.id}`
        if (!seen.has(key)) {
          seen.add(key)
          scopedModels.push({ model })
        }
      }
    }
  }

  // Only apply if we resolved some models and it's a genuine subset
  if (scopedModels.length > 0 && scopedModels.length < availableModels.length) {
    session.setScopedModels(scopedModels)
  }
}

if (!process.stdin.isTTY) {
  process.stderr.write('[gsd] Error: Interactive mode requires a terminal (TTY).\n')
  process.stderr.write('[gsd] Non-interactive alternatives:\n')
  process.stderr.write('[gsd]   gsd --print "your message"     Single-shot prompt\n')
  process.stderr.write('[gsd]   gsd --web [path]               Browser-only web mode\n')
  process.stderr.write('[gsd]   gsd --mode rpc                 JSON-RPC over stdin/stdout\n')
  process.stderr.write('[gsd]   gsd --mode mcp                 MCP server over stdin/stdout\n')
  process.stderr.write('[gsd]   gsd --mode text "message"      Text output mode\n')
  process.exit(1)
}

// Welcome screen — shown on every fresh interactive session before TUI takes over
{
  const { printWelcomeScreen } = await import('./welcome-screen.js')
  printWelcomeScreen({
    version: process.env.GSD_VERSION || '0.0.0',
    modelName: settingsManager.getDefaultModel() || undefined,
    provider: settingsManager.getDefaultProvider() || undefined,
  })
}

const interactiveMode = new InteractiveMode(session)
markStartup('InteractiveMode')
printStartupTimings()
await interactiveMode.run()
