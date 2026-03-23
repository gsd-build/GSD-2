// GSD Extension — Workflow Command Handlers
// All 17 command handlers that form the core mutation API of the WorkflowEngine.
// Each command validates preconditions, writes atomically via transaction(),
// and returns rich results with progress context per D-04.

import type { DbAdapter } from "./gsd-db.js";
import { transaction } from "./gsd-db.js";

// ─── Param & Result Interfaces ──────────────────────────────────────────────

export interface CompleteTaskParams {
  milestoneId: string;
  sliceId: string;
  taskId: string;
  summary: string;
  evidence?: string[];
}

export interface CompleteTaskResult {
  taskId: string;
  status: string;
  progress: string;
  nextTask: string | null;
  nextTaskTitle: string | null;
}

export interface CompleteSliceParams {
  milestoneId: string;
  sliceId: string;
  summary: string;
  uatResult?: string;
}

export interface CompleteSliceResult {
  sliceId: string;
  status: string;
  progress: string;
  nextSlice: string | null;
}

export interface PlanSliceParams {
  milestoneId: string;
  sliceId: string;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    estimate?: string;
    files?: string[];
    verify?: string;
  }>;
}

export interface PlanSliceResult {
  sliceId: string;
  taskCount: number;
  taskIds: string[];
}

export interface SaveDecisionParams {
  scope: string;
  decision: string;
  choice: string;
  rationale: string;
  revisable?: string;
  whenContext?: string;
  madeBy?: "human" | "agent" | "collaborative";
}

export interface SaveDecisionResult {
  id: string;
}

export interface StartTaskParams {
  milestoneId: string;
  sliceId: string;
  taskId: string;
}

export interface StartTaskResult {
  taskId: string;
  status: string;
  startedAt: string;
}

export interface RecordVerificationParams {
  milestoneId: string;
  sliceId: string;
  taskId: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface RecordVerificationResult {
  taskId: string;
  evidenceId: number;
}

export interface ReportBlockerParams {
  milestoneId: string;
  sliceId: string;
  taskId: string;
  description: string;
}

export interface ReportBlockerResult {
  taskId: string;
  status: string;
}

// ─── Command Implementations ────────────────────────────────────────────────

/**
 * completeTask: Atomically mark a task as done with summary and optional evidence.
 * Idempotent — calling on an already-done task returns current state without error.
 * Returns rich progress context per D-04.
 */
export function completeTask(
  db: DbAdapter,
  params: CompleteTaskParams,
): CompleteTaskResult {
  const { milestoneId, sliceId, taskId, summary, evidence } = params;

  return transaction(() => {
    // Fetch task
    const task = db
      .prepare(
        "SELECT * FROM tasks WHERE milestone_id = ? AND slice_id = ? AND id = ?",
      )
      .get(milestoneId, sliceId, taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Idempotent: if already done, return current state
    if ((task["status"] as string) === "done") {
      const progress = computeTaskProgress(db, milestoneId, sliceId);
      const next = getNextPendingTask(db, milestoneId, sliceId);
      return {
        taskId,
        status: "done",
        progress,
        nextTask: next?.id ?? null,
        nextTaskTitle: next?.title ?? null,
      };
    }

    // Update task
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE tasks SET status = 'done', summary = ?, completed_at = ? WHERE milestone_id = ? AND slice_id = ? AND id = ?",
    ).run(summary, now, milestoneId, sliceId, taskId);

    // Insert evidence if provided
    if (evidence && evidence.length > 0) {
      const stmt = db.prepare(
        "INSERT INTO verification_evidence (task_id, slice_id, milestone_id, command, exit_code, stdout, stderr, duration_ms, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const ev of evidence) {
        stmt.run(taskId, sliceId, milestoneId, ev, 0, "", "", 0, now);
      }
    }

    // Compute progress
    const progress = computeTaskProgress(db, milestoneId, sliceId);
    const next = getNextPendingTask(db, milestoneId, sliceId);

    return {
      taskId,
      status: "done",
      progress,
      nextTask: next?.id ?? null,
      nextTaskTitle: next?.title ?? null,
    };
  });
}

/**
 * completeSlice: Atomically mark a slice as done with summary and optional UAT result.
 * Returns progress context for the parent milestone.
 */
export function completeSlice(
  db: DbAdapter,
  params: CompleteSliceParams,
): CompleteSliceResult {
  const { milestoneId, sliceId, summary, uatResult } = params;

  return transaction(() => {
    // Fetch slice
    const slice = db
      .prepare(
        "SELECT * FROM slices WHERE milestone_id = ? AND id = ?",
      )
      .get(milestoneId, sliceId);

    if (!slice) {
      throw new Error(`Slice ${sliceId} not found`);
    }

    // Update slice
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE slices SET status = 'done', summary = ?, uat_result = ?, completed_at = ? WHERE milestone_id = ? AND id = ?",
    ).run(summary, uatResult ?? null, now, milestoneId, sliceId);

    // Compute progress
    const progress = computeSliceProgress(db, milestoneId);
    const next = getNextPendingSlice(db, milestoneId);

    return {
      sliceId,
      status: "done",
      progress,
      nextSlice: next?.id ?? null,
    };
  });
}

/**
 * planSlice: Create multiple task rows for a slice in one transaction.
 * Throws if the slice already has tasks.
 */
export function planSlice(
  db: DbAdapter,
  params: PlanSliceParams,
): PlanSliceResult {
  const { milestoneId, sliceId, tasks } = params;

  return transaction(() => {
    // Check for existing tasks
    const existing = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM tasks WHERE milestone_id = ? AND slice_id = ?",
      )
      .get(milestoneId, sliceId);

    if (existing && (existing["cnt"] as number) > 0) {
      throw new Error(`Slice ${sliceId} already has tasks`);
    }

    // Insert tasks
    const stmt = db.prepare(
      "INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, verify, seq) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
    );

    const taskIds: string[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]!;
      stmt.run(
        t.id,
        sliceId,
        milestoneId,
        t.title,
        t.description,
        t.estimate ?? "",
        JSON.stringify(t.files ?? []),
        t.verify ?? null,
        i,
      );
      taskIds.push(t.id);
    }

    return {
      sliceId,
      taskCount: tasks.length,
      taskIds,
    };
  });
}

/**
 * saveDecision: Record a decision with auto-generated sequential ID.
 */
export function saveDecision(
  db: DbAdapter,
  params: SaveDecisionParams,
): SaveDecisionResult {
  const { scope, decision, choice, rationale, revisable, whenContext, madeBy } =
    params;

  return transaction(() => {
    // Get next sequence number
    const maxRow = db
      .prepare("SELECT MAX(seq) as max_seq FROM decisions")
      .get();
    const maxSeq = (maxRow?.["max_seq"] as number) ?? 0;
    const nextSeq = maxSeq + 1;
    const id = `D${String(nextSeq).padStart(3, "0")}`;

    db.prepare(
      `INSERT INTO decisions (id, when_context, scope, decision, choice, rationale, revisable, made_by, superseded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      whenContext ?? "",
      scope,
      decision,
      choice,
      rationale,
      revisable ?? "",
      madeBy ?? "agent",
      null,
    );

    return { id };
  });
}

/**
 * startTask: Mark a task as in-progress with a timestamp.
 * Throws if the task is already done.
 */
export function startTask(
  db: DbAdapter,
  params: StartTaskParams,
): StartTaskResult {
  const { milestoneId, sliceId, taskId } = params;

  return transaction(() => {
    const task = db
      .prepare(
        "SELECT * FROM tasks WHERE milestone_id = ? AND slice_id = ? AND id = ?",
      )
      .get(milestoneId, sliceId, taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if ((task["status"] as string) === "done") {
      throw new Error(`Task ${taskId} is already done`);
    }

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE tasks SET status = 'in-progress', started_at = ? WHERE milestone_id = ? AND slice_id = ? AND id = ?",
    ).run(now, milestoneId, sliceId, taskId);

    return {
      taskId,
      status: "in-progress",
      startedAt: now,
    };
  });
}

/**
 * recordVerification: Store verification evidence against a task.
 */
export function recordVerification(
  db: DbAdapter,
  params: RecordVerificationParams,
): RecordVerificationResult {
  const { milestoneId, sliceId, taskId, command, exitCode, stdout, stderr, durationMs } =
    params;

  return transaction(() => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        "INSERT INTO verification_evidence (task_id, slice_id, milestone_id, command, exit_code, stdout, stderr, duration_ms, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(taskId, sliceId, milestoneId, command, exitCode, stdout, stderr, durationMs, now);

    // Extract lastInsertRowid from result
    let evidenceId = 0;
    if (result && typeof result === "object") {
      const r = result as Record<string, unknown>;
      // node:sqlite returns { changes, lastInsertRowid }
      // better-sqlite3 returns { changes, lastInsertRowid }
      if ("lastInsertRowid" in r) {
        evidenceId = Number(r["lastInsertRowid"]);
      }
    }

    // Fallback: query the last inserted ID
    if (evidenceId === 0) {
      const row = db
        .prepare("SELECT MAX(id) as max_id FROM verification_evidence WHERE task_id = ? AND slice_id = ? AND milestone_id = ?")
        .get(taskId, sliceId, milestoneId);
      evidenceId = (row?.["max_id"] as number) ?? 0;
    }

    return {
      taskId,
      evidenceId,
    };
  });
}

/**
 * reportBlocker: Mark a task as blocked with a description.
 */
export function reportBlocker(
  db: DbAdapter,
  params: ReportBlockerParams,
): ReportBlockerResult {
  const { milestoneId, sliceId, taskId, description } = params;

  return transaction(() => {
    const task = db
      .prepare(
        "SELECT * FROM tasks WHERE milestone_id = ? AND slice_id = ? AND id = ?",
      )
      .get(milestoneId, sliceId, taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    db.prepare(
      "UPDATE tasks SET status = 'blocked', blocker = ? WHERE milestone_id = ? AND slice_id = ? AND id = ?",
    ).run(description, milestoneId, sliceId, taskId);

    return {
      taskId,
      status: "blocked",
    };
  });
}

// ─── New Command Param & Result Interfaces ──────────────────────────────────

export interface CreateMilestoneParams {
  milestoneId: string;
  title: string;
  context?: string;
}

export interface CreateMilestoneResult {
  milestoneId: string;
  status: string;
  created: boolean;
}

export interface PlanMilestoneParams {
  milestoneId: string;
  title: string;
  vision: string;
  slices: Array<{
    id: string;
    title: string;
    risk: string;
    depends: string[];
    demo: string;
    done?: boolean;
  }>;
}

export interface PlanMilestoneResult {
  milestoneId: string;
  sliceCount: number;
  sliceIds: string[];
  activeSlice: string | null;
}

export interface CompleteMilestoneParams {
  milestoneId: string;
  summary: string;
}

export interface CompleteMilestoneResult {
  milestoneId: string;
  status: string;
  completedAt: string;
}

export interface ValidateMilestoneParams {
  milestoneId: string;
  verdict: "pass" | "needs-attention" | "needs-remediation";
  summary: string;
  remediationSlices?: Array<{
    id: string;
    title: string;
    risk: string;
    depends: string[];
    demo: string;
  }>;
}

export interface ValidateMilestoneResult {
  milestoneId: string;
  verdict: string;
  remediationSliceCount: number;
}

export interface UpdateRoadmapParams {
  milestoneId: string;
  addSlices?: Array<{
    id: string;
    title: string;
    risk: string;
    depends: string[];
    demo: string;
  }>;
  removeSliceIds?: string[];
  reorderSliceIds?: string[];
}

export interface UpdateRoadmapResult {
  milestoneId: string;
  added: number;
  removed: number;
  totalSlices: number;
}

export interface SaveContextParams {
  milestoneId: string;
  content: string;
}

export interface SaveContextResult {
  milestoneId: string;
  saved: true;
}

export interface SaveResearchParams {
  milestoneId: string;
  sliceId?: string;
  content: string;
}

export interface SaveResearchResult {
  milestoneId: string;
  sliceId: string | null;
  saved: true;
}

export interface SaveRequirementsParams {
  milestoneId: string;
  requirements: Array<{
    id: string;
    title: string;
    status: string;
    owner?: string;
    source?: string;
  }>;
}

export interface SaveRequirementsResult {
  count: number;
  requirementIds: string[];
}

export interface SaveUatResultParams {
  milestoneId: string;
  sliceId: string;
  verdict: "pass" | "fail" | "partial";
  checks: Array<{
    name: string;
    passed: boolean;
    notes?: string;
  }>;
}

export interface SaveUatResultResult {
  milestoneId: string;
  sliceId: string;
  verdict: string;
  checkCount: number;
}

export interface SaveKnowledgeParams {
  content: string;
  category?: string;
  source?: string;
}

export interface SaveKnowledgeResult {
  saved: true;
}

// ─── New Command Implementations ────────────────────────────────────────────

/**
 * createMilestone: Insert a new milestone with status='active'.
 * Idempotent — if the milestone already exists, return its current state.
 */
export function createMilestone(
  db: DbAdapter,
  params: CreateMilestoneParams,
): CreateMilestoneResult {
  const { milestoneId, title } = params;

  return transaction(() => {
    // Check if milestone already exists
    const existing = db
      .prepare("SELECT * FROM milestones WHERE id = ?")
      .get(milestoneId);

    if (existing) {
      return {
        milestoneId,
        status: existing["status"] as string,
        created: false,
      };
    }

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO milestones (id, title, status, created_at) VALUES (?, ?, 'active', ?)",
    ).run(milestoneId, title, now);

    return {
      milestoneId,
      status: "active",
      created: true,
    };
  });
}

/**
 * planMilestone: Insert all slices for a milestone with seq ordering.
 * First slice with deps met and not done gets status='active', rest get 'pending'.
 * Done slices get 'done'. If slices already exist, deletes them first (re-planning).
 * Also updates the milestone title if provided.
 */
export function planMilestone(
  db: DbAdapter,
  params: PlanMilestoneParams,
): PlanMilestoneResult {
  const { milestoneId, title, slices } = params;

  return transaction(() => {
    // Precondition: milestone must exist
    const milestone = db
      .prepare("SELECT * FROM milestones WHERE id = ?")
      .get(milestoneId);

    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found`);
    }

    // Update milestone title if provided
    if (title) {
      db.prepare("UPDATE milestones SET title = ? WHERE id = ?").run(
        title,
        milestoneId,
      );
    }

    // Delete existing slices for re-planning
    db.prepare("DELETE FROM slices WHERE milestone_id = ?").run(milestoneId);

    // Build set of done slice IDs for dependency resolution
    const doneIds = new Set<string>();
    for (const s of slices) {
      if (s.done) {
        doneIds.add(s.id);
      }
    }

    // Determine which slice should be active: first non-done slice whose deps are all met
    let activeSlice: string | null = null;

    const stmt = db.prepare(
      "INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, created_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );

    const now = new Date().toISOString();
    const sliceIds: string[] = [];

    for (let i = 0; i < slices.length; i++) {
      const s = slices[i]!;
      let status: string;

      if (s.done) {
        status = "done";
      } else if (
        activeSlice === null &&
        s.depends.every((dep) => doneIds.has(dep))
      ) {
        status = "active";
        activeSlice = s.id;
      } else {
        status = "pending";
      }

      stmt.run(
        s.id,
        milestoneId,
        s.title,
        status,
        s.risk,
        JSON.stringify(s.depends),
        now,
        i,
      );
      sliceIds.push(s.id);
    }

    return {
      milestoneId,
      sliceCount: slices.length,
      sliceIds,
      activeSlice,
    };
  });
}

/**
 * completeMilestone: Mark a milestone as done with summary.
 * Throws if any slices are not done.
 */
export function completeMilestone(
  db: DbAdapter,
  params: CompleteMilestoneParams,
): CompleteMilestoneResult {
  const { milestoneId, summary } = params;

  return transaction(() => {
    const milestone = db
      .prepare("SELECT * FROM milestones WHERE id = ?")
      .get(milestoneId);

    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found`);
    }

    // Verify all slices are done
    const notDone = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM slices WHERE milestone_id = ? AND status != 'done'",
      )
      .get(milestoneId);

    if (notDone && (notDone["cnt"] as number) > 0) {
      throw new Error(
        `Cannot complete milestone ${milestoneId}: ${notDone["cnt"]} slices are not done`,
      );
    }

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE milestones SET status = 'done', title = ?, completed_at = ? WHERE id = ?",
    ).run(
      `${(milestone["title"] as string) || ""} — ${summary}`,
      now,
      milestoneId,
    );

    return {
      milestoneId,
      status: "done",
      completedAt: now,
    };
  });
}

/**
 * validateMilestone: Record a validation verdict for a milestone.
 * If verdict is 'needs-remediation', insert remediation slices.
 * The VALIDATION.md file is written by the projection renderer.
 */
export function validateMilestone(
  db: DbAdapter,
  params: ValidateMilestoneParams,
): ValidateMilestoneResult {
  const { milestoneId, verdict, remediationSlices } = params;

  return transaction(() => {
    const milestone = db
      .prepare("SELECT * FROM milestones WHERE id = ?")
      .get(milestoneId);

    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found`);
    }

    let remediationSliceCount = 0;

    // If needs-remediation, insert new slices
    if (verdict === "needs-remediation" && remediationSlices && remediationSlices.length > 0) {
      // Get current max seq for this milestone
      const maxSeqRow = db
        .prepare(
          "SELECT MAX(seq) as max_seq FROM slices WHERE milestone_id = ?",
        )
        .get(milestoneId);
      let nextSeq = ((maxSeqRow?.["max_seq"] as number) ?? -1) + 1;

      const now = new Date().toISOString();
      const stmt = db.prepare(
        "INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, created_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );

      for (const s of remediationSlices) {
        stmt.run(
          s.id,
          milestoneId,
          s.title,
          "pending",
          s.risk,
          JSON.stringify(s.depends),
          now,
          nextSeq,
        );
        nextSeq++;
      }

      remediationSliceCount = remediationSlices.length;
    }

    return {
      milestoneId,
      verdict,
      remediationSliceCount,
    };
  });
}

/**
 * updateRoadmap: Add, remove, or reorder slices for a milestone in one transaction.
 * Only pending slices may be removed.
 */
export function updateRoadmap(
  db: DbAdapter,
  params: UpdateRoadmapParams,
): UpdateRoadmapResult {
  const { milestoneId, addSlices, removeSliceIds, reorderSliceIds } = params;

  return transaction(() => {
    const milestone = db
      .prepare("SELECT * FROM milestones WHERE id = ?")
      .get(milestoneId);

    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found`);
    }

    let removed = 0;
    let added = 0;

    // Remove specified slices (only if pending)
    if (removeSliceIds && removeSliceIds.length > 0) {
      const deleteStmt = db.prepare(
        "DELETE FROM slices WHERE milestone_id = ? AND id = ? AND status = 'pending'",
      );
      for (const id of removeSliceIds) {
        const result = deleteStmt.run(milestoneId, id);
        if (result && typeof result === "object") {
          const r = result as Record<string, unknown>;
          if ("changes" in r && (r["changes"] as number) > 0) {
            removed++;
          }
        }
      }
    }

    // Add new slices
    if (addSlices && addSlices.length > 0) {
      // Get current max seq
      const maxSeqRow = db
        .prepare(
          "SELECT MAX(seq) as max_seq FROM slices WHERE milestone_id = ?",
        )
        .get(milestoneId);
      let nextSeq = ((maxSeqRow?.["max_seq"] as number) ?? -1) + 1;

      const now = new Date().toISOString();
      const insertStmt = db.prepare(
        "INSERT INTO slices (id, milestone_id, title, status, risk, depends_on, created_at, seq) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)",
      );

      for (const s of addSlices) {
        insertStmt.run(
          s.id,
          milestoneId,
          s.title,
          s.risk,
          JSON.stringify(s.depends),
          now,
          nextSeq,
        );
        nextSeq++;
        added++;
      }
    }

    // Reorder slices by new seq values
    if (reorderSliceIds && reorderSliceIds.length > 0) {
      const updateStmt = db.prepare(
        "UPDATE slices SET seq = ? WHERE milestone_id = ? AND id = ?",
      );
      for (let i = 0; i < reorderSliceIds.length; i++) {
        updateStmt.run(i, milestoneId, reorderSliceIds[i]!);
      }
    }

    // Get total slice count
    const totalRow = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM slices WHERE milestone_id = ?",
      )
      .get(milestoneId);
    const totalSlices = (totalRow?.["cnt"] as number) ?? 0;

    return {
      milestoneId,
      added,
      removed,
      totalSlices,
    };
  });
}

/**
 * saveContext: Validate milestone exists and signal success for afterCommand rendering.
 * The actual CONTEXT.md file write happens in the projection/afterCommand hook.
 */
export function saveContext(
  db: DbAdapter,
  params: SaveContextParams,
): SaveContextResult {
  const { milestoneId } = params;

  return transaction(() => {
    const milestone = db
      .prepare("SELECT * FROM milestones WHERE id = ?")
      .get(milestoneId);

    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found`);
    }

    return {
      milestoneId,
      saved: true as const,
    };
  });
}

/**
 * saveResearch: Validate milestone/slice refs exist and signal success for afterCommand rendering.
 * The actual RESEARCH.md file write happens in the projection/afterCommand hook.
 */
export function saveResearch(
  db: DbAdapter,
  params: SaveResearchParams,
): SaveResearchResult {
  const { milestoneId, sliceId } = params;

  return transaction(() => {
    const milestone = db
      .prepare("SELECT * FROM milestones WHERE id = ?")
      .get(milestoneId);

    if (!milestone) {
      throw new Error(`Milestone ${milestoneId} not found`);
    }

    if (sliceId) {
      const slice = db
        .prepare(
          "SELECT * FROM slices WHERE milestone_id = ? AND id = ?",
        )
        .get(milestoneId, sliceId);

      if (!slice) {
        throw new Error(`Slice ${sliceId} not found in milestone ${milestoneId}`);
      }
    }

    return {
      milestoneId,
      sliceId: sliceId ?? null,
      saved: true as const,
    };
  });
}

/**
 * saveRequirements: UPSERT requirements into the requirements table.
 */
export function saveRequirements(
  db: DbAdapter,
  params: SaveRequirementsParams,
): SaveRequirementsResult {
  const { requirements } = params;

  return transaction(() => {
    const stmt = db.prepare(
      `INSERT INTO requirements (id, class, status, description, why, source, primary_owner, supporting_slices, validation, notes, full_content)
       VALUES (?, '', ?, ?, '', ?, ?, '', '', '', '')
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, description = excluded.description, source = excluded.source, primary_owner = excluded.primary_owner`,
    );

    const requirementIds: string[] = [];

    for (const req of requirements) {
      stmt.run(
        req.id,
        req.status,
        req.title,
        req.source ?? "",
        req.owner ?? "",
      );
      requirementIds.push(req.id);
    }

    return {
      count: requirements.length,
      requirementIds,
    };
  });
}

/**
 * saveUatResult: Store UAT result as JSON in the slice's uat_result column.
 */
export function saveUatResult(
  db: DbAdapter,
  params: SaveUatResultParams,
): SaveUatResultResult {
  const { milestoneId, sliceId, verdict, checks } = params;

  return transaction(() => {
    const slice = db
      .prepare(
        "SELECT * FROM slices WHERE milestone_id = ? AND id = ?",
      )
      .get(milestoneId, sliceId);

    if (!slice) {
      throw new Error(`Slice ${sliceId} not found in milestone ${milestoneId}`);
    }

    const uatJson = JSON.stringify({ verdict, checks });
    db.prepare(
      "UPDATE slices SET uat_result = ? WHERE milestone_id = ? AND id = ?",
    ).run(uatJson, milestoneId, sliceId);

    return {
      milestoneId,
      sliceId,
      verdict,
      checkCount: checks.length,
    };
  });
}

/**
 * saveKnowledge: Return success for afterCommand to render KNOWLEDGE.md.
 * The actual file write happens in the projection/afterCommand hook.
 */
export function saveKnowledge(
  _db: DbAdapter,
  _params: SaveKnowledgeParams,
): SaveKnowledgeResult {
  return { saved: true as const };
}

// ─── Exported Helpers ────────────────────────────────────────────────────────

/**
 * Compute milestone slice completion progress.
 * Returns total slices, done slices, and percentage for the given milestone.
 * Used by WorkflowEngine to trigger event compaction at 100% (EVT-03).
 */
export function _milestoneProgress(
  db: DbAdapter,
  milestoneId: string,
): { total: number; done: number; pct: number } {
  const totalRow = db
    .prepare("SELECT COUNT(*) as cnt FROM slices WHERE milestone_id = ?")
    .get(milestoneId);
  const doneRow = db
    .prepare("SELECT COUNT(*) as cnt FROM slices WHERE milestone_id = ? AND status = 'done'")
    .get(milestoneId);

  const total = (totalRow?.["cnt"] as number) ?? 0;
  const done = (doneRow?.["cnt"] as number) ?? 0;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return { total, done, pct };
}

// ─── Private Helpers ────────────────────────────────────────────────────────

function computeTaskProgress(
  db: DbAdapter,
  milestoneId: string,
  sliceId: string,
): string {
  const total = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE milestone_id = ? AND slice_id = ?",
    )
    .get(milestoneId, sliceId);
  const done = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM tasks WHERE milestone_id = ? AND slice_id = ? AND status = 'done'",
    )
    .get(milestoneId, sliceId);

  const totalCount = (total?.["cnt"] as number) ?? 0;
  const doneCount = (done?.["cnt"] as number) ?? 0;

  return `${doneCount}/${totalCount} tasks done in ${sliceId}`;
}

function computeSliceProgress(
  db: DbAdapter,
  milestoneId: string,
): string {
  const total = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM slices WHERE milestone_id = ?",
    )
    .get(milestoneId);
  const done = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM slices WHERE milestone_id = ? AND status = 'done'",
    )
    .get(milestoneId);

  const totalCount = (total?.["cnt"] as number) ?? 0;
  const doneCount = (done?.["cnt"] as number) ?? 0;

  return `${doneCount}/${totalCount} slices done in ${milestoneId}`;
}

function getNextPendingTask(
  db: DbAdapter,
  milestoneId: string,
  sliceId: string,
): { id: string; title: string } | null {
  const row = db
    .prepare(
      "SELECT id, title FROM tasks WHERE milestone_id = ? AND slice_id = ? AND status = 'pending' ORDER BY seq, id LIMIT 1",
    )
    .get(milestoneId, sliceId);

  if (!row) return null;
  return { id: row["id"] as string, title: row["title"] as string };
}

function getNextPendingSlice(
  db: DbAdapter,
  milestoneId: string,
): { id: string } | null {
  const row = db
    .prepare(
      "SELECT id FROM slices WHERE milestone_id = ? AND status != 'done' ORDER BY seq, id LIMIT 1",
    )
    .get(milestoneId);

  if (!row) return null;
  return { id: row["id"] as string };
}
