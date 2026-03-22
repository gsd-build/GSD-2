/**
 * Mobile Socket Protocol
 *
 * Defines the message types for bidirectional WebSocket communication
 * between a self-hosted GSD server and a mobile client app.
 *
 * All messages are JSON-encoded and follow a { type, ...payload } format.
 */

// ============================================================================
// Client → Server Messages
// ============================================================================

/** Authenticate with a pairing token */
export interface MobileAuthMessage {
  type: "auth";
  token: string;
  deviceName?: string;
  platform?: "ios" | "android" | "web";
}

/** List available sessions */
export interface MobileListSessionsMessage {
  type: "list_sessions";
  id: string;
  query?: string;
  sortMode?: "threaded" | "recent" | "relevance";
}

/** Attach to a session's event stream */
export interface MobileAttachSessionMessage {
  type: "attach_session";
  id: string;
  sessionPath: string;
}

/** Detach from the current session */
export interface MobileDetachSessionMessage {
  type: "detach_session";
  id: string;
}

/** Send a prompt to the active session */
export interface MobilePromptMessage {
  type: "prompt";
  id: string;
  message: string;
}

/** Send a steer message to interrupt/redirect the agent */
export interface MobileSteerMessage {
  type: "steer";
  id: string;
  message: string;
}

/** Abort the current agent operation */
export interface MobileAbortMessage {
  type: "abort";
  id: string;
}

/** Get current session state */
export interface MobileGetStateMessage {
  type: "get_state";
  id: string;
}

/** Get session messages/history */
export interface MobileGetMessagesMessage {
  type: "get_messages";
  id: string;
}

/** Create a new session */
export interface MobileNewSessionMessage {
  type: "new_session";
  id: string;
}

/** Switch to a different session */
export interface MobileSwitchSessionMessage {
  type: "switch_session";
  id: string;
  sessionPath: string;
}

/** Respond to an extension UI request */
export interface MobileExtensionUIResponseMessage {
  type: "extension_ui_response";
  id: string;
  requestId: string;
  value?: string;
  values?: string[];
  confirmed?: boolean;
  cancelled?: boolean;
}

/** Browse all sessions for the project (full discovery) */
export interface MobileBrowseSessionsMessage {
  type: "browse_sessions";
  id: string;
  query?: string;
  sortMode?: "recent" | "threaded";
}

/** Request a session handoff — take over the active desktop session */
export interface MobileHandoffRequestMessage {
  type: "handoff_request";
  id: string;
  /** If set, request handoff of this specific session. Otherwise, take the active session. */
  sessionPath?: string;
}

/** Resume last session on reconnect */
export interface MobileResumeMessage {
  type: "resume";
  id: string;
  /** The session path the client was last attached to */
  lastSessionPath?: string;
  /** The device token (for identifying returning clients) */
  deviceId?: string;
}

/** Ping to keep connection alive */
export interface MobilePingMessage {
  type: "ping";
}

export type MobileClientMessage =
  | MobileAuthMessage
  | MobileListSessionsMessage
  | MobileAttachSessionMessage
  | MobileDetachSessionMessage
  | MobilePromptMessage
  | MobileSteerMessage
  | MobileAbortMessage
  | MobileGetStateMessage
  | MobileGetMessagesMessage
  | MobileNewSessionMessage
  | MobileSwitchSessionMessage
  | MobileExtensionUIResponseMessage
  | MobileBrowseSessionsMessage
  | MobileHandoffRequestMessage
  | MobileResumeMessage
  | MobilePingMessage;

// ============================================================================
// Server → Client Messages
// ============================================================================

/** Authentication result */
export interface MobileAuthResultMessage {
  type: "auth_result";
  success: boolean;
  error?: string;
  serverVersion?: string;
  projectCwd?: string;
}

/** Response to a client request */
export interface MobileResponseMessage {
  type: "response";
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Session event forwarded from the bridge */
export interface MobileSessionEventMessage {
  type: "session_event";
  event: unknown;
}

/** Bridge status update */
export interface MobileBridgeStatusMessage {
  type: "bridge_status";
  phase: string;
  sessionId: string | null;
  sessionName?: string;
  isStreaming: boolean;
}

/** Extension UI request forwarded to mobile */
export interface MobileExtensionUIRequestMessage {
  type: "extension_ui_request";
  requestId: string;
  method: string;
  title: string;
  message?: string;
  options?: string[];
  placeholder?: string;
}

/** Pong response to ping */
export interface MobilePongMessage {
  type: "pong";
}

/** Session changed on the server (desktop switched, another mobile client took over, etc.) */
export interface MobileSessionChangedMessage {
  type: "session_changed";
  /** The new active session */
  sessionId: string | null;
  sessionPath: string | null;
  sessionName?: string;
  /** Who triggered the change */
  changedBy: "desktop" | "mobile" | "server";
  /** If another mobile client took over, their device name */
  changedByDevice?: string;
}

/** Result of a handoff request */
export interface MobileHandoffResultMessage {
  type: "handoff_result";
  id: string;
  success: boolean;
  error?: string;
  /** Session info on success */
  sessionId?: string;
  sessionPath?: string;
  sessionName?: string;
  /** Current session state snapshot */
  messageCount?: number;
  isStreaming?: boolean;
  phase?: string;
}

/** Server is shutting down */
export interface MobileServerShutdownMessage {
  type: "server_shutdown";
  reason?: string;
}

export type MobileServerMessage =
  | MobileAuthResultMessage
  | MobileResponseMessage
  | MobileSessionEventMessage
  | MobileBridgeStatusMessage
  | MobileExtensionUIRequestMessage
  | MobileSessionChangedMessage
  | MobileHandoffResultMessage
  | MobilePongMessage
  | MobileServerShutdownMessage;
