"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { GripVertical, Play, Loader2, Milestone } from "lucide-react"
import {
  useGSDWorkspaceState,
  useGSDWorkspaceActions,
  buildPromptCommand,
} from "@/lib/gsd-workspace-store"
import { deriveWorkflowAction } from "@/lib/workflow-actions"
import { NewMilestoneDialog } from "@/components/gsd/new-milestone-dialog"
import { ShellTerminal } from "@/components/gsd/shell-terminal"

export function DualTerminal() {
  const [splitPosition, setSplitPosition] = useState(50)
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const state = useGSDWorkspaceState()
  const { sendCommand } = useGSDWorkspaceActions()

  const boot = state.boot
  const workspace = boot?.workspace ?? null
  const auto = boot?.auto ?? null
  const bridge = boot?.bridge ?? null

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

  const handleWorkflowAction = (command: string) => {
    void sendCommand(buildPromptCommand(command, bridge))
  }

  const handlePrimaryAction = () => {
    if (!workflowAction.primary) return
    if (workflowAction.isNewMilestone) {
      setMilestoneDialogOpen(true)
    } else {
      handleWorkflowAction(workflowAction.primary.command)
    }
  }

  const handleMouseDown = () => {
    isDragging.current = true
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = (x / rect.width) * 100
    setSplitPosition(Math.max(20, Math.min(80, percent)))
  }

  const handleMouseUp = () => {
    isDragging.current = false
  }

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-medium">Power User Mode</span>
          {/* Compact workflow action bar */}
          <div className="flex items-center gap-2" data-testid="power-mode-action-bar">
            {workflowAction.primary && (
              <button
                onClick={handlePrimaryAction}
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
                onClick={() => handleWorkflowAction(action.command)}
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
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Left: Primary GSD</span>
          <span className="text-border">|</span>
          <span>Right: Interactive GSD</span>
        </div>
      </div>

      {/* Split terminals */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Left terminal - Primary GSD instance */}
        <div style={{ width: `${splitPosition}%` }} className="h-full overflow-hidden">
          <ShellTerminal className="h-full" command="pi" sessionPrefix="gsd-main" />
        </div>

        {/* Divider */}
        <div
          className="flex w-1 cursor-col-resize items-center justify-center bg-border hover:bg-muted-foreground/30 transition-colors"
          onMouseDown={handleMouseDown}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Right terminal - Interactive GSD instance */}
        <div style={{ width: `${100 - splitPosition}%` }} className="h-full overflow-hidden">
          <ShellTerminal className="h-full" command="pi" sessionPrefix="gsd-interactive" />
        </div>
      </div>

      <NewMilestoneDialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen} />
    </div>
  )
}
