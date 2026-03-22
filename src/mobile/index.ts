/**
 * GSD Mobile Socket System
 *
 * Self-hosted, installable WebSocket server for accessing GSD sessions
 * from a mobile device. Includes a branded admin dashboard, secure
 * user/pass authentication, and device pairing.
 *
 * Architecture:
 *   Mobile App ←→ WebSocket ←→ MobileSocketServer ←→ BridgeService ←→ Agent Session
 *   Browser    ←→ HTTP      ←→ Admin Dashboard    ←→ Config/Auth
 *
 * Key modules:
 *   - protocol.ts   — Message type definitions for the WebSocket protocol
 *   - auth.ts       — Token-based device pairing and authentication
 *   - config.ts     — Server configuration and credential management
 *   - websocket.ts  — Zero-dependency RFC 6455 WebSocket implementation
 *   - connection.ts — Per-client WebSocket connection handler
 *   - server.ts     — Self-hosted server with dashboard, auth, and TLS
 *   - dashboard.ts  — Branded admin UI (GSD monochrome dark theme)
 *   - cli.ts        — CLI interface for managing the mobile server
 */

export { MobileSocketServer, type MobileSocketServerOptions, type MobileSocketServerInfo } from "./server.ts";
export { MobileAuthManager, type PairedDevice } from "./auth.ts";
export { MobileConnection, type MobileConnectionConfig, type HandoffCallback } from "./connection.ts";
export { runMobileCLI, type MobileCLIOptions } from "./cli.ts";
export { RemoteClient, type RemoteClientOptions } from "./remote-client.ts";
export { startTunnel, detectAvailableMethods, printTunnelInstructions, type TunnelMethod, type TunnelOptions, type TunnelResult } from "./tunnel.ts";
export { SimpleWebSocket, upgradeToWebSocket } from "./websocket.ts";
export {
  loadConfig,
  saveConfig,
  updatePassword,
  updateUsername,
  verifyPassword,
  type ServerConfig,
} from "./config.ts";
export {
  renderLoginPage,
  renderDashboard,
  renderSettingsPage,
  type DashboardData,
  type SettingsData,
} from "./dashboard.ts";

// Re-export protocol types for mobile app development
export type {
  // Client → Server
  MobileClientMessage,
  MobileAuthMessage,
  MobileListSessionsMessage,
  MobileAttachSessionMessage,
  MobileDetachSessionMessage,
  MobilePromptMessage,
  MobileSteerMessage,
  MobileAbortMessage,
  MobileGetStateMessage,
  MobileGetMessagesMessage,
  MobileNewSessionMessage,
  MobileSwitchSessionMessage,
  MobileExtensionUIResponseMessage,
  MobileBrowseSessionsMessage,
  MobileHandoffRequestMessage,
  MobileResumeMessage,
  MobilePingMessage,

  // Server → Client
  MobileServerMessage,
  MobileAuthResultMessage,
  MobileResponseMessage,
  MobileSessionEventMessage,
  MobileBridgeStatusMessage,
  MobileExtensionUIRequestMessage,
  MobileSessionChangedMessage,
  MobileHandoffResultMessage,
  MobilePongMessage,
  MobileServerShutdownMessage,
} from "./protocol.ts";
