import { mkdtempSync, mkdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { getProjectSessionsDir } from "../../cli-web-branch.ts"

export type RuntimeWorkspaceFixture = {
  projectCwd: string
  expectedScope: string
  cleanup: () => void
}

export type SeededRuntimeSession = {
  sessionId: string
  name: string
  sessionPath: string
}

export type SeededInterruptedRunRecovery = {
  sessionsDir: string
  alternateSession: SeededRuntimeSession
  activeSession: SeededRuntimeSession
  leakedSecret: string
}

type SessionMessageSeed = Record<string, unknown>

function canonicalizePath(path: string): string {
  try {
    return realpathSync.native?.(path) ?? realpathSync(path)
  } catch {
    return path
  }
}

function sessionBaseVariants(baseSessionsDir: string): string[] {
  const variants = new Set<string>([baseSessionsDir])
  const normalized = baseSessionsDir.replace(/\\/g, "/")
  if (normalized.endsWith("/.gsd/sessions")) {
    variants.add(join(dirname(baseSessionsDir), "agent", "sessions"))
  }
  if (normalized.endsWith("/.gsd/agent/sessions")) {
    variants.add(join(dirname(dirname(baseSessionsDir)), "sessions"))
  }
  return [...variants]
}

function resolveSeedTargetSessionDirs(projectCwd: string, baseSessionsDir: string): string[] {
  const cwdVariants = new Set<string>([projectCwd, canonicalizePath(projectCwd)])
  const targets = new Set<string>()

  for (const cwd of cwdVariants) {
    for (const baseDir of sessionBaseVariants(baseSessionsDir)) {
      targets.add(getProjectSessionsDir(cwd, baseDir))
    }
  }

  return [...targets]
}

function timestampForFilename(timestamp: string): string {
  return timestamp.replace(/[:.]/g, "-")
}

function offsetTimestamp(baseTimestamp: string, offsetSeconds: number): string {
  return new Date(new Date(baseTimestamp).getTime() + offsetSeconds * 1_000).toISOString()
}

function writeSeededSessionFile(options: {
  projectCwd: string
  sessionsDir: string
  sessionId: string
  name: string
  baseTimestamp: string
  messages: SessionMessageSeed[]
}): SeededRuntimeSession {
  const sessionPath = join(options.sessionsDir, `${timestampForFilename(options.baseTimestamp)}_${options.sessionId}.jsonl`)
  const lines: string[] = []
  let parentId: string | null = null

  lines.push(
    JSON.stringify({
      type: "session",
      version: 3,
      id: options.sessionId,
      timestamp: options.baseTimestamp,
      cwd: options.projectCwd,
    }),
  )

  const infoId = `${options.sessionId}-info`
  lines.push(
    JSON.stringify({
      type: "session_info",
      id: infoId,
      parentId,
      timestamp: offsetTimestamp(options.baseTimestamp, 1),
      name: options.name,
    }),
  )
  parentId = infoId

  for (const [index, message] of options.messages.entries()) {
    const entryId = `${options.sessionId}-entry-${index + 1}`
    lines.push(
      JSON.stringify({
        type: "message",
        id: entryId,
        parentId,
        timestamp: offsetTimestamp(options.baseTimestamp, index + 2),
        message,
      }),
    )
    parentId = entryId
  }

  writeFileSync(sessionPath, `${lines.join("\n")}\n`)
  const sessionTime = new Date(options.baseTimestamp)
  utimesSync(sessionPath, sessionTime, sessionTime)

  return {
    sessionId: options.sessionId,
    name: options.name,
    sessionPath,
  }
}

export function makeRuntimeWorkspaceFixture(): RuntimeWorkspaceFixture {
  const root = mkdtempSync(join(tmpdir(), "gsd-web-runtime-fixture-"))
  const projectCwd = join(root, "project")
  const milestoneDir = join(projectCwd, ".gsd", "milestones", "M001")
  const sliceDir = join(milestoneDir, "slices", "S02")
  const tasksDir = join(sliceDir, "tasks")

  mkdirSync(tasksDir, { recursive: true })

  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    `# M001: Fixture Milestone\n\n## Slices\n- [ ] **S02: Fixture browser continuity** \`risk:low\` \`depends:[]\`\n`,
  )
  writeFileSync(
    join(sliceDir, "S02-PLAN.md"),
    `# S02: Fixture browser continuity\n\n**Goal:** Fixture proof\n**Demo:** Fixture proof\n\n## Tasks\n- [ ] **T02: Preserve current-project truth across the launched host** \`est:5m\`\n`,
  )
  writeFileSync(
    join(tasksDir, "T02-PLAN.md"),
    `# T02: Preserve current-project truth across the launched host\n\n## Steps\n- prove fixture cwd launch truth\n`,
  )

  return {
    projectCwd,
    expectedScope: "M001/S02/T02",
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

export function makeInterruptedRunRuntimeFixture(): RuntimeWorkspaceFixture {
  const root = mkdtempSync(join(tmpdir(), "gsd-web-runtime-recovery-"))
  const projectCwd = join(root, "project")
  const milestoneDir = join(projectCwd, ".gsd", "milestones", "M002")
  const sliceDir = join(milestoneDir, "slices", "S04")
  const tasksDir = join(sliceDir, "tasks")

  mkdirSync(tasksDir, { recursive: true })

  writeFileSync(
    join(milestoneDir, "M002-ROADMAP.md"),
    [
      "# M002: Recovery Runtime Fixture",
      "",
      "## Slices",
      "- [ ] **S04: Browser recovery continuity** `risk:high` `depends:[]`",
      "  > After this: launched-host recovery diagnostics stay truthful after reconnect.",
    ].join("\n"),
  )
  writeFileSync(
    join(sliceDir, "S04-PLAN.md"),
    [
      "# S04: Browser recovery continuity",
      "",
      "**Goal:** Keep launched-host recovery diagnostics truthful across reconnects.",
      "**Demo:** A seeded interrupted-run project shows redacted browser recovery state without opening the TUI.",
      "",
      "## Tasks",
      "- [x] **T02: Earlier recovery pass** `est:10m`",
      "- [ ] **T03: Validate interrupted-run browser recovery** `est:15m`",
    ].join("\n"),
  )
  writeFileSync(
    join(tasksDir, "T02-PLAN.md"),
    [
      "# T02: Earlier recovery pass",
      "",
      "## Steps",
      "- leave the summary missing so doctor diagnostics stay inspectable in the browser fixture",
    ].join("\n"),
  )
  writeFileSync(
    join(tasksDir, "T03-PLAN.md"),
    [
      "# T03: Validate interrupted-run browser recovery",
      "",
      "## Steps",
      "- prove refresh, reload, and reopen against the seeded interrupted-run fixture",
    ].join("\n"),
  )

  return {
    projectCwd,
    expectedScope: "M002/S04/T03",
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

export function seedCurrentProjectSession(options: {
  projectCwd: string
  baseSessionsDir: string
  sessionId: string
  name: string
  baseTimestamp: string
}): { sessionsDir: string; session: SeededRuntimeSession } {
  const targetSessionDirs = resolveSeedTargetSessionDirs(options.projectCwd, options.baseSessionsDir)
  let session: SeededRuntimeSession | null = null

  for (const sessionsDir of targetSessionDirs) {
    mkdirSync(sessionsDir, { recursive: true })
    const written = writeSeededSessionFile({
      projectCwd: canonicalizePath(options.projectCwd),
      sessionsDir,
      sessionId: options.sessionId,
      name: options.name,
      baseTimestamp: options.baseTimestamp,
      messages: [
        {
          role: "user",
          content: "Review the current browser proof before starting a fresh live session.",
        },
        {
          role: "assistant",
          content: "Queued the browser proof review and ready to continue.",
        },
      ],
    })
    session ??= written
  }

  return { sessionsDir: targetSessionDirs[0]!, session: session! }
}

export function seedInterruptedRunRecoverySessions(options: {
  projectCwd: string
  baseSessionsDir: string
}): SeededInterruptedRunRecovery {
  const targetSessionDirs = resolveSeedTargetSessionDirs(options.projectCwd, options.baseSessionsDir)

  let alternateSession: SeededRuntimeSession | null = null
  let activeSession: SeededRuntimeSession | null = null
  const leakedSecret = "sk-runtime-recovery-secret-4321"

  for (const sessionsDir of targetSessionDirs) {
    mkdirSync(sessionsDir, { recursive: true })

    const writtenAlternate = writeSeededSessionFile({
      projectCwd: canonicalizePath(options.projectCwd),
      sessionsDir,
      sessionId: "sess-warmup",
      name: "Warmup Session",
      baseTimestamp: "2026-03-15T03:20:00.000Z",
      messages: [
        {
          role: "user",
          content: "Check the previous workspace continuity proof.",
        },
        {
          role: "assistant",
          content: "Workspace continuity proof was recorded and closed.",
        },
      ],
    })
    alternateSession ??= writtenAlternate

    const writtenActive = writeSeededSessionFile({
      projectCwd: canonicalizePath(options.projectCwd),
      sessionsDir,
      sessionId: "sess-recovery",
      name: "Interrupted Recovery Session",
      baseTimestamp: "2026-03-15T03:30:00.000Z",
      messages: [
        {
          role: "user",
          content: "Resume the interrupted browser recovery proof and keep the diagnostics redacted.",
        },
        {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tool-read-1",
              name: "read",
              arguments: { path: ".gsd/milestones/M002/slices/S04/S04-PLAN.md" },
            },
            {
              type: "toolCall",
              id: "tool-write-1",
              name: "write",
              arguments: {
                path: "notes/recovery-proof.md",
                content: "interrupted recovery notes",
              },
            },
            {
              type: "toolCall",
              id: "tool-bash-1",
              name: "bash",
              arguments: { command: "npm run verify:recovery" },
            },
          ],
        },
        {
          role: "toolResult",
          toolCallId: "tool-bash-1",
          toolName: "bash",
          isError: true,
          content: `authentication failed for ${leakedSecret}`,
        },
        {
          role: "assistant",
          content: "The recovery proof stopped after the auth failure and needs a browser-visible follow-up path.",
        },
      ],
    })
    activeSession ??= writtenActive
  }

  return {
    sessionsDir: targetSessionDirs[0]!,
    alternateSession: alternateSession!,
    activeSession: activeSession!,
    leakedSecret,
  }
}
