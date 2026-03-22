"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { authFetch } from "@/lib/auth"

interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  updateStatus: string
  targetVersion?: string
  error?: string
}

const POLL_INTERVAL = 3000

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch("/api/update")
      if (!res.ok) return
      const data: UpdateInfo = await res.json()
      setInfo(data)
    } catch {
      // Network error — silently ignore, banner stays in last known state
    }
  }, [])

  // Initial fetch on mount
  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // Polling while update is running
  useEffect(() => {
    if (info?.updateStatus === "running") {
      intervalRef.current = setInterval(() => void fetchStatus(), POLL_INTERVAL)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [info?.updateStatus, fetchStatus])

  const handleUpdate = async () => {
    setTriggering(true)
    try {
      const res = await authFetch("/api/update", { method: "POST" })
      if (res.ok || res.status === 202) {
        // Immediately poll to pick up the "running" status
        await fetchStatus()
      } else if (res.status === 409) {
        // Already running — just refresh status
        await fetchStatus()
      }
    } catch {
      // Network error during trigger
    } finally {
      setTriggering(false)
    }
  }

  // Don't render until we have data, or if no update is available and status is idle
  if (!info) return null
  if (!info.updateAvailable && info.updateStatus === "idle") return null
  if (dismissed) return null

  const isRunning = info.updateStatus === "running"
  const isSuccess = info.updateStatus === "success"
  const isError = info.updateStatus === "error"
  const targetLabel = info.targetVersion ?? info.latestVersion

  return (
    <div
      data-testid="update-banner"
      className={cn(
        "flex items-center gap-3 border-b px-4 py-2 text-xs",
        isSuccess && "border-success/20 bg-success/10 text-success",
        isError && "border-destructive/20 bg-destructive/10 text-destructive",
        !isSuccess && !isError && "border-warning/20 bg-warning/10 text-warning",
      )}
    >
      {isSuccess ? (
        <span className="flex-1" data-testid="update-banner-message">
          Update complete — restart GSD to use v{targetLabel}
        </span>
      ) : isError ? (
        <>
          <span className="flex-1" data-testid="update-banner-message">
            Update failed{info.error ? `: ${info.error}` : ""}
          </span>
          <button
            onClick={() => void handleUpdate()}
            disabled={triggering}
            className={cn(
              "flex-shrink-0 rounded border border-destructive/30 bg-background px-2 py-0.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10",
              triggering && "cursor-not-allowed opacity-50",
            )}
            data-testid="update-banner-retry"
          >
            Retry
          </button>
        </>
      ) : (
        <>
          <span className="flex-1" data-testid="update-banner-message">
            {isRunning ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Updating to v{targetLabel}…
              </span>
            ) : (
              <>
                Update available: v{info.currentVersion} → v{info.latestVersion}
              </>
            )}
          </span>
          {!isRunning && (
            <button
              onClick={() => void handleUpdate()}
              disabled={triggering}
              className={cn(
                "flex-shrink-0 rounded border border-warning/30 bg-background px-2 py-0.5 text-xs font-medium text-warning transition-colors hover:bg-warning/10",
                triggering && "cursor-not-allowed opacity-50",
              )}
              data-testid="update-banner-action"
            >
              Update
            </button>
          )}
        </>
      )}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update banner"
        className="flex-shrink-0 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
        data-testid="update-banner-dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
