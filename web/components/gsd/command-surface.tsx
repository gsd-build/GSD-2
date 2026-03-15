"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Archive,
  ArrowRightLeft,
  ArrowUpRight,
  Brain,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  COMMAND_SURFACE_THINKING_LEVELS,
  type CommandSurfaceSection,
  type CommandSurfaceTarget,
} from "@/lib/command-surface-contract"
import { cn } from "@/lib/utils"
import {
  formatCost,
  formatTokens,
  getModelLabel,
  getSessionLabelFromBridge,
  shortenPath,
  useGSDWorkspaceActions,
  useGSDWorkspaceState,
} from "@/lib/gsd-workspace-store"

const SETTINGS_SURFACE_SECTIONS = ["model", "thinking", "auth"] as const
const SESSION_SURFACE_SECTIONS = ["resume", "fork", "session", "compact"] as const

function availableSectionsForSurface(surface: string | null): CommandSurfaceSection[] {
  switch (surface) {
    case "resume":
    case "fork":
    case "session":
    case "export":
    case "compact":
      return [...SESSION_SURFACE_SECTIONS]
    default:
      return [...SETTINGS_SURFACE_SECTIONS]
  }
}

function sectionLabel(section: CommandSurfaceSection): string {
  switch (section) {
    case "model":
      return "Model"
    case "thinking":
      return "Thinking"
    case "auth":
      return "Auth"
    case "resume":
      return "Resume"
    case "fork":
      return "Fork"
    case "session":
      return "Session"
    case "compact":
      return "Compact"
  }
}

function sectionIcon(section: CommandSurfaceSection) {
  switch (section) {
    case "model":
      return <Cpu className="h-4 w-4" />
    case "thinking":
      return <Brain className="h-4 w-4" />
    case "auth":
      return <ShieldCheck className="h-4 w-4" />
    case "resume":
      return <ArrowRightLeft className="h-4 w-4" />
    case "fork":
      return <GitBranch className="h-4 w-4" />
    case "session":
      return <FileText className="h-4 w-4" />
    case "compact":
      return <Archive className="h-4 w-4" />
  }
}

function sectionDescription(section: CommandSurfaceSection): string {
  switch (section) {
    case "model":
      return "Load available models from the live bridge and apply a real model change."
    case "thinking":
      return "Choose the thinking level that the current live session should use."
    case "auth":
      return "Manage browser sign-in, API-key setup, and logout against the current onboarding contract."
    case "resume":
      return "Switch the live browser workspace to another resumable project session."
    case "fork":
      return "Load forkable user messages from the current session and create a new fork from one of them."
    case "session":
      return "Inspect current session stats and export the session as HTML from the browser surface."
    case "compact":
      return "Run a real manual compaction with optional custom instructions and inspect the resulting summary."
  }
}

function surfaceTitle(surface: string | null): string {
  switch (surface) {
    case "model":
      return "Model"
    case "thinking":
      return "Thinking"
    case "login":
      return "Login"
    case "logout":
      return "Logout"
    case "settings":
      return "Settings"
    case "resume":
      return "Resume"
    case "fork":
      return "Fork"
    case "session":
      return "Session"
    case "export":
      return "Export"
    case "compact":
      return "Compact"
    default:
      return "Command surface"
  }
}

function surfaceDescription(surface: string | null): string {
  switch (surface) {
    case "resume":
    case "fork":
    case "session":
    case "export":
    case "compact":
      return "Browser-native session controls reuse one shared surface for resume, fork, session stats, export, and compaction."
    default:
      return "Browser-native command controls reuse one shared surface for settings, model selection, thinking, and auth."
  }
}

function currentAuthIntent(activeSurface: string | null, selectedTarget: CommandSurfaceTarget | null): "login" | "logout" | "manage" {
  if (selectedTarget?.kind === "auth") return selectedTarget.intent
  if (activeSurface === "login") return "login"
  if (activeSurface === "logout") return "logout"
  return "manage"
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  if (diffMs < 60_000) return "just now"
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function CommandSurface() {
  const workspace = useGSDWorkspaceState()
  const {
    closeCommandSurface,
    setCommandSurfaceSection,
    selectCommandSurfaceTarget,
    loadAvailableModels,
    applyModelSelection,
    applyThinkingLevel,
    switchSessionFromSurface,
    loadSessionStats,
    exportSessionFromSurface,
    loadForkMessages,
    forkSessionFromSurface,
    compactSessionFromSurface,
    saveApiKeyFromSurface,
    startProviderFlowFromSurface,
    submitProviderFlowInputFromSurface,
    cancelProviderFlowFromSurface,
    logoutProviderFromSurface,
  } = useGSDWorkspaceActions()

  const { commandSurface } = workspace
  const onboarding = workspace.boot?.onboarding ?? null
  const activeFlow = onboarding?.activeFlow ?? null
  const resumableSessions = workspace.boot?.resumableSessions ?? []
  const currentModelLabel = getModelLabel(workspace.boot?.bridge)
  const currentSessionLabel = getSessionLabelFromBridge(workspace.boot?.bridge)
  const currentSessionFile = workspace.boot?.bridge.activeSessionFile ?? workspace.boot?.bridge.sessionState?.sessionFile ?? null
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [flowInput, setFlowInput] = useState("")

  useEffect(() => {
    if (!commandSurface.open || commandSurface.section !== "model") return
    if (commandSurface.availableModels.length > 0) return
    if (commandSurface.pendingAction === "loading_models") return
    void loadAvailableModels()
  }, [commandSurface.open, commandSurface.section, commandSurface.availableModels.length, commandSurface.pendingAction, loadAvailableModels])

  useEffect(() => {
    if (!commandSurface.open || commandSurface.section !== "session") return
    if (commandSurface.sessionStats) return
    if (commandSurface.pendingAction === "load_session_stats") return
    void loadSessionStats()
  }, [commandSurface.open, commandSurface.section, commandSurface.sessionStats, commandSurface.pendingAction, loadSessionStats])

  useEffect(() => {
    if (!commandSurface.open || commandSurface.section !== "fork") return
    if (commandSurface.forkMessages.length > 0) return
    if (commandSurface.pendingAction === "load_fork_messages") return
    void loadForkMessages()
  }, [commandSurface.open, commandSurface.section, commandSurface.forkMessages.length, commandSurface.pendingAction, loadForkMessages])

  useEffect(() => {
    if (!commandSurface.open || commandSurface.section !== "resume") return
    const selectedResumeTarget = commandSurface.selectedTarget?.kind === "resume" ? commandSurface.selectedTarget : null
    if (selectedResumeTarget?.sessionPath) return
    const defaultSession = resumableSessions.find((session) => !session.isActive) ?? resumableSessions[0]
    if (!defaultSession) return
    selectCommandSurfaceTarget({ kind: "resume", sessionPath: defaultSession.path })
  }, [commandSurface.open, commandSurface.section, commandSurface.selectedTarget, resumableSessions, selectCommandSurfaceTarget])

  useEffect(() => {
    setFlowInput("")
  }, [activeFlow?.flowId])

  const selectedModelTarget = commandSurface.selectedTarget?.kind === "model" ? commandSurface.selectedTarget : null
  const selectedThinkingTarget = commandSurface.selectedTarget?.kind === "thinking" ? commandSurface.selectedTarget : null
  const selectedAuthTarget = commandSurface.selectedTarget?.kind === "auth" ? commandSurface.selectedTarget : null
  const selectedResumeTarget = commandSurface.selectedTarget?.kind === "resume" ? commandSurface.selectedTarget : null
  const selectedForkTarget = commandSurface.selectedTarget?.kind === "fork" ? commandSurface.selectedTarget : null
  const selectedSessionTarget = commandSurface.selectedTarget?.kind === "session" ? commandSurface.selectedTarget : null
  const selectedCompactTarget = commandSurface.selectedTarget?.kind === "compact" ? commandSurface.selectedTarget : null

  const selectedAuthIntent = currentAuthIntent(commandSurface.activeSurface, commandSurface.selectedTarget)
  const selectedAuthProvider = onboarding?.required.providers.find((provider) => provider.id === selectedAuthTarget?.providerId) ?? null
  const modelQuery = (selectedModelTarget?.query ?? commandSurface.args).trim().toLowerCase()
  const filteredModels = useMemo(() => {
    if (!modelQuery) return commandSurface.availableModels
    return commandSurface.availableModels.filter((model) =>
      `${model.provider} ${model.modelId} ${model.name ?? ""}`.toLowerCase().includes(modelQuery),
    )
  }, [commandSurface.availableModels, modelQuery])

  const authBusy = workspace.onboardingRequestState !== "idle"
  const modelBusy = commandSurface.pendingAction === "loading_models" || workspace.commandInFlight === "get_available_models"
  const forkBusy = commandSurface.pendingAction === "load_fork_messages" || commandSurface.pendingAction === "fork_session"
  const sessionBusy = commandSurface.pendingAction === "load_session_stats" || commandSurface.pendingAction === "export_html"
  const resumeBusy = commandSurface.pendingAction === "switch_session"
  const compactBusy = commandSurface.pendingAction === "compact_session" || workspace.boot?.bridge.sessionState?.isCompacting === true
  const selectedProviderApiKey = selectedAuthProvider ? apiKeys[selectedAuthProvider.id] ?? "" : ""
  const surfaceSections = availableSectionsForSurface(commandSurface.activeSurface)

  return (
    <Sheet open={commandSurface.open} onOpenChange={(open) => !open && closeCommandSurface()}>
      <SheetContent side="right" className="sm:max-w-2xl" data-testid="command-surface">
        <SheetHeader className="border-b border-border/70">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <SheetTitle data-testid="command-surface-title">{surfaceTitle(commandSurface.activeSurface)}</SheetTitle>
            {commandSurface.activeSurface && (
              <Badge variant="outline" data-testid="command-surface-kind">
                /{commandSurface.activeSurface}
              </Badge>
            )}
          </div>
          <SheetDescription>{surfaceDescription(commandSurface.activeSurface)}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="sticky top-0 z-10 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap gap-2" data-testid="command-surface-sections">
              {surfaceSections.map((section) => (
                <Button
                  key={section}
                  type="button"
                  variant={commandSurface.section === section ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCommandSurfaceSection(section)}
                  data-testid={`command-surface-section-${section}`}
                >
                  {sectionIcon(section)}
                  {sectionLabel(section)}
                </Button>
              ))}
            </div>
            {commandSurface.section && (
              <p className="mt-2 text-xs text-muted-foreground">{sectionDescription(commandSurface.section)}</p>
            )}
          </div>

          <div className="space-y-4 pt-4">
            {commandSurface.lastError && (
              <div
                className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                data-testid="command-surface-error"
              >
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{commandSurface.lastError}</div>
                </div>
              </div>
            )}

            {commandSurface.lastResult && !commandSurface.lastError && (
              <div
                className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success"
                data-testid="command-surface-result"
              >
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>{commandSurface.lastResult}</div>
                </div>
              </div>
            )}

            {commandSurface.section === "model" && (
              <Card data-testid="command-surface-models">
                <CardHeader className="gap-3 border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">Live model selection</CardTitle>
                      <CardDescription>
                        Current session model: <span className="font-mono text-xs text-foreground">{currentModelLabel}</span>
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadAvailableModels()} disabled={modelBusy}>
                      <RefreshCw className={cn("h-4 w-4", modelBusy && "animate-spin")} />
                      Refresh models
                    </Button>
                  </div>
                  {modelQuery && (
                    <div className="text-xs text-muted-foreground">Showing models matching “{modelQuery}”.</div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 pt-6">
                  {modelBusy && commandSurface.availableModels.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Loading models from the live bridge…
                    </div>
                  ) : filteredModels.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {filteredModels.map((model) => {
                        const selected =
                          selectedModelTarget?.provider === model.provider &&
                          selectedModelTarget?.modelId === model.modelId
                        return (
                          <button
                            key={`${model.provider}/${model.modelId}`}
                            type="button"
                            className={cn(
                              "rounded-2xl border px-4 py-3 text-left transition-all",
                              selected
                                ? "border-foreground/40 bg-foreground/[0.045] shadow-sm"
                                : "border-border/70 bg-background/70 hover:border-foreground/20 hover:bg-accent/40",
                            )}
                            onClick={() =>
                              selectCommandSurfaceTarget({
                                kind: "model",
                                provider: model.provider,
                                modelId: model.modelId,
                                query: selectedModelTarget?.query,
                              })
                            }
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium text-foreground">{model.name || model.modelId}</div>
                                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                                  {model.provider}/{model.modelId}
                                </div>
                              </div>
                              <div className="flex flex-wrap justify-end gap-1">
                                {model.isCurrent && <Badge>Current</Badge>}
                                {model.reasoning && <Badge variant="outline">Thinking</Badge>}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                      No models matched the current filter.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() =>
                        selectedModelTarget?.provider &&
                        selectedModelTarget?.modelId &&
                        void applyModelSelection(selectedModelTarget.provider, selectedModelTarget.modelId)
                      }
                      disabled={!selectedModelTarget?.provider || !selectedModelTarget.modelId || commandSurface.pendingAction === "set_model"}
                      data-testid="command-surface-apply-model"
                    >
                      {commandSurface.pendingAction === "set_model" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Cpu className="h-4 w-4" />
                      )}
                      Apply model
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {commandSurface.section === "thinking" && (
              <Card data-testid="command-surface-thinking">
                <CardHeader className="gap-3 border-b border-border/60 pb-4">
                  <CardTitle className="text-lg">Thinking level</CardTitle>
                  <CardDescription>
                    Current level: <span className="font-mono text-xs text-foreground">{workspace.boot?.bridge.sessionState?.thinkingLevel ?? "off"}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {COMMAND_SURFACE_THINKING_LEVELS.map((level) => {
                      const selected = selectedThinkingTarget?.level === level
                      return (
                        <button
                          key={level}
                          type="button"
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left text-sm transition-all",
                            selected
                              ? "border-foreground/40 bg-foreground/[0.045] shadow-sm"
                              : "border-border/70 bg-background/70 hover:border-foreground/20 hover:bg-accent/40",
                          )}
                          onClick={() => selectCommandSurfaceTarget({ kind: "thinking", level })}
                        >
                          <div className="font-medium capitalize text-foreground">{level}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {level === "off" ? "Fastest path" : level === "minimal" ? "Light reasoning" : "More deliberate model work"}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => selectedThinkingTarget && void applyThinkingLevel(selectedThinkingTarget.level)}
                      disabled={!selectedThinkingTarget || commandSurface.pendingAction === "set_thinking_level"}
                      data-testid="command-surface-apply-thinking"
                    >
                      {commandSurface.pendingAction === "set_thinking_level" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Brain className="h-4 w-4" />
                      )}
                      Apply thinking level
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {commandSurface.section === "resume" && (
              <Card data-testid="command-surface-resume">
                <CardHeader className="gap-3 border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">Resume another session</CardTitle>
                      <CardDescription>
                        Current live session: <span className="font-mono text-xs text-foreground">{currentSessionLabel ?? "session pending"}</span>
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{resumableSessions.length} available</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {resumableSessions.length === 0 ? (
                    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                      No resumable project sessions are available yet.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {resumableSessions.map((session) => {
                        const selected = selectedResumeTarget?.sessionPath === session.path
                        return (
                          <button
                            key={session.id}
                            type="button"
                            className={cn(
                              "rounded-2xl border px-4 py-3 text-left transition-all",
                              selected
                                ? "border-foreground/40 bg-foreground/[0.045] shadow-sm"
                                : "border-border/70 bg-background/70 hover:border-foreground/20 hover:bg-accent/40",
                            )}
                            onClick={() => selectCommandSurfaceTarget({ kind: "resume", sessionPath: session.path })}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium text-foreground">{session.name || session.id}</div>
                                  {session.isActive && <Badge>Active</Badge>}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">{shortenPath(session.path)}</div>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                  <span>{session.messageCount} messages</span>
                                  <span>{formatRelativeTime(session.modifiedAt)}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => selectedResumeTarget?.sessionPath && void switchSessionFromSurface(selectedResumeTarget.sessionPath)}
                      disabled={!selectedResumeTarget?.sessionPath || resumeBusy}
                      data-testid="command-surface-apply-resume"
                    >
                      {resumeBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                      Switch session
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {commandSurface.section === "fork" && (
              <Card data-testid="command-surface-fork">
                <CardHeader className="gap-3 border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">Fork from a previous message</CardTitle>
                      <CardDescription>
                        Load real forkable user messages from the current session and create a new branch session from one.
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadForkMessages()} disabled={forkBusy}>
                      <RefreshCw className={cn("h-4 w-4", commandSurface.pendingAction === "load_fork_messages" && "animate-spin")} />
                      Refresh fork points
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {forkBusy && commandSurface.forkMessages.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Loading forkable messages…
                    </div>
                  ) : commandSurface.forkMessages.length > 0 ? (
                    <div className="grid gap-3">
                      {commandSurface.forkMessages.map((message) => {
                        const selected = selectedForkTarget?.entryId === message.entryId
                        return (
                          <button
                            key={message.entryId}
                            type="button"
                            className={cn(
                              "rounded-2xl border px-4 py-3 text-left transition-all",
                              selected
                                ? "border-foreground/40 bg-foreground/[0.045] shadow-sm"
                                : "border-border/70 bg-background/70 hover:border-foreground/20 hover:bg-accent/40",
                            )}
                            onClick={() => selectCommandSurfaceTarget({ kind: "fork", entryId: message.entryId })}
                          >
                            <div className="font-mono text-[11px] text-muted-foreground">{message.entryId}</div>
                            <div className="mt-2 text-sm text-foreground">{message.text}</div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                      No user messages are available for forking yet.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => selectedForkTarget?.entryId && void forkSessionFromSurface(selectedForkTarget.entryId)}
                      disabled={!selectedForkTarget?.entryId || commandSurface.pendingAction === "fork_session"}
                      data-testid="command-surface-apply-fork"
                    >
                      {commandSurface.pendingAction === "fork_session" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <GitBranch className="h-4 w-4" />
                      )}
                      Create fork
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {commandSurface.section === "session" && (
              <Card data-testid="command-surface-session">
                <CardHeader className="gap-3 border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">Current session details</CardTitle>
                      <CardDescription>
                        Inspect stats for the active session and export the exact session tree to HTML.
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadSessionStats()} disabled={sessionBusy}>
                      <RefreshCw className={cn("h-4 w-4", commandSurface.pendingAction === "load_session_stats" && "animate-spin")} />
                      Refresh stats
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Active session</div>
                      <div className="mt-2 font-medium text-foreground">{currentSessionLabel ?? "session pending"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{currentSessionFile ? shortenPath(currentSessionFile) : "No session file attached yet"}</div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Loaded stats</div>
                      <div className="mt-2 font-medium text-foreground">{commandSurface.sessionStats?.sessionId ?? "Not loaded yet"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {commandSurface.sessionStats?.sessionFile ? shortenPath(commandSurface.sessionStats.sessionFile) : "Refresh to inspect the current session snapshot"}
                      </div>
                    </div>
                  </div>

                  {commandSurface.sessionStats ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Messages</div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>User: {commandSurface.sessionStats.userMessages}</div>
                          <div>Assistant: {commandSurface.sessionStats.assistantMessages}</div>
                          <div>Tool calls: {commandSurface.sessionStats.toolCalls}</div>
                          <div>Tool results: {commandSurface.sessionStats.toolResults}</div>
                          <div className="col-span-2 font-medium">Total: {commandSurface.sessionStats.totalMessages}</div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Tokens + cost</div>
                        <div className="mt-3 space-y-2 text-sm">
                          <div>Input: {formatTokens(commandSurface.sessionStats.tokens.input)}</div>
                          <div>Output: {formatTokens(commandSurface.sessionStats.tokens.output)}</div>
                          {commandSurface.sessionStats.tokens.cacheRead > 0 && <div>Cache read: {formatTokens(commandSurface.sessionStats.tokens.cacheRead)}</div>}
                          {commandSurface.sessionStats.tokens.cacheWrite > 0 && <div>Cache write: {formatTokens(commandSurface.sessionStats.tokens.cacheWrite)}</div>}
                          <div className="font-medium">Total: {formatTokens(commandSurface.sessionStats.tokens.total)}</div>
                          <div>Cost: {formatCost(commandSurface.sessionStats.cost)}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                      Refresh session stats to inspect the current session breakdown.
                    </div>
                  )}

                  <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                    <FieldTitle>Export HTML</FieldTitle>
                    <FieldDescription>
                      Leave the path blank to let the bridge choose the default export location.
                    </FieldDescription>
                    <Field>
                      <FieldLabel htmlFor="command-surface-export-path">Output path</FieldLabel>
                      <FieldContent>
                        <Input
                          id="command-surface-export-path"
                          data-testid="command-surface-export-path"
                          value={selectedSessionTarget?.outputPath ?? ""}
                          onChange={(event) => selectCommandSurfaceTarget({ kind: "session", outputPath: event.target.value })}
                          placeholder="Optional output path"
                          disabled={commandSurface.pendingAction === "export_html"}
                        />
                      </FieldContent>
                    </Field>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => void exportSessionFromSurface(selectedSessionTarget?.outputPath)}
                        disabled={commandSurface.pendingAction === "export_html"}
                        data-testid="command-surface-export-session"
                      >
                        {commandSurface.pendingAction === "export_html" ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Export HTML
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {commandSurface.section === "compact" && (
              <Card data-testid="command-surface-compact">
                <CardHeader className="gap-3 border-b border-border/60 pb-4">
                  <CardTitle className="text-lg">Manual compaction</CardTitle>
                  <CardDescription>
                    Compact the current session context now. Provide optional guidance if you want the summary to emphasize specific constraints or files.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <Field>
                    <FieldLabel htmlFor="command-surface-compact-instructions">Custom instructions</FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="command-surface-compact-instructions"
                        data-testid="command-surface-compact-instructions"
                        value={selectedCompactTarget?.customInstructions ?? ""}
                        onChange={(event) => selectCommandSurfaceTarget({ kind: "compact", customInstructions: event.target.value })}
                        placeholder="Optional: tell compaction what to preserve or emphasize"
                        rows={6}
                        disabled={compactBusy}
                      />
                      <FieldDescription>
                        These instructions are sent directly to the real `compact` RPC command only when provided.
                      </FieldDescription>
                    </FieldContent>
                  </Field>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => void compactSessionFromSurface(selectedCompactTarget?.customInstructions)}
                      disabled={compactBusy}
                      data-testid="command-surface-apply-compact"
                    >
                      {compactBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                      Compact now
                    </Button>
                  </div>

                  {commandSurface.lastCompaction && (
                    <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <FieldTitle>Last compaction result</FieldTitle>
                        <Badge variant="outline">{formatTokens(commandSurface.lastCompaction.tokensBefore)} before</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">First kept entry: {commandSurface.lastCompaction.firstKeptEntryId}</div>
                      <div className="whitespace-pre-wrap text-sm text-foreground">{commandSurface.lastCompaction.summary}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {commandSurface.section === "auth" && onboarding && (
              <Card data-testid="command-surface-auth">
                <CardHeader className="gap-3 border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">Auth controls</CardTitle>
                      <CardDescription>
                        Start sign-in, validate API keys, or log out without leaving the browser shell.
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {selectedAuthIntent === "login" ? "Login" : selectedAuthIntent === "logout" ? "Logout" : "Manage auth"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="grid gap-3 md:grid-cols-2">
                    {onboarding.required.providers.map((provider) => {
                      const selected = provider.id === selectedAuthProvider?.id
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left transition-all",
                            selected
                              ? "border-foreground/40 bg-foreground/[0.045] shadow-sm"
                              : "border-border/70 bg-background/70 hover:border-foreground/20 hover:bg-accent/40",
                          )}
                          onClick={() =>
                            selectCommandSurfaceTarget({
                              kind: "auth",
                              providerId: provider.id,
                              intent: selectedAuthIntent,
                            })
                          }
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground">{provider.label}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {provider.configured ? `Configured via ${provider.configuredVia}` : "Not configured yet"}
                              </div>
                            </div>
                            <div className="flex flex-wrap justify-end gap-1">
                              {provider.recommended && <Badge>Recommended</Badge>}
                              {provider.configured && <Badge variant="outline">Detected</Badge>}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {selectedAuthProvider && (
                    <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <FieldTitle>{selectedAuthProvider.label}</FieldTitle>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {selectedAuthProvider.supports.apiKey
                              ? "Validate a provider key here or use browser sign-in when available."
                              : "This provider uses browser sign-in instead of an API key."}
                          </div>
                        </div>
                        <Badge variant="outline">{selectedAuthProvider.configuredVia ?? "not configured"}</Badge>
                      </div>

                      {selectedAuthProvider.supports.apiKey && (
                        <form
                          className="space-y-4"
                          onSubmit={(event) => {
                            event.preventDefault()
                            if (!selectedProviderApiKey.trim()) return
                            void saveApiKeyFromSurface(selectedAuthProvider.id, selectedProviderApiKey)
                          }}
                        >
                          <FieldGroup>
                            <Field>
                              <FieldLabel htmlFor="command-surface-api-key">API key</FieldLabel>
                              <FieldContent>
                                <Input
                                  id="command-surface-api-key"
                                  data-testid="command-surface-api-key-input"
                                  type="password"
                                  autoComplete="off"
                                  value={selectedProviderApiKey}
                                  onChange={(event) =>
                                    setApiKeys((previous) => ({
                                      ...previous,
                                      [selectedAuthProvider.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Paste a provider key"
                                  disabled={authBusy}
                                />
                                <FieldDescription>
                                  Validation happens through the onboarding API and only returns sanitized status and refresh state.
                                </FieldDescription>
                              </FieldContent>
                            </Field>
                          </FieldGroup>

                          <div className="flex flex-wrap gap-3">
                            <Button
                              type="submit"
                              disabled={!selectedProviderApiKey.trim() || authBusy}
                              data-testid="command-surface-save-api-key"
                            >
                              {commandSurface.pendingAction === "save_api_key" ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <KeyRound className="h-4 w-4" />
                              )}
                              Validate and save
                            </Button>

                            {selectedAuthProvider.supports.oauth && selectedAuthProvider.supports.oauthAvailable && (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={authBusy}
                                onClick={() => void startProviderFlowFromSurface(selectedAuthProvider.id)}
                                data-testid="command-surface-start-provider-flow"
                              >
                                <ArrowUpRight className="h-4 w-4" />
                                Browser sign-in
                              </Button>
                            )}
                          </div>
                        </form>
                      )}

                      {!selectedAuthProvider.supports.apiKey && selectedAuthProvider.supports.oauth && selectedAuthProvider.supports.oauthAvailable && (
                        <Button
                          type="button"
                          disabled={authBusy}
                          onClick={() => void startProviderFlowFromSurface(selectedAuthProvider.id)}
                          data-testid="command-surface-start-provider-flow"
                        >
                          {commandSurface.pendingAction === "start_provider_flow" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogIn className="h-4 w-4" />
                          )}
                          Start browser sign-in
                        </Button>
                      )}

                      <div className="flex flex-wrap gap-3">
                        {selectedAuthProvider.supports.oauth && selectedAuthProvider.supports.oauthAvailable && selectedAuthProvider.supports.apiKey && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={authBusy}
                            onClick={() => void startProviderFlowFromSurface(selectedAuthProvider.id)}
                          >
                            <LogIn className="h-4 w-4" />
                            Sign in with browser
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={authBusy}
                          onClick={() => void logoutProviderFromSurface(selectedAuthProvider.id)}
                          data-testid="command-surface-logout-provider"
                        >
                          {commandSurface.pendingAction === "logout_provider" ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <LogOut className="h-4 w-4" />
                          )}
                          Logout provider
                        </Button>
                      </div>

                      {activeFlow && activeFlow.providerId === selectedAuthProvider.id && (
                        <div className="space-y-4 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4" data-testid="command-surface-active-flow">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{activeFlow.status.replaceAll("_", " ")}</Badge>
                            <span className="text-sm text-muted-foreground">Updated {new Date(activeFlow.updatedAt).toLocaleTimeString()}</span>
                          </div>

                          {activeFlow.auth?.instructions && (
                            <div className="text-sm text-muted-foreground">{activeFlow.auth.instructions}</div>
                          )}

                          {activeFlow.auth?.url && (
                            <Button asChild variant="outline" size="sm" data-testid="command-surface-open-auth-url">
                              <a href={activeFlow.auth.url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                Open sign-in page
                              </a>
                            </Button>
                          )}

                          {activeFlow.progress.length > 0 && (
                            <div className="space-y-2">
                              <FieldTitle>Flow progress</FieldTitle>
                              <div className="space-y-2 text-sm text-muted-foreground">
                                {activeFlow.progress.map((message, index) => (
                                  <div key={`${activeFlow.flowId}-${index}`} className="rounded-lg border border-border/50 bg-background/70 px-3 py-2">
                                    {message}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {activeFlow.prompt && (
                            <form
                              className="space-y-3"
                              onSubmit={(event) => {
                                event.preventDefault()
                                if (!activeFlow.prompt?.allowEmpty && !flowInput.trim()) return
                                void submitProviderFlowInputFromSurface(activeFlow.flowId, flowInput)
                              }}
                            >
                              <Field>
                                <FieldLabel htmlFor="command-surface-flow-input">Next step</FieldLabel>
                                <FieldContent>
                                  <Input
                                    id="command-surface-flow-input"
                                    data-testid="command-surface-flow-input"
                                    value={flowInput}
                                    onChange={(event) => setFlowInput(event.target.value)}
                                    placeholder={activeFlow.prompt.placeholder || "Enter the requested value"}
                                    disabled={authBusy}
                                  />
                                  <FieldDescription>{activeFlow.prompt.message}</FieldDescription>
                                </FieldContent>
                              </Field>

                              <div className="flex flex-wrap gap-3">
                                <Button type="submit" disabled={authBusy || (!activeFlow.prompt.allowEmpty && !flowInput.trim())}>
                                  {commandSurface.pendingAction === "submit_provider_flow_input" ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <ShieldCheck className="h-4 w-4" />
                                  )}
                                  Continue sign-in
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={authBusy}
                                  onClick={() => void cancelProviderFlowFromSurface(activeFlow.flowId)}
                                >
                                  Cancel flow
                                </Button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}

                      {onboarding.bridgeAuthRefresh.phase !== "idle" && (
                        <div className="rounded-xl border border-border/70 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                          <div className="font-medium text-foreground">Bridge auth refresh</div>
                          <div className="mt-1">
                            {onboarding.bridgeAuthRefresh.phase === "pending"
                              ? "Refreshing the live bridge onto the new auth view…"
                              : onboarding.bridgeAuthRefresh.phase === "failed"
                                ? onboarding.bridgeAuthRefresh.error || "Bridge auth refresh failed."
                                : "The live bridge picked up the latest auth state."}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <SheetFooter className="border-t border-border/70">
          <Button type="button" variant="ghost" onClick={() => closeCommandSurface()}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
