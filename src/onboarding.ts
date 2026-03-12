/**
 * Unified first-run onboarding wizard.
 *
 * Replaces the raw API-key-only wizard with a branded, clack-based experience
 * that guides users through LLM provider authentication before the TUI launches.
 *
 * Flow: logo -> choose LLM provider -> authenticate (OAuth or API key) ->
 *       optional tool keys -> summary -> TUI launches.
 *
 * All steps are skippable. All errors are recoverable. Never crashes boot.
 */

import { exec, execSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AuthStorage } from '@mariozechner/pi-coding-agent'
import { renderLogo } from './logo.js'
import { agentDir } from './app-paths.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolKeyConfig {
  provider: string
  envVar: string
  label: string
  hint: string
}

type ClackModule = typeof import('@clack/prompts')
type PicoModule = {
  cyan: (s: string) => string
  green: (s: string) => string
  yellow: (s: string) => string
  dim: (s: string) => string
  bold: (s: string) => string
  red: (s: string) => string
  reset: (s: string) => string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOL_KEYS: ToolKeyConfig[] = [
  {
    provider: 'brave',
    envVar: 'BRAVE_API_KEY',
    label: 'Brave Search',
    hint: 'web search + search_and_read tools',
  },
  {
    provider: 'brave_answers',
    envVar: 'BRAVE_ANSWERS_KEY',
    label: 'Brave Answers',
    hint: 'AI-summarised search answers',
  },
  {
    provider: 'context7',
    envVar: 'CONTEXT7_API_KEY',
    label: 'Context7',
    hint: 'up-to-date library docs',
  },
  {
    provider: 'jina',
    envVar: 'JINA_API_KEY',
    label: 'Jina AI',
    hint: 'clean web page extraction',
  },
  {
    provider: 'slack_bot',
    envVar: 'SLACK_BOT_TOKEN',
    label: 'Slack Bot',
    hint: 'remote questions in auto-mode',
  },
  {
    provider: 'discord_bot',
    envVar: 'DISCORD_BOT_TOKEN',
    label: 'Discord Bot',
    hint: 'remote questions in auto-mode',
  },
]

/** Known LLM provider IDs that, if authed, mean the user doesn't need onboarding */
const LLM_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'github-copilot',
  'openai-codex',
  'google-gemini-cli',
  'google-antigravity',
  'google',
  'groq',
  'xai',
  'openrouter',
  'mistral',
]

/** API key prefix validation — loose checks to catch obvious mistakes */
const API_KEY_PREFIXES: Record<string, string[]> = {
  anthropic: ['sk-ant-'],
  openai: ['sk-'],
}

const OTHER_PROVIDERS = [
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'groq', label: 'Groq' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'mistral', label: 'Mistral' },
]

// ─── Custom Provider Presets ──────────────────────────────────────────────────

export interface CustomProviderPreset {
  baseUrl: string
  api: string
  apiKey: string
  exampleModel: string
  needsApiKey: boolean
  label: string
}

export const CUSTOM_PROVIDER_PRESETS: Record<string, CustomProviderPreset> = {
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    api: 'openai-completions',
    apiKey: 'ollama',
    exampleModel: 'llama3.1:8b',
    needsApiKey: false,
    label: 'Ollama',
  },
  'lm-studio': {
    baseUrl: 'http://localhost:1234/v1',
    api: 'openai-completions',
    apiKey: 'lm-studio',
    exampleModel: 'loaded-model',
    needsApiKey: false,
    label: 'LM Studio',
  },
  vllm: {
    baseUrl: 'http://localhost:8000/v1',
    api: 'openai-completions',
    apiKey: 'VLLM_API_KEY',
    exampleModel: 'meta-llama/Llama-3.1-8B',
    needsApiKey: true,
    label: 'vLLM',
  },
  generic: {
    baseUrl: 'https://api.example.com/v1',
    api: 'openai-completions',
    apiKey: 'YOUR_API_KEY',
    exampleModel: 'model-name',
    needsApiKey: true,
    label: 'Generic OpenAI-compatible',
  },
}

/**
 * Generate a models.json template for a custom provider preset.
 *
 * Returns the stringified JSON (pretty-printed), the provider key name
 * (used as the provider ID in auth.json), and whether the preset needs
 * a user-supplied API key.
 *
 * Pure function — no file I/O, no prompts.
 */
export function generateModelsTemplate(preset: string): {
  json: string
  providerName: string
  needsApiKey: boolean
} {
  const config = CUSTOM_PROVIDER_PRESETS[preset]
  if (!config) {
    throw new Error(`Unknown custom provider preset: ${preset}`)
  }

  const template = {
    providers: {
      [preset]: {
        baseUrl: config.baseUrl,
        api: config.api,
        apiKey: config.apiKey,
        models: [{ id: config.exampleModel }],
      },
    },
  }

  return {
    json: JSON.stringify(template, null, 2),
    providerName: preset,
    needsApiKey: config.needsApiKey,
  }
}

// ─── Dynamic imports ──────────────────────────────────────────────────────────

/**
 * Dynamically import @clack/prompts and picocolors.
 * Dynamic import with fallback so the module doesn't crash if they're missing.
 */
async function loadClack(): Promise<ClackModule> {
  try {
    return await import('@clack/prompts')
  } catch {
    throw new Error('[gsd] @clack/prompts not found — onboarding wizard requires this dependency')
  }
}

async function loadPico(): Promise<PicoModule> {
  try {
    const mod = await import('picocolors')
    return mod.default ?? mod
  } catch {
    // Fallback: return identity functions
    const identity = (s: string) => s
    return { cyan: identity, green: identity, yellow: identity, dim: identity, bold: identity, red: identity, reset: identity }
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Open a URL in the system browser (best-effort, non-blocking) */
function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' :
      'xdg-open'
  exec(`${cmd} "${url}"`, () => {
    // Ignore errors — user can manually open the URL
  })
}

/** Check if an error is a clack cancel signal */
function isCancelError(p: ClackModule, err: unknown): boolean {
  return p.isCancel(err)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Determine if the onboarding wizard should run.
 *
 * Returns true when:
 * - No LLM provider has credentials in authStorage
 * - No models.json file exists (custom provider not configured)
 * - We're on a TTY (interactive terminal)
 *
 * Returns false (skip wizard) when:
 * - Any LLM provider is already authed (returning user)
 * - A models.json file exists at agentDir (custom provider configured)
 * - Not a TTY (piped input, subagent, CI)
 *
 * @param authStorage - credential store to check for LLM provider auth
 * @param agentDirOverride - optional override for the agent directory (used in tests)
 */
export function shouldRunOnboarding(authStorage: AuthStorage, agentDirOverride?: string): boolean {
  if (!process.stdin.isTTY) return false
  // Check if any LLM provider has credentials
  const authedProviders = authStorage.list()
  const hasLlmAuth = authedProviders.some(id => LLM_PROVIDER_IDS.includes(id))
  // Check if a custom provider has been configured via models.json
  const dir = agentDirOverride ?? agentDir
  const hasModelsJson = existsSync(join(dir, 'models.json'))
  return !hasLlmAuth && !hasModelsJson
}

/**
 * Run the unified onboarding wizard.
 *
 * Walks the user through:
 * 1. Choose LLM provider
 * 2. Authenticate (OAuth or API key)
 * 3. Optional tool API keys
 * 4. Summary
 *
 * All steps are skippable. All errors are recoverable.
 * Writes status to stderr during execution.
 */
export async function runOnboarding(authStorage: AuthStorage): Promise<void> {
  let p: ClackModule
  let pc: PicoModule
  try {
    ;[p, pc] = await Promise.all([loadClack(), loadPico()])
  } catch (err) {
    // If clack isn't available, fall back silently — don't block boot
    process.stderr.write(`[gsd] Onboarding wizard unavailable: ${err instanceof Error ? err.message : String(err)}\n`)
    return
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  process.stderr.write(renderLogo(pc.cyan))
  p.intro(pc.bold('Welcome to GSD — let\'s get you set up'))

  // ── LLM Provider Selection ────────────────────────────────────────────────
  let llmConfigured = false
  try {
    llmConfigured = await runLlmStep(p, pc, authStorage)
  } catch (err) {
    // User cancelled (Ctrl+C in clack throws) or unexpected error
    if (isCancelError(p, err)) {
      p.cancel('Setup cancelled — you can run /login inside GSD later.')
      return
    }
    p.log.warn(`LLM setup failed: ${err instanceof Error ? err.message : String(err)}`)
    p.log.info('You can configure your LLM provider later with /login inside GSD.')
  }

  // ── Tool API Keys ─────────────────────────────────────────────────────────
  let toolKeyCount = 0
  try {
    toolKeyCount = await runToolKeysStep(p, pc, authStorage)
  } catch (err) {
    if (isCancelError(p, err)) {
      p.cancel('Setup cancelled.')
      return
    }
    p.log.warn(`Tool key setup failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const summaryLines: string[] = []
  if (llmConfigured) {
    // Re-read what provider was stored
    const authed = authStorage.list().filter(id => LLM_PROVIDER_IDS.includes(id))
    if (authed.length > 0) {
      const name = authed[0]
      summaryLines.push(`${pc.green('✓')} LLM provider: ${name}`)
    } else {
      summaryLines.push(`${pc.green('✓')} LLM provider configured`)
    }
  } else {
    summaryLines.push(`${pc.yellow('↷')} LLM provider: skipped — use /login inside GSD`)
  }

  if (toolKeyCount > 0) {
    summaryLines.push(`${pc.green('✓')} ${toolKeyCount} tool key${toolKeyCount > 1 ? 's' : ''} saved`)
  } else {
    summaryLines.push(`${pc.dim('↷')} Tool keys: none configured`)
  }

  p.note(summaryLines.join('\n'), 'Setup complete')
  p.outro(pc.dim('Launching GSD...'))
}

// ─── LLM Authentication Step ──────────────────────────────────────────────────

async function runLlmStep(p: ClackModule, pc: PicoModule, authStorage: AuthStorage): Promise<boolean> {
  // Build the OAuth provider list dynamically from what's registered
  const oauthProviders = authStorage.getOAuthProviders()
  const oauthMap = new Map(oauthProviders.map(op => [op.id, op]))

  const choice = await p.select({
    message: 'Choose your LLM provider',
    options: [
      { value: 'anthropic-oauth', label: 'Anthropic — Claude (OAuth login)', hint: 'recommended' },
      { value: 'anthropic-api-key', label: 'Anthropic — Claude (API key)' },
      { value: 'openai-api-key', label: 'OpenAI (API key)' },
      { value: 'github-copilot-oauth', label: 'GitHub Copilot (OAuth login)' },
      { value: 'openai-codex-oauth', label: 'ChatGPT Plus/Pro — Codex (OAuth login)' },
      { value: 'google-gemini-cli-oauth', label: 'Google Gemini CLI (OAuth login)' },
      { value: 'google-antigravity-oauth', label: 'Antigravity — Gemini 3, Claude, GPT-OSS (OAuth login)' },
      { value: 'other-api-key', label: 'Other provider (API key)' },
      { value: 'custom-provider', label: 'Custom/Local provider (Ollama, LM Studio, etc.)', hint: 'bring your own models.json' },
      { value: 'skip', label: 'Skip for now', hint: 'use /login inside GSD later' },
    ],
  })

  if (p.isCancel(choice) || choice === 'skip') return false

  // ── OAuth flows ───────────────────────────────────────────────────────────
  if (choice === 'anthropic-oauth') {
    return await runOAuthFlow(p, pc, authStorage, 'anthropic', oauthMap)
  }
  if (choice === 'github-copilot-oauth') {
    return await runOAuthFlow(p, pc, authStorage, 'github-copilot', oauthMap)
  }
  if (choice === 'openai-codex-oauth') {
    return await runOAuthFlow(p, pc, authStorage, 'openai-codex', oauthMap)
  }
  if (choice === 'google-gemini-cli-oauth') {
    return await runOAuthFlow(p, pc, authStorage, 'google-gemini-cli', oauthMap)
  }
  if (choice === 'google-antigravity-oauth') {
    return await runOAuthFlow(p, pc, authStorage, 'google-antigravity', oauthMap)
  }

  // ── API key flows ─────────────────────────────────────────────────────────
  if (choice === 'anthropic-api-key') {
    return await runApiKeyFlow(p, pc, authStorage, 'anthropic', 'Anthropic')
  }
  if (choice === 'openai-api-key') {
    return await runApiKeyFlow(p, pc, authStorage, 'openai', 'OpenAI')
  }
  if (choice === 'other-api-key') {
    return await runOtherProviderFlow(p, pc, authStorage)
  }
  if (choice === 'custom-provider') {
    return await runCustomProviderFlow(p, pc, authStorage)
  }

  return false
}

// ─── OAuth Flow ───────────────────────────────────────────────────────────────

async function runOAuthFlow(
  p: ClackModule,
  pc: PicoModule,
  authStorage: AuthStorage,
  providerId: string,
  oauthMap: Map<string, { id: string; name?: string; usesCallbackServer?: boolean }>,
): Promise<boolean> {
  const providerInfo = oauthMap.get(providerId)
  const providerName = providerInfo?.name ?? providerId
  const usesCallbackServer = providerInfo?.usesCallbackServer ?? false

  const s = p.spinner()
  s.start(`Authenticating with ${providerName}...`)

  try {
    await authStorage.login(providerId as any, {
      onAuth: (info: { url: string; instructions?: string }) => {
        s.stop(`Opening browser for ${providerName}`)
        openBrowser(info.url)
        p.log.info(`${pc.dim('URL:')} ${pc.cyan(info.url)}`)
        if (info.instructions) {
          p.log.info(pc.yellow(info.instructions))
        }
      },
      onPrompt: async (prompt: { message: string; placeholder?: string }) => {
        const result = await p.text({
          message: prompt.message,
          placeholder: prompt.placeholder,
        })
        if (p.isCancel(result)) return ''
        return result as string
      },
      onProgress: (message: string) => {
        p.log.step(pc.dim(message))
      },
      onManualCodeInput: usesCallbackServer
        ? async () => {
            const result = await p.text({
              message: 'Paste the redirect URL from your browser:',
              placeholder: 'http://localhost:...',
            })
            if (p.isCancel(result)) return ''
            return result as string
          }
        : undefined,
    } as any)

    p.log.success(`Authenticated with ${pc.green(providerName)}`)
    return true
  } catch (err) {
    s.stop(`${providerName} authentication failed`)
    const errorMsg = err instanceof Error ? err.message : String(err)
    p.log.warn(`OAuth error: ${errorMsg}`)

    // Offer retry or skip
    const retry = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'retry', label: 'Try again' },
        { value: 'skip', label: 'Skip — configure later with /login' },
      ],
    })

    if (p.isCancel(retry) || retry === 'skip') return false
    // Recursive retry
    return runOAuthFlow(p, pc, authStorage, providerId, oauthMap)
  }
}

// ─── API Key Flow ─────────────────────────────────────────────────────────────

async function runApiKeyFlow(
  p: ClackModule,
  pc: PicoModule,
  authStorage: AuthStorage,
  providerId: string,
  providerLabel: string,
): Promise<boolean> {
  const key = await p.password({
    message: `Paste your ${providerLabel} API key:`,
    mask: '●',
  })

  if (p.isCancel(key) || !key) return false
  const trimmed = (key as string).trim()
  if (!trimmed) return false

  // Basic prefix validation
  const expectedPrefixes = API_KEY_PREFIXES[providerId]
  if (expectedPrefixes && !expectedPrefixes.some(pfx => trimmed.startsWith(pfx))) {
    p.log.warn(`Key doesn't start with expected prefix (${expectedPrefixes.join(' or ')}). Saving anyway.`)
  }

  authStorage.set(providerId, { type: 'api_key', key: trimmed })
  p.log.success(`API key saved for ${pc.green(providerLabel)}`)
  return true
}

// ─── "Other Provider" Sub-Flow ────────────────────────────────────────────────

async function runOtherProviderFlow(
  p: ClackModule,
  pc: PicoModule,
  authStorage: AuthStorage,
): Promise<boolean> {
  const provider = await p.select({
    message: 'Select provider',
    options: OTHER_PROVIDERS.map(op => ({
      value: op.value,
      label: op.label,
    })),
  })

  if (p.isCancel(provider)) return false
  const label = OTHER_PROVIDERS.find(op => op.value === provider)?.label ?? String(provider)
  return runApiKeyFlow(p, pc, authStorage, provider as string, label)
}

// ─── Custom Provider Flow ─────────────────────────────────────────────────────

async function runCustomProviderFlow(
  p: ClackModule,
  pc: PicoModule,
  authStorage: AuthStorage,
): Promise<boolean> {
  // Preset selection
  const presetOptions = Object.entries(CUSTOM_PROVIDER_PRESETS).map(([key, config]) => ({
    value: key,
    label: config.label,
    hint: config.needsApiKey ? 'requires API key' : 'no API key needed',
  }))

  const preset = await p.select({
    message: 'Select your local/custom provider',
    options: presetOptions,
  })

  if (p.isCancel(preset)) return false

  const modelsJsonPath = join(agentDir, 'models.json')

  // Overwrite guard — don't clobber existing models.json
  if (existsSync(modelsJsonPath)) {
    const openExisting = await p.confirm({
      message: 'models.json already exists — open it in your editor?',
      initialValue: true,
    })

    if (p.isCancel(openExisting)) return false

    if (openExisting) {
      openInEditor(modelsJsonPath, p, pc)
    }
    return false
  }

  // Generate and write template
  const { json, providerName, needsApiKey } = generateModelsTemplate(preset as string)

  try {
    mkdirSync(agentDir, { recursive: true })
    writeFileSync(modelsJsonPath, json, 'utf-8')
  } catch (err) {
    p.log.warn(`Failed to write models.json: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }

  // API key collection (or skip for local providers)
  if (needsApiKey) {
    const key = await p.password({
      message: `Paste your ${CUSTOM_PROVIDER_PRESETS[preset as string].label} API key:`,
      mask: '●',
    })

    if (!p.isCancel(key) && key) {
      const trimmed = (key as string).trim()
      if (trimmed) {
        authStorage.set(providerName, { type: 'api_key', key: trimmed })
        p.log.success(`API key saved for ${pc.green(providerName)}`)
      }
    }
  } else {
    p.log.info(`No API key needed — ${CUSTOM_PROVIDER_PRESETS[preset as string].label} runs locally`)
  }

  // Open in editor
  openInEditor(modelsJsonPath, p, pc)

  // Success message
  p.log.success(
    `${pc.green(providerName)} provider configured\n` +
    `  Template: ${pc.cyan(modelsJsonPath)}\n` +
    `  ${pc.yellow('Restart GSD to use your custom models')}`
  )

  return true
}

/** Attempt to open a file in $VISUAL, $EDITOR, or vi. Falls back to showing the path. */
function openInEditor(filePath: string, p: ClackModule, pc: PicoModule): void {
  const editor = process.env.VISUAL || process.env.EDITOR
  if (editor) {
    try {
      execSync(`${editor} "${filePath}"`, { stdio: 'inherit' })
    } catch {
      p.note(pc.cyan(filePath), 'Edit your models.json at')
    }
  } else {
    try {
      execSync(`vi "${filePath}"`, { stdio: 'inherit' })
    } catch {
      p.note(pc.cyan(filePath), 'Edit your models.json at')
    }
  }
}

// ─── Tool API Keys Step ───────────────────────────────────────────────────────

async function runToolKeysStep(
  p: ClackModule,
  pc: PicoModule,
  authStorage: AuthStorage,
): Promise<number> {
  // Filter to keys not already configured
  const missing = TOOL_KEYS.filter(tk => !authStorage.has(tk.provider) && !process.env[tk.envVar])
  if (missing.length === 0) return 0

  const wantToolKeys = await p.confirm({
    message: 'Set up optional tool API keys? (web search, docs, etc.)',
    initialValue: false,
  })

  if (p.isCancel(wantToolKeys) || !wantToolKeys) return 0

  let savedCount = 0
  for (const tk of missing) {
    const key = await p.password({
      message: `${tk.label} ${pc.dim(`(${tk.hint})`)} — Enter to skip:`,
      mask: '●',
    })

    if (p.isCancel(key)) break

    const trimmed = (key as string | undefined)?.trim()
    if (trimmed) {
      authStorage.set(tk.provider, { type: 'api_key', key: trimmed })
      process.env[tk.envVar] = trimmed
      p.log.success(`${tk.label} saved`)
      savedCount++
    } else {
      // Store empty key so wizard doesn't re-ask on next launch
      authStorage.set(tk.provider, { type: 'api_key', key: '' })
      p.log.info(pc.dim(`${tk.label} skipped`))
    }
  }

  return savedCount
}

// ─── Env hydration (migrated from wizard.ts) ─────────────────────────────────

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
        process.env[envVar] = cred.key
      }
    }
  }
}
