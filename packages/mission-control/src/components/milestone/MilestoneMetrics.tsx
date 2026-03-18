/**
 * MilestoneMetrics — 4-card aggregate stat bar for the Milestone view.
 * Aggregates data across ALL milestones (allMilestones[]) not just the active one.
 *
 * Cards: Current Activity | Total Cost | Time Elapsed | Tokens Used
 */
import { useEffect, useState } from "react";
import type { GSD2State } from "@/server/types";

interface MilestoneMetricsProps {
  gsd2State: GSD2State | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatElapsed(startIso: string): string {
  if (!startIso) return "—";
  const start = new Date(startIso).getTime();
  if (isNaN(start)) return "—";
  const diffMs = Date.now() - start;
  if (diffMs < 0) return "—";
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

function MetricCard({ label, value, sub, accent }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 bg-[#0F1419] rounded-lg border border-[#1E2D3D]">
      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`font-mono text-sm font-bold truncate ${accent ? "text-[#5BC8F0]" : "text-slate-200"}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] font-mono text-slate-500 truncate">{sub}</span>}
    </div>
  );
}

export function MilestoneMetrics({ gsd2State }: MilestoneMetricsProps) {
  // Tick every second to update elapsed time
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!gsd2State) {
    return (
      <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-[#1E2D3D]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-navy-700 animate-pulse" />
        ))}
      </div>
    );
  }

  const { projectState, allMilestones } = gsd2State;

  // Current Activity
  const activeSliceId = projectState.active_slice;
  const activeSliceName = allMilestones
    .flatMap((m) => m.slices)
    .find((s) => s.id === activeSliceId)?.name ?? "";
  const activityLabel = projectState.auto_mode && activeSliceId
    ? `${activeSliceId}${activeSliceName ? ` · ${activeSliceName}` : ""}`
    : "Idle";
  const activitySub = projectState.auto_mode ? "Running" : "No active session";

  // Total Cost — sum costEstimates across ALL milestones + running cost from projectState
  const estimatedTotal = allMilestones
    .flatMap((m) => m.slices)
    .reduce((sum, s) => sum + (s.costEstimate ?? 0), 0);
  const runningCost = projectState.cost ?? 0;
  const totalCost = estimatedTotal + runningCost;

  // Time Elapsed — since last_updated when auto_mode, else "—"
  const elapsed = projectState.auto_mode
    ? formatElapsed(projectState.last_updated)
    : "—";

  // Tokens
  const tokens = projectState.tokens ?? 0;

  return (
    <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-[#1E2D3D]">
      <MetricCard
        label="Current Activity"
        value={activityLabel}
        sub={activitySub}
        accent={projectState.auto_mode}
      />
      <MetricCard
        label="Total Cost"
        value={`$${totalCost.toFixed(2)}`}
        sub={estimatedTotal > 0 ? `est. $${estimatedTotal.toFixed(2)} across all` : undefined}
      />
      <MetricCard
        label="Time Elapsed"
        value={elapsed}
        sub={projectState.auto_mode ? "active session" : undefined}
      />
      <MetricCard
        label="Tokens Used"
        value={formatTokens(tokens)}
        sub={tokens > 0 ? `${tokens.toLocaleString()} total` : undefined}
      />
    </div>
  );
}
