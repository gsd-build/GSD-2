import type { BrowserSlashCommandDispatchResult, BrowserSlashCommandSurface } from "./browser-slash-command-dispatch"

export const COMMAND_SURFACE_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const

export type CommandSurfaceThinkingLevel = (typeof COMMAND_SURFACE_THINKING_LEVELS)[number]
export type CommandSurfaceSection = "model" | "thinking" | "auth" | "resume" | "fork" | "session" | "compact"
export type CommandSurfaceSource = "slash" | "sidebar" | "surface"
export type CommandSurfacePendingAction =
  | "loading_models"
  | "set_model"
  | "set_thinking_level"
  | "save_api_key"
  | "start_provider_flow"
  | "submit_provider_flow_input"
  | "cancel_provider_flow"
  | "logout_provider"
  | "switch_session"
  | "load_fork_messages"
  | "fork_session"
  | "load_session_stats"
  | "export_html"
  | "compact_session"

export interface CommandSurfaceModelOption {
  provider: string
  modelId: string
  name?: string
  reasoning: boolean
  isCurrent: boolean
}

export interface CommandSurfaceForkMessage {
  entryId: string
  text: string
}

export interface CommandSurfaceSessionStats {
  sessionFile: string | undefined
  sessionId: string
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  totalMessages: number
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
  cost: number
}

export interface CommandSurfaceCompactionResult {
  summary: string
  firstKeptEntryId: string
  tokensBefore: number
  details?: unknown
}

export interface CommandSurfaceResumableSession {
  id: string
  path: string
  name?: string
  isActive: boolean
}

export type CommandSurfaceTarget =
  | { kind: "settings"; section: CommandSurfaceSection }
  | { kind: "model"; provider?: string; modelId?: string; query?: string }
  | { kind: "thinking"; level: CommandSurfaceThinkingLevel }
  | { kind: "auth"; providerId?: string; intent: "login" | "logout" | "manage" }
  | { kind: "resume"; sessionPath?: string }
  | { kind: "fork"; entryId?: string }
  | { kind: "session"; outputPath?: string }
  | { kind: "compact"; customInstructions: string }

export interface WorkspaceCommandSurfaceState {
  open: boolean
  activeSurface: BrowserSlashCommandSurface | null
  source: CommandSurfaceSource | null
  section: CommandSurfaceSection | null
  args: string
  pendingAction: CommandSurfacePendingAction | null
  selectedTarget: CommandSurfaceTarget | null
  lastError: string | null
  lastResult: string | null
  availableModels: CommandSurfaceModelOption[]
  forkMessages: CommandSurfaceForkMessage[]
  sessionStats: CommandSurfaceSessionStats | null
  lastCompaction: CommandSurfaceCompactionResult | null
}

export interface CommandSurfaceOpenContext {
  onboardingLocked?: boolean
  currentModel?: { provider?: string; modelId?: string } | null
  currentThinkingLevel?: string | null
  preferredProviderId?: string | null
  resumableSessions?: CommandSurfaceResumableSession[]
}

export interface CommandSurfaceOpenRequest extends CommandSurfaceOpenContext {
  surface: BrowserSlashCommandSurface
  source: CommandSurfaceSource
  args?: string
  selectedTarget?: CommandSurfaceTarget | null
}

export interface CommandSurfaceActionResult {
  action: CommandSurfacePendingAction
  success: boolean
  message: string
  selectedTarget?: CommandSurfaceTarget | null
  availableModels?: CommandSurfaceModelOption[]
  forkMessages?: CommandSurfaceForkMessage[]
  sessionStats?: CommandSurfaceSessionStats | null
  lastCompaction?: CommandSurfaceCompactionResult | null
}

const AUTH_SURFACE_COMMANDS = new Set<BrowserSlashCommandSurface>(["settings", "login", "logout"])

function matchingSessionPath(
  sessions: CommandSurfaceResumableSession[] | undefined,
  query: string | undefined,
): string | undefined {
  if (!sessions?.length) return undefined
  const normalizedQuery = query?.trim().toLowerCase()
  if (!normalizedQuery) {
    return sessions.find((session) => !session.isActive)?.path ?? sessions[0]?.path
  }

  const exactMatch = sessions.find((session) => {
    const values = [session.id, session.name, session.path].filter(Boolean).map((value) => value!.toLowerCase())
    return values.includes(normalizedQuery)
  })
  if (exactMatch) return exactMatch.path

  return sessions.find((session) => {
    const values = [session.id, session.name, session.path].filter(Boolean).map((value) => value!.toLowerCase())
    return values.some((value) => value.includes(normalizedQuery))
  })?.path
}

export function isCommandSurfaceThinkingLevel(value: string | null | undefined): value is CommandSurfaceThinkingLevel {
  return COMMAND_SURFACE_THINKING_LEVELS.includes((value ?? "") as CommandSurfaceThinkingLevel)
}

export function createInitialCommandSurfaceState(): WorkspaceCommandSurfaceState {
  return {
    open: false,
    activeSurface: null,
    source: null,
    section: null,
    args: "",
    pendingAction: null,
    selectedTarget: null,
    lastError: null,
    lastResult: null,
    availableModels: [],
    forkMessages: [],
    sessionStats: null,
    lastCompaction: null,
  }
}

export function commandSurfaceSectionForRequest(request: CommandSurfaceOpenRequest): CommandSurfaceSection | null {
  switch (request.surface) {
    case "model":
      return "model"
    case "thinking":
      return "thinking"
    case "settings":
      return request.onboardingLocked ? "auth" : "model"
    case "login":
    case "logout":
      return "auth"
    case "resume":
      return "resume"
    case "fork":
      return "fork"
    case "session":
    case "export":
      return "session"
    case "compact":
      return "compact"
    default:
      return null
  }
}

function buildSettingsTarget(section: CommandSurfaceSection): CommandSurfaceTarget {
  return { kind: "settings", section }
}

function buildModelTarget(request: CommandSurfaceOpenRequest): CommandSurfaceTarget {
  const query = request.args?.trim() || undefined
  return {
    kind: "model",
    provider: request.currentModel?.provider,
    modelId: request.currentModel?.modelId,
    query,
  }
}

function buildThinkingTarget(request: CommandSurfaceOpenRequest): CommandSurfaceTarget {
  const requestedLevel = request.args?.trim().toLowerCase() || ""
  const level = isCommandSurfaceThinkingLevel(requestedLevel)
    ? requestedLevel
    : isCommandSurfaceThinkingLevel(request.currentThinkingLevel)
      ? request.currentThinkingLevel
      : "off"

  return {
    kind: "thinking",
    level,
  }
}

function buildAuthTarget(request: CommandSurfaceOpenRequest): CommandSurfaceTarget {
  const requestedProviderId = request.args?.trim() || undefined
  return {
    kind: "auth",
    providerId: requestedProviderId ?? request.preferredProviderId ?? undefined,
    intent: request.surface === "login" ? "login" : request.surface === "logout" ? "logout" : "manage",
  }
}

function buildResumeTarget(request: CommandSurfaceOpenRequest): CommandSurfaceTarget {
  const selectedPath = matchingSessionPath(request.resumableSessions, request.args)
  return {
    kind: "resume",
    sessionPath: selectedPath,
  }
}

function buildForkTarget(request: CommandSurfaceOpenRequest): CommandSurfaceTarget {
  const entryId = request.args?.trim() || undefined
  return {
    kind: "fork",
    entryId,
  }
}

function buildSessionTarget(request: CommandSurfaceOpenRequest): CommandSurfaceTarget {
  const outputPath = request.args?.trim() || undefined
  return {
    kind: "session",
    outputPath,
  }
}

function buildCompactTarget(request: CommandSurfaceOpenRequest): CommandSurfaceTarget {
  return {
    kind: "compact",
    customInstructions: request.args?.trim() ?? "",
  }
}

export function buildCommandSurfaceTarget(request: CommandSurfaceOpenRequest): CommandSurfaceTarget | null {
  if (request.selectedTarget !== undefined) {
    return request.selectedTarget
  }

  const section = commandSurfaceSectionForRequest(request)
  if (!section) return null

  if (request.surface === "settings") {
    return buildSettingsTarget(section)
  }

  if (request.surface === "model") {
    return buildModelTarget(request)
  }

  if (request.surface === "thinking") {
    return buildThinkingTarget(request)
  }

  if (AUTH_SURFACE_COMMANDS.has(request.surface)) {
    return buildAuthTarget(request)
  }

  if (request.surface === "resume") {
    return buildResumeTarget(request)
  }

  if (request.surface === "fork") {
    return buildForkTarget(request)
  }

  if (request.surface === "session" || request.surface === "export") {
    return buildSessionTarget(request)
  }

  if (request.surface === "compact") {
    return buildCompactTarget(request)
  }

  return buildSettingsTarget(section)
}

export function openCommandSurfaceState(
  current: WorkspaceCommandSurfaceState,
  request: CommandSurfaceOpenRequest,
): WorkspaceCommandSurfaceState {
  const section = commandSurfaceSectionForRequest(request)
  return {
    ...current,
    open: true,
    activeSurface: request.surface,
    source: request.source,
    section,
    args: request.args?.trim() ?? "",
    pendingAction: null,
    selectedTarget: buildCommandSurfaceTarget(request),
    lastError: null,
    lastResult: null,
    sessionStats: null,
    forkMessages: [],
    lastCompaction: null,
  }
}

export function closeCommandSurfaceState(current: WorkspaceCommandSurfaceState): WorkspaceCommandSurfaceState {
  return {
    ...current,
    open: false,
    pendingAction: null,
  }
}

export function setCommandSurfaceSection(
  current: WorkspaceCommandSurfaceState,
  section: CommandSurfaceSection,
  context: CommandSurfaceOpenContext = {},
): WorkspaceCommandSurfaceState {
  const request: CommandSurfaceOpenRequest = {
    surface: current.activeSurface ?? "settings",
    source: current.source ?? "surface",
    args: current.args,
    ...context,
  }

  let selectedTarget: CommandSurfaceTarget | null = current.selectedTarget
  if (section === "model") {
    selectedTarget = buildModelTarget(request)
  } else if (section === "thinking") {
    selectedTarget = buildThinkingTarget(request)
  } else if (section === "auth") {
    selectedTarget = buildAuthTarget({
      ...request,
      surface:
        current.activeSurface === "logout"
          ? "logout"
          : current.activeSurface === "login"
            ? "login"
            : "settings",
    })
  } else if (section === "resume") {
    selectedTarget = buildResumeTarget(request)
  } else if (section === "fork") {
    selectedTarget = buildForkTarget(request)
  } else if (section === "session") {
    selectedTarget = buildSessionTarget(request)
  } else if (section === "compact") {
    selectedTarget = buildCompactTarget(request)
  }

  return {
    ...current,
    section,
    selectedTarget,
  }
}

export function setCommandSurfacePending(
  current: WorkspaceCommandSurfaceState,
  action: CommandSurfacePendingAction,
  selectedTarget: CommandSurfaceTarget | null = current.selectedTarget,
): WorkspaceCommandSurfaceState {
  return {
    ...current,
    pendingAction: action,
    selectedTarget,
    lastError: null,
    lastResult: null,
  }
}

export function applyCommandSurfaceActionResult(
  current: WorkspaceCommandSurfaceState,
  result: CommandSurfaceActionResult,
): WorkspaceCommandSurfaceState {
  return {
    ...current,
    pendingAction: null,
    selectedTarget: result.selectedTarget === undefined ? current.selectedTarget : result.selectedTarget,
    availableModels: result.availableModels ?? current.availableModels,
    forkMessages: result.forkMessages ?? current.forkMessages,
    sessionStats: result.sessionStats === undefined ? current.sessionStats : result.sessionStats,
    lastCompaction: result.lastCompaction === undefined ? current.lastCompaction : result.lastCompaction,
    lastError: result.success ? null : result.message,
    lastResult: result.success ? result.message : null,
  }
}

export function surfaceOutcomeToOpenRequest(
  outcome: Extract<BrowserSlashCommandDispatchResult, { kind: "surface" }>,
  context: CommandSurfaceOpenContext = {},
): CommandSurfaceOpenRequest {
  return {
    surface: outcome.surface,
    source: "slash",
    args: outcome.args,
    ...context,
  }
}
