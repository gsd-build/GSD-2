/**
 * State derivation engine for the file-to-state pipeline.
 * Reads GSD 2's flat .gsd/ directory schema into a typed GSD2State object.
 * Called on startup (full rebuild) and on file change events.
 *
 * GSD 2 file schema (all files live in .gsd/ root):
 *   STATE.md            — active milestone/slice/task pointers, status
 *   M{NNN}-ROADMAP.md   — milestone structure (NNN from STATE.md active_milestone)
 *   S{NN}-PLAN.md       — slice task decomposition (NN from STATE.md active_slice)
 *   T{NN}-SUMMARY.md    — completed task output (NN from STATE.md active_task)
 *   DECISIONS.md        — architectural decision register
 *   preferences.md      — model config, budget ceiling, skill_discovery (YAML frontmatter)
 *   PROJECT.md          — living project description
 *   M{NNN}-CONTEXT.md   — user decisions for active milestone
 */
import matter from "gray-matter";
import { access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  GSD2State,
  GSD2ProjectState,
  GSD2Preferences,
  GSD2RoadmapState,
  GSD2SlicePlan,
  GSD2TaskSummary,
  GSD2SliceInfo,
  GSD2UatFile,
  GSD2UatItem,
  GSD2TaskEntry,
  SliceStatus,
} from "./types";

// -- Default values --

const DEFAULT_GSD2_PROJECT_STATE: GSD2ProjectState = {
  gsd_state_version: "",
  milestone: "",
  milestone_name: "",
  status: "unknown",
  active_milestone: "M001",
  active_slice: "S01",
  active_task: "T01",
  auto_mode: false,
  cost: 0,
  tokens: 0,
  last_updated: "",
};

// -- File reading helpers --

async function readFileText(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

// -- Milestone subdirectory file reading helpers --

/**
 * Reads a milestone-level file (e.g. M002-ROADMAP.md) with subdirectory fallback.
 * Tries .gsd/{filename} first, then .gsd/milestones/{milestone}/{filename}.
 */
async function readMilestoneFile(gsdDir: string, milestone: string, filename: string): Promise<string | null> {
  return (
    (await readFileText(join(gsdDir, filename))) ??
    (await readFileText(join(gsdDir, "milestones", milestone, filename)))
  );
}

/**
 * Reads a slice-level file (e.g. S01-PLAN.md) with subdirectory fallback.
 * Tries .gsd/{filename} first, then .gsd/milestones/{milestone}/slices/{filename}.
 */
async function readSliceFile(gsdDir: string, milestone: string, filename: string): Promise<string | null> {
  return (
    (await readFileText(join(gsdDir, filename))) ??
    (await readFileText(join(gsdDir, "milestones", milestone, "slices", filename)))
  );
}

// -- GSD 2 STATE.md parser --

/**
 * Parses GSD 2 STATE.md content into GSD2ProjectState.
 *
 * Handles multiple YAML frontmatter blocks (gray-matter only parses the first).
 * Strategy: split on "\n---\n" boundaries, find all YAML blocks, use the LAST one.
 * This ensures the most recent state is used when STATE.md has accumulated history.
 */
export function parseGSD2State(raw: string): GSD2ProjectState {
  // Find all segments between --- delimiters
  // STATE.md may look like: ---\nblock1\n---\ncontent\n---\nblock2\n---\ncontent
  const segments = raw.split(/\n---\n|\r\n---\r\n/);

  // Collect all YAML-containing segments (those that look like frontmatter)
  // A frontmatter segment starts with "---\n" or is preceded by "---"
  // After splitting on \n---\n, even-indexed segments (0, 2, 4...) are frontmatter candidates
  // We want the LAST frontmatter block that has meaningful content
  let lastYamlData: Record<string, unknown> = {};

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (!seg) continue;

    // Try to parse this segment as YAML frontmatter
    try {
      const parsed = matter(`---\n${seg}\n---\n`);
      const data = parsed.data;
      // Only accept if it has at least one recognized GSD2 state field
      if (
        data.gsd_state_version !== undefined ||
        data.milestone !== undefined ||
        data.status !== undefined ||
        data.active_milestone !== undefined
      ) {
        lastYamlData = data as Record<string, unknown>;
      }
    } catch {
      // Not valid YAML, skip
    }
  }

  // Also try parsing with gray-matter directly on the full content
  // to catch single-block STATE.md files
  try {
    const directParsed = matter(raw);
    const directData = directParsed.data as Record<string, unknown>;
    if (
      directData.gsd_state_version !== undefined ||
      directData.active_milestone !== undefined
    ) {
      // If we got data from direct parse and segments didn't find anything better,
      // or if direct parse has active_milestone but lastYamlData doesn't, prefer segments result
      // The segment approach finds the LAST block; only use direct if no segments found
      if (Object.keys(lastYamlData).length === 0) {
        lastYamlData = directData;
      }
    }
  } catch {
    // ignore
  }

  const d = lastYamlData;

  return {
    gsd_state_version: typeof d.gsd_state_version === "string"
      ? d.gsd_state_version
      : typeof d.gsd_state_version === "number"
        ? String(d.gsd_state_version)
        : DEFAULT_GSD2_PROJECT_STATE.gsd_state_version,
    milestone: typeof d.milestone === "string"
      ? d.milestone
      : DEFAULT_GSD2_PROJECT_STATE.milestone,
    milestone_name: typeof d.milestone_name === "string"
      ? d.milestone_name
      : DEFAULT_GSD2_PROJECT_STATE.milestone_name,
    status: typeof d.status === "string"
      ? d.status
      : DEFAULT_GSD2_PROJECT_STATE.status,
    active_milestone: typeof d.active_milestone === "string"
      ? d.active_milestone
      : DEFAULT_GSD2_PROJECT_STATE.active_milestone,
    active_slice: typeof d.active_slice === "string"
      ? d.active_slice
      : DEFAULT_GSD2_PROJECT_STATE.active_slice,
    active_task: typeof d.active_task === "string"
      ? d.active_task
      : DEFAULT_GSD2_PROJECT_STATE.active_task,
    auto_mode: typeof d.auto_mode === "boolean"
      ? d.auto_mode
      : DEFAULT_GSD2_PROJECT_STATE.auto_mode,
    cost: typeof d.cost === "number"
      ? d.cost
      : DEFAULT_GSD2_PROJECT_STATE.cost,
    tokens: typeof d.tokens === "number"
      ? d.tokens
      : DEFAULT_GSD2_PROJECT_STATE.tokens,
    last_updated: typeof d.last_updated === "string"
      ? d.last_updated
      : DEFAULT_GSD2_PROJECT_STATE.last_updated,
    ...(typeof d.last_activity === "string" ? { last_activity: d.last_activity } : {}),
  };
}

/**
 * Reads the roadmap file for the active milestone, with fallback scan of milestones/ directory.
 * Logs all paths attempted to aid debugging when STATE.md pointers are stale or missing.
 */
async function readRoadmapWithFallback(gsdDir: string, active_milestone: string): Promise<string | null> {
  const filename = `${active_milestone}-ROADMAP.md`;
  console.log(`[state-deriver] Looking for roadmap: ${filename} (milestone: ${active_milestone})`);

  const primary = await readMilestoneFile(gsdDir, active_milestone, filename);
  if (primary) {
    console.log(`[state-deriver] Roadmap found via primary path`);
    return primary;
  }

  // Fallback: scan .gsd/milestones/ for any *-ROADMAP.md
  const milestonesDir = join(gsdDir, "milestones");
  console.log(`[state-deriver] Primary not found; scanning: ${milestonesDir}`);
  try {
    const entries = await readdir(milestonesDir);
    for (const entry of entries) {
      const roadmapPath = join(milestonesDir, entry, `${entry}-ROADMAP.md`);
      const scanned = await readFileText(roadmapPath);
      if (scanned) {
        console.log(`[state-deriver] Roadmap found via scan: ${roadmapPath}`);
        return scanned;
      }
    }
  } catch (err) {
    console.log(`[state-deriver] Milestones scan failed: ${err}`);
  }

  console.log(`[state-deriver] No roadmap found for milestone: ${active_milestone}`);
  return null;
}

// -- Migration detection --

/**
 * Detects whether the project needs migration from GSD v1 (.planning/) to GSD 2 (.gsd/).
 * Returns true when .planning/ exists but .gsd/ does not.
 */
async function checkMigrationNeeded(repoRoot: string, gsdDir: string): Promise<boolean> {
  try {
    await access(join(repoRoot, ".planning"));
    // .planning exists — now check if .gsd does NOT exist
    try {
      await access(gsdDir);
      return false; // .gsd exists — no migration needed
    } catch {
      return true; // .planning exists but .gsd does not — migration needed
    }
  } catch {
    return false; // .planning does not exist — not a v1 project
  }
}

// -- Preferences parser --

function parsePreferences(raw: string): GSD2Preferences {
  try {
    const parsed = matter(raw);
    const d = parsed.data as Record<string, unknown>;
    const prefs: GSD2Preferences = {};

    if (typeof d.research_model === "string") prefs.research_model = d.research_model;
    if (typeof d.planning_model === "string") prefs.planning_model = d.planning_model;
    if (typeof d.execution_model === "string") prefs.execution_model = d.execution_model;
    if (typeof d.completion_model === "string") prefs.completion_model = d.completion_model;
    if (typeof d.budget_ceiling === "number") prefs.budget_ceiling = d.budget_ceiling;
    if (d.skill_discovery === "auto" || d.skill_discovery === "suggest" || d.skill_discovery === "off") {
      prefs.skill_discovery = d.skill_discovery;
    }

    return prefs;
  } catch {
    return {};
  }
}

// -- Slice data parsers --

/**
 * Parses M{NNN}-ROADMAP.md raw content into a GSD2RoadmapState.
 *
 * Slice sections are identified by `## S{NN}` headings.
 * Status is determined from badge text: PLANNED, IN PROGRESS, NEEDS REVIEW, COMPLETE.
 * Returns safe empty defaults on missing or malformed input — never throws.
 */
export function parseRoadmap(raw: string): GSD2RoadmapState {
  const empty: GSD2RoadmapState = { milestoneId: "M001", milestoneName: "", slices: [] };

  if (!raw || !raw.trim()) return empty;

  // Extract milestone ID and name from first `# M001 —` heading or frontmatter
  let milestoneId = "M001";
  let milestoneName = "";

  // Try frontmatter first
  try {
    const fm = matter(raw);
    if (typeof fm.data.milestone_id === "string") milestoneId = fm.data.milestone_id;
    if (typeof fm.data.milestone_name === "string") milestoneName = fm.data.milestone_name;
  } catch {
    // ignore
  }

  // Fall back to `# M001 — Name`, `# M001: Name`, or `# M001 Name` heading
  const milestoneHeading = raw.match(/^#\s+(M\d+)(?:[:\s]+[—–-]\s+(.+)|[:\s]+(.+))?$/m);
  if (milestoneHeading) {
    if (!milestoneId || milestoneId === "M001") milestoneId = milestoneHeading[1];
    if (!milestoneName) {
      milestoneName = (milestoneHeading[2] || milestoneHeading[3] || "").trim();
    }
  }

  // Strategy 1: Heading-based slices — `## S01 — Name [STATUS]`
  const slices: GSD2SliceInfo[] = [];
  const sliceSectionRegex = /^##\s+(S\d+)\s+[—–-]\s+([^\[]+)\s*(?:\[([^\]]+)\])?/gm;
  let sliceMatch: RegExpExecArray | null;

  while ((sliceMatch = sliceSectionRegex.exec(raw)) !== null) {
    const id = sliceMatch[1];
    const name = sliceMatch[2].trim();
    const badgeRaw = (sliceMatch[3] ?? "").toUpperCase();

    let status: SliceStatus = "planned";
    if (badgeRaw === "COMPLETE") status = "complete";
    else if (badgeRaw === "IN PROGRESS") status = "in_progress";
    else if (badgeRaw === "NEEDS REVIEW") status = "needs_review";
    else if (badgeRaw === "PLANNED") status = "planned";

    // Find the body of this slice section (until next ## heading or EOF)
    const sectionStart = sliceMatch.index;
    const nextSectionMatch = raw.slice(sectionStart + 1).search(/^##\s+/m);
    const sectionEnd = nextSectionMatch >= 0 ? sectionStart + 1 + nextSectionMatch : raw.length;
    const sectionBody = raw.slice(sectionStart, sectionEnd);

    // Extract task count from "N tasks" pattern
    const taskCountMatch = sectionBody.match(/(\d+)\s+tasks?/i);
    const taskCount = taskCountMatch ? parseInt(taskCountMatch[1], 10) : 0;

    // Extract cost estimate from "~$N.NN" pattern
    const costMatch = sectionBody.match(/~\$(\d+(?:\.\d+)?)/);
    const costEstimate = costMatch ? parseFloat(costMatch[1]) : null;

    // Extract branch from "gsd/M{NNN}/S{NN}" pattern
    const branchMatch = sectionBody.match(/gsd\/M\d+\/S\d+/);
    const branch = branchMatch ? branchMatch[0] : `gsd/${milestoneId}/${id}`;

    // Parse dependencies from "Depends on: SXX Name" lines
    const depLines = sectionBody.matchAll(/Depends\s+on:\s+(S\d+)\s*(.*)/gi);
    const dependencies: GSD2SliceInfo["dependencies"] = [];
    for (const depMatch of depLines) {
      const depId = depMatch[1];
      const depName = depMatch[2].trim();
      dependencies.push({ id: depId, name: depName, complete: false });
    }

    slices.push({ id, name, status, taskCount, costEstimate, branch, dependencies });
  }

  // Strategy 2: List-based slices from `## Slices` section (GSD2 checklist format)
  // Format: `- [x] **S01: Name** \`risk:...\` \`depends:[S01,S02]\``
  if (slices.length === 0) {
    const listSliceRegex = /^-\s+\[([xX \-])\]\s+\*\*(S\d+):\s+([^*]+?)\*\*(.*?)$/gm;
    let listMatch: RegExpExecArray | null;

    while ((listMatch = listSliceRegex.exec(raw)) !== null) {
      const checkChar = listMatch[1];
      const id = listMatch[2];
      const name = listMatch[3].trim();
      const rest = listMatch[4] ?? "";

      let status: SliceStatus = "planned";
      if (checkChar.toLowerCase() === "x") status = "complete";
      else if (checkChar === "-") status = "in_progress";

      // Parse dependencies from `depends:[S01,S02]` inline code span
      const depsMatch = rest.match(/`depends:\[([^\]]*)\]`/);
      const dependencies: GSD2SliceInfo["dependencies"] = [];
      if (depsMatch?.[1]) {
        for (const depId of depsMatch[1].split(",").map((s) => s.trim()).filter(Boolean)) {
          dependencies.push({ id: depId, name: "", complete: false });
        }
      }

      slices.push({
        id,
        name,
        status,
        taskCount: 0,
        costEstimate: null,
        branch: `gsd/${milestoneId}/${id}`,
        dependencies,
      });
    }
  }

  // Post-process: mark dependency complete based on referenced slice status
  for (const slice of slices) {
    for (const dep of slice.dependencies) {
      const refSlice = slices.find((s) => s.id === dep.id);
      if (refSlice) {
        dep.complete = refSlice.status === "complete";
      }
    }
  }

  return { milestoneId, milestoneName, slices };
}

/**
 * Parses S{NN}-PLAN.md raw content into a GSD2SlicePlan.
 *
 * Tasks are extracted from `## Tasks` section — numbered items `T01: Name [status]`.
 * Cost estimate read from frontmatter `cost_estimate: ~$0.40`.
 * Must-haves read from `## Must-Haves` block.
 * Returns safe empty defaults on missing or malformed input — never throws.
 */
export function parsePlan(raw: string, sliceId: string): GSD2SlicePlan {
  const empty: GSD2SlicePlan = { sliceId, costEstimate: null, tasks: [], mustHaves: [] };

  if (!raw || !raw.trim()) return empty;

  // Parse frontmatter for cost estimate
  let costEstimate: number | null = null;
  try {
    const fm = matter(raw);
    if (typeof fm.data.cost_estimate === "string") {
      const costMatch = (fm.data.cost_estimate as string).match(/~?\$?(\d+(?:\.\d+)?)/);
      if (costMatch) costEstimate = parseFloat(costMatch[1]);
    }
  } catch {
    // ignore
  }

  // Parse tasks from `## Tasks` section
  // Match lines like: `- T01: Name [complete]` or `- T01: Name [pending]`
  const tasks: GSD2TaskEntry[] = [];
  const taskRegex = /^[-*]\s+(T\d+):\s+([^\[]+?)\s*\[(\w+)\]/gm;
  let taskMatch: RegExpExecArray | null;
  while ((taskMatch = taskRegex.exec(raw)) !== null) {
    const id = taskMatch[1];
    const name = taskMatch[2].trim();
    const statusRaw = taskMatch[3].toLowerCase();
    const status: GSD2TaskEntry["status"] = statusRaw === "complete" ? "complete" : "pending";
    tasks.push({ id, name, status });
  }

  // Parse must-haves from `## Must-Haves` section
  const mustHaves: string[] = [];
  const mustHavesMatch = raw.match(/^##\s+Must-Haves?\s*\n([\s\S]*?)(?=^##\s|\s*$)/m);
  if (mustHavesMatch) {
    const block = mustHavesMatch[1];
    const lines = block.split("\n");
    for (const line of lines) {
      const stripped = line.replace(/^[-*]\s+/, "").trim();
      if (stripped) mustHaves.push(stripped);
    }
  }

  return { sliceId, costEstimate, tasks, mustHaves };
}

/**
 * Parses S{NN}-UAT.md raw content into a GSD2UatFile.
 *
 * Parses `- [ ] UAT-01: Description` and `- [x] UAT-01: Description` lines.
 * Returns safe empty defaults on missing or malformed input — never throws.
 */
export function parseUat(raw: string, sliceId: string): GSD2UatFile {
  const empty: GSD2UatFile = { sliceId, items: [] };

  if (!raw || !raw.trim()) return empty;

  const items: GSD2UatItem[] = [];
  const uatRegex = /^-\s+\[([ xX])\]\s+(UAT-\d+):\s+(.+)$/gm;
  let uatMatch: RegExpExecArray | null;

  while ((uatMatch = uatRegex.exec(raw)) !== null) {
    const checkMark = uatMatch[1];
    const id = uatMatch[2];
    const text = uatMatch[3].trim();
    const checked = checkMark.toLowerCase() === "x";
    items.push({ id, text, checked });
  }

  return { sliceId, items };
}

// -- Git branch data helper --

/**
 * Reads git commit count and last commit message for a given branch.
 * Returns { commits: 0, lastMessage: "" } if branch not found or any error occurs.
 */
async function readGitBranchData(
  repoRoot: string,
  branch: string
): Promise<{ commits: number; lastMessage: string }> {
  const defaultResult = { commits: 0, lastMessage: "" };
  if (!branch) return defaultResult;

  try {
    // Check if branch exists
    const branchCheck = Bun.spawn(
      ["git", "branch", "--list", branch],
      { cwd: repoRoot, stdout: "pipe", stderr: "pipe" }
    );
    const branchOut = await new Response(branchCheck.stdout).text();
    await branchCheck.exited;

    if (!branchOut.trim()) return defaultResult;

    // Get commit count on this branch
    const countProc = Bun.spawn(
      ["git", "rev-list", "--count", branch],
      { cwd: repoRoot, stdout: "pipe", stderr: "pipe" }
    );
    const countOut = await new Response(countProc.stdout).text();
    await countProc.exited;

    const commits = parseInt(countOut.trim(), 10) || 0;

    // Get last commit message
    const msgProc = Bun.spawn(
      ["git", "log", "-1", "--format=%s", branch],
      { cwd: repoRoot, stdout: "pipe", stderr: "pipe" }
    );
    const msgOut = await new Response(msgProc.stdout).text();
    await msgProc.exited;

    const lastMessage = msgOut.trim();

    return { commits, lastMessage };
  } catch {
    return defaultResult;
  }
}

// -- Main entry point --

/**
 * Builds the complete GSD2State from a .gsd/ directory.
 * This is the main entry point for state derivation.
 *
 * Phase 1: Read STATE.md → parse active pointers
 * Phase 2: Parallel read of all derived files using dynamic paths
 * Phase 3: Parse preferences.md with gray-matter
 * Phase 4: Check migration status
 *
 * All missing files return null — never throws.
 * Calling this twice on the same files produces identical output.
 */
export async function buildFullState(gsdDir: string): Promise<GSD2State> {
  // Phase 1: Read STATE.md to get active pointers
  const stateRaw = await readFileText(join(gsdDir, "STATE.md"));
  const projectState: GSD2ProjectState = stateRaw
    ? parseGSD2State(stateRaw)
    : { ...DEFAULT_GSD2_PROJECT_STATE };

  const { active_milestone, active_slice, active_task } = projectState;

  // Phase 2: Parallel read of all derived and static files
  // Milestone and slice files use helpers that fall back to subdirectory layout:
  //   .gsd/{filename} → .gsd/milestones/{M}/  and  .gsd/milestones/{M}/slices/
  const [
    roadmapRaw,
    planRaw,
    summaryRaw,
    decisionsRaw,
    prefsRaw,
    projectRaw,
    contextRaw,
    uatRaw,
  ] = await Promise.all([
    readRoadmapWithFallback(gsdDir, active_milestone),
    readSliceFile(gsdDir, active_milestone, `${active_slice}-PLAN.md`),
    readSliceFile(gsdDir, active_milestone, `${active_task}-SUMMARY.md`),
    readFileText(join(gsdDir, "DECISIONS.md")),
    readFileText(join(gsdDir, "preferences.md")),
    readFileText(join(gsdDir, "PROJECT.md")),
    readMilestoneFile(gsdDir, active_milestone, `${active_milestone}-CONTEXT.md`),
    readSliceFile(gsdDir, active_milestone, `${active_slice}-UAT.md`),
  ]);

  // Phase 3: Build typed sub-state objects
  const roadmap: GSD2RoadmapState | null = roadmapRaw ? parseRoadmap(roadmapRaw) : null;
  const slices: GSD2SliceInfo[] = roadmapRaw ? parseRoadmap(roadmapRaw).slices : [];
  const activePlan: GSD2SlicePlan | null = planRaw
    ? parsePlan(planRaw, active_slice)
    : null;
  const activeTask: GSD2TaskSummary | null = summaryRaw
    ? { taskId: active_task, sliceId: active_slice, summary: summaryRaw.slice(0, 200) }
    : null;
  const uatFile: GSD2UatFile | null = uatRaw ? parseUat(uatRaw, active_slice) : null;
  const preferences: GSD2Preferences | null = prefsRaw
    ? parsePreferences(prefsRaw)
    : null;

  // Phase 4: Migration detection
  const repoRoot = resolve(gsdDir, "..");
  const needsMigration = await checkMigrationNeeded(repoRoot, gsdDir);

  // Phase 5: Read git branch data for active slice (non-blocking, defaults to 0/"")
  const activeSliceBranch = `gsd/${active_milestone}/${active_slice}`;
  const { commits: gitBranchCommits, lastMessage: lastCommitMessage } =
    await readGitBranchData(repoRoot, activeSliceBranch);

  // Phase 6: Scan all milestones from .gsd/milestones/ for stacked view
  const allMilestones: GSD2RoadmapState[] = [];
  try {
    const milestonesDir = join(gsdDir, "milestones");
    const milestoneEntries = await readdir(milestonesDir, { withFileTypes: true });
    const milestoneDirs = milestoneEntries
      .filter((e) => e.isDirectory() && /^M\d+$/i.test(e.name))
      .map((e) => e.name)
      .sort();

    for (const milestoneId of milestoneDirs) {
      const roadmapPath = join(milestonesDir, milestoneId, `${milestoneId}-ROADMAP.md`);
      const raw = await readFileText(roadmapPath);
      if (raw) {
        const parsed = parseRoadmap(raw);
        allMilestones.push(parsed);
      }
    }
  } catch {
    // milestones/ dir not present — fall back to active milestone only
  }

  // If scan found nothing, use the active roadmap as the single milestone
  if (allMilestones.length === 0 && roadmap) {
    allMilestones.push(roadmap);
  }

  return {
    projectState,
    roadmap,
    activePlan,
    activeTask,
    decisions: decisionsRaw,
    preferences,
    project: projectRaw,
    milestoneContext: contextRaw,
    needsMigration,
    slices,
    allMilestones,
    uatFile,
    gitBranchCommits,
    lastCommitMessage,
  };
}
