"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Milestone, Send, Sparkles, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  useGSDWorkspaceState,
  useGSDWorkspaceActions,
  buildPromptCommand,
} from "@/lib/gsd-workspace-store"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
}

interface NewMilestoneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NewMilestoneDialog({ open, onOpenChange }: NewMilestoneDialogProps) {
  const state = useGSDWorkspaceState()
  const { submitInput, sendCommand } = useGSDWorkspaceActions()
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasStarted, setHasStarted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevStreamingRef = useRef("")
  const prevTranscriptLenRef = useRef(0)
  const prevTerminalLenRef = useRef(0)

  const bridge = state.boot?.bridge ?? null
  const isStreaming = Boolean(state.boot?.bridge.sessionState?.isStreaming)
  const isInputDisabled =
    state.bootStatus !== "ready" ||
    state.commandInFlight === "refresh" ||
    Boolean(state.boot?.onboarding.locked)

  // Capture baseline terminal state when dialog opens
  useEffect(() => {
    if (open) {
      prevTerminalLenRef.current = state.terminalLines.length
      prevTranscriptLenRef.current = state.liveTranscript.length
      prevStreamingRef.current = ""
      setMessages([{
        id: "system-0",
        role: "system",
        content: "All milestones complete. Let's plan what to build next.",
        timestamp: Date.now(),
      }])
      setHasStarted(false)
      setInput("")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Watch for new terminal lines and streaming text, convert to chat messages
  useEffect(() => {
    if (!open || !hasStarted) return

    const newMessages: ChatMessage[] = []

    // Check for new completed transcript blocks (assistant responses)
    if (state.liveTranscript.length > prevTranscriptLenRef.current) {
      const newBlocks = state.liveTranscript.slice(prevTranscriptLenRef.current)
      for (const block of newBlocks) {
        if (block.trim()) {
          newMessages.push({
            id: `transcript-${Date.now()}-${Math.random()}`,
            role: "assistant",
            content: block.trim(),
            timestamp: Date.now(),
          })
        }
      }
      prevTranscriptLenRef.current = state.liveTranscript.length
    }

    // Check for new terminal lines (system messages, errors, etc.)
    if (state.terminalLines.length > prevTerminalLenRef.current) {
      const newLines = state.terminalLines.slice(prevTerminalLenRef.current)
      for (const line of newLines) {
        if (line.type === "input") continue // skip echoed inputs
        if (line.type === "system" && line.content.trim()) {
          newMessages.push({
            id: `system-${line.id}`,
            role: "system",
            content: line.content.trim(),
            timestamp: Date.now(),
          })
        }
      }
      prevTerminalLenRef.current = state.terminalLines.length
    }

    if (newMessages.length > 0) {
      setMessages(prev => [...prev, ...newMessages])
    }
  }, [open, hasStarted, state.liveTranscript, state.terminalLines])

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, state.streamingAssistantText])

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleStart = async () => {
    setHasStarted(true)
    // Send /gsd which triggers the guided flow's "complete" phase handler
    await sendCommand(buildPromptCommand("/gsd", bridge))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    }])
    setInput("")
    await submitInput(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0"
        showCloseButton={!isStreaming}
      >
        {/* Header */}
        <DialogHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Milestone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>New Milestone</DialogTitle>
              <DialogDescription>
                Discuss what to build next with GSD
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Chat area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-4"
          style={{ minHeight: "300px", maxHeight: "50vh" }}
        >
          <div className="space-y-4">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}

            {/* Live streaming text from assistant */}
            {isStreaming && state.streamingAssistantText && (
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="rounded-lg rounded-tl-none border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed">
                    <span className="whitespace-pre-wrap">{state.streamingAssistantText}</span>
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60" />
                  </div>
                </div>
              </div>
            )}

            {/* Thinking indicator */}
            {isStreaming && !state.streamingAssistantText && hasStarted && (
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex items-center gap-2 rounded-lg rounded-tl-none border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border px-6 py-4">
          {!hasStarted ? (
            <Button
              onClick={handleStart}
              disabled={isInputDisabled}
              className="w-full gap-2"
              data-testid="new-milestone-start"
            >
              <Sparkles className="h-4 w-4" />
              Start Planning
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isStreaming ? "Wait for GSD to finish…" : "Describe what you want to build next…"}
                disabled={isInputDisabled || isStreaming}
                className="flex-1 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="new-milestone-input"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isInputDisabled || isStreaming || !input.trim()}
                className="h-10 w-10 shrink-0"
                data-testid="new-milestone-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-full border border-border/60 bg-accent/50 px-4 py-1.5 text-xs text-muted-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === "user") {
    return (
      <div className="flex flex-row-reverse gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10">
          <User className="h-3.5 w-3.5 text-foreground/70" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="rounded-lg rounded-tr-none bg-primary/10 px-3.5 py-2.5 text-sm leading-relaxed">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg rounded-tl-none border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  )
}
