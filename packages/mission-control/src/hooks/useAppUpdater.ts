import { useState, useEffect, useCallback } from 'react';

// Dynamic import so the hook works outside Tauri context (browser dev mode)
async function invokeIfTauri(cmd: string): Promise<unknown> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke(cmd);
  } catch {
    return null;
  }
}

export interface AppUpdaterState {
  updateReady: boolean;
  installing: boolean;
  error: string | null;
}

export function useAppUpdater() {
  const [state, setState] = useState<AppUpdaterState>({
    updateReady: false,
    installing: false,
    error: null,
  });

  useEffect(() => {
    // Check for update on mount (non-blocking — runs after first render)
    invokeIfTauri('check_for_updates')
      .then((hasUpdate) => {
        if (hasUpdate === true) {
          setState(s => ({ ...s, updateReady: true }));
        }
      })
      .catch(() => {/* silently ignore — non-critical */});
  }, []);

  const installUpdate = useCallback(async () => {
    setState(s => ({ ...s, installing: true, error: null }));
    try {
      await invokeIfTauri('install_update');
      // App will restart — no further state update needed
    } catch (e) {
      setState(s => ({ ...s, installing: false, error: String(e) }));
    }
  }, []);

  return { ...state, installUpdate };
}
