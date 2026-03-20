"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { buildProjectAbsoluteUrl, buildProjectPath } from "@/lib/project-url"
import "@xterm/xterm/css/xterm.css"

type XTerminal = import("@xterm/xterm").Terminal
type XFitAddon = import("@xterm/addon-fit").FitAddon

interface MainSessionTerminalProps {
  className?: string
  fontSize?: number
  projectCwd?: string
}

const MIN_INITIAL_ATTACH_WIDTH = 180
const MIN_INITIAL_ATTACH_HEIGHT = 120
const MIN_INITIAL_ATTACH_COLS = 20
const MIN_INITIAL_ATTACH_ROWS = 8

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
    fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
    lineHeight: 1.35,
    letterSpacing: 0,
    theme: getXtermTheme(isDark),
    allowProposedApi: true,
    scrollback: 10000,
    convertEol: false,
  }
}

function getAttachableTerminalSize(container: HTMLDivElement | null, terminal: XTerminal | null): { cols: number; rows: number } | null {
  if (!container || !terminal) return null

  const rect = container.getBoundingClientRect()
  if (rect.width < MIN_INITIAL_ATTACH_WIDTH || rect.height < MIN_INITIAL_ATTACH_HEIGHT) {
    return null
  }

  if (terminal.cols < MIN_INITIAL_ATTACH_COLS || terminal.rows < MIN_INITIAL_ATTACH_ROWS) {
    return null
  }

  return { cols: terminal.cols, rows: terminal.rows }
}

async function settleTerminalLayout(
  container: HTMLDivElement | null,
  terminal: XTerminal | null,
  fitAddon: XFitAddon | null,
  isDisposed: () => boolean,
): Promise<{ cols: number; rows: number } | null> {
  if (typeof document !== "undefined" && "fonts" in document) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ])
    } catch {
      // Ignore font loading failures and fall through to repeated fit attempts.
    }
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    if (isDisposed()) return null

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })

    if (isDisposed()) return null

    try {
      fitAddon?.fit()
    } catch {
      // Hidden or detached.
    }

    const size = getAttachableTerminalSize(container, terminal)
    if (size) {
      return size
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return getAttachableTerminalSize(container, terminal)
}

export function MainSessionTerminal({ className, fontSize, projectCwd }: MainSessionTerminalProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== "light"
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerminal | null>(null)
  const fitAddonRef = useRef<XFitAddon | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputQueueRef = useRef<string[]>([])
  const flushingRef = useRef(false)
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "error">("connecting")
  const [hasOutput, setHasOutput] = useState(false)

  const flushInputQueue = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    while (inputQueueRef.current.length > 0) {
      const data = inputQueueRef.current.shift()!
      try {
        await fetch(buildProjectPath("/api/bridge-terminal/input", projectCwd), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        })
      } catch {
        inputQueueRef.current.unshift(data)
        break
      }
    }
    flushingRef.current = false
  }, [projectCwd])

  const sendInput = useCallback((data: string) => {
    inputQueueRef.current.push(data)
    void flushInputQueue()
  }, [flushInputQueue])

  const sendResize = useCallback((cols: number, rows: number) => {
    if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current)
    resizeTimeoutRef.current = setTimeout(() => {
      void fetch(buildProjectPath("/api/bridge-terminal/resize", projectCwd), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cols, rows }),
      })
    }, 75)
  }, [projectCwd])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getXtermTheme(isDark)
    }
  }, [isDark])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.fontSize = fontSize ?? 13
    try {
      fitAddonRef.current?.fit()
      sendResize(termRef.current.cols, termRef.current.rows)
    } catch {
      // Hidden or not mounted yet.
    }
  }, [fontSize, sendResize])

  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let terminal: XTerminal | null = null
    let fitAddon: XFitAddon | null = null

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

      const initialSize = await settleTerminalLayout(containerRef.current, terminal, fitAddon, () => disposed)
      if (disposed) return

      terminal.onData((data) => {
        sendInput(data)
      })
      terminal.onBinary((data) => {
        sendInput(data)
      })

      const connectStream = (preferredSize: { cols: number; rows: number } | null) => {
        const streamUrl = buildProjectAbsoluteUrl(
          "/api/bridge-terminal/stream",
          window.location.origin,
          projectCwd,
        )
        if (preferredSize) {
          streamUrl.searchParams.set("cols", String(preferredSize.cols))
          streamUrl.searchParams.set("rows", String(preferredSize.rows))
        }

        const es = new EventSource(streamUrl.toString())
        eventSourceRef.current = es
        setConnectionState((current) => (current === "connected" ? current : "connecting"))

        es.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as { type: string; data?: string }
            if (message.type === "connected") {
              setConnectionState("connected")
              void settleTerminalLayout(containerRef.current, termRef.current, fitAddonRef.current, () => disposed).then((size) => {
                if (!size) return
                sendResize(size.cols, size.rows)
              })
              return
            }

            if (message.type === "output" && typeof message.data === "string") {
              termRef.current?.write(message.data)
              setHasOutput(true)
            }
          } catch {
            setConnectionState("error")
          }
        }

        es.onerror = () => {
          setConnectionState("error")
        }
      }

      connectStream(initialSize)

      resizeObserver = new ResizeObserver(() => {
        if (disposed) return
        try {
          fitAddon?.fit()
          if (terminal) {
            sendResize(terminal.cols, terminal.rows)
          }
        } catch {
          // Hidden or detached.
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
  }, [fontSize, isDark, projectCwd, sendInput, sendResize])

  const handleClick = useCallback(() => {
    termRef.current?.focus()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => termRef.current?.focus(), 80)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className={cn("relative h-full w-full bg-terminal", className)} onClick={handleClick} data-testid="main-session-native-terminal">
      {!hasOutput && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-terminal">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {connectionState === "error" ? "Reconnecting main session terminal…" : "Connecting to main session…"}
          </span>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" style={{ padding: "8px 4px 4px 8px" }} />
    </div>
  )
}
