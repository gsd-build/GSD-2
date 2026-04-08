// GSD Watch — Tree renderer: layout engine, badge formatting, ANSI-safe line construction
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { visibleWidth, truncateToWidth } from "@gsd/pi-tui";
import type { MilestoneNode, PhaseNode, PlanNode, NodeStatus } from "./types.js";

// ─── VisibleNode Types ────────────────────────────────────────────────────────

/** Identifies the type of tree node that a rendered line represents. */
export type VisibleNodeKind = "milestone" | "phase" | "plan";

/**
 * Metadata for a single rendered line — maps line index to tree node identity.
 * Used by cursor navigation to identify collapsible phases and track cursor
 * position across file-change refreshes.
 */
export interface VisibleNode {
  kind: VisibleNodeKind;
  milestoneIdx?: number; // index into milestones array, for milestone-level identity
  dirName?: string;   // defined when kind === "phase"
  planId?: string;    // defined when kind === "plan"
}

// ─── ANSI Color Codes ─────────────────────────────────────────────────────────

const RESET   = "\x1b[0m";
const BOLD    = "\x1b[1m";
const DIM     = "\x1b[2m";
const GREEN   = "\x1b[32m";
const YELLOW  = "\x1b[33m";
const RED     = "\x1b[31m";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<NodeStatus, string> = {
  done:    `${GREEN}✓${RESET}`,
  active:  `${YELLOW}◆${RESET}`,
  pending: `${DIM}○${RESET}`,
  blocked: `${RED}✘${RESET}`,
};

const BADGE_FILLED = `${GREEN}●${RESET}`;
const BADGE_EMPTY  = `${DIM}○${RESET}`;

/** Minimum pane width to show plan-level detail. Below this, only phases shown. Per D-13. */
const MIN_WIDTH_FOR_PLANS = 30;

/** Minimum name characters to show when fitting badges. Below this, drop badges. */
const MIN_NAME_WITH_BADGES = 4;

/** Collapsed indicator appended to collapsed phase lines. Per D-08. */
const COLLAPSED_INDICATOR = ` ${DIM}▸${RESET}`;

// ─── Safety Clamp ─────────────────────────────────────────────────────────────

/**
 * Hard-clamp a line to the given width. Ensures no line ever overflows
 * the terminal pane, even if individual truncation calculations are off.
 */
function clampLine(line: string, width: number): string {
  if (visibleWidth(line) <= width) return line;
  return truncateToWidth(line, width, "…");
}

// ─── Badge Formatting ─────────────────────────────────────────────────────────

/**
 * Format badge boolean array as a string of filled/empty circles.
 * Always returns " " + 7 badge characters (8 visible chars total).
 */
function formatBadgeString(badges: boolean[]): string {
  return " " + badges.map((b) => (b ? BADGE_FILLED : BADGE_EMPTY)).join("");
}

// ─── Milestone Line ───────────────────────────────────────────────────────────

/**
 * Format the root milestone header line.
 * No tree prefix — this is the root node.
 */
function formatMilestoneLine(milestone: MilestoneNode, width: number): string {
  const icon = STATUS_ICON[milestone.status];
  const iconWidth = visibleWidth(icon + " ");
  const available = width - iconWidth;
  const name = truncateToWidth(milestone.label, available, "…");
  return clampLine(icon + " " + BOLD + name + RESET, width);
}

// ─── Phase Line ───────────────────────────────────────────────────────────────

/**
 * Format a phase line with status icon, name, and lifecycle badges.
 * Per D-12: name wins over badges on truncation.
 *
 * Layout: prefix + STATUS_ICON + " " + name [+ badgeStr]
 */
function formatPhaseLine(phase: PhaseNode, prefix: string, width: number): string {
  const prefixWidth = visibleWidth(prefix);
  const icon = STATUS_ICON[phase.status];
  const statusWidth = visibleWidth(icon + " ");
  const available = width - prefixWidth - statusWidth;

  const badgeStr = formatBadgeString(phase.badges);
  const badgeWidth = visibleWidth(badgeStr);

  let namePart: string;
  let badgePart: string;

  if (available >= MIN_NAME_WITH_BADGES + badgeWidth) {
    // Enough room for name AND badges
    const nameWidth = available - badgeWidth;
    namePart = truncateToWidth(phase.label, nameWidth, "…");
    badgePart = badgeStr;
  } else {
    // Drop badges — name gets all available space
    namePart = truncateToWidth(phase.label, available, "…");
    badgePart = "";
  }

  return clampLine(prefix + icon + " " + namePart + badgePart, width);
}

// ─── Plan Line ────────────────────────────────────────────────────────────────

/**
 * Format a plan line with status icon and label.
 * No badges on individual plans.
 */
function formatPlanLine(plan: PlanNode, prefix: string, width: number): string {
  const prefixWidth = visibleWidth(prefix);
  const icon = STATUS_ICON[plan.status];
  const statusWidth = visibleWidth(icon + " ");
  const available = width - prefixWidth - statusWidth;
  const name = truncateToWidth(plan.label, available, "…");
  return clampLine(prefix + icon + " " + name, width);
}

// ─── Single Milestone Renderer ───────────────────────────────────────────────

/**
 * Render a single milestone's phases and plans into lines/nodes arrays.
 */
function renderSingleMilestone(
  milestone: MilestoneNode,
  milestoneIdx: number,
  width: number,
  collapsedPhases: Set<string>,
  lines: string[],
  nodes: VisibleNode[]
): void {
  // Milestone header (root node — no tree prefix)
  lines.push(formatMilestoneLine(milestone, width));
  nodes.push({ kind: "milestone", milestoneIdx });

  const phases = milestone.phases;
  for (let pi = 0; pi < phases.length; pi++) {
    const phase = phases[pi];
    const isLastPhase = pi === phases.length - 1;
    const isCollapsed = collapsedPhases.has(phase.dirName);

    // Phase prefix: ├── for non-last, └── for last (dim tree connectors)
    const phasePrefix = isLastPhase ? `${DIM}└── ${RESET}` : `${DIM}├── ${RESET}`;
    let phaseLine = formatPhaseLine(phase, phasePrefix, width);

    if (isCollapsed) {
      // Append ▸ indicator to collapsed phase lines (D-08).
      const indicatorWidth = visibleWidth(COLLAPSED_INDICATOR);
      const currentWidth = visibleWidth(phaseLine);
      if (currentWidth + indicatorWidth > width) {
        phaseLine = truncateToWidth(phaseLine, width - indicatorWidth, "…") + COLLAPSED_INDICATOR;
      } else {
        phaseLine = phaseLine + COLLAPSED_INDICATOR;
      }
    }

    lines.push(phaseLine);
    nodes.push({ kind: "phase", dirName: phase.dirName, milestoneIdx });

    // Skip plan lines for collapsed phases (D-07, D-08)
    if (isCollapsed) {
      continue;
    }

    // Plans are only shown when width is sufficient (D-13)
    if (width >= MIN_WIDTH_FOR_PLANS) {
      const plans = phase.plans;
      for (let pj = 0; pj < plans.length; pj++) {
        const plan = plans[pj];
        const isLastPlan = pj === plans.length - 1;

        // Continuation prefix based on whether this is the last phase (dim tree connectors)
        const continuation = isLastPhase ? "    " : `${DIM}│${RESET}   `;
        const connector = isLastPlan ? `${DIM}└── ${RESET}` : `${DIM}├── ${RESET}`;
        const planPrefix = continuation + connector;

        lines.push(formatPlanLine(plan, planPrefix, width));
        nodes.push({ kind: "plan", planId: plan.id, milestoneIdx });
      }
    }
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Render the project tree as an array of terminal-safe strings, alongside
 * a parallel VisibleNode array identifying each line's tree node.
 *
 * Accepts a single milestone or an array of milestones (from DB or filesystem).
 * Each milestone renders as a root header with its phases/plans underneath.
 * Collapsed milestones show only their header line with a ▸ indicator.
 *
 * @param milestones - The milestone node(s) to render.
 * @param width - Terminal column width for truncation.
 * @param collapsedPhases - Optional set of phase dirName values that are collapsed.
 * @param collapsedMilestones - Optional set of milestone indices that are collapsed.
 * @returns Object with parallel `lines` (string[]) and `nodes` (VisibleNode[]) arrays.
 */
export function renderTreeLines(
  milestones: MilestoneNode | MilestoneNode[],
  width: number,
  collapsedPhases: Set<string> = new Set(),
  collapsedMilestones: Set<number> = new Set()
): { lines: string[]; nodes: VisibleNode[] } {
  const lines: string[] = [];
  const nodes: VisibleNode[] = [];

  // Normalize to array for uniform handling
  const milestoneArray = Array.isArray(milestones) ? milestones : [milestones];

  for (let mi = 0; mi < milestoneArray.length; mi++) {
    // Add blank separator between milestones (only for multi-milestone)
    if (mi > 0 && milestoneArray.length > 1) {
      lines.push("");
      nodes.push({ kind: "milestone", milestoneIdx: mi }); // spacer node
    }

    if (collapsedMilestones.has(mi)) {
      // Collapsed milestone: show header with ▸ indicator only
      let headerLine = formatMilestoneLine(milestoneArray[mi], width);
      const indicatorWidth = visibleWidth(COLLAPSED_INDICATOR);
      const currentWidth = visibleWidth(headerLine);
      if (currentWidth + indicatorWidth > width) {
        headerLine = truncateToWidth(headerLine, width - indicatorWidth, "…") + COLLAPSED_INDICATOR;
      } else {
        headerLine = headerLine + COLLAPSED_INDICATOR;
      }
      lines.push(headerLine);
      nodes.push({ kind: "milestone", milestoneIdx: mi });
    } else {
      renderSingleMilestone(milestoneArray[mi], mi, width, collapsedPhases, lines, nodes);
    }
  }

  return { lines, nodes };
}
