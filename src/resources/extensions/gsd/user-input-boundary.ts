const USER_APPROVAL_UNIT_TYPES = new Set([
  "discuss-project",
  "discuss-requirements",
  "discuss-milestone",
  "research-decision",
]);

const REMOTE_QUESTION_FAILURE_RE =
  /(?:Remote (?:auth failed|questions failed|channel configured but returned no result|questions timed out|questions timed out or failed)|Failed to send questions via)/i;

const APPROVAL_WAIT_RE =
  /\bwait(?:ing)?\s+for\s+(?:your\s+)?(?:confirmation|approval|input|response|answer)\b/i;

const APPROVAL_QUESTION_RE =
  /\b(?:confirm|confirmation|approve|approval|approved|captured|correct|correctly|happy\s+with|ready\s+to\s+(?:write|save|proceed|ship)|(?:want|need)\s+to\s+adjust|should\s+I\s+(?:write|save|proceed)|do\s+you\s+want\s+me\s+to\s+(?:write|save|proceed)|ship\s+it)\b/i;

const APPROVAL_RIGHT_QUESTION_RE =
  /\b(?:does|do|is|are|was|were|did)\b[^\n?]{0,120}\bright\b/i;

const APPROVAL_CHANGE_QUESTION_RE =
  /\b(?:anything\s+else|anything|something)\s+to\s+(?:adjust|add|remove|reclassify)\b/i;

const RESEARCH_DECISION_QUESTION_RE =
  /\b(?:research|skip)\b/i;

function extractTextFromMessage(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const typed = block as { type?: unknown; text?: unknown };
    if (typed.type === "text" && typeof typed.text === "string") {
      parts.push(typed.text);
    }
  }
  return parts.join("\n");
}

function lastAssistantText(messages: unknown[] | undefined): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") continue;
    if ((msg as { role?: unknown }).role !== "assistant") continue;
    const text = extractTextFromMessage(msg).trim();
    if (text) return text;
  }
  return "";
}

function anyMessageMatches(messages: unknown[] | undefined, pattern: RegExp): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some((msg) => {
    if (!msg || typeof msg !== "object") return false;
    if ((msg as { role?: unknown }).role === "user") return false;
    return pattern.test(extractTextFromMessage(msg));
  });
}

function hasApprovalQuestion(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "?") continue;
    const previousBreak = Math.max(
      text.lastIndexOf("\n", i),
      text.lastIndexOf(".", i),
      text.lastIndexOf("!", i),
      text.lastIndexOf("?", i - 1),
    );
    const fragment = text.slice(previousBreak + 1, i + 1);
    if (APPROVAL_QUESTION_RE.test(fragment)) return true;
    if (APPROVAL_RIGHT_QUESTION_RE.test(fragment)) return true;
    if (APPROVAL_CHANGE_QUESTION_RE.test(fragment)) return true;
  }
  return false;
}

function hasResearchDecisionQuestion(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "?") continue;
    const previousBreak = Math.max(
      text.lastIndexOf("\n", i),
      text.lastIndexOf(".", i),
      text.lastIndexOf("!", i),
      text.lastIndexOf("?", i - 1),
    );
    const fragment = text.slice(previousBreak + 1, i + 1);
    if (RESEARCH_DECISION_QUESTION_RE.test(fragment)) return true;
  }
  return false;
}

export function approvalGateIdForUnit(
  unitType: string | undefined,
  unitId?: string | null,
): string | null {
  if (!unitType) return null;
  if (unitType === "discuss-project") return "depth_verification_project_confirm";
  if (unitType === "discuss-requirements") return "depth_verification_requirements_confirm";
  if (unitType === "research-decision") return "depth_verification_research_decision_confirm";
  if (unitType === "discuss-milestone") {
    const safeUnitId = typeof unitId === "string" && /^[A-Za-z0-9_-]+$/.test(unitId)
      ? unitId
      : "milestone";
    return `depth_verification_${safeUnitId}_confirm`;
  }
  return null;
}

const CHANGE_REQUEST_RESPONSE_RE =
  /\b(?:no|nope|nah|not\s+yet|don't|do\s+not|change|add|remove|reclassify|adjust|clarify|missing|instead|but|however|wait|hold)\b/i;

const APPROVAL_RESPONSE_RE =
  /^(?:y|yes|yeah|yep|approve|approved|confirm|confirmed|correct|right|looks\s+(?:good|right)|sounds\s+good|all\s+good|ok|okay|go\s+ahead|proceed|write\s+it|save\s+it|do\s+it)\b/i;

const RESEARCH_DECISION_RESPONSE_RE =
  /^(?:research|run\s+research|do\s+research|skip|skip\s+research|no\s+research)\b/i;

export function isExplicitApprovalResponse(
  input: string | undefined,
  pendingGateId?: string | null,
): boolean {
  const text = input?.trim() ?? "";
  if (!text) return false;
  if (pendingGateId?.includes("research_decision")) {
    return RESEARCH_DECISION_RESPONSE_RE.test(text);
  }
  if (CHANGE_REQUEST_RESPONSE_RE.test(text)) return false;
  return APPROVAL_RESPONSE_RE.test(text);
}

export function isAwaitingUserInput(messages: unknown[] | undefined): boolean {
  if (anyMessageMatches(messages, /ask_user_questions was cancelled before receiving a response/i)) return true;
  if (anyMessageMatches(messages, REMOTE_QUESTION_FAILURE_RE)) return true;
  const text = lastAssistantText(messages);
  if (!text) return false;
  if (APPROVAL_WAIT_RE.test(text)) return true;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => line.endsWith("?"))) return true;
  return hasApprovalQuestion(text);
}

export function isAwaitingApprovalBoundary(messages: unknown[] | undefined): boolean {
  if (anyMessageMatches(messages, /ask_user_questions was cancelled before receiving a response/i)) return true;
  if (anyMessageMatches(messages, REMOTE_QUESTION_FAILURE_RE)) return true;
  const text = lastAssistantText(messages);
  if (!text) return false;
  if (APPROVAL_WAIT_RE.test(text)) return true;
  return hasApprovalQuestion(text);
}

export function shouldPauseForUserApprovalQuestion(
  unitType: string | undefined,
  messages: unknown[] | undefined,
): boolean {
  if (!unitType || !USER_APPROVAL_UNIT_TYPES.has(unitType)) return false;
  if (anyMessageMatches(messages, /ask_user_questions was cancelled before receiving a response/i)) return true;
  if (anyMessageMatches(messages, REMOTE_QUESTION_FAILURE_RE)) return true;
  const text = lastAssistantText(messages);
  if (!text) return false;
  if (APPROVAL_WAIT_RE.test(text)) return true;
  if (unitType === "research-decision") return hasResearchDecisionQuestion(text);
  return hasApprovalQuestion(text);
}
