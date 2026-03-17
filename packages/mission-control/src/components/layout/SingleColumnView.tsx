/**
 * SingleColumnView — view router for sidebar-driven navigation.
 *
 * Renders one full-width view component based on the active ViewType.
 * Replaces TabLayout's tab-switching mechanism.
 */
import { ChatViewConnected as ChatView } from "@/components/views/ChatView";
import { MilestoneView } from "@/components/views/MilestoneView";
import { HistoryView } from "@/components/views/HistoryView";
import { SettingsView } from "@/components/views/SettingsView";
import { AssetsView } from "@/components/views/AssetsView";
import { ReviewViewWithAnimation } from "@/components/views/ReviewView";
import { RoutingBadge } from "@/components/chat/RoutingBadge";
import { PhaseGateCard } from "@/components/chat/PhaseGateCard";
import { FolderOpen } from "lucide-react";
import type { ViewType } from "@/lib/view-types";
import type { PlanningState } from "@/server/types";
import type { ChatMessage, ReviewResults } from "@/server/chat-types";
import type { SessionTab } from "@/hooks/useSessionManager";
import type { CostState } from "@/hooks/useCostTracker";
import type { MilestoneAction } from "@/components/views/MilestoneView";
import type { IntentType } from "@/server/classify-intent-api";
import type React from "react";

interface SingleColumnViewProps {
  activeView: ViewType;
  planningState: PlanningState | null;
  chatMessages: ChatMessage[];
  onChatSend: (msg: string) => void;
  isChatProcessing: boolean;
  /** Multi-session props */
  sessions?: SessionTab[];
  activeSessionId?: string;
  onSelectSession?: (id: string) => void;
  onCreateSession?: (forkFrom?: string) => void;
  onCloseSession?: (id: string) => void;
  onRenameSession?: (id: string, name: string) => void;
  /** Review mode props — wired from useChatMode via AppShell (Plan 04) */
  reviewResults?: ReviewResults | null;
  onReviewDismiss?: () => void;
  onReviewFix?: (draftMessage: string) => void;
  /** Discuss mode overlay — QuestionCard + DecisionLogDrawer from useChatMode */
  discussOverlay?: React.ReactNode;
  /** Preview toggle — wired from usePreview via AppShell */
  onTogglePreview?: () => void;
  previewOpen?: boolean;
  /**
   * headingRef — programmatic focus target for keyboard panel switching (KEYS-06).
   * Attached to the main element (tabIndex={-1}) so focus moves after Ctrl+1-5.
   * Ref is typed HTMLHeadingElement for usePanelFocus compatibility; attached to main via cast.
   */
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  /** Phase 13 props — wired from useSessionManager via AppShell */
  isAutoMode?: boolean;
  isCrashed?: boolean;
  costState?: CostState;
  onInterrupt?: () => void;
  onDismissCrash?: () => void;
  /** Phase 14 prop — forwards MilestoneView slice actions to AppShell/WebSocket */
  onMilestoneAction?: (action: MilestoneAction) => void;
  /** Phase 18 prop — Builder mode: hides cost badge, slash autocomplete, changes placeholder */
  builderMode?: boolean;
  /** Phase 18-02: Routing badge state after message send in Builder mode */
  routingBadgeState?: {
    intent: Exclude<IntentType, "UI_PHASE_GATE">;
    originalMessage: string;
    sentAs: string;
  } | null;
  /** Phase 18-02: Phase gate intercept state (UI_PHASE_GATE intent) */
  phaseGateState?: { originalMessage: string } | null;
  /** Clear routing badge */
  onClearRoutingBadge?: () => void;
  /** Clear phase gate */
  onClearPhaseGate?: () => void;
  /** Send message bypassing Builder mode classification (for PhaseGate skip path) */
  onSendDirectMessage?: (message: string) => void;
  /** Phase 20.1: Project name to display in the right panel header bar above all views */
  projectName?: string;
}

export function SingleColumnView({
  activeView,
  planningState,
  chatMessages,
  onChatSend,
  isChatProcessing,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onCloseSession,
  onRenameSession,
  reviewResults,
  onReviewDismiss,
  onReviewFix,
  discussOverlay,
  onTogglePreview,
  previewOpen,
  headingRef,
  isAutoMode,
  isCrashed,
  costState,
  onInterrupt,
  onDismissCrash,
  onMilestoneAction,
  builderMode = false,
  routingBadgeState,
  phaseGateState,
  onClearRoutingBadge,
  onClearPhaseGate,
  onSendDirectMessage,
  projectName,
}: SingleColumnViewProps) {
  return (
    // tabIndex={-1} enables programmatic focus after Ctrl+1-5 panel switch (KEYS-06)
    <main
      className="flex-1 min-w-0 h-full overflow-hidden flex flex-col"
      tabIndex={-1}
      ref={headingRef as React.RefObject<HTMLElement | null>}
    >
      {projectName && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-navy-600 bg-navy-900 shrink-0">
          <FolderOpen className="h-3 w-3 text-slate-500" />
          <span className="text-xs font-mono text-slate-400 truncate">{projectName}</span>
        </div>
      )}
      <div key={activeView.kind} className="animate-in fade-in duration-200 flex-1 min-h-0 overflow-hidden">
      {activeView.kind === "chat" && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          {/* Phase gate card — intercept UI_PHASE_GATE intent (BUILDER-04) */}
          {phaseGateState && (
            <PhaseGateCard
              originalMessage={phaseGateState.originalMessage}
              onSetupDesign={() => {
                onClearPhaseGate?.();
                onSendDirectMessage?.("/gsd discuss");
              }}
              onSkip={() => {
                const msg = phaseGateState.originalMessage;
                onClearPhaseGate?.();
                onSendDirectMessage?.(msg);
              }}
            />
          )}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <ChatView
              planningState={planningState}
              chatMessages={chatMessages}
              onChatSend={onChatSend}
              isChatProcessing={isChatProcessing}
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={onSelectSession}
              onCreateSession={onCreateSession}
              onCloseSession={onCloseSession}
              onRenameSession={onRenameSession}
              discussOverlay={discussOverlay}
              onTogglePreview={onTogglePreview}
              previewOpen={previewOpen}
              isAutoMode={isAutoMode}
              isCrashed={isCrashed}
              costState={costState}
              onInterrupt={onInterrupt}
              onDismissCrash={onDismissCrash}
              builderMode={builderMode}
            />
          </div>
          {/* Routing badge — shown after message send in Builder mode (BUILDER-04) */}
          {routingBadgeState && (
            <RoutingBadge
              intent={routingBadgeState.intent}
              originalMessage={routingBadgeState.originalMessage}
              sentAs={routingBadgeState.sentAs}
              onOverride={() => onClearRoutingBadge?.()}
              onDismiss={() => onClearRoutingBadge?.()}
            />
          )}
        </div>
      )}
      {activeView.kind === "milestone" && (
        <MilestoneView
          gsd2State={planningState}
          sessions={sessions?.map((s) => ({
            id: s.id,
            name: s.name,
            worktreePath: s.hasWorktree ? "(worktree)" : null,
            worktreeBranch: s.worktreeBranch,
          }))}
          onAction={onMilestoneAction}
        />
      )}
      {activeView.kind === "history" && (
        <HistoryView />
      )}
      {activeView.kind === "settings" && (
        <SettingsView />
      )}
      {activeView.kind === "assets" && (
        <AssetsView />
      )}
      {activeView.kind === "review" && reviewResults && (
        <ReviewViewWithAnimation
          results={reviewResults}
          onDismiss={onReviewDismiss ?? (() => {})}
          onFix={onReviewFix ?? (() => {})}
        />
      )}
      </div>
    </main>
  );
}
