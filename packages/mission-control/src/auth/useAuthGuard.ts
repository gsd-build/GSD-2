/**
 * useAuthGuard.ts
 *
 * Checks on app load whether the provider picker must be shown.
 * Reads auth status from /api/auth/status (Bun server) — works in both
 * browser dev mode and Tauri with no isTauri() branching required.
 */

import { useState, useEffect } from "react";
import { getActiveProvider } from "./auth-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthGuardState =
  | { status: "checking" }
  | { status: "authenticated"; provider: string }
  | { status: "needs_picker" };

export interface UseAuthGuardResult {
  state: AuthGuardState;
  setAuthenticated: (provider: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuthGuard(): UseAuthGuardResult {
  const [state, setState] = useState<AuthGuardState>({ status: "checking" });

  const setAuthenticated = (provider: string) => {
    setState({ status: "authenticated", provider });
  };

  useEffect(() => {
    getActiveProvider().then((provider) => {
      setState(provider ? { status: "authenticated", provider } : { status: "needs_picker" });
    });
  }, []);

  return { state, setAuthenticated };
}
