/**
 * Remote Questions — Adapter pattern interfaces
 *
 * Defines the contract for Slack/Discord (or any future) channel adapters.
 */

export interface ChannelAdapter {
  readonly name: string;
  sendQuestions(questions: FormattedQuestion[]): Promise<SendResult>;
  pollResponse(ref: PollReference): Promise<RemoteAnswer | null>;
  validate(): Promise<void>;
}

export interface FormattedQuestion {
  id: string;
  header: string;
  question: string;
  options: Array<{ label: string; description: string }>;
  allowMultiple: boolean;
}

export interface SendResult {
  ref: PollReference;
  threadUrl?: string;
}

export interface PollReference {
  channelType: "slack" | "discord";
  messageId: string;
  threadTs?: string;
  channelId: string;
}

export interface RemoteAnswer {
  answers: Record<string, { answers: string[]; user_note?: string }>;
}
