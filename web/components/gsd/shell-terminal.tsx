"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { useTheme } from "next-themes"
import { Plus, X, TerminalSquare, Trash2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import "@xterm/xterm/css/xterm.css"

type XTerminal = import("@xterm/xterm").Terminal
type XFitAddon = import("@xterm/addon-fit").FitAddon

// ─── Types ────────────────────────────────────────────────────────────────────

interface TerminalTab {
  id: string
  label: string
  connected: boolean
}

interface ShellTerminalProps {
  className?: string
  command?: string
  commandArgs?: string[]
  sessionPrefix?: string
  hideSidebar?: boolean
  fontSize?: number
}

// ─── xterm themes ─────────────────────────────────────────────────────────────

const XTERM_DARK_THEME = {
  background: "#0a0a0a",
  foreground: "#e4e4e7",
  cursor: "#e4e4e7",
  cursorAccent: "#0a0a0a",
  selectionBackground: "#27272a",
  selectionForeground: "#e4e4e7",
  black: "#18181b",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#e4e4e7",
  brightBlack: "#52525b",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#fafafa",
} as const

const XTERM_LIGHT_THEME = {
  background: "#f5f5f5",
  foreground: "#1a1a1a",
  cursor: "#1a1a1a",
  cursorAccent: "#f5f5f5",
  selectionBackground: "#d4d4d8",
  selectionForeground: "#1a1a1a",
  black: "#1a1a1a",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#e4e4e7",
  brightBlack: "#71717a",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#fafafa",
} as const

function getXtermTheme(isDark: boolean) {
  return isDark ? XTERM_DARK_THEME : XTERM_LIGHT_THEME
}

function getXtermOptions(isDark: boolean, fontSize?: number) {
  return {
    cursorBlink: true,
    cursorStyle: "bar" as const,
    fontSize: fontSize ?? 13,
    fontFamily:
      "'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
    lineHeight: 1.35,
    letterSpacing: 0,
    theme: getXtermTheme(isDark),
    allowProposedApi: true,
    scrollback: 10000,
    convertEol: false,
  }
}

function deriveCommandLabel(command?: string): string {
  if (!command?.trim()) return "zsh"
  const token = command.trim().split(/\s+/)[0] || command
  const normalized = token.replace(/\\/g, "/")
  const parts = normalized.split("/")
  return parts[parts.length - 1] || token
}

// ─── Single terminal instance (internal) ──────────────────────────────────────

interface TerminalInstanceProps {
  sessionId: string
  visible: boolean
  command?: string
  commandArgs?: string[]
  isDark: boolean
  fontSize?: number
  onConnectionChange: (connected: boolean) => void
}

function TerminalInstance({
  sessionId,
  visible,
  command,
  commandArgs,
  isDark,
  fontSize,
  onConnectionChange,
}: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<XFitAddon | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const inputQueueRef = useRef<string[]>([])
  const flushingRef = useRef(false)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onConnectionChangeRef = useRef(onConnectionChange)
  const commandArgsKey = (commandArgs ?? []).join("\u0000")
  const [hasOutput, setHasOutput] = useState(false)

  const sendResize = useCallback(
    (cols: number, rows: number) => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
      resizeTimeoutRef.current = setTimeout(() => {
        void fetch("/api/terminal/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionId, cols, rows }),
        })
      }, 100)
    },
    [sessionId],
  )

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

  const sendInput = useCallback(
    (data: string) => {
      inputQueueRef.current.push(data)
      void flushInputQueue()
    },
    [flushInputQueue],
  )

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange
  }, [onConnectionChange])

  // Update xterm theme when isDark changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getXtermTheme(isDark)
    }
  }, [isDark])

  // Update xterm font size when fontSize changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize ?? 13
      try {
        fitAddonRef.current?.fit()
        if (termRef.current) {
          sendResize(termRef.current.cols, termRef.current.rows)
        }
      } catch {
        /* not visible yet */
      }
    }
  }, [fontSize, sendResize])

  // Re-fit when visibility changes
  useEffect(() => {
    if (visible && fitAddonRef.current && termRef.current) {
      // Small delay to let the DOM settle
      const t = setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
          if (termRef.current) {
            sendResize(termRef.current.cols, termRef.current.rows)
          }
        } catch {
          /* not visible yet */
        }
      }, 50)
      return () => clearTimeout(t)
    }
  }, [visible, sendResize])

  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false
    let terminal: XTerminal | null = null
    let fitAddon: XFitAddon | null = null
    let resizeObserver: ResizeObserver | null = null

    const init = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ])

      if (disposed) return

      terminal = new Terminal(getXtermOptions(isDark, fontSize))
      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(containerRef.current!)

      termRef.current = terminal
      fitAddonRef.current = fitAddon

      try {
        fitAddon.fit()
      } catch {
        /* container might not be visible yet */
      }

      terminal.onData((data) => sendInput(data))
      terminal.onBinary((data) => sendInput(data))

      // SSE stream
      const streamUrl = new URL(`/api/terminal/stream`, window.location.origin)
      streamUrl.searchParams.set("id", sessionId)
      if (command) streamUrl.searchParams.set("command", command)
      for (const arg of commandArgs ?? []) {
        streamUrl.searchParams.append("arg", arg)
      }
      const es = new EventSource(streamUrl.toString())
      eventSourceRef.current = es

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type: string
            data?: string
          }
          if (msg.type === "connected") {
            onConnectionChangeRef.current(true)
            if (terminal) sendResize(terminal.cols, terminal.rows)
          } else if (msg.type === "output" && msg.data) {
            terminal?.write(msg.data)
            setHasOutput(true)
          }
        } catch {
          /* malformed */
        }
      }

      es.onerror = () => onConnectionChangeRef.current(false)

      // Resize observer
      resizeObserver = new ResizeObserver(() => {
        if (disposed) return
        try {
          fitAddon?.fit()
          if (terminal) sendResize(terminal.cols, terminal.rows)
        } catch {
          /* not visible */
        }
      })
      resizeObserver.observe(containerRef.current!)
    }

    void init()

    return () => {
      disposed = true
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      resizeObserver?.disconnect()
      terminal?.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId, command, commandArgsKey, sendInput, sendResize])

  // Focus on click
  const handleClick = useCallback(() => {
    termRef.current?.focus()
  }, [])

  // Auto-focus when this tab becomes visible
  useEffect(() => {
    if (visible) {
      // Small delay to let layout settle
      const t = setTimeout(() => termRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [visible])

  return (
    <div
      className={cn("relative h-full w-full bg-terminal", !visible && "hidden")}
      onClick={handleClick}
    >
      {/* Loading overlay — visible until first output arrives */}
      {!hasOutput && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-terminal">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {command ? "Starting GSD…" : "Connecting…"}
          </span>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ padding: "8px 4px 4px 8px" }}
      />
    </div>
  )
}

// ─── Multi-instance terminal panel ────────────────────────────────────────────

export function ShellTerminal({ className, command, commandArgs, sessionPrefix, hideSidebar = false, fontSize }: ShellTerminalProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== "light"
  const defaultId = sessionPrefix ?? (command ? "gsd-default" : "default")
  const commandLabel = deriveCommandLabel(command)
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: defaultId, label: commandLabel, connected: false },
  ])
  const [activeTabId, setActiveTabId] = useState(defaultId)

  const createTab = useCallback(async () => {
    try {
      const res = await fetch("/api/terminal/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command ? { command } : {}),
      })
      const data = (await res.json()) as { id: string }
      const index = tabs.length + 1
      const newTab: TerminalTab = {
        id: data.id,
        label: commandLabel,
        connected: false,
      }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(data.id)
    } catch {
      /* network error */
    }
  }, [tabs.length, command])

  const closeTab = useCallback(
    (id: string) => {
      // Don't close the last tab
      if (tabs.length <= 1) return
      void fetch(`/api/terminal/sessions?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      setTabs((prev) => prev.filter((t) => t.id !== id))
      if (activeTabId === id) {
        setActiveTabId((prev) => {
          const remaining = tabs.filter((t) => t.id !== id)
          return remaining[remaining.length - 1]?.id ?? "default"
        })
      }
    },
    [tabs, activeTabId],
  )

  const updateConnection = useCallback(
    (id: string, connected: boolean) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, connected } : t)),
      )
    },
    [],
  )

  return (
    <div className={cn("flex bg-terminal", className)}>
      {/* Terminal area */}
      <div className="relative flex-1 min-w-0">
        {tabs.map((tab) => (
          <TerminalInstance
            key={tab.id}
            sessionId={tab.id}
            visible={tab.id === activeTabId}
            command={command}
            commandArgs={tab.id === defaultId ? commandArgs : undefined}
            isDark={isDark}
            fontSize={fontSize}
            onConnectionChange={(c) => updateConnection(tab.id, c)}
          />
        ))}
      </div>

      {!hideSidebar && (
        <div className="flex w-[34px] flex-shrink-0 flex-col border-l border-border/40 bg-terminal">
          {/* New terminal button */}
          <button
            onClick={createTab}
            className="flex h-[30px] w-full items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="New terminal"
          >
            <Plus className="h-3 w-3" />
          </button>

          <div className="h-px bg-border/40" />

          {/* Tab list */}
          <div className="flex-1 overflow-y-auto">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={cn(
                  "group relative flex h-[30px] w-full items-center justify-center transition-colors",
                  tab.id === activeTabId
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                )}
                title={`${tab.label} ${index + 1}`}
              >
                {/* Active indicator bar */}
                {tab.id === activeTabId && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-muted-foreground" />
                )}

                <div className="relative flex items-center">
                  <TerminalSquare className="h-3 w-3" />
                  {/* Connection dot */}
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-terminal",
                      tab.connected ? "bg-success" : "bg-muted-foreground/40",
                    )}
                  />
                </div>

                {/* Close button — shows on hover as small badge in corner */}
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                    className="absolute -right-0.5 -top-0.5 z-10 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-muted-foreground hover:bg-destructive/20 hover:text-destructive group-hover:flex"
                    title="Kill terminal"
                  >
                    <X className="h-2 w-2" />
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
