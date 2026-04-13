/**
 * One-time migration of provider credentials from Pi (~/.pi/agent/auth.json)
 * into GSD's auth storage. Runs when GSD has no LLM providers configured,
 * so users with an existing Pi install skip re-authentication.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AuthStorage, AuthCredential } from '@gsd/pi-coding-agent'

const PI_AUTH_PATH = join(homedir(), '.pi', 'agent', 'auth.json')
const PI_SETTINGS_PATH = join(homedir(), '.pi', 'agent', 'settings.json')

const LLM_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'codex-cli',
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

/**
 * Migrate provider credentials from Pi's auth.json into GSD's AuthStorage.
 *
 * Only runs when GSD has no LLM provider configured and Pi's auth.json exists.
 * Copies any credentials GSD doesn't already have. Returns true if an LLM
 * provider was migrated (so onboarding can be skipped).
 */
export function migratePiCredentials(authStorage: AuthStorage): boolean {
  try {
    const existing = authStorage.list()
    const hasLlm = existing.some(id => LLM_PROVIDER_IDS.includes(id))
    if (hasLlm) return false

    if (!existsSync(PI_AUTH_PATH)) return false

    const raw = readFileSync(PI_AUTH_PATH, 'utf-8')
    const piData = JSON.parse(raw) as Record<string, AuthCredential>

    let migratedLlm = false
    for (const [providerId, credential] of Object.entries(piData)) {
      if (authStorage.has(providerId)) continue
      authStorage.set(providerId, credential)
      const isLlm = LLM_PROVIDER_IDS.includes(providerId)
      if (isLlm) migratedLlm = true
      process.stderr.write(`[gsd] Migrated ${isLlm ? 'LLM provider' : 'credential'}: ${providerId} (from Pi)\n`)
    }

    return migratedLlm
  } catch {
    return false
  }
}

export function getPiDefaultModelAndProvider(): { provider: string; model: string } | null {
  try {
    if (!existsSync(PI_SETTINGS_PATH)) return null

    const raw = readFileSync(PI_SETTINGS_PATH, 'utf-8')
    const data = JSON.parse(raw) as { defaultProvider?: unknown; defaultModel?: unknown }
    if (typeof data.defaultProvider !== 'string' || typeof data.defaultModel !== 'string') {
      return null
    }

    return {
      provider: data.defaultProvider,
      model: data.defaultModel,
    }
  } catch {
    return null
  }
}
