/**
 * Headless UI Handling — auto-response, progress formatting, and supervised stdin
 *
 * Handles extension UI requests (auto-responding in headless mode),
 * formats progress events for stderr output, and reads orchestrator
 * commands from stdin in supervised mode.
 */

import type { Readable } from 'node:stream'

import { RpcClient, attachJsonlLineReader } from '@gsd/pi-coding-agent'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtensionUIRequest {
  type: 'extension_ui_request'
  id: string
  method: string
  title?: string
  options?: string[]
  message?: string
  prefill?: string
  timeout?: number
  [key: string]: unknown
}

export type { ExtensionUIRequest }

/** Context passed alongside an event for richer formatting. */
export interface ProgressContext {
  verbose: boolean
  toolDuration?: number           // ms, for tool_execution_end
  lastCost?: { costUsd: number; inputTokens: number; outputTokens: number }
  thinkingPreview?: string        // accumulated LLM text to show before tool calls
  isError?: boolean               // tool execution ended with an error
}

// ---------------------------------------------------------------------------
// ANSI Color Helpers
// ---------------------------------------------------------------------------

const _c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

/** Build a no-op color map (all codes empty). */
function noColor(): typeof _c {
  const nc: Record<string, string> = {}
  for (const k of Object.keys(_c)) nc[k] = ''
  return nc as typeof _c
}

const colorsDisabled = !!process.env['NO_COLOR'] || !process.stderr.isTTY
const c: typeof _c = colorsDisabled ? noColor() : _c

// ---------------------------------------------------------------------------
// Tool-Arg Summarizer
// ---------------------------------------------------------------------------

/**
 * Produce a short human-readable summary of tool arguments.
 * Returns a string like "path/to/file.ts" or "grep pattern *.ts" — never the
 * full JSON blob.
 */
export function summarizeToolArgs(toolName: unknown, toolInput: unknown): string {
  const name = String(toolName ?? '')
  const input = (toolInput && typeof toolInput === 'object') ? toolInput as Record<string, unknown> : {}

  switch (name) {
    case 'Read':
    case 'read':
      return shortPath(input.file_path) || ''
    case 'Write':
    case 'write':
      return shortPath(input.file_path) || ''
    case 'Edit':
    case 'edit':
      return shortPath(input.file_path) || ''
    case 'Bash':
    case 'bash': {
      const cmd = String(input.command ?? '')
      return cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd
    }
    case 'Glob':
    case 'glob':
      return String(input.pattern ?? '')
    case 'Grep':
    case 'grep':
    case 'Search':
    case 'search': {
      const pat = String(input.pattern ?? '')
      const g = input.glob ? ` ${input.glob}` : ''
      return `${pat}${g}`
    }
    case 'Task':
    case 'task': {
      const desc = String(input.description ?? input.prompt ?? '')
      return desc.length > 60 ? desc.slice(0, 57) + '...' : desc
    }
    default: {
      // Fallback: show first string-valued key up to 60 chars
      for (const v of Object.values(input)) {
        if (typeof v === 'string' && v.length > 0) {
          return v.length > 60 ? v.slice(0, 57) + '...' : v
        }
      }
      return ''
    }
  }
}

function shortPath(p: unknown): string {
  if (typeof p !== 'string') return ''
  // Strip common CWD prefix to save space
  const cwd = process.cwd()
  if (p.startsWith(cwd + '/')) return p.slice(cwd.length + 1)
  // Strip /Users/*/Developer/ prefix
  return p.replace(/^\/Users\/[^/]+\/Developer\//, '')
}

// ---------------------------------------------------------------------------
// Format Duration
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = (ms / 1000).toFixed(1)
  return `${s}s`
}

// ---------------------------------------------------------------------------
// Extension UI Auto-Responder
// ---------------------------------------------------------------------------

export function handleExtensionUIRequest(
  event: ExtensionUIRequest,
  client: RpcClient,
): void {
  const { id, method } = event

  switch (method) {
    case 'select': {
      // Lock-guard prompts list "View status" first, but headless needs "Force start"
      // to proceed. Detect by title and pick the force option.
      const title = String(event.title ?? '')
      let selected = event.options?.[0] ?? ''
      if (title.includes('Auto-mode is running') && event.options) {
        const forceOption = event.options.find(o => o.toLowerCase().includes('force start'))
        if (forceOption) selected = forceOption
      }
      client.sendUIResponse(id, { value: selected })
      break
    }
    case 'confirm':
      client.sendUIResponse(id, { confirmed: true })
      break
    case 'input':
      client.sendUIResponse(id, { value: '' })
      break
    case 'editor':
      client.sendUIResponse(id, { value: event.prefill ?? '' })
      break
    case 'notify':
    case 'setStatus':
    case 'setWidget':
    case 'setTitle':
    case 'set_editor_text':
      client.sendUIResponse(id, { value: '' })
      break
    default:
      process.stderr.write(`[headless] Warning: unknown extension_ui_request method "${method}", cancelling\n`)
      client.sendUIResponse(id, { cancelled: true })
      break
  }
}

// ---------------------------------------------------------------------------
// Progress Formatter
// ---------------------------------------------------------------------------

export function formatProgress(event: Record<string, unknown>, ctx: ProgressContext): string | null {
  const type = String(event.type ?? '')

  // Emit accumulated thinking preview before tool calls
  if (ctx.thinkingPreview) {
    // thinkingPreview is handled by the caller in headless.ts — it prepends
    // the thinking line before the current event's line. We return the thinking
    // line as a prefix joined with newline.
  }

  switch (type) {
    case 'tool_execution_start': {
      if (!ctx.verbose) return null
      const name = String(event.toolName ?? 'unknown')
      const args = summarizeToolArgs(event.toolName, event.args)
      const argStr = args ? ` ${c.dim}${args}${c.reset}` : ''
      return `  ${c.dim}[tool]${c.reset}    ${name}${argStr}`
    }

    case 'tool_execution_end': {
      if (!ctx.verbose) return null
      const name = String(event.toolName ?? 'unknown')
      const durationStr = ctx.toolDuration != null ? ` ${c.dim}${formatDuration(ctx.toolDuration)}${c.reset}` : ''
      if (ctx.isError) {
        return `  ${c.red}[tool]    ${name} error${c.reset}${durationStr}`
      }
      return `  ${c.dim}[tool]    ${name} done${c.reset}${durationStr}`
    }

    case 'agent_start':
      return `${c.dim}[agent]   Session started${c.reset}`

    case 'agent_end': {
      let line = `${c.dim}[agent]   Session ended${c.reset}`
      if (ctx.lastCost) {
        const cost = `$${ctx.lastCost.costUsd.toFixed(4)}`
        const tokens = `${ctx.lastCost.inputTokens + ctx.lastCost.outputTokens} tokens`
        line += ` ${c.dim}(${cost}, ${tokens})${c.reset}`
      }
      return line
    }

    case 'extension_ui_request': {
      const method = String(event.method ?? '')

      if (method === 'notify') {
        const msg = String(event.message ?? '')
        if (!msg) return null
        // Bold important notifications
        const isImportant = /^(committed:|verification gate:|milestone|blocked:)/i.test(msg)
        return isImportant
          ? `${c.bold}[gsd]     ${msg}${c.reset}`
          : `[gsd]     ${msg}`
      }

      if (method === 'setStatus') {
        // Parse statusKey for phase transitions
        const statusKey = String(event.statusKey ?? '')
        const msg = String(event.message ?? '')
        if (!statusKey && !msg) return null  // suppress empty status lines
        // Show meaningful phase transitions
        if (statusKey) {
          const label = parsePhaseLabel(statusKey, msg)
          if (label) return `${c.cyan}[phase]   ${label}${c.reset}`
        }
        // Fallback: show message if non-empty
        if (msg) return `${c.cyan}[phase]   ${msg}${c.reset}`
        return null
      }

      return null
    }

    default:
      return null
  }
}

/**
 * Format a thinking preview line from accumulated LLM text deltas.
 */
export function formatThinkingLine(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  const truncated = trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed
  return `${c.dim}${c.italic}[thinking] ${truncated}${c.reset}`
}

/**
 * Format a cost line (used for periodic cost updates in verbose mode).
 */
export function formatCostLine(costUsd: number, inputTokens: number, outputTokens: number): string {
  return `${c.dim}[cost]    $${costUsd.toFixed(4)} (${inputTokens + outputTokens} tokens)${c.reset}`
}

// ---------------------------------------------------------------------------
// Phase Label Parser
// ---------------------------------------------------------------------------

/**
 * Parse a statusKey into a human-readable phase label.
 * statusKey format varies but common patterns:
 *   "milestone:M1", "slice:S1.1", "task:T1.1.1", "phase:discuss", etc.
 */
function parsePhaseLabel(statusKey: string, message: string): string | null {
  // Direct phase/milestone/slice/task keys
  const parts = statusKey.split(':')
  if (parts.length >= 2) {
    const [kind, value] = parts
    switch (kind.toLowerCase()) {
      case 'milestone':
        return `Milestone ${value}${message ? ' -- ' + message : ''}`
      case 'slice':
        return `Slice ${value}${message ? ' -- ' + message : ''}`
      case 'task':
        return `Task ${value}${message ? ' -- ' + message : ''}`
      case 'phase':
        return `Phase: ${value}${message ? ' -- ' + message : ''}`
      default:
        return `${kind}: ${value}${message ? ' -- ' + message : ''}`
    }
  }

  // Single-word status keys with a message
  if (message) return `${statusKey}: ${message}`
  return statusKey || null
}

// ---------------------------------------------------------------------------
// Supervised Stdin Reader
// ---------------------------------------------------------------------------

export function startSupervisedStdinReader(
  client: RpcClient,
  onResponse: (id: string) => void,
): () => void {
  return attachJsonlLineReader(process.stdin as Readable, (line) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line)
    } catch {
      process.stderr.write(`[headless] Warning: invalid JSON from orchestrator stdin, skipping\n`)
      return
    }

    const type = String(msg.type ?? '')

    switch (type) {
      case 'extension_ui_response': {
        const id = String(msg.id ?? '')
        const value = msg.value !== undefined ? String(msg.value) : undefined
        const confirmed = typeof msg.confirmed === 'boolean' ? msg.confirmed : undefined
        const cancelled = typeof msg.cancelled === 'boolean' ? msg.cancelled : undefined
        client.sendUIResponse(id, { value, confirmed, cancelled })
        if (id) {
          onResponse(id)
        }
        break
      }
      case 'prompt':
        client.prompt(String(msg.message ?? ''))
        break
      case 'steer':
        client.steer(String(msg.message ?? ''))
        break
      case 'follow_up':
        client.followUp(String(msg.message ?? ''))
        break
      default:
        process.stderr.write(`[headless] Warning: unknown message type "${type}" from orchestrator stdin\n`)
        break
    }
  })
}
