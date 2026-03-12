/**
 * /search-provider slash command.
 *
 * Lets users switch between tavily, brave, and auto search backends.
 * Supports direct arg (`/search-provider tavily`) or interactive select UI.
 * Tab completion provides the three valid options with key status.
 *
 * All provider logic lives in provider.ts (S01) — this is pure UI wiring.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import type { AutocompleteItem } from '@mariozechner/pi-tui'
import {
  getTavilyApiKey,
  getBraveApiKey,
  getSearchProviderPreference,
  setSearchProviderPreference,
  resolveSearchProvider,
  type SearchProviderPreference,
} from './provider.ts'

const VALID_PREFERENCES: SearchProviderPreference[] = ['tavily', 'brave', 'auto']

function keyStatus(provider: 'tavily' | 'brave'): string {
  if (provider === 'tavily') return getTavilyApiKey() ? '✓' : '✗'
  return getBraveApiKey() ? '✓' : '✗'
}

function buildSelectOptions(): string[] {
  return [
    `tavily (key: ${keyStatus('tavily')})`,
    `brave (key: ${keyStatus('brave')})`,
    `auto`,
  ]
}

function parseSelectChoice(choice: string): SearchProviderPreference {
  if (choice.startsWith('tavily')) return 'tavily'
  if (choice.startsWith('brave')) return 'brave'
  return 'auto'
}

export function registerSearchProviderCommand(pi: ExtensionAPI): void {
  pi.registerCommand('search-provider', {
    description: 'Switch search provider (tavily, brave, auto)',

    getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
      const trimmed = prefix.trim().toLowerCase()
      return VALID_PREFERENCES
        .filter((p) => p.startsWith(trimmed))
        .map((p) => {
          let description: string
          if (p === 'auto') {
            description = `Auto-select (tavily: ${keyStatus('tavily')}, brave: ${keyStatus('brave')})`
          } else {
            description = `key: ${keyStatus(p)}`
          }
          return { value: p, label: p, description }
        })
    },

    async handler(args, ctx) {
      const trimmed = args.trim().toLowerCase()

      let chosen: SearchProviderPreference

      if (trimmed && (VALID_PREFERENCES as string[]).includes(trimmed)) {
        // Direct arg — apply immediately, no select UI
        chosen = trimmed as SearchProviderPreference
      } else {
        // No arg or invalid arg — show interactive select
        const current = getSearchProviderPreference()
        const options = buildSelectOptions()
        const result = await ctx.ui.select(
          `Search provider (current: ${current})`,
          options,
        )

        if (result === undefined) {
          // User cancelled — bail silently
          return
        }

        chosen = parseSelectChoice(result)
      }

      setSearchProviderPreference(chosen)
      const effective = resolveSearchProvider()
      ctx.ui.notify(
        `Search provider set to ${chosen}. Effective provider: ${effective ?? 'none (no API keys)'}`,
        'info',
      )
    },
  })
}
