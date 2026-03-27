/**
 * @gsd/mcp-server — MCP server for GSD orchestration.
 */

export { SessionManager } from './session-manager.js';
export { createMcpServer } from './server.js';
export type {
  SessionStatus,
  ManagedSession,
  ExecuteOptions,
  PendingBlocker,
  CostAccumulator,
} from './types.js';
export { MAX_EVENTS, INIT_TIMEOUT_MS } from './types.js';
