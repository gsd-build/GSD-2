"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ChatPane } from "@/components/gsd/chat-mode"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GuidedDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when open state changes (e.g. close button clicked) */
  onOpenChange: (open: boolean) => void
  /** Detection kind for contextual title */
  detectionKind?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDialogTitle(detectionKind?: string): string {
  switch (detectionKind) {
    case "v1-legacy":
      return "Migrating to GSD v2"
    case "brownfield":
      return "Mapping Your Project"
    case "blank":
      return "Setting Up Your Project"
    default:
      return "Getting Started"
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Full-screen dialog that embeds ChatPane to render the bridge session
 * response to an onboarding CTA command.
 *
 * The initial command dispatch is NOT handled here — it is managed by
 * the parent (Dashboard) via a useEffect keyed on open + command.
 */
export function GuidedDialog({
  open,
  onOpenChange,
  detectionKind,
}: GuidedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl h-[85vh] flex flex-col p-0 gap-0"
        data-testid="guided-dialog"
      >
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold">
            {getDialogTitle(detectionKind)}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Interactive guided setup — responses stream below as they are generated.
          </DialogDescription>
        </DialogHeader>

        {/* ChatPane without onOpenAction hides the Discuss/Next/Auto action buttons */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatPane className="h-full" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
