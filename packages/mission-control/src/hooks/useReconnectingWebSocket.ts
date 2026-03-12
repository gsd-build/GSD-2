/**
 * Auto-reconnecting WebSocket hook with exponential backoff.
 *
 * Exports:
 * - useReconnectingWebSocket: React hook for WebSocket with auto-reconnect
 * - calculateBackoffDelay: Pure function for exponential backoff calculation
 * - shouldProcessMessage: Pure function for sequence-based message filtering
 * - applyStateUpdate: Pure function for applying StateDiff to PlanningState
 */
import { useEffect, useRef, useState, useCallback } from "react";
import type { PlanningState, StateDiff } from "../server/types";

// -- Pure functions (exported for testing) --

/**
 * Calculate reconnection delay with exponential backoff and jitter.
 * Formula: min(baseDelay * 2^attempt, maxDelay) + jitter(0-10%)
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = delay * 0.1 * Math.random();
  return delay + jitter;
}

/**
 * Determine if an onopen event represents a reconnect (vs the first connection).
 * Returns true when attemptBeforeConnect > 0, meaning at least one previous attempt was made.
 */
export function isReconnect(attemptBeforeConnect: number): boolean {
  return attemptBeforeConnect > 0;
}

/**
 * Determine if a message should be processed based on sequence number.
 * Only process messages with sequence strictly greater than lastProcessed.
 */
export function shouldProcessMessage(
  messageSequence: number,
  lastProcessed: number
): boolean {
  return messageSequence > lastProcessed;
}

/**
 * Apply a StateDiff to the current PlanningState.
 * - "full": replace entire state with changes (must contain complete PlanningState)
 * - "diff": shallow merge changes into existing state (requires existing state)
 */
export function applyStateUpdate(
  currentState: PlanningState | null,
  message: StateDiff
): PlanningState | null {
  if (message.type === "full") {
    // Full messages contain the complete state in changes
    return message.changes as PlanningState;
  }

  if (message.type === "diff") {
    // Cannot apply diff without a base state
    if (currentState === null) {
      return null;
    }
    // Shallow merge: overwrite top-level keys from changes
    return { ...currentState, ...message.changes };
  }

  return currentState;
}

// -- React hook types --

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface ReconnectingWebSocketOptions {
  onMessage?: (data: unknown) => void;
  /** Called when the WebSocket reconnects after a previous disconnect (not on first connect). */
  onReconnect?: () => void;
}

export interface ReconnectingWebSocketResult {
  status: ConnectionStatus;
  send: (msg: string) => void;
}

/**
 * React hook that provides an auto-reconnecting WebSocket connection.
 * On disconnect, schedules reconnect with exponential backoff (1s base, 30s cap, 10% jitter).
 * Resets attempt counter on successful connection.
 */
export function useReconnectingWebSocket(
  url: string,
  options?: ReconnectingWebSocketOptions
): ReconnectingWebSocketResult {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(options?.onMessage);
  const onReconnectRef = useRef(options?.onReconnect);

  // Keep callback refs current without re-triggering effect
  onMessageRef.current = options?.onMessage;
  onReconnectRef.current = options?.onReconnect;

  const connect = useCallback(() => {
    setStatus("connecting");
    const ws = new WebSocket(url);

    ws.onopen = () => {
      const wasReconnect = isReconnect(attemptRef.current);
      setStatus("connected");
      attemptRef.current = 0;
      if (wasReconnect && onReconnectRef.current) {
        onReconnectRef.current();
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
      const delay = calculateBackoffDelay(attemptRef.current);
      attemptRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // Errors always trigger onclose, so reconnect is handled there
    };

    ws.onmessage = (event) => {
      if (onMessageRef.current) {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch {
          // Ignore malformed messages
        }
      }
    };

    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    }
  }, []);

  return { status, send };
}
