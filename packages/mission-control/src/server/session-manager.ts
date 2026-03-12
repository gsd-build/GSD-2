/**
 * SessionManager — manages multiple concurrent chat sessions.
 *
 * Each session has its own ClaudeProcessManager instance.
 * Max 4 sessions per project. Metadata persists to .session-metadata.json.
 */
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ClaudeProcessManager } from "./claude-process";
import { createSessionWorktree, removeSessionWorktree, renameSessionWorktree } from "./worktree-api";
import { MAX_SESSIONS } from "./types";
import type { SessionMetadata } from "./chat-types";
import type { ServerWebSocket } from "bun";

/** Minimal interface for a process manager — allows injection for testing. */
export interface IProcessManager {
  readonly isActive: boolean;
  readonly isProcessing: boolean;
  readonly sessionId: string | null;
  onEvent(handler: (event: unknown) => void): void;
  start(): Promise<void>;
  sendMessage(prompt: string): Promise<void>;
  kill(): Promise<void>;
  /** Send SIGINT to the active process. No-op if no process is active. */
  interrupt(): void;
}

export interface SessionState {
  id: string;
  name: string;
  slug: string;
  processManager: IProcessManager;
  activeClient: ServerWebSocket | null;
  worktreePath: string | null;
  worktreeBranch: string | null;
  createdAt: number;
  claudeSessionId: string | null;
  /** True once wireSessionEvents has registered handlers — prevents duplicate registration. */
  wired: boolean;
}

export interface SessionManagerOptions {
  /** Factory to create process managers. Defaults to real ClaudeProcessManager. */
  processFactory?: (cwd: string) => IProcessManager;
}

interface PersistedSession {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
  claudeSessionId: string | null;
}

interface PersistedMetadata {
  sessions: PersistedSession[];
  tabOrder: string[];
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private planningDir: string;
  private processFactory: (cwd: string) => IProcessManager;
  private _worktreeEnabled: boolean = false;

  constructor(planningDir: string, options?: SessionManagerOptions) {
    this.planningDir = planningDir;
    this.processFactory = options?.processFactory ?? ((cwd: string) => new ClaudeProcessManager(cwd));
  }

  /** Enable or disable worktree isolation for new sessions. */
  setWorktreeEnabled(enabled: boolean): void {
    this._worktreeEnabled = enabled;
  }

  get worktreeEnabled(): boolean {
    return this._worktreeEnabled;
  }

  /**
   * Create a new session. Assigns "Chat N" name using next available number.
   * Optionally fork from an existing session (copies Claude session ID for --resume).
   */
  createSession(cwd: string, opts?: { forkFromSessionId?: string }): SessionState {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Maximum ${MAX_SESSIONS} concurrent sessions reached`);
    }

    const id = randomUUID();
    const name = this.nextName();
    const slug = this.toSlug(name);
    // Use worktree path as cwd if worktree isolation is enabled (set after async init)
    const pm = this.processFactory(cwd);

    let claudeSessionId: string | null = null;
    if (opts?.forkFromSessionId) {
      const source = this.sessions.get(opts.forkFromSessionId);
      if (source) {
        claudeSessionId = source.processManager.sessionId ?? source.claudeSessionId;
      }
    }

    const session: SessionState = {
      id,
      name,
      slug,
      processManager: pm,
      activeClient: null,
      worktreePath: null,
      worktreeBranch: null,
      createdAt: Date.now(),
      claudeSessionId,
      wired: false,
    };

    this.sessions.set(id, session);
    // Fire-and-forget persist (sync write for test reliability)
    this.persistMetadataSync();

    // If worktree isolation enabled, create worktree asynchronously
    if (this._worktreeEnabled) {
      const repoRoot = cwd;
      createSessionWorktree(repoRoot, slug).then((result) => {
        if ("error" in result) {
          console.error(`[session-manager] Worktree creation failed for ${slug}:`, result.error);
          // Graceful degradation — session still works without worktree
        } else {
          session.worktreePath = result.worktreePath;
          session.worktreeBranch = result.branchName;
          this.persistMetadataSync();
          console.log(`[session-manager] Worktree created at ${result.worktreePath}`);
        }
      }).catch((err) => {
        console.error(`[session-manager] Worktree creation error for ${slug}:`, err);
      });
    }

    return session;
  }

  getSession(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  /** Returns all sessions ordered by createdAt. */
  listSessions(): SessionState[] {
    return Array.from(this.sessions.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Kill all registered session processes — orphan prevention hook.
   * Called by the server on app shutdown. No-op if no sessions exist.
   */
  async killAll(): Promise<void> {
    const sessions = this.listSessions();
    await Promise.all(sessions.map((s) => s.processManager.kill()));
  }

  /** Close a session: stop routing, kill process, remove from registry. No-op for unknown IDs. */
  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    session.activeClient = null;
    await session.processManager.kill();
    this.sessions.delete(id);
    this.persistMetadataSync();
  }

  /**
   * Close a session with worktree action.
   * - "merge": TODO — merge branch into main (complex, future work), then remove worktree and branch
   * - "keep": remove session from registry, leave worktree on disk
   * - "delete": remove worktree and branch, remove from registry
   */
  async closeSessionWithWorktree(
    id: string,
    action: "merge" | "keep" | "delete",
    repoRoot: string,
  ): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    session.activeClient = null;
    await session.processManager.kill();

    if (session.worktreePath) {
      switch (action) {
        case "merge":
          // TODO: Implement git merge session/<slug> into main branch.
          // This is complex (conflict resolution, current branch handling) and is left
          // as future work. For now, fall through to delete behavior.
          console.warn(`[session-manager] Merge action not yet implemented for ${session.slug}, falling back to delete`);
          await removeSessionWorktree(repoRoot, session.worktreePath, true);
          break;
        case "keep":
          // Leave worktree on disk — user can manually manage it
          console.log(`[session-manager] Keeping worktree at ${session.worktreePath}`);
          break;
        case "delete":
          await removeSessionWorktree(repoRoot, session.worktreePath, true);
          break;
      }
    }

    this.sessions.delete(id);
    this.persistMetadataSync();
  }

  /**
   * Rename a session and regenerate its slug.
   * If session has a worktree, renames the worktree directory and git branch to match.
   */
  async renameSession(id: string, newName: string, repoRoot?: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    const oldSlug = session.slug;
    const newSlug = this.toSlug(newName);
    session.name = newName;
    session.slug = newSlug;

    // Rename worktree directory and branch if applicable
    if (session.worktreePath && repoRoot && oldSlug !== newSlug) {
      try {
        const result = await renameSessionWorktree(repoRoot, oldSlug, newSlug);
        if ("error" in result) {
          console.warn(`[session-manager] Worktree rename failed for ${oldSlug} -> ${newSlug}:`, result.error);
          // Keep old worktree path as fallback — display name is still updated
        } else {
          session.worktreePath = result.worktreePath;
          session.worktreeBranch = result.branchName;
          console.log(`[session-manager] Worktree renamed to ${result.worktreePath}`);
        }
      } catch (err) {
        console.warn(`[session-manager] Worktree rename error:`, err);
        // Graceful degradation — name is updated, worktree keeps old path
      }
    }

    this.persistMetadataSync();
  }

  /** Returns lightweight session list for clients. */
  getMetadata(): SessionMetadata[] {
    return this.listSessions().map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      isProcessing: s.processManager.isProcessing,
      createdAt: s.createdAt,
      worktreePath: s.worktreePath,
      worktreeBranch: s.worktreeBranch,
    }));
  }

  /** Persist session metadata to disk. */
  async persistMetadata(): Promise<void> {
    this.persistMetadataSync();
  }

  /** Synchronous persist to ensure data is written before returning. */
  private persistMetadataSync(): void {
    const sessions = this.listSessions();
    const data: PersistedMetadata = {
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        createdAt: s.createdAt,
        claudeSessionId: s.claudeSessionId,
      })),
      tabOrder: sessions.map((s) => s.id),
    };
    const filePath = join(this.planningDir, ".session-metadata.json");
    try {
      writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Best-effort persist — don't crash on write failure
    }
  }

  /** Restore sessions from persisted metadata. Creates PM instances but does NOT start them. */
  async restoreMetadata(cwd: string): Promise<void> {
    const filePath = join(this.planningDir, ".session-metadata.json");
    try {
      const raw = await readFile(filePath, "utf-8");
      const data: PersistedMetadata = JSON.parse(raw);

      if (!data.sessions || !Array.isArray(data.sessions)) return;

      for (const saved of data.sessions) {
        const pm = this.processFactory(cwd);
        const session: SessionState = {
          id: saved.id,
          name: saved.name,
          slug: saved.slug,
          processManager: pm,
          activeClient: null,
          worktreePath: null,
          worktreeBranch: null,
          createdAt: saved.createdAt,
          claudeSessionId: saved.claudeSessionId,
          wired: false,
        };
        this.sessions.set(saved.id, session);
      }
    } catch {
      // Missing or corrupt file — start fresh
      console.warn("[session-manager] No session metadata found or corrupt file, starting fresh");
    }
  }

  /** Generate kebab-case slug from name. */
  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /** Find lowest unused "Chat N" number. */
  private nextName(): string {
    const usedNumbers = new Set<number>();
    for (const session of this.sessions.values()) {
      const match = session.name.match(/^Chat (\d+)$/);
      if (match) usedNumbers.add(parseInt(match[1], 10));
    }
    let n = 1;
    while (usedNumbers.has(n)) n++;
    return `Chat ${n}`;
  }
}
