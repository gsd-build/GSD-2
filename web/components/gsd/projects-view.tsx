"use client"

import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react"
import { FolderOpen, Loader2, AlertCircle, Layers, Sparkles, ArrowUpCircle, GitBranch, FolderKanban, CheckCircle2, FolderRoot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjectStoreManager } from "@/lib/project-store-manager"
import { Button } from "@/components/ui/button"

// ─── Types (mirroring server-side ProjectMetadata) ─────────────────────────

type ProjectDetectionKind = "active-gsd" | "empty-gsd" | "v1-legacy" | "brownfield" | "blank"

interface ProjectDetectionSignals {
  hasGsdFolder: boolean
  hasPlanningFolder: boolean
  hasGitRepo: boolean
  hasPackageJson: boolean
  fileCount: number
  hasMilestones?: boolean
  hasCargo?: boolean
  hasGoMod?: boolean
  hasPyproject?: boolean
}

interface ProjectMetadata {
  name: string
  path: string
  kind: ProjectDetectionKind
  signals: ProjectDetectionSignals
  lastModified: number
}

// ─── Kind badge config ─────────────────────────────────────────────────────

const KIND_CONFIG: Record<ProjectDetectionKind, { label: string; className: string; icon: typeof FolderOpen }> = {
  "active-gsd": {
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    icon: Layers,
  },
  "empty-gsd": {
    label: "Initialized",
    className: "bg-sky-500/15 text-sky-400 border-sky-500/25",
    icon: FolderOpen,
  },
  brownfield: {
    label: "Existing",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    icon: GitBranch,
  },
  "v1-legacy": {
    label: "Legacy v1",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/25",
    icon: ArrowUpCircle,
  },
  blank: {
    label: "Blank",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
    icon: Sparkles,
  },
}

function describeSignals(signals: ProjectDetectionSignals): string {
  const parts: string[] = []
  if (signals.hasGitRepo) parts.push("Git")
  if (signals.hasPackageJson) parts.push("Node.js")
  if (signals.hasCargo) parts.push("Rust")
  if (signals.hasGoMod) parts.push("Go")
  if (signals.hasPyproject) parts.push("Python")
  if (parts.length === 0 && signals.fileCount > 0) parts.push(`${signals.fileCount} files`)
  return parts.join(" · ")
}

// ─── ProjectsView ──────────────────────────────────────────────────────────

export function ProjectsView() {
  const manager = useProjectStoreManager()
  const activeProjectCwd = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot)

  const [projects, setProjects] = useState<ProjectMetadata[]>([])
  const [devRoot, setDevRoot] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback(async (root: string) => {
    const projRes = await fetch(`/api/projects?root=${encodeURIComponent(root)}`)
    if (!projRes.ok) throw new Error(`Failed to discover projects: ${projRes.status}`)
    return await projRes.json() as ProjectMetadata[]
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const prefsRes = await fetch("/api/preferences")
        if (!prefsRes.ok) throw new Error(`Failed to load preferences: ${prefsRes.status}`)
        const prefs = await prefsRes.json()

        if (!prefs.devRoot) {
          setDevRoot(null)
          setProjects([])
          setLoading(false)
          return
        }

        setDevRoot(prefs.devRoot)
        const discovered = await loadProjects(prefs.devRoot)
        if (!cancelled) setProjects(discovered)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [loadProjects])

  /** Called after dev root is saved — refreshes the view with discovered projects */
  const handleDevRootSaved = useCallback(async (newRoot: string) => {
    setDevRoot(newRoot)
    setLoading(true)
    setError(null)
    try {
      const discovered = await loadProjects(newRoot)
      setProjects(discovered)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [loadProjects])

  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const switchPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clean up poll on unmount
  useEffect(() => {
    return () => {
      if (switchPollRef.current) clearInterval(switchPollRef.current)
    }
  }, [])

  function handleSelectProject(project: ProjectMetadata) {
    // Already active — just navigate
    if (activeProjectCwd === project.path) {
      window.dispatchEvent(
        new CustomEvent("gsd:navigate-view", { detail: { view: "dashboard" } })
      )
      return
    }

    setSwitchingTo(project.name)
    const store = manager.switchProject(project.path)

    // Poll the store's boot status until ready (or error/timeout)
    if (switchPollRef.current) clearInterval(switchPollRef.current)
    const startTime = Date.now()
    switchPollRef.current = setInterval(() => {
      const state = store.getSnapshot()
      const elapsed = Date.now() - startTime
      if (state.bootStatus === "ready" || state.bootStatus === "error" || elapsed > 30000) {
        if (switchPollRef.current) clearInterval(switchPollRef.current)
        switchPollRef.current = null
        setSwitchingTo(null)
        window.dispatchEvent(
          new CustomEvent("gsd:navigate-view", { detail: { view: "dashboard" } })
        )
      }
    }, 150)
  }

  // ─── Switching dialog ────────────────────────────────────────────────

  const switchingDialog = (
    <Dialog open={!!switchingTo} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-foreground">
              Opening {switchingTo}
            </h3>
            <p className="text-sm text-muted-foreground">
              Starting project bridge and loading workspace…
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  // ─── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        {switchingDialog}
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  // ─── Error state ───────────────────────────────────────────────────────

  if (error) {
    return (
      <>
        {switchingDialog}
        <div className="flex h-full items-center justify-center px-6">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      </>
    )
  }

  // ─── No dev root configured ────────────────────────────────────────────

  if (!devRoot) {
    return <DevRootSetup onSaved={handleDevRootSaved} />
  }

  // ─── Dev root set, no projects found ───────────────────────────────────

  if (projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <FolderOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">No projects found</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No project directories were discovered in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">{devRoot}</code>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Project grid ──────────────────────────────────────────────────────

  return (
    <>
      {switchingDialog}
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">
          {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{devRoot}</code>
            <span className="ml-2 text-muted-foreground/60">·</span>
            <span className="ml-2">{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const isActive = activeProjectCwd === project.path
            const config = KIND_CONFIG[project.kind]
            const BadgeIcon = config.icon
            const signalText = describeSignals(project.signals)

            return (
              <button
                key={project.path}
                onClick={() => handleSelectProject(project)}
                className={cn(
                  "group relative flex flex-col gap-3 rounded-lg border p-4 text-left transition-all",
                  "hover:bg-accent/50",
                  isActive
                    ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-card",
                )}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}

                {/* Name */}
                <div className="space-y-1 pr-4">
                  <h3 className="text-sm font-semibold text-foreground truncate">{project.name}</h3>
                  <p className="text-[11px] text-muted-foreground/60 font-mono truncate">{project.path}</p>
                </div>

                {/* Kind badge + signal chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      config.className,
                    )}
                  >
                    <BadgeIcon className="h-3 w-3" />
                    {config.label}
                  </span>
                  {signalText && (
                    <span className="text-[10px] text-muted-foreground/50">{signalText}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
    </>
  )
}

// ─── Folder Picker Dialog ───────────────────────────────────────────────

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChevronRight, Folder, CornerLeftUp } from "lucide-react"

interface BrowseEntry {
  name: string
  path: string
}

interface BrowseResult {
  current: string
  parent: string | null
  entries: BrowseEntry[]
}

function FolderPickerDialog({
  open,
  onOpenChange,
  onSelect,
  initialPath,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
  initialPath?: string | null
}) {
  const [currentPath, setCurrentPath] = useState<string>("")
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<BrowseEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const browse = useCallback(async (targetPath?: string) => {
    setLoading(true)
    setError(null)
    try {
      const param = targetPath ? `?path=${encodeURIComponent(targetPath)}` : ""
      const res = await fetch(`/api/browse-directories${param}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `${res.status}`)
      }
      const data: BrowseResult = await res.json()
      setCurrentPath(data.current)
      setParentPath(data.parent)
      setEntries(data.entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to browse")
    } finally {
      setLoading(false)
    }
  }, [])

  // Load initial directory when dialog opens
  useEffect(() => {
    if (open) {
      void browse(initialPath ?? undefined)
    }
  }, [open, initialPath, browse])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">Choose Folder</DialogTitle>
          <DialogDescription className="text-xs">
            Navigate to the folder that contains your project directories.
          </DialogDescription>
        </DialogHeader>

        {/* Current path breadcrumb */}
        <div className="border-y border-border/40 bg-muted/30 px-5 py-2">
          <p className="font-mono text-xs text-muted-foreground truncate" title={currentPath}>
            {currentPath}
          </p>
        </div>

        {/* Directory listing */}
        <ScrollArea className="h-[320px]">
          <div className="px-2 py-1">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="px-3 py-4 text-center text-xs text-red-400">{error}</div>
            )}

            {!loading && !error && (
              <>
                {/* Parent directory */}
                {parentPath && (
                  <button
                    onClick={() => void browse(parentPath)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <CornerLeftUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">..</span>
                  </button>
                )}

                {/* Subdirectories */}
                {entries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => void browse(entry.path)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 group"
                  >
                    <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-foreground truncate flex-1">{entry.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}

                {/* Empty directory */}
                {!parentPath && entries.length === 0 && (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    No subdirectories
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border/40 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSelect(currentPath)
              onOpenChange(false)
            }}
            disabled={!currentPath}
            className="gap-1.5"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Select This Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dev Root Setup Component (uses folder picker) ──────────────────────

function DevRootSetup({ onSaved, currentRoot }: { onSaved: (root: string) => void; currentRoot?: string | null }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleSave = useCallback(async (selectedPath: string) => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devRoot: selectedPath }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          (body as { error?: string }).error ?? `Request failed (${res.status})`,
        )
      }

      setSuccess(true)
      onSaved(selectedPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preference")
    } finally {
      setSaving(false)
    }
  }, [onSaved])

  const isCompact = !!currentRoot

  if (isCompact) {
    // Compact inline form for settings panel
    return (
      <div className="space-y-3" data-testid="devroot-settings">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded border border-border/40 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
            {currentRoot}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
            disabled={saving}
            className="h-9 gap-1.5 shrink-0"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : success ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <>
                <FolderOpen className="h-3.5 w-3.5" />
                Change
              </>
            )}
          </Button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-emerald-400">Dev root updated</p>}

        <FolderPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(path) => void handleSave(path)}
          initialPath={currentRoot}
        />
      </div>
    )
  }

  // Full-page centered setup for first-time configuration
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <FolderRoot className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Set your development root</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The folder that contains your projects. GSD will scan it for project directories.
          </p>
        </div>

        <Button
          onClick={() => setPickerOpen(true)}
          disabled={saving}
          className="h-11 gap-2.5 px-6"
          data-testid="projects-devroot-browse"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <FolderOpen className="h-4 w-4" />
              Browse for Folder
            </>
          )}
        </Button>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <FolderPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(path) => void handleSave(path)}
        />
      </div>
    </div>
  )
}

// ─── Exported Dev Root Section for Settings ──────────────────────────────

export function DevRootSettingsSection() {
  const [devRoot, setDevRoot] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((prefs) => setDevRoot(prefs.devRoot ?? null))
      .catch(() => setDevRoot(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading preferences…
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="settings-devroot">
      <div className="flex items-center gap-2.5">
        <FolderRoot className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
          Development Root
        </h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        The parent folder containing your project directories. GSD scans one level deep for projects.
      </p>
      <DevRootSetup
        currentRoot={devRoot ?? ""}
        onSaved={(root) => setDevRoot(root)}
      />
    </div>
  )
}
