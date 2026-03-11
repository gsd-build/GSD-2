import { createInterface } from 'readline'
import type { AuthStorage } from '@mariozechner/pi-coding-agent'

// ─── Colors ──────────────────────────────────────────────────────────────────

const cyan   = '\x1b[36m'
const green  = '\x1b[32m'
const yellow = '\x1b[33m'
const dim    = '\x1b[2m'
const bold   = '\x1b[1m'
const reset  = '\x1b[0m'

// ─── Masked input ─────────────────────────────────────────────────────────────

/**
 * Prompt for masked input using raw mode stdin.
 * Handles backspace, Ctrl+C, and Enter.
 * Falls back to plain readline if setRawMode is unavailable (e.g. some SSH contexts).
 */
async function promptMasked(label: string, hint: string): Promise<string> {
  return new Promise((resolve) => {
    const question = `  ${cyan}›${reset} ${label} ${dim}${hint}${reset}\n  `
    try {
      process.stdout.write(question)
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')
      let value = ''
      const redraw = () => {
        process.stdout.clearLine(0)
        process.stdout.cursorTo(0)
        if (value.length === 0) {
          process.stdout.write('  ')
        } else {
          const dots = '●'.repeat(Math.min(value.length, 24))
          const counter = value.length > 24 ? ` ${dim}(${value.length})${reset}` : ` ${dim}${value.length}${reset}`
          process.stdout.write(`  ${dots}${counter}`)
        }
      }
      const handler = (ch: string) => {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', handler)
          process.stdout.write('\n')
          resolve(value)
        } else if (ch === '\u0003') {
          process.stdin.setRawMode(false)
          process.stdout.write('\n')
          process.exit(0)
        } else if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1)
          }
          redraw()
        } else {
          value += ch
          redraw()
        }
      }
      process.stdin.on('data', handler)
    } catch (_err) {
      process.stdout.write(` ${dim}(input will be visible)${reset}\n  `)
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      rl.question('', (answer) => {
        rl.close()
        resolve(answer)
      })
    }
  })
}

// ─── Env hydration ────────────────────────────────────────────────────────────

/**
 * Hydrate process.env from stored auth.json credentials for optional tool keys.
 * Runs on every launch so extensions see Brave/Context7/Jina keys stored via the
 * wizard on prior launches.
 */
export function loadStoredEnvKeys(authStorage: AuthStorage): void {
  const providers: Array<[string, string]> = [
    ['brave',         'BRAVE_API_KEY'],
    ['brave_answers', 'BRAVE_ANSWERS_KEY'],
    ['context7',      'CONTEXT7_API_KEY'],
    ['jina',          'JINA_API_KEY'],
    ['slack_bot',     'SLACK_BOT_TOKEN'],
    ['discord_bot',   'DISCORD_BOT_TOKEN'],
  ]
  for (const [provider, envVar] of providers) {
    if (!process.env[envVar]) {
      const cred = authStorage.get(provider)
      if (cred?.type === 'api_key' && cred.key) {
        process.env[envVar] = cred.key as string
      }
    }
  }
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

interface ApiKeyConfig {
  provider: string
  envVar: string
  label: string
  hint: string
  description: string
}

const API_KEYS: ApiKeyConfig[] = [
  {
    provider:    'brave',
    envVar:      'BRAVE_API_KEY',
    label:       'Brave Search',
    hint:        '(search-the-web + search_and_read tools)',
    description: 'Web search and page extraction',
  },
  {
    provider:    'brave_answers',
    envVar:      'BRAVE_ANSWERS_KEY',
    label:       'Brave Answers',
    hint:        '(AI-summarised search answers)',
    description: 'AI-generated search summaries',
  },
  {
    provider:    'context7',
    envVar:      'CONTEXT7_API_KEY',
    label:       'Context7',
    hint:        '(up-to-date library docs)',
    description: 'Live library and framework documentation',
  },
  {
    provider:    'jina',
    envVar:      'JINA_API_KEY',
    label:       'Jina AI',
    hint:        '(clean page extraction)',
    description: 'High-quality web page content extraction',
  },
  {
    provider:    'slack_bot',
    envVar:      'SLACK_BOT_TOKEN',
    label:       'Slack Bot',
    hint:        '(remote questions in auto-mode)',
    description: 'Bot token for remote questions via Slack',
  },
  {
    provider:    'discord_bot',
    envVar:      'DISCORD_BOT_TOKEN',
    label:       'Discord Bot',
    hint:        '(remote questions in auto-mode)',
    description: 'Bot token for remote questions via Discord',
  },
]

/**
 * Check for missing optional tool API keys and prompt for them if on a TTY.
 *
 * Anthropic auth is handled by pi's own OAuth/API key flow — we don't touch it.
 * This wizard only collects Brave Search, Context7, and Jina keys which are needed
 * for web search and documentation tools.
 */
export async function runWizardIfNeeded(authStorage: AuthStorage): Promise<void> {
  const missing = API_KEYS.filter(
    k => !authStorage.has(k.provider) && !process.env[k.envVar]
  )

  if (missing.length === 0) return

  // Non-TTY: warn and continue
  if (!process.stdin.isTTY) {
    const names = missing.map(k => k.label).join(', ')
    process.stderr.write(
      `[gsd] Warning: optional tool API keys not configured (${names}). Some tools may not work.\n`
    )
    return
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  process.stdout.write(
    `\n  ${bold}Optional API keys${reset}\n` +
    `  ${dim}─────────────────────────────────────────────${reset}\n` +
    `  These unlock additional tools. All optional — press ${cyan}Enter${reset} to skip any.\n\n`
  )

  // ── Prompts ─────────────────────────────────────────────────────────────────
  let savedCount = 0

  for (const key of missing) {
    const value = await promptMasked(key.label, key.hint)
    if (value.trim()) {
      authStorage.set(key.provider, { type: 'api_key', key: value.trim() })
      process.env[key.envVar] = value.trim()
      process.stdout.write(`  ${green}✓${reset} ${key.label} saved\n\n`)
      savedCount++
    } else {
      authStorage.set(key.provider, { type: 'api_key', key: '' })
      process.stdout.write(`  ${dim}↷  ${key.label} skipped${reset}\n\n`)
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  process.stdout.write(
    `  ${dim}─────────────────────────────────────────────${reset}\n`
  )
  if (savedCount > 0) {
    process.stdout.write(
      `  ${green}✓${reset} ${savedCount} key${savedCount > 1 ? 's' : ''} saved to ${dim}~/.gsd/agent/auth.json${reset}\n` +
      `  ${dim}Run ${reset}${cyan}/login${reset}${dim} inside gsd to connect your LLM provider.${reset}\n\n`
    )
  } else {
    process.stdout.write(
      `  ${yellow}↷${reset}  All keys skipped — you can add them later via ${dim}~/.gsd/agent/auth.json${reset}\n` +
      `  ${dim}Run ${reset}${cyan}/login${reset}${dim} inside gsd to connect your LLM provider.${reset}\n\n`
    )
  }
}
