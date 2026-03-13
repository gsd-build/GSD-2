import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/shared/ProgressBar";
import type { GSD2State, SliceAction } from "@/server/types";

interface MilestoneHeaderProps {
  gsd2State: GSD2State | null;
  onStartNext?: () => void;
}

export function MilestoneHeader({ gsd2State, onStartNext }: MilestoneHeaderProps) {
  if (!gsd2State) {
    return (
      <div className="border-b border-navy-600 p-4">
        <div className="mb-2 h-4 w-24 animate-pulse rounded bg-navy-700" />
        <div className="h-6 w-48 animate-pulse rounded bg-navy-700" />
      </div>
    );
  }

  const milestoneId = gsd2State.roadmap?.milestoneId ?? null;
  const milestoneName = gsd2State.roadmap?.milestoneName ?? gsd2State.projectState.milestone_name;
  const totalCost = gsd2State.slices.reduce((sum, s) => sum + (s.costEstimate ?? 0), 0);
  const budgetCeiling = gsd2State.preferences?.budget_ceiling ?? null;

  const budgetRatio = budgetCeiling && budgetCeiling > 0 ? totalCost / budgetCeiling : 0;
  const costColor =
    budgetRatio >= 0.95
      ? "text-[#EF4444]"
      : budgetRatio >= 0.80
        ? "text-[#F59E0B]"
        : "text-[#22C55E]";

  const nextPlannedSlice = gsd2State.slices.find((s) => s.status === "planned") ?? null;
  const showStartNext = !gsd2State.projectState.auto_mode && nextPlannedSlice !== null;

  return (
    <div className="border-b border-navy-600 p-4">
      {/* Milestone ID + branch badge */}
      <div className="mb-2 flex items-center gap-2">
        {milestoneId && (
          <span className={cn(
            "inline-flex items-center rounded bg-navy-700 px-2 py-0.5",
            "font-mono text-xs text-slate-400",
          )}>
            {milestoneId}
          </span>
        )}
        <span className={cn(
          "inline-flex items-center gap-1 rounded bg-navy-700 px-2 py-0.5",
          "font-mono text-xs text-slate-400",
        )}>
          <GitBranch className="h-3 w-3" />
          {gsd2State.projectState.active_slice || gsd2State.projectState.milestone}
        </span>
      </div>

      {/* Milestone name */}
      <h2 className="font-display text-lg font-bold text-cyan-accent">
        {milestoneName}
      </h2>

      {/* Total cost */}
      <p className={cn("mt-1 font-mono text-sm font-medium", totalCost > 0 ? costColor : "text-slate-400")}>
        ${totalCost.toFixed(2)} total cost
        {budgetCeiling && (
          <span className="ml-1 text-xs text-slate-500">/ ${budgetCeiling.toFixed(2)} ceiling</span>
        )}
      </p>

      {/* Budget ceiling bar */}
      {budgetCeiling && budgetCeiling > 0 && (
        <div className="mt-2">
          <ProgressBar value={Math.min(budgetRatio * 100, 100)} />
        </div>
      )}

      {/* Start next slice shortcut */}
      {showStartNext && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onStartNext}
            disabled={!onStartNext}
            className={cn(
              "rounded bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400",
              "transition-colors hover:bg-cyan-500/20",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            Start next slice: {nextPlannedSlice!.id} {nextPlannedSlice!.name}
          </button>
        </div>
      )}
    </div>
  );
}
