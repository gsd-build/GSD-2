"use client"

import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "gsd-terminal-font-size"
const DEFAULT_SIZE = 13
const CHANGE_EVENT = "terminal-font-size-changed"

/**
 * Persists terminal font size to localStorage and syncs across components/tabs.
 *
 * Observability:
 *   - `localStorage.getItem('gsd-terminal-font-size')` → current persisted value
 *   - Window event `terminal-font-size-changed` fires on every local change
 *   - `storage` events sync across tabs
 */
export function useTerminalFontSize(): [number, (size: number) => void] {
  const [fontSize, setFontSizeState] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_SIZE
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = Number(stored)
        if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 24) return parsed
      }
    } catch {
      // localStorage may be unavailable
    }
    return DEFAULT_SIZE
  })

  const setFontSize = useCallback((size: number) => {
    const clamped = Math.max(8, Math.min(24, Math.round(size)))
    setFontSizeState(clamped)
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped))
    } catch {
      // localStorage may be unavailable
    }
    // Notify other hook instances within the same tab
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: clamped }))
  }, [])

  // Sync from other tabs via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const parsed = Number(e.newValue)
      if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 24) {
        setFontSizeState(parsed)
      }
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  // Sync from other hook instances in the same tab via custom event
  useEffect(() => {
    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail
      if (Number.isFinite(detail) && detail >= 8 && detail <= 24) {
        setFontSizeState(detail)
      }
    }
    window.addEventListener(CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(CHANGE_EVENT, handleChange)
  }, [])

  return [fontSize, setFontSize]
}
