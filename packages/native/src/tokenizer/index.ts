/**
 * BPE token counting via native tiktoken-rs (cl100k_base encoding).
 *
 * The encoder is initialized lazily on first call and cached for the
 * lifetime of the process.
 */

import { native } from "../native.js";

/**
 * Count BPE tokens in a string using cl100k_base encoding.
 */
export function countTokens(text: string): number {
  return native.countTokens(text);
}

/**
 * Count BPE tokens for each string in a batch.
 */
export function countTokensBatch(texts: string[]): number[] {
  return native.countTokensBatch(texts);
}

/**
 * Estimate the token count of a chat message object.
 *
 * Handles string and array content (text, thinking, toolCall, image blocks),
 * bashExecution messages, and summary messages. Adds per-message framing
 * overhead.
 */
export function estimateMessageTokens(
  message: { role: string; content: unknown; [key: string]: unknown },
): number {
  return native.estimateMessageTokens(message);
}
