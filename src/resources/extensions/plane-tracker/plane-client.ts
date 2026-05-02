/**
 * Plane Tracker — HTTP client for Plane API
 *
 * Reads config from ~/agentic-system/config/plane.env
 * Provides typed methods for issue CRUD.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const REQUEST_TIMEOUT_MS = 15_000;

export interface PlaneConfig {
  url: string;
  apiKey: string;
  workspace: string;
}

export interface PlaneIssue {
  id?: string;
  name: string;
  description_html?: string;
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  state?: string;
  labels?: string[];
  assignees?: string[];
  start_date?: string;
  target_date?: string;
}

// Cache for project ID and state ID lookups
const projectCache = new Map<string, string>();
const stateCache = new Map<string, Map<string, string>>();
const labelCache = new Map<string, Map<string, string>>();

let config: PlaneConfig | null = null;

export function loadConfig(): PlaneConfig | null {
  if (config) return config;

  const envPath = join(homedir(), "agentic-system", "config", "plane.env");
  try {
    const content = readFileSync(envPath, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }

    if (!vars.PLANE_URL || !vars.PLANE_API_KEY || !vars.PLANE_WORKSPACE) {
      return null;
    }

    config = {
      url: vars.PLANE_URL.replace(/\/$/, ""),
      apiKey: vars.PLANE_API_KEY,
      workspace: vars.PLANE_WORKSPACE,
    };
    return config;
  } catch {
    return null;
  }
}

async function planeRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<any> {
  const cfg = loadConfig();
  if (!cfg) throw new Error("Plane not configured (~/agentic-system/config/plane.env)");

  const headers: Record<string, string> = {
    "X-API-Key": cfg.apiKey,
  };

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const url = `${cfg.url}${path}`;
  const response = await fetch(url, init);

  if (response.status === 204) return {};
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const safe = text.length > 200 ? text.slice(0, 200) + "\u2026" : text;
    throw new Error(`Plane API ${response.status}: ${safe}`);
  }

  return response.json();
}

async function resolveProject(name: string): Promise<string> {
  if (projectCache.has(name)) return projectCache.get(name)!;

  const cfg = loadConfig()!;
  const resp = await planeRequest(
    "GET",
    `/api/v1/workspaces/${cfg.workspace}/projects/`,
  );

  const projects = resp.results || resp;
  for (const p of projects) {
    projectCache.set(p.name, p.id);
    // Also cache by identifier/slug
    if (p.identifier) projectCache.set(p.identifier, p.id);
  }

  if (!projectCache.has(name)) {
    throw new Error(`Project not found in Plane: "${name}"`);
  }
  return projectCache.get(name)!;
}

async function resolveState(projectId: string, stateName: string): Promise<string> {
  if (!stateCache.has(projectId)) {
    const cfg = loadConfig()!;
    const resp = await planeRequest(
      "GET",
      `/api/v1/workspaces/${cfg.workspace}/projects/${projectId}/states/`,
    );
    const states = new Map<string, string>();
    for (const s of resp.results || resp) {
      states.set(s.name, s.id);
    }
    stateCache.set(projectId, states);
  }

  const id = stateCache.get(projectId)!.get(stateName);
  if (!id) throw new Error(`State "${stateName}" not found in project ${projectId}`);
  return id;
}

async function ensureLabel(projectId: string, labelName: string, color: string): Promise<string> {
  if (!labelCache.has(projectId)) {
    const cfg = loadConfig()!;
    const resp = await planeRequest(
      "GET",
      `/api/v1/workspaces/${cfg.workspace}/projects/${projectId}/labels/`,
    );
    const labels = new Map<string, string>();
    for (const l of resp.results || resp) {
      labels.set(l.name, l.id);
    }
    labelCache.set(projectId, labels);
  }

  const existing = labelCache.get(projectId)!.get(labelName);
  if (existing) return existing;

  // Create the label
  const cfg = loadConfig()!;
  const created = await planeRequest(
    "POST",
    `/api/v1/workspaces/${cfg.workspace}/projects/${projectId}/labels/`,
    { name: labelName, color },
  );
  labelCache.get(projectId)!.set(labelName, created.id);
  return created.id;
}

// --- Public API ---

export async function createIssue(
  projectName: string,
  name: string,
  description: string,
  options: {
    priority?: string;
    state?: string;
    labels?: string[];
  } = {},
): Promise<{ id: string; name: string }> {
  const projectId = await resolveProject(projectName);

  const issue: any = {
    name,
    description_html: `<p>${description.replace(/\n/g, "<br>")}</p>`,
  };

  if (options.priority) issue.priority = options.priority;

  if (options.state) {
    issue.state = await resolveState(projectId, options.state);
  }

  if (options.labels && options.labels.length > 0) {
    const labelColors: Record<string, string> = {
      feature: "#7c3aed",
      phase: "#3b82f6",
      gate: "#f59e0b",
      builder: "#3b82f6",
      qa: "#10b981",
      ops: "#ef4444",
      research: "#8b5cf6",
      director: "#f59e0b",
    };
    const labelIds: string[] = [];
    for (const label of options.labels) {
      const id = await ensureLabel(projectId, label, labelColors[label] || "#6b7280");
      labelIds.push(id);
    }
    issue.labels = labelIds;
  }

  const cfg = loadConfig()!;
  const result = await planeRequest(
    "POST",
    `/api/v1/workspaces/${cfg.workspace}/projects/${projectId}/issues/`,
    issue,
  );

  return { id: result.id, name: result.name };
}

export async function updateIssue(
  projectName: string,
  issueId: string,
  updates: {
    state?: string;
    priority?: string;
    name?: string;
    description?: string;
  },
): Promise<void> {
  const projectId = await resolveProject(projectName);

  const body: any = {};
  if (updates.name) body.name = updates.name;
  if (updates.priority) body.priority = updates.priority;
  if (updates.description) {
    body.description_html = `<p>${updates.description.replace(/\n/g, "<br>")}</p>`;
  }
  if (updates.state) {
    body.state = await resolveState(projectId, updates.state);
  }

  const cfg = loadConfig()!;
  await planeRequest(
    "PATCH",
    `/api/v1/workspaces/${cfg.workspace}/projects/${projectId}/issues/${issueId}/`,
    body,
  );
}

export async function addComment(
  projectName: string,
  issueId: string,
  comment: string,
): Promise<void> {
  const projectId = await resolveProject(projectName);
  const cfg = loadConfig()!;
  await planeRequest(
    "POST",
    `/api/v1/workspaces/${cfg.workspace}/projects/${projectId}/issues/${issueId}/comments/`,
    { comment_html: `<p>${comment.replace(/\n/g, "<br>")}</p>` },
  );
}

export async function listIssues(
  projectName: string,
  limit: number = 20,
): Promise<Array<{ id: string; name: string; state: string; priority: string }>> {
  const projectId = await resolveProject(projectName);
  const cfg = loadConfig()!;
  const resp = await planeRequest(
    "GET",
    `/api/v1/workspaces/${cfg.workspace}/projects/${projectId}/issues/?per_page=${limit}`,
  );
  return (resp.results || []).map((i: any) => ({
    id: i.id,
    name: i.name,
    state: i.state || "",
    priority: i.priority || "",
  }));
}
