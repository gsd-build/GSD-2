/**
 * MilestoneView — standalone milestone overview with optional split view.
 *
 * Renders SliceAccordion (replacing v1 PhaseList + CommittedHistory).
 * Uses GSD2State fields (slices, projectState) — no more PhaseState[] props.
 *
 * When multiple sessions have active worktrees, shows a stacked view
 * with one section per worktree session. Each section displays the session
 * name + branch badge and standard milestone content.
 *
 * When only one session or no worktrees: renders standard single milestone view.
 */
import { PanelWrapper } from "@/components/layout/PanelWrapper";
import { MilestoneHeader } from "@/components/milestone/MilestoneHeader";
import { SliceAccordion } from "@/components/milestone/SliceAccordion";
import type { GSD2State, SliceAction } from "@/server/types";

export interface WorktreeSessionInfo {
  id: string;
  name: string;
  worktreePath: string | null;
  worktreeBranch?: string | null;
}

interface MilestoneViewProps {
  gsd2State: GSD2State | null;
  /** Optional sessions list — when provided, enables split view for worktree sessions. */
  sessions?: WorktreeSessionInfo[];
  /** Optional action handler — forwarded to SliceAccordion and MilestoneHeader. */
  onAction?: (action: SliceAction) => void;
}

/** Standard milestone content (reused in both single and split views). */
function MilestoneContent({ gsd2State, onAction }: { gsd2State: GSD2State | null; onAction?: (action: SliceAction) => void }) {
  const slices = gsd2State?.slices ?? [];
  const activeSliceId = gsd2State?.projectState.active_slice ?? "";
  const isAutoMode = gsd2State?.projectState.auto_mode ?? false;

  function handleSliceAction(action: SliceAction) {
    if (onAction) {
      onAction(action);
    } else {
      // Log for now — full wiring in 14-03/14-04 connects to WebSocket sendMessage
      console.log("[MilestoneView] SliceAction:", action);
    }
  }

  function handleStartNext() {
    const nextPlanned = slices.find((s) => s.status === "planned");
    if (nextPlanned) {
      handleSliceAction({ type: "start_slice", sliceId: nextPlanned.id });
    }
  }

  return (
    <div className="flex flex-col">
      <MilestoneHeader
        gsd2State={gsd2State}
        onStartNext={handleStartNext}
      />
      <SliceAccordion
        slices={slices}
        activeSliceId={activeSliceId}
        isAutoMode={isAutoMode}
        onAction={handleSliceAction}
      />
    </div>
  );
}

/** Session section header with name and branch badge. */
function SessionSectionHeader({ session }: { session: WorktreeSessionInfo }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-navy-800/50 border-b border-navy-600">
      <span className="font-medium text-sm text-slate-300">{session.name}</span>
      {session.worktreeBranch ? (
        <span className="text-xs px-2 py-0.5 rounded bg-cyan-accent/10 text-cyan-accent font-mono">
          {session.worktreeBranch}
        </span>
      ) : (
        <span className="text-xs px-2 py-0.5 rounded bg-navy-700 text-slate-500">
          Watching main branch
        </span>
      )}
    </div>
  );
}

export function MilestoneView({ gsd2State, sessions, onAction }: MilestoneViewProps) {
  const slices = gsd2State?.slices ?? [];
  const worktreeSessions = sessions?.filter((s) => s.worktreePath) ?? [];

  // Split view: when 2+ sessions have worktrees — stacked vertically
  if (worktreeSessions.length >= 2) {
    return (
      <>
        {/* Screen-reader h1 for this view — PanelWrapper renders an h2 label, not h1 */}
        <h1 className="sr-only">Milestone</h1>
        <PanelWrapper
          title="Milestone"
          isLoading={gsd2State === null}
          isEmpty={gsd2State !== null && slices.length === 0}
        >
          <div className="space-y-4">
            {worktreeSessions.map((session, index) => (
              <div key={session.id} className="animate-in fade-in duration-200 rounded-lg border border-navy-600 overflow-hidden" style={{ animationDelay: `${index * 40}ms` }}>
                <SessionSectionHeader session={session} />
                <div className="overflow-auto max-h-[50vh]">
                  <MilestoneContent gsd2State={gsd2State} onAction={onAction} />
                </div>
              </div>
            ))}
          </div>
        </PanelWrapper>
      </>
    );
  }

  // Standard single view
  return (
    <>
      {/* Screen-reader h1 for this view — PanelWrapper renders an h2 label, not h1 */}
      <h1 className="sr-only">Milestone</h1>
      <PanelWrapper
        title="Milestone"
        isLoading={gsd2State === null}
        isEmpty={gsd2State !== null && slices.length === 0}
      >
        <MilestoneContent gsd2State={gsd2State} onAction={onAction} />
      </PanelWrapper>
    </>
  );
}
