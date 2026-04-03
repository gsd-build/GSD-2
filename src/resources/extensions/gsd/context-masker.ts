/**
 * Observation masking for GSD auto-mode sessions.
 *
 * Replaces tool result content older than N turns with a placeholder.
 * Reduces context bloat between compactions with zero LLM overhead.
 * Preserves message ordering, roles, and all assistant/user messages.
 */

interface MaskableMessage {
  role: string;
  content: string;
  type?: string;
}

const MASK_PLACEHOLDER = "[result masked — within summarized history]";

function findTurnBoundary(messages: MaskableMessage[], keepRecentTurns: number): number {
  let turnsSeen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].type === "user") {
      turnsSeen++;
      if (turnsSeen >= keepRecentTurns) return i;
    }
  }
  return 0;
}

const MASKABLE_TYPES = new Set(["toolResult", "bashExecution"]);

export function createObservationMask(keepRecentTurns: number = 8) {
  return (messages: MaskableMessage[]): MaskableMessage[] => {
    const boundary = findTurnBoundary(messages, keepRecentTurns);
    if (boundary === 0) return messages;

    return messages.map((m, i) => {
      if (i >= boundary) return m;
      if (MASKABLE_TYPES.has(m.type ?? "")) {
        return { ...m, content: MASK_PLACEHOLDER };
      }
      return m;
    });
  };
}
