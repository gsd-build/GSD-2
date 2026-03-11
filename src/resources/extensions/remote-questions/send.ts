/**
 * Remote Questions — Entry point
 *
 * Transparent routing: when ctx.hasUI is false and a remote channel is
 * configured, sends questions via Slack/Discord and polls for the response.
 *
 * The LLM keeps calling `ask_user_questions` as normal — this module
 * intercepts the non-interactive branch.
 */

import type { FormattedQuestion, ChannelAdapter, RemoteAnswer } from "./channels.js";
import { resolveRemoteConfig, type ResolvedConfig } from "./config.js";
import { SlackAdapter } from "./slack-adapter.js";
import { DiscordAdapter } from "./discord-adapter.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  header: string;
  question: string;
  options: Array<{ label: string; description: string }>;
  allowMultiple?: boolean;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Try to send questions via a remote channel (Slack/Discord).
 * Returns a formatted ToolResult if successful, or null if no remote
 * channel is configured (caller falls back to the original error).
 */
export async function tryRemoteQuestions(
  questions: Question[],
  signal?: AbortSignal,
): Promise<ToolResult | null> {
  const config = resolveRemoteConfig();
  if (!config) return null;

  const adapter = createAdapter(config);
  const formatted = questionsToFormatted(questions);

  try {
    await adapter.validate();
  } catch (err) {
    return errorToolResult(`Remote auth failed (${config.channel}): ${(err as Error).message}`);
  }

  let sendResult;
  try {
    sendResult = await adapter.sendQuestions(formatted);
  } catch (err) {
    return errorToolResult(`Failed to send questions via ${config.channel}: ${(err as Error).message}`);
  }

  const threadInfo = sendResult.threadUrl
    ? ` Thread: ${sendResult.threadUrl}`
    : "";

  // Poll for response
  const answer = await pollWithTimeout(adapter, sendResult.ref, formatted, signal, config);

  if (!answer) {
    // Timeout — return structured result so the LLM knows
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            timed_out: true,
            channel: config.channel,
            timeout_minutes: config.timeoutMs / 60000,
            thread_url: sendResult.threadUrl ?? null,
            message: `User did not respond within ${config.timeoutMs / 60000} minutes.${threadInfo}`,
          }),
        },
      ],
      details: {
        remote: true,
        channel: config.channel,
        timed_out: true,
        threadUrl: sendResult.threadUrl,
      },
    };
  }

  // Format the answer in the same structure as formatForLLM
  const formattedAnswer = formatRemoteAnswerForLLM(answer);

  return {
    content: [{ type: "text", text: formattedAnswer }],
    details: {
      remote: true,
      channel: config.channel,
      timed_out: false,
      threadUrl: sendResult.threadUrl,
      questions,
      response: answer,
    },
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

function createAdapter(config: ResolvedConfig): ChannelAdapter & {
  pollResponseWithQuestions?: (
    ref: import("./channels.js").PollReference,
    questions: FormattedQuestion[],
  ) => Promise<RemoteAnswer | null>;
} {
  switch (config.channel) {
    case "slack":
      return new SlackAdapter(config.token, config.channelId);
    case "discord":
      return new DiscordAdapter(config.token, config.channelId);
    default:
      throw new Error(`Unknown channel type: ${config.channel}`);
  }
}

async function pollWithTimeout(
  adapter: ReturnType<typeof createAdapter>,
  ref: import("./channels.js").PollReference,
  questions: FormattedQuestion[],
  signal: AbortSignal | undefined,
  config: ResolvedConfig,
): Promise<RemoteAnswer | null> {
  const deadline = Date.now() + config.timeoutMs;
  let retries = 0;
  const maxNetworkRetries = 1;

  while (Date.now() < deadline && !signal?.aborted) {
    try {
      // Use the question-aware poll if available
      const answer = adapter.pollResponseWithQuestions
        ? await adapter.pollResponseWithQuestions(ref, questions)
        : await adapter.pollResponse(ref);

      if (answer) return answer;
      retries = 0; // Reset on successful poll
    } catch {
      retries++;
      if (retries > maxNetworkRetries) return null;
    }

    await sleep(config.pollIntervalMs, signal);
  }

  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    };

    const onAbort = () => settle();
    const timer = setTimeout(() => settle(), ms);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function questionsToFormatted(questions: Question[]): FormattedQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    header: q.header,
    question: q.question,
    options: q.options,
    allowMultiple: q.allowMultiple ?? false,
  }));
}

/**
 * Format RemoteAnswer into the same JSON structure as the local formatForLLM.
 * Structure: { answers: { [id]: { answers: string[] } } }
 */
function formatRemoteAnswerForLLM(answer: RemoteAnswer): string {
  const formatted: Record<string, { answers: string[] }> = {};
  for (const [id, data] of Object.entries(answer.answers)) {
    const list = [...data.answers];
    if (data.user_note) {
      list.push(`user_note: ${data.user_note}`);
    }
    formatted[id] = { answers: list };
  }
  return JSON.stringify({ answers: formatted });
}

function errorToolResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    details: { remote: true, error: true },
  };
}
