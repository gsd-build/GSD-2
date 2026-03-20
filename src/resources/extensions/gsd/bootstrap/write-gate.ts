const MILESTONE_CONTEXT_RE = /M\d+(?:-[a-z0-9]{6})?-CONTEXT\.md$/;

let depthVerificationDone = false;
let activeQueuePhase = false;

export function isDepthVerified(): boolean {
  return depthVerificationDone;
}

export function isQueuePhaseActive(): boolean {
  return activeQueuePhase;
}

export function setQueuePhaseActive(active: boolean): void {
  activeQueuePhase = active;
}

export function resetWriteGateState(): void {
  depthVerificationDone = false;
}

export function clearDiscussionFlowState(): void {
  depthVerificationDone = false;
  activeQueuePhase = false;
}

export function markDepthVerified(): void {
  depthVerificationDone = true;
}

export function shouldBlockContextWrite(
  toolName: string,
  inputPath: string,
  milestoneId: string | null,
  depthVerified: boolean,
  queuePhaseActive?: boolean,
): { block: boolean; reason?: string } {
  if (toolName !== "write") return { block: false };

  const inDiscussion = milestoneId !== null;
  const inQueue = queuePhaseActive ?? false;
  if (!inDiscussion && !inQueue) return { block: false };
  if (!MILESTONE_CONTEXT_RE.test(inputPath)) return { block: false };
  if (depthVerified) return { block: false };

  return {
    block: true,
    reason: `Blocked: Cannot write to milestone CONTEXT.md during discussion phase without depth verification. Call ask_user_questions with question id "depth_verification" first to confirm discussion depth before writing context.`,
  };
}

