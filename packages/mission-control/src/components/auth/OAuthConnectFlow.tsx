import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OAuthConnectFlowProps {
  provider: string; // "anthropic" | "github-copilot"
  onCancel: () => void;
  onError: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_DISPLAY: Record<string, string> = {
  anthropic: "Claude Max (Anthropic)",
  "github-copilot": "GitHub Copilot",
};

function getProviderDisplay(provider: string): string {
  return PROVIDER_DISPLAY[provider] ?? provider;
}

// Timeout: 5 minutes
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * OAuthConnectFlow — visual waiting screen shown while the OAuth browser flow
 * is in progress. Purely presentational: the actual oauth-callback event is
 * handled by useAuthGuard in the parent.
 *
 * Auto-dismisses with an error after OAUTH_TIMEOUT_MS of no response.
 */
export function OAuthConnectFlow({ provider, onCancel, onError }: OAuthConnectFlowProps) {
  const providerDisplay = getProviderDisplay(provider);

  // Set up timeout on mount
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onError("Authentication timed out. Please try again.");
    }, OAUTH_TIMEOUT_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onError]);

  return (
    <div style={styles.container}>
      {/* Provider name */}
      <h2 style={styles.providerName}>{providerDisplay}</h2>

      {/* Status heading */}
      <p style={styles.statusHeading}>Opening your browser...</p>

      {/* Description */}
      <p style={styles.description}>
        {"We've opened "}
        <strong style={{ color: "#FFFFFF" }}>{providerDisplay}</strong>
        {" in your browser."}
        <br />
        Complete sign-in there, then return here.
      </p>

      {/* Amber spinner */}
      <div style={styles.spinnerWrapper}>
        <div className="gsd-oauth-spinner" style={styles.spinner} />
        <span className="gsd-oauth-pulse" style={styles.spinnerLabel}>Opening in browser...</span>
      </div>

      {/* Cancel */}
      <button onClick={onCancel} style={styles.cancelButton}>
        Cancel
      </button>

      {/* Keyframe animation injected via style tag */}
      <style>{`
        @keyframes gsd-oauth-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes gsd-oauth-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .gsd-oauth-spinner {
          animation: gsd-oauth-spin 1s linear infinite;
        }
        .gsd-oauth-pulse {
          animation: gsd-oauth-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    padding: "8px 0",
  },
  providerName: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: "18px",
    color: "#FFFFFF",
    margin: 0,
    textAlign: "center",
  },
  statusHeading: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "15px",
    color: "#F59E0B",
    margin: 0,
    fontWeight: 600,
  },
  description: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#94A3B8",
    margin: 0,
    textAlign: "center",
    lineHeight: "1.6",
  },
  spinnerWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  spinner: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "3px solid rgba(245,158,11,0.2)",
    borderTopColor: "#F59E0B",
    // Note: animation applied via className below, but we add a fallback here
  } as React.CSSProperties,
  spinnerLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#F59E0B",
  },
  cancelButton: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#94A3B8",
    background: "transparent",
    border: "1px solid #1E2D3D",
    borderRadius: "6px",
    padding: "8px 20px",
    cursor: "pointer",
    transition: "border-color 0.15s, color 0.15s",
  },
};
