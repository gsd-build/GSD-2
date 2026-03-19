import pkg from "../../../package.json"

const GSD_LOGO_LINES = [
  "   ██████╗ ███████╗██████╗ ",
  "  ██╔════╝ ██╔════╝██╔══██╗",
  "  ██║  ███╗███████╗██║  ██║",
  "  ██║   ██║╚════██║██║  ██║",
  "  ╚██████╔╝███████║██████╔╝",
  "   ╚═════╝ ╚══════╝╚═════╝ ",
] as const

const TERMINAL_FONT_FAMILY = "'SF Mono', 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace"
const GSD_VERSION = typeof pkg.version === "string" ? pkg.version : "0.0.0"

interface TerminalTuiHeaderProps {
  fontSize?: number
}

/**
 * Visual parity shim for the bridge-backed main session terminal.
 *
 * The main session TUI is the authoritative bridge session, but its branded
 * header does not reliably replay in the browser attach path yet. Keep the
 * runtime untouched and mirror the same chrome in the web pane so both sides of
 * Power User Mode present the same header treatment.
 */
export function TerminalTuiHeader({ fontSize = 13 }: TerminalTuiHeaderProps) {
  return (
    <div className="shrink-0 border-b border-border/40 bg-terminal px-4 pt-3 pb-2 text-terminal-foreground select-none">
      <pre
        aria-hidden="true"
        className="overflow-hidden whitespace-pre text-[#0b6770] dark:text-[#b9ddd9]"
        style={{
          fontFamily: TERMINAL_FONT_FAMILY,
          fontSize,
          lineHeight: 1.08,
        }}
      >
        {GSD_LOGO_LINES.join("\n")}
      </pre>
      <div
        className="mt-3 flex items-baseline gap-2 text-terminal-foreground"
        style={{
          fontFamily: TERMINAL_FONT_FAMILY,
          lineHeight: 1.1,
        }}
      >
        <span className="font-semibold tracking-tight" style={{ fontSize: fontSize + 2 }}>
          Get Shit Done
        </span>
        <span className="text-muted-foreground" style={{ fontSize: Math.max(12, fontSize) }}>
          v{GSD_VERSION}
        </span>
      </div>
    </div>
  )
}
