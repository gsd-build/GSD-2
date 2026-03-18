"use client"

import { useEffect, useRef, useCallback, useState, useMemo, KeyboardEvent } from "react"
import { MessagesSquare, SendHorizonal, Check, Eye, EyeOff, Play, Loader2, Milestone, X, MessageCircle, FileEdit, FilePlus, Terminal, ChevronDown, ChevronRight, MoreHorizontal, Zap, Square, Pause, BarChart3, LayoutGrid, ListOrdered, History, Compass, PenLine, Inbox, SkipForward, Undo2, BookOpen, Settings, SlidersHorizontal, Stethoscope, FileOutput, Trash2, Globe, type LucideIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { ChatMessage, TuiPrompt } from "@/lib/pty-chat-parser"
import {
  useGSDWorkspaceState,
  useGSDWorkspaceActions,
  buildPromptCommand,
  type CompletedToolExecution,
} from "@/lib/gsd-workspace-store"
import { deriveWorkflowAction } from "@/lib/workflow-actions"
import { NewMilestoneDialog } from "@/components/gsd/new-milestone-dialog"
import { useTerminalFontSize } from "@/lib/use-terminal-font-size"

type HeadlessTerminal = import("@xterm/xterm").Terminal

/* ─── ActionPanel types ─── */

/**
 * Configuration for a secondary action panel.
 * accentColor maps to Tailwind color names (e.g. "sky", "amber", "green").
 */
export interface ActionPanelConfig {
  label: string
  command: string
  sessionId: string
  accentColor: string
  renderMode?: "chat" | "terminal"
}

/* ─── GSD Action Definitions ─── */

/**
 * Defines every /gsd subcommand available in the chat input bar.
 * Top 3 are shown as standalone buttons; the rest live in the overflow menu.
 */
interface GSDActionDef {
  label: string
  command: string
  icon: LucideIcon
  description: string
  category: "workflow" | "visibility" | "correction" | "knowledge" | "config" | "maintenance"
  renderMode?: "chat" | "terminal"
  /** Where this command executes: "main" sends to main agent, "panel" opens action panel */
  target: "main" | "panel"
}

const GSD_ACTIONS: GSDActionDef[] = [
  // ── Top 3 (standalone buttons) ──
  { label: "Discuss",   command: "/gsd discuss",   icon: MessageCircle,     description: "Start guided milestone/slice discussion",                    category: "workflow",    target: "panel" },
  { label: "Next",      command: "/gsd next",      icon: Play,              description: "Execute next task, then pause",                              category: "workflow",    target: "main",   renderMode: "terminal" },
  { label: "Auto",      command: "/gsd auto",      icon: Zap,               description: "Run all queued units continuously",                         category: "workflow",    target: "main",   renderMode: "terminal" },
  // ── Overflow: Workflow ──
  { label: "Stop",      command: "/gsd stop",      icon: Square,            description: "Stop auto-mode gracefully",                                  category: "workflow",    target: "main",   renderMode: "terminal" },
  { label: "Pause",     command: "/gsd pause",     icon: Pause,             description: "Pause auto-mode (preserves state)",                          category: "workflow",    target: "main",   renderMode: "terminal" },
  // ── Overflow: Visibility ──
  { label: "Status",    command: "/gsd status",    icon: BarChart3,         description: "Show progress dashboard",                                    category: "visibility",  target: "panel",  renderMode: "terminal" },
  { label: "Visualize", command: "/gsd visualize", icon: LayoutGrid,        description: "Interactive TUI (progress, deps, metrics, timeline)",        category: "visibility",  target: "panel",  renderMode: "terminal" },
  { label: "Queue",     command: "/gsd queue",     icon: ListOrdered,       description: "Show queued/dispatched units and execution order",            category: "visibility",  target: "panel",  renderMode: "terminal" },
  { label: "History",   command: "/gsd history",   icon: History,           description: "View execution history with cost/phase/model details",        category: "visibility",  target: "panel",  renderMode: "terminal" },
  // ── Overflow: Course correction ──
  { label: "Steer",     command: "/gsd steer",     icon: Compass,           description: "Apply user override to active work",                         category: "correction",  target: "panel" },
  { label: "Capture",   command: "/gsd capture",   icon: PenLine,           description: "Quick-capture a thought to CAPTURES.md",                     category: "correction",  target: "panel" },
  { label: "Triage",    command: "/gsd triage",    icon: Inbox,             description: "Classify and route pending captures",                        category: "correction",  target: "panel",  renderMode: "terminal" },
  { label: "Skip",      command: "/gsd skip",      icon: SkipForward,       description: "Prevent a unit from auto-mode dispatch",                     category: "correction",  target: "panel",  renderMode: "terminal" },
  { label: "Undo",      command: "/gsd undo",      icon: Undo2,             description: "Revert last completed unit",                                 category: "correction",  target: "panel",  renderMode: "terminal" },
  // ── Overflow: Knowledge ──
  { label: "Knowledge", command: "/gsd knowledge", icon: BookOpen,          description: "Add rule, pattern, or lesson to KNOWLEDGE.md",               category: "knowledge",   target: "panel" },
  // ── Overflow: Configuration ──
  { label: "Mode",      command: "/gsd mode",      icon: SlidersHorizontal, description: "Set workflow mode (solo/team)",                               category: "config",      target: "panel",  renderMode: "terminal" },
  { label: "Prefs",     command: "/gsd prefs",     icon: Settings,          description: "Manage preferences (global/project)",                        category: "config",      target: "panel",  renderMode: "terminal" },
  // ── Overflow: Maintenance ──
  { label: "Doctor",    command: "/gsd doctor",    icon: Stethoscope,       description: "Diagnose and repair .gsd/ state",                            category: "maintenance", target: "panel",  renderMode: "terminal" },
  { label: "Export",    command: "/gsd export",    icon: FileOutput,        description: "Export milestone/slice results (JSON or Markdown)",           category: "maintenance", target: "panel",  renderMode: "terminal" },
  { label: "Cleanup",   command: "/gsd cleanup",   icon: Trash2,            description: "Remove merged branches or snapshots",                        category: "maintenance", target: "panel",  renderMode: "terminal" },
  { label: "Remote",    command: "/gsd remote",    icon: Globe,             description: "Control remote auto-mode (Slack/Discord)",                    category: "maintenance", target: "panel",  renderMode: "terminal" },
]

/** Top 3 shown as standalone buttons next to chat input */
const TOP_ACTIONS = GSD_ACTIONS.slice(0, 3)
/** Remaining actions in the overflow menu */
const OVERFLOW_ACTIONS = GSD_ACTIONS.slice(3)

const CATEGORY_LABELS: Record<GSDActionDef["category"], string> = {
  workflow: "Workflow",
  visibility: "Visibility",
  correction: "Course Correction",
  knowledge: "Knowledge",
  config: "Configuration",
  maintenance: "Maintenance",
}

function groupByCategory(actions: GSDActionDef[]): Array<{ category: GSDActionDef["category"]; label: string; items: GSDActionDef[] }> {
  const seen = new Map<GSDActionDef["category"], GSDActionDef[]>()
  for (const a of actions) {
    let group = seen.get(a.category)
    if (!group) {
      group = []
      seen.set(a.category, group)
    }
    group.push(a)
  }
  return Array.from(seen.entries()).map(([cat, items]) => ({ category: cat, label: CATEGORY_LABELS[cat], items }))
}

function toActionPanelConfig(action: GSDActionDef): Omit<ActionPanelConfig, "sessionId"> {
  return {
    label: action.label,
    command: action.command,
    accentColor: "sky",
    renderMode: action.renderMode,
  }
}

/**
 * ChatMode — main view for the Chat tab.
 *
 * T01: Header with live GSD workflow action bar (mirrors Power Mode toolbar).
 * T02: ActionPanel — right-side panel with secondary PTY session; slides in on action click.
 * T03 adds fully-styled ChatBubble rendering (markdown + syntax highlight)
 *     and the fully-wired ChatInputBar.
 *
 * Observability:
 *   - This component mounts only when activeView === "chat" (no hidden pre-init).
 *   - sessionStorage key "gsd-active-view:<cwd>" equals "chat" when this view is active.
 *   - ChatPane logs SSE lifecycle to console under [ChatPane] prefix.
 *   - ActionPanel logs open/close/cleanup under [ActionPanel] prefix.
 *   - In dev mode, window.__chatParser exposes the PtyChatParser instance.
 *   - Header toolbar: data-testid="chat-mode-action-bar" confirms toolbar rendered.
 *   - Primary button: data-testid="chat-primary-action" reflects current workflowAction label.
 *   - Secondary buttons: data-testid="chat-secondary-action-{command}".
 *   - Action panel: data-testid="action-panel" — present when panel is open.
 *   - Action panel close: data-testid="action-panel-close".
 */
export function ChatMode({ className }: { className?: string }) {
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [actionPanelState, setActionPanelState] = useState<ActionPanelConfig | null>(null)
  const state = useGSDWorkspaceState()
  const { sendCommand } = useGSDWorkspaceActions()

  const bridge = state.boot?.bridge ?? null

  // ── Panel lifecycle ────────────────────────────────────────────────────────

  const closePanel = useCallback(() => {
    setActionPanelState((current) => {
      if (!current) return null
      const { sessionId } = current
      console.log("[ActionPanel] close reason=manual sessionId=%s", sessionId)
      // Session DELETE is handled by ActionPanel's unmount useEffect (backstop)
      // This avoids double-DELETE when both explicit close and unmount fire.
      return null
    })
  }, [])

  const openPanel = useCallback(
    (actionDef: Omit<ActionPanelConfig, "sessionId">) => {
      const newSessionId = "gsd-action-" + Date.now()

      setActionPanelState((current) => {
        if (current) {
          // Log the replace — unmount cleanup handles the DELETE for the old session
          console.log("[ActionPanel] close reason=replace sessionId=%s", current.sessionId)
        }

        const newConfig: ActionPanelConfig = { ...actionDef, sessionId: newSessionId }
        console.log("[ActionPanel] open sessionId=%s command=%s", newSessionId, actionDef.command)
        return newConfig
      })
    },
    [],
  )

  const handlePrimaryAction = useCallback(
    (command: string) => {
      void sendCommand(buildPromptCommand(command, bridge))
    },
    [sendCommand, bridge],
  )

  const handleSecondaryAction = useCallback(
    (command: string) => {
      void sendCommand(buildPromptCommand(command, bridge))
    },
    [sendCommand, bridge],
  )

  return (
    <div className={cn("flex h-full flex-col overflow-hidden bg-background", className)}>
      {/* ── Header bar ── */}
      <ChatModeHeader
        onPrimaryAction={handlePrimaryAction}
        onSecondaryAction={handleSecondaryAction}
        onNewMilestone={() => setMilestoneDialogOpen(true)}
      />

      {/* ── Main pane + optional right panel ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main ChatPane: shrinks to ~58% when action panel is open */}
        <ChatPane
          sessionId="gsd-main"
          command="gsd"
          className={cn(
            "min-w-0 transition-[width] duration-300",
            actionPanelState ? "w-[58%]" : "flex-1",
          )}
          onOpenAction={(action) => {
            if (action.target === "main") {
              handlePrimaryAction(action.command)
            } else {
              openPanel(toActionPanelConfig(action))
            }
          }}
        />

        {/* Vertical divider — only visible when panel is open */}
        <AnimatePresence>
          {actionPanelState && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-px flex-shrink-0 bg-border"
            />
          )}
        </AnimatePresence>

        {/* Action panel — animated slide-in from right */}
        <AnimatePresence>
          {actionPanelState && (
            <motion.div
              key={actionPanelState.sessionId}
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-[42%] flex-shrink-0 overflow-hidden"
            >
              <ActionPanel
                config={actionPanelState}
                onClose={closePanel}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <NewMilestoneDialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen} />
    </div>
  )
}

/* ─── Header ─── */

interface ChatModeHeaderProps {
  onPrimaryAction: (command: string) => void
  onSecondaryAction: (command: string) => void
  onNewMilestone: () => void
}

/**
 * ChatModeHeader — action toolbar for Chat Mode.
 *
 * Single-row layout matching the Power User Mode header: title + badge left-aligned,
 * workflow action buttons immediately to the right (no second row).
 *
 * Observability:
 *   - data-testid="chat-mode-action-bar" on the workflow button row
 *   - data-testid="chat-primary-action" on the primary button
 *   - data-testid="chat-secondary-action-{command}" on each secondary button
 */
function ChatModeHeader({ onPrimaryAction, onSecondaryAction, onNewMilestone }: ChatModeHeaderProps) {
  const state = useGSDWorkspaceState()

  const boot = state.boot
  const workspace = boot?.workspace ?? null
  const auto = boot?.auto ?? null

  const workflowAction = deriveWorkflowAction({
    phase: workspace?.active.phase ?? "pre-planning",
    autoActive: auto?.active ?? false,
    autoPaused: auto?.paused ?? false,
    onboardingLocked: boot?.onboarding.locked ?? false,
    commandInFlight: state.commandInFlight,
    bootStatus: state.bootStatus,
    hasMilestones: (workspace?.milestones.length ?? 0) > 0,
    projectDetectionKind: boot?.projectDetection?.kind ?? null,
  })

  const handlePrimary = () => {
    if (!workflowAction.primary) return
    if (workflowAction.isNewMilestone) {
      onNewMilestone()
    } else {
      onPrimaryAction(workflowAction.primary.command)
    }
  }

  // Derive a short GSD state badge label
  const stateBadge = (() => {
    if (state.bootStatus !== "ready") return state.bootStatus
    const phase = workspace?.active.phase
    if (!phase) return "idle"
    if (auto?.active && !auto?.paused) return "auto"
    if (auto?.paused) return "paused"
    return phase
  })()

  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
      {/* Left: title + state badge */}
      <div className="flex items-center gap-2">
        <MessagesSquare className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Chat Mode</span>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {stateBadge}
        </span>
      </div>

      {/* Right: workflow action buttons */}
      <div className="flex items-center gap-2" data-testid="chat-mode-action-bar">
          {workflowAction.primary && (
            <button
              data-testid="chat-primary-action"
              onClick={handlePrimary}
              disabled={workflowAction.disabled}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                workflowAction.primary.variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
                workflowAction.disabled && "cursor-not-allowed opacity-50",
              )}
              title={workflowAction.disabledReason}
            >
              {state.commandInFlight ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : workflowAction.isNewMilestone ? (
                <Milestone className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {workflowAction.primary.label}
            </button>
          )}
          {workflowAction.secondaries.map((action) => (
            <button
              key={action.command}
              data-testid={`chat-secondary-action-${action.command}`}
              onClick={() => onSecondaryAction(action.command)}
              disabled={workflowAction.disabled}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-accent",
                workflowAction.disabled && "cursor-not-allowed opacity-50",
              )}
              title={workflowAction.disabledReason}
            >
              {action.label}
            </button>
          ))}
          {state.commandInFlight && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          )}
        </div>
    </div>
  )
}

/* ─── ActionPanel ─── */

/**
 * ActionPanel — right-side secondary chat pane for a GSD action.
 *
 * Opened by ChatMode.openPanel(). Contains a ChatPane connected to a fresh
 * PTY session. Auto-closes 1500ms after PtyChatParser emits CompletionSignal.
 *
 * Observability:
 *   - data-testid="action-panel" + data-session-id={config.sessionId}
 *   - data-testid="action-panel-close" — X button
 *   - console.log("[ActionPanel] completion signal received, closing in 1500ms sessionId=%s")
 *   - console.log("[ActionPanel] unmount cleanup sessionId=%s") — backstop on unmount
 */
function ActionPanel({
  config,
  onClose,
}: {
  config: ActionPanelConfig
  onClose: () => void
}) {

  // Unmount backstop: DELETE the session if ActionPanel unmounts without closePanel being called
  // (e.g., navigating away from Chat Mode while panel is open)
  useEffect(() => {
    const { sessionId } = config
    return () => {
      console.log("[ActionPanel] unmount cleanup sessionId=%s", sessionId)
      fetch(`/api/terminal/sessions?id=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }).catch((err: unknown) => {
        console.error("[ActionPanel] unmount session DELETE failed sessionId=%s", sessionId, err)
      })
    }
  // config.sessionId is stable for a given panel instance; config object itself changes on replace
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.sessionId])

  // Subscribe to completion signal via ChatPane callback
  const handleCompletionSignal = useCallback(() => {
    console.log(
      "[ActionPanel] completion signal received, closing in 1500ms sessionId=%s",
      config.sessionId,
    )
    setTimeout(() => {
      onClose()
    }, 1500)
  }, [config.sessionId, onClose])

  return (
    <div
      data-testid="action-panel"
      data-session-id={config.sessionId}
      className="flex h-full flex-col overflow-hidden bg-background"
    >
      {/* Panel header */}
      <div
        className="flex h-11 flex-shrink-0 items-center justify-between border-b border-border bg-card px-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {config.label}
          </span>
        </div>
        <button
          data-testid="action-panel-close"
          onClick={onClose}
          aria-label="Close action panel"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Secondary pane — always uses StructuredTerminalActionPane for its own PTY session.
          ChatPane reads from the global workspace store which is shared with the main chat,
          so action panels must use their own independent terminal session. */}
      <StructuredTerminalActionPane
        sessionId={config.sessionId}
        command="gsd"
        commandArgs={[config.command]}
        activityLabel={config.label}
        onCompletionSignal={handleCompletionSignal}
      />
    </div>
  )
}



type ShikiHighlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string
}

let chatHighlighterPromise: Promise<ShikiHighlighter> | null = null

function getChatHighlighter(): Promise<ShikiHighlighter> {
  if (!chatHighlighterPromise) {
    chatHighlighterPromise = import("shiki")
      .then((mod) =>
        mod.createHighlighter({
          themes: ["github-dark-default", "github-light-default"],
          langs: [
            "typescript", "tsx", "javascript", "jsx",
            "json", "jsonc", "markdown", "mdx",
            "css", "scss", "less", "html", "xml",
            "yaml", "toml", "bash", "python", "ruby",
            "rust", "go", "java", "kotlin", "swift",
            "c", "cpp", "csharp", "php", "sql",
            "graphql", "dockerfile", "makefile",
            "lua", "diff", "ini", "dotenv",
          ],
        }),
      )
      .catch((err) => {
        chatHighlighterPromise = null
        throw err
      })
  }
  return chatHighlighterPromise
}

/* ─── Markdown renderer for assistant bubbles ─── */

/**
 * Renders markdown content using react-markdown + remark-gfm + shiki code blocks.
 * Dynamic imports keep the main bundle lean.
 * Falls back to plain text if modules fail to load.
 *
 * Observability:
 *   - console.debug("[ChatBubble] markdown modules loaded") fires once on first render
 */
function MarkdownContent({ content }: { content: string }) {
  const [rendered, setRendered] = useState<React.ReactNode | null>(null)
  const [ready, setReady] = useState(false)
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )

  // Watch for theme changes via MutationObserver on <html> class
  useEffect(() => {
    if (typeof document === "undefined") return
    const el = document.documentElement
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"))
    })
    observer.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      import("react-markdown"),
      import("remark-gfm"),
      getChatHighlighter(),
    ])
      .then(([ReactMarkdownMod, remarkGfmMod, highlighter]) => {
        if (cancelled) return
        console.debug("[ChatBubble] markdown modules loaded")

        const ReactMarkdown = ReactMarkdownMod.default
        const remarkGfm = remarkGfmMod.default

        const shikiTheme = isDark ? "github-dark-default" : "github-light-default"

        const buildComponents = (h: typeof highlighter) => ({
          code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) {
            const match = /language-(\w+)/.exec(className || "")
            const codeStr = String(children).replace(/\n$/, "")

            if (match) {
              try {
                const highlighted = h.codeToHtml(codeStr, {
                  lang: match[1],
                  theme: shikiTheme,
                })
                return (
                  <div
                    className="chat-code-block my-3 rounded-xl overflow-x-auto text-sm shadow-sm border border-border/40"
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                )
              } catch { /* unsupported language — fall through */ }
            }

            const isInline = !className && !String(children).includes("\n")
            if (isInline) {
              return (
                <code
                  className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[0.85em] font-mono text-foreground"
                  {...props}
                >
                  {children}
                </code>
              )
            }

            return (
              <pre className={cn("my-3 overflow-x-auto rounded-xl p-4 text-sm border border-border/40", isDark ? "bg-[#0d1117]" : "bg-[#f6f8fa]")}>
                <code className="font-mono">{children}</code>
              </pre>
            )
          },
          pre({ children }: { children?: React.ReactNode }) {
            return <>{children}</>
          },
          table({ children }: { children?: React.ReactNode }) {
            return (
              <div className="my-4 overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full border-collapse text-sm">{children}</table>
              </div>
            )
          },
          th({ children }: { children?: React.ReactNode }) {
            return (
              <th className="border-b border-border bg-muted/40 px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {children}
              </th>
            )
          },
          td({ children }: { children?: React.ReactNode }) {
            return (
              <td className="border-b border-border/50 px-3 py-2 text-sm last:border-0">
                {children}
              </td>
            )
          },
          a({ href, children }: { href?: string; children?: React.ReactNode }) {
            return (
              <a
                href={href}
                className="text-info underline underline-offset-2 hover:text-info transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            )
          },
          h1({ children }: { children?: React.ReactNode }) {
            return <h1 className="mt-4 mb-2 text-base font-semibold text-foreground first:mt-0">{children}</h1>
          },
          h2({ children }: { children?: React.ReactNode }) {
            return <h2 className="mt-3 mb-1.5 text-sm font-semibold text-foreground first:mt-0">{children}</h2>
          },
          h3({ children }: { children?: React.ReactNode }) {
            return <h3 className="mt-2 mb-1 text-sm font-medium text-foreground first:mt-0">{children}</h3>
          },
          ul({ children }: { children?: React.ReactNode }) {
            return <ul className="my-2 ml-4 list-disc space-y-0.5 text-sm [&>li]:text-foreground">{children}</ul>
          },
          ol({ children }: { children?: React.ReactNode }) {
            return <ol className="my-2 ml-4 list-decimal space-y-0.5 text-sm [&>li]:text-foreground">{children}</ol>
          },
          blockquote({ children }: { children?: React.ReactNode }) {
            return <blockquote className="my-3 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground italic">{children}</blockquote>
          },
          hr() {
            return <hr className="my-4 border-border/50" />
          },
          p({ children }: { children?: React.ReactNode }) {
            return <p className="mb-2 text-sm leading-relaxed last:mb-0 text-foreground">{children}</p>
          },
          img({ alt, src }: { alt?: string; src?: string }) {
            return (
              <span className="my-2 block rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground italic">
                🖼 {alt || src || "image"}
              </span>
            )
          },
        })

        setRendered(
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(highlighter) as import("react-markdown").Components}>
            {content}
          </ReactMarkdown>,
        )
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isDark]) // re-render when content changes (streaming) or theme toggles

  if (!ready) {
    // Plain text fallback while modules load
    return (
      <span className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {content}
      </span>
    )
  }

  if (!rendered) {
    return (
      <span className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {content}
      </span>
    )
  }

  return <div className="chat-markdown min-w-0">{rendered}</div>
}

/* ─── TuiSelectPrompt ─── */

/**
 * Renders a GSD arrow-key select prompt as a native clickable list.
 *
 * Clicking an option calculates the arrow-key delta from the current
 * PTY-tracked selection, sends that many \x1b[A/\x1b[B + \r to the PTY,
 * and transitions to a static post-submission state.
 *
 * Observability:
 *   - Logs "[TuiSelectPrompt] mounted kind=select label=%s" on mount
 *   - Logs "[TuiSelectPrompt] submit delta=%d keystrokes=%j" on submit
 *   - data-testid="tui-select-prompt" on container
 *   - data-testid="tui-select-option-{i}" on each option button
 *   - data-testid="tui-prompt-submitted" on post-submission element
 */
function TuiSelectPrompt({
  prompt,
  onSubmit,
}: {
  prompt: TuiPrompt
  onSubmit: (data: string) => void
}) {
  const [localIndex, setLocalIndex] = useState(prompt.selectedIndex ?? 0)
  const [submitted, setSubmitted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    console.log("[TuiSelectPrompt] mounted kind=select label=%s", prompt.label)
    // Auto-focus the container so keyboard events are captured immediately
    containerRef.current?.focus()
  }, [prompt.label])

  const submitIndex = useCallback(
    (clickedIndex: number) => {
      const delta = clickedIndex - localIndex
      let keystrokes = ""
      if (delta > 0) {
        keystrokes = "\x1b[B".repeat(delta)
      } else if (delta < 0) {
        keystrokes = "\x1b[A".repeat(Math.abs(delta))
      }
      keystrokes += "\r"

      console.log(
        "[TuiSelectPrompt] submit delta=%d keystrokes=%j",
        delta,
        keystrokes,
      )

      setLocalIndex(clickedIndex)
      setSubmitted(true)
      onSubmit(keystrokes)
    },
    [localIndex, onSubmit],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (submitted) return
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setLocalIndex((i) => Math.max(0, i - 1))
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setLocalIndex((i) => Math.min(prompt.options.length - 1, i + 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        submitIndex(localIndex)
      }
    },
    [submitted, localIndex, prompt.options.length, submitIndex],
  )

  if (submitted) {
    const selectedLabel = prompt.options[localIndex] ?? ""
    return (
      <div
        data-testid="tui-prompt-submitted"
        className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
      >
        <Check className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-medium">{selectedLabel}</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid="tui-select-prompt"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="mt-2 rounded-xl border border-border/60 bg-background/60 p-1.5 shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-border"
      aria-label={`Select: ${prompt.label}`}
      role="listbox"
      aria-activedescendant={`tui-select-option-${localIndex}`}
    >
      {prompt.label && (
        <p className="mb-1.5 px-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {prompt.label}
        </p>
      )}
      {prompt.options.map((option, i) => {
        const isSelected = i === localIndex
        const description = prompt.descriptions?.[i]
        return (
          <button
            key={i}
            id={`tui-select-option-${i}`}
            data-testid={`tui-select-option-${i}`}
            role="option"
            aria-selected={isSelected}
            onClick={() => submitIndex(i)}
            className={cn(
              "flex w-full items-start gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
              isSelected
                ? "bg-primary/15 text-primary font-medium"
                : "text-foreground hover:bg-muted/60",
            )}
          >
            <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
              {isSelected ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block">{option}</span>
              {description && (
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {description}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ─── TuiTextPrompt ─── */

/**
 * Renders a GSD text prompt as a native labeled input field.
 *
 * Submitting sends the typed value + "\r" to the PTY (carriage return = Enter).
 * After submission shows a static "✓ Submitted" confirmation (value not echoed).
 *
 * Observability:
 *   - Logs "[TuiTextPrompt] mounted kind=text label=%s" on mount
 *   - Logs "[TuiTextPrompt] submitted label=%s" on submit
 *   - data-testid="tui-text-prompt" on container
 *   - data-testid="tui-prompt-submitted" on post-submission element
 */
function TuiTextPrompt({
  prompt,
  onSubmit,
}: {
  prompt: TuiPrompt
  onSubmit: (data: string) => void
}) {
  const [value, setValue] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    console.log("[TuiTextPrompt] mounted kind=text label=%s", prompt.label)
    inputRef.current?.focus()
  }, [prompt.label])

  const handleSubmit = useCallback(() => {
    if (submitted) return
    console.log("[TuiTextPrompt] submitted label=%s", prompt.label)
    setSubmitted(true)
    onSubmit(value + "\r")
  }, [submitted, value, prompt.label, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  if (submitted) {
    return (
      <div
        data-testid="tui-prompt-submitted"
        className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
      >
        <Check className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-medium">✓ Submitted</span>
      </div>
    )
  }

  return (
    <div
      data-testid="tui-text-prompt"
      className="mt-2 rounded-xl border border-border/60 bg-background/60 p-3 shadow-sm"
    >
      {prompt.label && (
        <p className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {prompt.label}
        </p>
      )}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer…"
          className="flex-1 h-8 text-sm"
          aria-label={prompt.label || "Text input"}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className={cn(
            "flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium transition-all",
            value.trim()
              ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm"
              : "bg-muted text-muted-foreground/40 cursor-not-allowed",
          )}
        >
          Submit
        </button>
      </div>
    </div>
  )
}

/* ─── TuiPasswordPrompt ─── */

/**
 * Renders a GSD password/API-key prompt as a native masked input field.
 *
 * Submitting sends the typed value + "\r" to the PTY.
 * The entered value is NEVER shown in the DOM, logs, or post-submission text.
 * After submission shows "{label} — entered ✓" with no value echo.
 *
 * Observability:
 *   - Logs "[TuiPasswordPrompt] mounted kind=password label=%s" on mount
 *   - Logs "[TuiPasswordPrompt] submitted label=%s" on submit (value not logged)
 *   - data-testid="tui-password-prompt" on container
 *   - data-testid="tui-prompt-submitted" on post-submission element
 */
function TuiPasswordPrompt({
  prompt,
  onSubmit,
}: {
  prompt: TuiPrompt
  onSubmit: (data: string) => void
}) {
  const [value, setValue] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    console.log("[TuiPasswordPrompt] mounted kind=password label=%s", prompt.label)
    inputRef.current?.focus()
  }, [prompt.label])

  const handleSubmit = useCallback(() => {
    if (submitted) return
    // Value intentionally not logged — redaction constraint
    console.log("[TuiPasswordPrompt] submitted label=%s", prompt.label)
    setSubmitted(true)
    onSubmit(value + "\r")
  }, [submitted, value, prompt.label, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  if (submitted) {
    const displayLabel = prompt.label || "Value"
    return (
      <div
        data-testid="tui-prompt-submitted"
        className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
      >
        <Check className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-medium">{displayLabel} — entered ✓</span>
      </div>
    )
  }

  return (
    <div
      data-testid="tui-password-prompt"
      className="mt-2 rounded-xl border border-border/60 bg-background/60 p-3 shadow-sm"
    >
      {prompt.label && (
        <p className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {prompt.label}
        </p>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            type={showPassword ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter value…"
            className="h-8 pr-9 text-sm"
            aria-label={prompt.label || "Password input"}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            tabIndex={-1}
            aria-label={showPassword ? "Hide input" : "Show input"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {showPassword ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!value}
          className={cn(
            "flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium transition-all",
            value
              ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm"
              : "bg-muted text-muted-foreground/40 cursor-not-allowed",
          )}
        >
          Submit
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground/50">
        Value is transmitted securely and not stored in chat history.
      </p>
    </div>
  )
}

/* ─── StreamingCursor ─── */

function StreamingCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-current opacity-70"
      style={{ animation: "chat-cursor 1s ease-in-out infinite" }}
    />
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function stripInitialCommandEcho(content: string, initialCommand: string): string {
  const trimmedCommand = initialCommand.trim()
  if (!trimmedCommand) return content

  const prefixPattern = new RegExp(`^${escapeRegExp(trimmedCommand)}(?:\n+)?`)
  return content.replace(prefixPattern, "").replace(/^\n+/, "")
}

function stripTerminalChrome(content: string): string {
  return content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true

      // ── Per-line chrome patterns (anchored — match entire line) ──

      // Update banners
      if (trimmed.startsWith("Update available:")) return false
      if (trimmed.startsWith("Run npm update -g gsd-pi")) return false
      // Cost/pricing lines: $N.NNN (...) — any dollar amount followed by parens
      if (/^\$\d+(?:\.\d+)?\s*\(/.test(trimmed)) return false
      // Version banners
      if (/^Get Shit Done v/i.test(trimmed)) return false
      // Block/box-drawing decoration-only lines
      if (/^[█▇▆▅▄▃▂▁\s]+$/.test(trimmed)) return false
      if (/^[█╔╗║╝╚]+/.test(trimmed)) return false
      if (/^[─━\-│┃╭╮╰╯┌┐└┘├┤┬┴┼\s]+$/.test(trimmed)) return false
      // Dashboard / status overlay chrome
      if (/^GSD Dashboard/i.test(trimmed)) return false
      if (/No unit running/i.test(trimmed)) return false
      if (/\/gsd auto to start/i.test(trimmed)) return false
      // pi status bar: scroll indicators, row/col
      if (/^[↑↓]\d+\s/.test(trimmed)) return false
      // Path-only lines (working directory display)
      if (/^~\/\S+$/.test(trimmed)) return false

      // ── Substring chrome patterns (match anywhere in line) ──
      // If a line CONTAINS startup/plugin chrome, drop the entire line.
      // These are startup banners that sometimes get concatenated with
      // user input echo or prompt text on the same terminal row.

      if (/Warning:.*Google/i.test(trimmed)) return false
      if (/No authentic\w*tion set/i.test(trimmed)) return false
      if (/Log in via Google/i.test(trimmed)) return false
      if (/GEMINI_API_KEY/i.test(trimmed)) return false
      if (/\bgoogle_search\b/i.test(trimmed)) return false
      if (/Web search v\d/i.test(trimmed)) return false
      if (/\bJina\s+✓/i.test(trimmed)) return false
      if (/\bBrave\s+✓/i.test(trimmed)) return false
      if (/\bAnswers\s+✓/i.test(trimmed)) return false
      // Web search plugin loading line (multi-part on one row)
      if (/Web search.*loaded/i.test(trimmed)) return false

      return true
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const SCREEN_SELECTED_OPTION_RE = /^\s*›\s+(\d+)\.\s+(.+)$/
const SCREEN_UNSELECTED_OPTION_RE = /^\s*(\d+)\.\s+(.+)$/
const SCREEN_HINTS_RE = /↑\/↓ to choose|quick-select|enter to confirm|scroll · g\/G top\/end · esc close/i
const SCREEN_BAR_RE = /^[─━\-]{6,}$/
const SCREEN_FRAME_CHARS_RE = /[│┃╭╮╰╯┌┐└┘├┤┬┴┼╞╡╪╫╬]/g

function createLocalMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isScreenChromeLine(trimmed: string): boolean {
  if (!trimmed) return false
  // Update / version banners
  if (trimmed.startsWith("Update available:")) return true
  if (trimmed.startsWith("Run npm update -g gsd-pi")) return true
  if (trimmed.startsWith("Get Shit Done v")) return true
  // Google auth / search plugin chrome — substring match handles wrapped lines
  if (/Warning:.*Google/i.test(trimmed)) return true
  if (/No authentic\w*tion set/i.test(trimmed)) return true
  if (/Log in via Google/i.test(trimmed)) return true
  if (/GEMINI_API_KEY/i.test(trimmed)) return true
  if (/\bgoogle_search\b/i.test(trimmed)) return true
  if (/Web search.*loaded/i.test(trimmed)) return true
  if (/Web search v\d/i.test(trimmed)) return true
  if (/\b(?:Brave|Answers|Jina)\s+✓/i.test(trimmed)) return true
  // Block/box-drawing decoration
  if (/^[█▇▆▅▄▃▂▁\s]+$/.test(trimmed)) return true
  if (/^[█╔╗║╝╚]+/.test(trimmed)) return true
  // Path-only lines
  if (/^~\//.test(trimmed)) return true
  // Cost lines
  if (/^\$\d+(?:\.\d+)?\s*\(/.test(trimmed)) return true
  // Dashboard chrome
  if (/^GSD Dashboard/i.test(trimmed)) return true
  if (/No unit running/i.test(trimmed)) return true
  if (/\/gsd auto to start/i.test(trimmed)) return true
  // pi status bar: scroll indicators
  if (/^[↑↓]\d+\s/.test(trimmed)) return true
  return false
}

function normalizeScreenLine(line: string): string {
  return line
    .replace(SCREEN_FRAME_CHARS_RE, " ")
    .replace(/[─━\-]{4,}/g, " ")
    .replace(/[█▇▆▅▄▃▂▁]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trimEnd()
}

function beautifyParsedScreenContent(content: string): string {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean)
  const output: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip pure separator/hint lines
    if (/^[─━\- ]+$/.test(line)) continue
    if (SCREEN_HINTS_RE.test(line)) continue

    // Dashboard header → chrome, skip
    if (/^GSD Dashboard/i.test(line)) continue

    // "No unit running" line → chrome, skip
    if (/No unit running/i.test(line)) continue
    if (/\/gsd auto to start/i.test(line)) continue

    // Milestone title line: M007: ...
    if (/^M\d{3}:/.test(line)) {
      output.push(`\n### ${line}`)
      continue
    }

    // Slices progress line
    if (/^Slices\b/i.test(line)) {
      const clean = line.replace(/\.\.\./g, "").trim()
      output.push(`\n**${clean}**`)
      continue
    }

    // Slice result line: ✓ S01: ...
    if (/^✓\s*S\d{2}:/.test(line)) {
      output.push(`- ${line}`)
      continue
    }

    // "All milestones complete" or similar status
    if (/all milestones complete/i.test(line)) {
      output.push(`\n${line}`)
      continue
    }

    // Checkmark status line: ✓ GSD — M007: ...
    if (/^✓\s/.test(line)) {
      output.push(`\n${line}`)
      continue
    }

    // Default: keep as-is
    output.push(line)
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

function parseStructuredTerminalScreen(screenText: string, echoedCommand?: string): { content: string; prompt?: TuiPrompt } {
  const sourceLines = screenText
    .split("\n")
    .map((line) => normalizeScreenLine(line.replace(/\r/g, "")))

  const contentLines: string[] = []
  const options: Array<{ label: string; description: string; selected: boolean }> = []

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      if (contentLines[contentLines.length - 1] !== "") {
        contentLines.push("")
      }
      continue
    }

    if (echoedCommand && trimmed === echoedCommand.trim()) continue
    if (isScreenChromeLine(trimmed)) continue
    if (SCREEN_BAR_RE.test(trimmed)) continue
    if (SCREEN_HINTS_RE.test(trimmed)) continue

    const selectedMatch = SCREEN_SELECTED_OPTION_RE.exec(line)
    const unselectedMatch = SCREEN_UNSELECTED_OPTION_RE.exec(line)
    const optionMatch = selectedMatch ?? unselectedMatch
    if (optionMatch) {
      const descriptionLines: string[] = []
      while (i + 1 < sourceLines.length) {
        const nextLine = sourceLines[i + 1]
        const nextTrimmed = nextLine.trim()
        if (!nextTrimmed) {
          i += 1
          break
        }
        if (isScreenChromeLine(nextTrimmed)) {
          i += 1
          continue
        }
        if (SCREEN_HINTS_RE.test(nextTrimmed) || SCREEN_BAR_RE.test(nextTrimmed)) {
          break
        }
        if (SCREEN_SELECTED_OPTION_RE.test(nextLine) || SCREEN_UNSELECTED_OPTION_RE.test(nextLine)) {
          break
        }
        descriptionLines.push(nextTrimmed)
        i += 1
        continue
      }

      options.push({
        label: optionMatch[2].trim(),
        description: descriptionLines.join(" "),
        selected: Boolean(selectedMatch),
      })
      continue
    }

    contentLines.push(trimmed)
  }

  const content = beautifyParsedScreenContent(
    contentLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  )

  if (options.length >= 2) {
    const selectedIndex = Math.max(0, options.findIndex((option) => option.selected))
    return {
      content,
      prompt: {
        kind: "select",
        label: "",
        options: options.map((option) => option.label),
        descriptions: options.map((option) => option.description),
        selectedIndex,
      },
    }
  }

  return { content }
}

/* ─── ChatBubble ─── */

/**
 * Renders a single ChatMessage as a styled bubble.
 *
 * - assistant: left-aligned bubble with full markdown rendering + syntax-highlighted code blocks
 * - user: right-aligned outgoing bubble with plain text
 * - system: small centered muted line (no bubble chrome)
 * - incomplete messages show an animated streaming cursor
 * - when message.prompt.kind === 'select', TuiSelectPrompt renders below content
 */
function ChatBubble({
  message,
  onSubmitPrompt,
}: {
  message: ChatMessage
  onSubmitPrompt?: (data: string) => void
}) {
  if (message.role === "system") {
    return (
      <div className="flex items-center justify-center py-1">
        <span className="text-[11px] text-muted-foreground/60 italic px-3">
          {message.content}
        </span>
      </div>
    )
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
          <span className="whitespace-pre-wrap leading-relaxed">{message.content}</span>
          {!message.complete && <StreamingCursor />}
        </div>
      </div>
    )
  }

  // assistant
  const hasSelectPrompt =
    message.prompt?.kind === "select" &&
    !message.complete &&
    onSubmitPrompt != null

  const hasTextPrompt =
    message.prompt?.kind === "text" &&
    !message.complete &&
    onSubmitPrompt != null

  const hasPasswordPrompt =
    message.prompt?.kind === "password" &&
    !message.complete &&
    onSubmitPrompt != null

  const hasAnyPrompt = hasSelectPrompt || hasTextPrompt || hasPasswordPrompt

  return (
    <div className="flex justify-start gap-3">
      <div className="mt-1 flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-card border border-border">
        <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="max-w-[82%] min-w-0 rounded-2xl rounded-tl-md border border-border/60 bg-card px-4 py-3 shadow-sm">
        <MarkdownContent content={message.content} />
        {!message.complete && !hasAnyPrompt && <StreamingCursor />}
        {hasSelectPrompt && (
          <TuiSelectPrompt
            prompt={message.prompt!}
            onSubmit={onSubmitPrompt!}
          />
        )}
        {hasTextPrompt && (
          <TuiTextPrompt
            prompt={message.prompt!}
            onSubmit={onSubmitPrompt!}
          />
        )}
        {hasPasswordPrompt && (
          <TuiPasswordPrompt
            prompt={message.prompt!}
            onSubmit={onSubmitPrompt!}
          />
        )}
      </div>
    </div>
  )
}

/* ─── ChatMessageList ─── */

/**
 * Renders ChatMessage[] as a scrollable list of ChatBubble components.
 *
 * Scroll behavior:
 *   - Auto-scrolls to bottom on new messages ONLY when the user is within 100px of bottom
 *   - If the user has scrolled up to read history, auto-scroll is suppressed
 */
function ChatMessageList({
  messages,
  onSubmitPrompt,
  fontSize,
}: {
  messages: ChatMessage[]
  onSubmitPrompt: (data: string) => void
  fontSize?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const prevMessageCountRef = useRef(messages.length)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceFromBottom < 100
  }, [])

  // Scroll to bottom on new messages (if user is near bottom)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const isNewMessage = messages.length !== prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }

    // If a new message arrives while scrolled up, still update the count but don't scroll
    void isNewMessage
  }, [messages])

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
    >
      {messages.map((msg) => (
        <ChatBubble key={msg.id} message={msg} onSubmitPrompt={onSubmitPrompt} />
      ))}
      {/* Bottom spacer for scroll anchor */}
      <div className="h-2" />
    </div>
  )
}

/* ─── ChatInputBar ─── */

/**
 * Text input bar at the bottom of ChatPane.
 *
 * - Enter: send input + "\r" and clear
 * - Shift+Enter: insert newline (multiline)
 * - Disabled when disconnected; shows "Disconnected" badge
 * - Send button visible when input has content and connected
 * - Top 3 action buttons (Discuss, Next, Auto) shown standalone
 * - Overflow menu (⋯) contains all remaining /gsd subcommands grouped by category
 * - Every action has a tooltip with description on hover
 */
function ChatInputBar({
  onSendInput,
  connected,
  onOpenAction,
}: {
  onSendInput: (data: string) => void
  connected: boolean
  onOpenAction?: (action: GSDActionDef) => void
}) {
  const [value, setValue] = useState("")
  const [overflowOpen, setOverflowOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || !connected) return
    onSendInput(value + "\r")
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, connected, onSendInput])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  const hasContent = value.trim().length > 0
  const overflowGroups = useMemo(() => groupByCategory(OVERFLOW_ACTIONS), [])

  return (
    <div className="flex-shrink-0 border-t border-border bg-card/80 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-end gap-2">
        {/* Input + send button */}
        <div
          className={cn(
            "flex flex-1 items-end gap-2 rounded-xl border bg-background transition-colors",
            connected
              ? "border-border focus-within:border-border/80 focus-within:ring-1 focus-within:ring-border/30"
              : "border-border/40 opacity-60",
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={!connected}
            rows={1}
            aria-label="Send message"
            placeholder={
              connected
                ? "Send a message… (Enter to send, Shift+Enter for newline)"
                : "Connecting…"
            }
            className="min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
            style={{ height: "40px", maxHeight: "160px", overflowY: "auto" }}
          />
          <div className="flex flex-shrink-0 items-end pb-1.5 pr-1.5 gap-1">
            {!connected && (
              <span className="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">
                Disconnected
              </span>
            )}
            <button
              onClick={handleSend}
              disabled={!connected || !hasContent}
              aria-label="Send"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
                hasContent && connected
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-95"
                  : "bg-muted text-muted-foreground/40 cursor-not-allowed",
              )}
            >
              <SendHorizonal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Top 3 action buttons with tooltips ── */}
        {onOpenAction && (
          <TooltipProvider delayDuration={300}>
            {TOP_ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <Tooltip key={action.command}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onOpenAction(action)}
                      aria-label={action.description}
                      className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {action.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <p className="font-medium">{action.label}</p>
                    <p className="text-[10px] opacity-80">{action.description}</p>
                  </TooltipContent>
                </Tooltip>
              )
            })}

            {/* ── Overflow menu ── */}
            <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      aria-label="More GSD commands"
                      className={cn(
                        "flex flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background p-2.5 text-foreground transition-colors hover:bg-accent",
                        overflowOpen && "bg-accent",
                      )}
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                {!overflowOpen && (
                  <TooltipContent side="top" sideOffset={6}>
                    More commands
                  </TooltipContent>
                )}
              </Tooltip>

              <PopoverContent
                side="top"
                align="end"
                sideOffset={8}
                className="w-64 max-h-[420px] overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-lg"
              >
                {overflowGroups.map((group, gi) => (
                  <div key={group.category}>
                    {gi > 0 && <div className="my-1.5 border-t border-border/50" />}
                    <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                      {group.label}
                    </p>
                    {group.items.map((action) => {
                      const Icon = action.icon
                      return (
                        <Tooltip key={action.command}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                setOverflowOpen(false)
                                onOpenAction(action)
                              }}
                              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
                            >
                              <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate">{action.label}</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" sideOffset={8}>
                            <p className="font-medium">{action.label}</p>
                            <p className="text-[10px] opacity-80">{action.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </TooltipProvider>
        )}
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
        GSD session · Shift+Enter for newline
      </p>
    </div>
  )
}

/* ─── Placeholder state ─── */

function PlaceholderState({
  connected,
  runningLabel,
  notice,
  primaryAction,
  onPrimaryAction,
}: {
  connected: boolean
  runningLabel?: string
  notice?: string | null
  primaryAction?: { label: string; icon: LucideIcon } | null
  onPrimaryAction?: () => void
}) {
  const showSpinner = connected && Boolean(runningLabel)

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card">
        {showSpinner ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
        ) : (
          <MessagesSquare className="h-6 w-6 text-muted-foreground/50" />
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-sm font-medium text-foreground">Chat Mode</p>
        {showSpinner ? (
          <p className="max-w-xs text-xs text-muted-foreground">
            Running {runningLabel}…
          </p>
        ) : notice ? (
          <p className="max-w-xs text-xs text-muted-foreground">{notice}</p>
        ) : !connected ? (
          <p className="max-w-xs text-xs text-muted-foreground">
            Connecting to GSD session…
          </p>
        ) : primaryAction && onPrimaryAction ? (
          <div className="mt-4">
            <button
              onClick={onPrimaryAction}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent active:scale-[0.98]"
            >
              <primaryAction.icon className="h-4 w-4 text-muted-foreground" />
              {primaryAction.label}
            </button>
          </div>
        ) : (
          <p className="max-w-xs text-xs text-muted-foreground">
            Connected — waiting for GSD output…
          </p>
        )}
      </div>
    </div>
  )
}

function StructuredTerminalActionPane({
  sessionId,
  command,
  commandArgs,
  activityLabel,
  onCompletionSignal,
}: {
  sessionId: string
  command?: string
  commandArgs?: string[]
  activityLabel: string
  onCompletionSignal?: () => void
}) {
  const terminalRef = useRef<HeadlessTerminal | null>(null)
  const hostElementRef = useRef<HTMLDivElement | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const inputQueueRef = useRef<string[]>([])
  const flushingRef = useRef(false)
  const screenUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageIdRef = useRef(createLocalMessageId())
  const commandArgsKey = (commandArgs ?? []).join("\u0000")
  const [terminalFontSize] = useTerminalFontSize()

  const [connected, setConnected] = useState(false)
  const [commandInProgress, setCommandInProgress] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const lastSnapshotRef = useRef<string>("")
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushInputQueue = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    while (inputQueueRef.current.length > 0) {
      const data = inputQueueRef.current.shift()!
      try {
        await fetch("/api/terminal/input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionId, data }),
        })
      } catch {
        inputQueueRef.current.unshift(data)
        break
      }
    }
    flushingRef.current = false
  }, [sessionId])

  const sendInput = useCallback((data: string) => {
    inputQueueRef.current.push(data)
    void flushInputQueue()
  }, [flushInputQueue])

  const updateParsedScreen = useCallback(() => {
    const terminal = terminalRef.current as HeadlessTerminal & {
      buffer?: {
        active?: {
          length: number
          getLine: (index: number) => {
            translateToString: (trimRight?: boolean) => string
            isWrapped: boolean
          } | undefined
        }
      }
      rows?: number
    } | null
    if (!terminal?.buffer?.active) return

    const active = terminal.buffer.active
    const rows = terminal.rows ?? 30
    const start = Math.max(0, active.length - rows)

    // Reconstruct logical lines by joining wrapped physical rows
    const logicalLines: string[] = []
    let currentLogical = ""
    for (let index = start; index < active.length; index++) {
      const line = active.getLine(index)
      if (!line) continue
      if (line.isWrapped) {
        currentLogical += line.translateToString(true)
      } else {
        if (currentLogical) logicalLines.push(currentLogical)
        currentLogical = line.translateToString(true)
      }
    }
    if (currentLogical) logicalLines.push(currentLogical)

    const parsed = parseStructuredTerminalScreen(logicalLines.join("\n"), commandArgs?.[0])

    // Strip terminal chrome from parsed content
    const cleanContent = stripTerminalChrome(parsed.content)

    if (cleanContent.trim().length === 0 && !parsed.prompt) return

    const snapshotKey = cleanContent + (parsed.prompt?.options.join("|") ?? "")
    if (snapshotKey === lastSnapshotRef.current) return
    lastSnapshotRef.current = snapshotKey

    setCommandInProgress(false)
    setNotice(null)

    setMessages((prev) => {
      const completed = prev.map((m) =>
        m.complete ? m : { ...m, complete: true, prompt: undefined },
      )
      const newMsg: ChatMessage = {
        id: createLocalMessageId(),
        role: "assistant",
        content: cleanContent,
        complete: !parsed.prompt,
        prompt: parsed.prompt,
        timestamp: Date.now(),
      }
      return [...completed, newMsg]
    })

    // Schedule completion signal — fire after screen stabilises for 2s
    if (parsed.prompt === undefined && onCompletionSignal) {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
      completionTimerRef.current = setTimeout(() => {
        completionTimerRef.current = null
        onCompletionSignal()
      }, 2000)
    }
  }, [commandArgs, onCompletionSignal])

  useEffect(() => {
    setCommandInProgress(true)
    setNotice(null)
    setMessages([])
    lastSnapshotRef.current = ""

    let disposed = false

    const init = async () => {
      const { Terminal } = await import("@xterm/xterm")
      if (disposed) return

      const terminal = new Terminal({
        cols: 200,
        rows: 30,
        allowProposedApi: true,
        convertEol: false,
        scrollback: 10000,
      })
      terminalRef.current = terminal

      const host = document.createElement("div")
      host.style.position = "fixed"
      host.style.left = "-10000px"
      host.style.top = "0"
      host.style.width = "1px"
      host.style.height = "1px"
      host.style.overflow = "hidden"
      document.body.appendChild(host)
      hostElementRef.current = host
      terminal.open(host)

      const streamUrl = new URL("/api/terminal/stream", window.location.origin)
      streamUrl.searchParams.set("id", sessionId)
      if (command) streamUrl.searchParams.set("command", command)
      for (const arg of commandArgs ?? []) {
        streamUrl.searchParams.append("arg", arg)
      }

      const es = new EventSource(streamUrl.toString())
      eventSourceRef.current = es

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; data?: string }
          if (msg.type === "connected") {
            setConnected(true)
          } else if (msg.type === "output" && msg.data) {
            terminal.write(msg.data, () => {
              if (screenUpdateTimerRef.current) {
                clearTimeout(screenUpdateTimerRef.current)
              }
              screenUpdateTimerRef.current = setTimeout(() => {
                updateParsedScreen()
                screenUpdateTimerRef.current = null
              }, 120)
            })
          }
        } catch {
          // ignore malformed event payloads
        }
      }

      es.onerror = () => {
        setConnected(false)
      }
    }

    void init()

    return () => {
      disposed = true
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      if (screenUpdateTimerRef.current) {
        clearTimeout(screenUpdateTimerRef.current)
        screenUpdateTimerRef.current = null
      }
      terminalRef.current?.dispose()
      terminalRef.current = null
      hostElementRef.current?.remove()
      hostElementRef.current = null
    }
  }, [sessionId, command, commandArgsKey, updateParsedScreen])

  useEffect(() => {
    if (commandInProgress || messages.length > 0) return
    const timeout = setTimeout(() => {
      if (messages.length === 0) {
        setNotice(
          activityLabel ? `${activityLabel} completed with no chat-visible output.` : "Command completed with no chat-visible output.",
        )
      }
    }, 1500)
    return () => clearTimeout(timeout)
  }, [activityLabel, commandInProgress, messages.length])

  if (messages.length === 0) {
    return (
      <PlaceholderState
        connected={connected}
        runningLabel={commandInProgress ? activityLabel : undefined}
        notice={!commandInProgress ? notice : null}
      />
    )
  }

  return <ChatMessageList messages={messages} onSubmitPrompt={sendInput} fontSize={terminalFontSize} />
}

/* ─── Chat Pane ─── */

interface ChatPaneProps {
  sessionId: string
  command?: string
  commandArgs?: string[]
  className?: string
  initialCommand?: string
  onCompletionSignal?: () => void
  onOpenAction?: (action: GSDActionDef) => void
  activityLabel?: string
  suppressTerminalChrome?: boolean
  suppressInitialEcho?: boolean
}

/* ─── ToolExecutionBlock ─── */

/**
 * Renders a completed tool execution as a collapsible block.
 * Edit tool shows a syntax-highlighted unified diff.
 * Write tool shows the file path and a preview.
 * Bash tool shows the command and output.
 * Other tools show a compact summary.
 */
function ToolExecutionBlock({ tool }: { tool: CompletedToolExecution }) {
  const [expanded, setExpanded] = useState(false)

  const path = typeof tool.args?.path === "string" ? tool.args.path : typeof tool.args?.file_path === "string" ? tool.args.file_path : null
  const shortPath = path ? (path.startsWith(process.env.HOME ?? "/Users") ? "~" + path.slice((process.env.HOME ?? "").length) : path) : null
  const isError = tool.result?.isError ?? false
  const diff = tool.result?.details?.diff as string | undefined

  // Choose icon and label
  const icon = tool.name === "edit" ? <FileEdit className="h-3.5 w-3.5" />
    : tool.name === "write" ? <FilePlus className="h-3.5 w-3.5" />
    : <Terminal className="h-3.5 w-3.5" />

  const label = tool.name === "edit" ? "Edit"
    : tool.name === "write" ? "Write"
    : tool.name === "bash" ? "$"
    : tool.name

  // For bash, show the command
  const bashCommand = tool.name === "bash" && typeof tool.args?.command === "string" ? tool.args.command : null

  // Result text (for bash output, read result, etc.)
  const resultText = tool.result?.content
    ?.filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n") ?? ""

  return (
    <div className="flex justify-start gap-3">
      <div className="w-7 flex-shrink-0" />
      <div className="max-w-[82%] min-w-0 w-full">
        <button
          onClick={() => setExpanded((e) => !e)}
          className={cn(
            "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
            isError
              ? "border-destructive/30 bg-destructive/5 hover:bg-destructive/10"
              : "border-border/40 bg-muted/20 hover:bg-muted/30",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className={cn("flex-shrink-0", isError ? "text-destructive" : "text-muted-foreground/60")}>
              {icon}
            </span>
            <span className={cn("font-mono font-medium", isError ? "text-destructive" : "text-muted-foreground")}>
              {label}
            </span>
            {shortPath && (
              <span className="truncate font-mono text-info/80">{shortPath}</span>
            )}
            {bashCommand && !shortPath && (
              <span className="truncate font-mono text-muted-foreground/70">{bashCommand.length > 60 ? bashCommand.slice(0, 60) + "…" : bashCommand}</span>
            )}
            <span className="ml-auto flex-shrink-0 text-muted-foreground/40">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
          </div>

          {/* Expanded content */}
          {expanded && diff && (
            <div className="mt-2 overflow-x-auto rounded-md border border-border/30 bg-background/80 p-2 font-mono text-[11px] leading-relaxed">
              {diff.split("\n").map((line, i) => {
                const isAdd = line.startsWith("+")
                const isRemove = line.startsWith("-")
                const isContext = line.startsWith(" ")
                return (
                  <div
                    key={i}
                    className={cn(
                      "whitespace-pre",
                      isAdd && "bg-success/10 text-success",
                      isRemove && "bg-destructive/10 text-destructive",
                      isContext && "text-muted-foreground/60",
                      !isAdd && !isRemove && !isContext && "text-muted-foreground/40",
                    )}
                  >
                    {line}
                  </div>
                )
              })}
            </div>
          )}

          {/* Expanded: bash output or other result */}
          {expanded && !diff && resultText && (
            <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md border border-border/30 bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground/70 whitespace-pre-wrap">
              {resultText.length > 2000 ? resultText.slice(0, 2000) + "\n…" : resultText}
            </div>
          )}

          {/* Error message */}
          {expanded && isError && resultText && (
            <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[11px] text-destructive whitespace-pre-wrap">
              {resultText}
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

/* ─── ThinkingIndicator ─── */

/**
 * Live thinking indicator — shows a spinner + the last 2 lines of the
 * LLM's internal reasoning, truncated and styled as a muted aside.
 * Expands on click to show the full thinking text.
 */
function ThinkingIndicator({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const hasContent = content.trim().length > 0

  // Extract the last 2 non-empty lines for the preview
  const lines = content.split("\n").filter((l) => l.trim())
  const previewLines = lines.slice(-2)
  const hasMore = lines.length > 2

  return (
    <div className="flex justify-start gap-3">
      <div className="mt-1 flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-card border border-border">
        {isStreaming ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="max-w-[82%] min-w-0">
        <button
          onClick={() => hasContent && setExpanded((e) => !e)}
          className={cn(
            "w-full rounded-xl border border-border/40 bg-muted/20 px-3.5 py-2 text-left transition-colors",
            hasContent && "hover:bg-muted/30 cursor-pointer",
            !hasContent && "cursor-default",
          )}
        >
          {/* Header row */}
          <div className="flex items-center gap-2">
            {isStreaming && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
              </span>
            )}
            <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              {isStreaming ? "Thinking…" : "Thought process"}
            </span>
            {hasContent && hasMore && !expanded && (
              <span className="text-[10px] text-muted-foreground/40">
                ▶ {lines.length} lines
              </span>
            )}
            {hasContent && expanded && (
              <span className="text-[10px] text-muted-foreground/40">▼</span>
            )}
          </div>

          {/* Preview: last 2 lines */}
          {hasContent && !expanded && (
            <div className="mt-1 space-y-0.5">
              {previewLines.map((line, i) => (
                <p key={i} className="text-xs leading-relaxed text-muted-foreground/50 italic truncate">
                  {line}
                </p>
              ))}
            </div>
          )}

          {/* Expanded: full thinking text */}
          {hasContent && expanded && (
            <div className="mt-1 max-h-[200px] overflow-y-auto text-xs leading-relaxed text-muted-foreground/50 italic whitespace-pre-wrap">
              {content}
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * ChatPane — bridge event-driven chat rendering.
 *
 * Consumes structured agent events from the workspace store:
 * - streamingAssistantText: live text deltas from the LLM
 * - streamingThinkingText: live thinking/reasoning deltas
 * - liveTranscript: completed text blocks from previous turns
 * - activeToolExecution: currently running tool call
 *
 * User messages are tracked locally and sent via submitInput().
 * No terminal buffer parsing — all data comes from the bridge event stream.
 *
 * Observability:
 *   - data-testid="chat-pane-store-driven" on the root element
 *   - ChatInputBar shows "Disconnected" badge when bridge is not connected
 */
export function ChatPane({ className, onOpenAction }: ChatPaneProps) {
  const state = useGSDWorkspaceState()
  const { submitInput, sendCommand } = useGSDWorkspaceActions()
  const [userMessages, setUserMessages] = useState<ChatMessage[]>([])
  const [terminalFontSize] = useTerminalFontSize()

  const connected = state.connectionState === "connected"
  const isStreaming = state.boot?.bridge.sessionState?.isStreaming ?? false
  const bridge = state.boot?.bridge ?? null

  // ── Derive smart CTA for the placeholder state ──
  const workflowAction = deriveWorkflowAction({
    phase: state.boot?.workspace?.active.phase ?? "pre-planning",
    autoActive: state.boot?.auto?.active ?? false,
    autoPaused: state.boot?.auto?.paused ?? false,
    onboardingLocked: state.boot?.onboarding.locked ?? false,
    commandInFlight: state.commandInFlight,
    bootStatus: state.bootStatus,
    hasMilestones: (state.boot?.workspace?.milestones.length ?? 0) > 0,
    projectDetectionKind: state.boot?.projectDetection?.kind ?? null,
  })

  const placeholderCTA = useMemo((): { label: string; icon: LucideIcon } | null => {
    if (!workflowAction.primary || workflowAction.disabled) return null
    const phase = state.boot?.workspace?.active.phase ?? "pre-planning"
    const autoActive = state.boot?.auto?.active ?? false
    const autoPaused = state.boot?.auto?.paused ?? false

    if (autoActive && !autoPaused) {
      return { label: "Stop Auto", icon: Square }
    }
    if (autoPaused) {
      return { label: "Resume Auto", icon: Play }
    }
    if (phase === "complete") {
      return { label: "New Milestone", icon: Milestone }
    }
    if (phase === "planning") {
      return { label: "Plan", icon: Play }
    }
    if (phase === "executing" || phase === "summarizing") {
      return { label: "Start Auto", icon: Zap }
    }
    if (phase === "pre-planning") {
      return { label: "Initialize Project", icon: Play }
    }
    return { label: "Continue", icon: Play }
  }, [workflowAction, state.boot?.workspace?.active.phase, state.boot?.auto?.active, state.boot?.auto?.paused])

  const handlePlaceholderCTA = useCallback(() => {
    if (!workflowAction.primary) return
    if (workflowAction.isNewMilestone) {
      // "New Milestone" triggers /gsd auto behind the scenes to start the guided flow
      void sendCommand(buildPromptCommand("/gsd auto", bridge))
    } else {
      void sendCommand(buildPromptCommand(workflowAction.primary.command, bridge))
    }
  }, [workflowAction, sendCommand, bridge])

  /** Send user text — adds a user bubble and dispatches via the store */
  const handleUserInput = useCallback((data: string) => {
    const text = data.replace(/\r$/, "").trim()
    if (!text) return

    const userMsg: ChatMessage = {
      id: createLocalMessageId(),
      role: "user",
      content: text,
      complete: true,
      timestamp: Date.now(),
    }
    setUserMessages((prev) => [...prev, userMsg])
    void submitInput(text)
  }, [submitInput])

  // Build message list from store state
  const messages = useMemo((): ChatMessage[] => {
    const allMessages: ChatMessage[] = []
    const transcriptBlocks = state.liveTranscript
    const userMsgs = userMessages

    // Interleave: turns alternate user → assistant.
    // Each transcript block corresponds to one assistant turn.
    // User messages are paired with their subsequent assistant response.
    for (let i = 0; i < Math.max(userMsgs.length, transcriptBlocks.length); i++) {
      // User message for this turn
      if (i < userMsgs.length) {
        allMessages.push(userMsgs[i])
      }
      // Assistant response for this turn
      if (i < transcriptBlocks.length) {
        const block = transcriptBlocks[i]
        if (block.trim()) {
          allMessages.push({
            id: `transcript-${i}`,
            role: "assistant",
            content: block,
            complete: true,
            timestamp: Date.now() - (transcriptBlocks.length - i) * 1000,
          })
        }
      }
    }

    // Add currently streaming content
    const hasStreaming = state.streamingAssistantText.length > 0
    const hasThinking = state.streamingThinkingText.length > 0

    if (hasStreaming || hasThinking) {
      const streamingContent = state.streamingAssistantText
      allMessages.push({
        id: "streaming-current",
        role: "assistant",
        content: streamingContent || "",
        complete: false,
        timestamp: Date.now(),
      })
    }

    return allMessages
  }, [state.liveTranscript, state.streamingAssistantText, state.streamingThinkingText, userMessages])

  // Prompt submit handler for TUI prompts (select/text/password)
  const handlePromptSubmit = useCallback((data: string) => {
    void submitInput(data.replace(/\r$/, ""))
  }, [submitInput])

  const showPlaceholder = messages.length === 0 && !isStreaming

  return (
    <div
      data-testid="chat-pane-store-driven"
      className={cn("flex flex-col overflow-hidden", className)}
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        {showPlaceholder ? (
          <PlaceholderState
            connected={connected}
            runningLabel={isStreaming ? "responding" : undefined}
            primaryAction={placeholderCTA}
            onPrimaryAction={handlePlaceholderCTA}
          />
        ) : (
          <div
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
            style={terminalFontSize !== 13 ? { fontSize: `${terminalFontSize}px` } : undefined}
          >
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} onSubmitPrompt={handlePromptSubmit} />
            ))}

            {/* Completed tool executions for this turn */}
            {state.completedToolExecutions.map((tool) => (
              <ToolExecutionBlock key={tool.id} tool={tool} />
            ))}

            {/* Active tool execution indicator (inline, not header bar) */}
            {state.activeToolExecution && (
              <div className="flex justify-start gap-3">
                <div className="w-7 flex-shrink-0" />
                <div className="max-w-[82%] min-w-0">
                  <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
                    <span className="font-mono text-xs text-muted-foreground">
                      {state.activeToolExecution.name}
                    </span>
                    {state.activeToolExecution.args?.path && (
                      <span className="font-mono text-xs text-info/80 truncate">
                        {String(state.activeToolExecution.args.path)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Thinking / streaming indicator */}
            {isStreaming && !state.activeToolExecution && (
              <ThinkingIndicator
                content={state.streamingThinkingText}
                isStreaming={true}
              />
            )}

            <div className="h-2" />
          </div>
        )}
      </div>

      <ChatInputBar
        onSendInput={handleUserInput}
        connected={connected}
        onOpenAction={onOpenAction}
      />
    </div>
  )
}
