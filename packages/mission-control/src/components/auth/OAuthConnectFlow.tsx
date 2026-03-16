import { useEffect, useRef, useState } from "react";
import { startDeviceCodeFlow, submitDeviceCode } from "@/auth/auth-api";
import type { AuthEvent } from "@/auth/auth-api";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OAuthConnectFlowProps {
  provider: string;
  onAuthenticated: (provider: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_DISPLAY: Record<string, string> = {
  anthropic: "Claude Max (Anthropic)",
  "github-copilot": "GitHub Copilot",
  "google-antigravity": "Google (Gemini)",
  "google-gemini-cli": "Google (Gemini CLI)",
};

function getProviderDisplay(provider: string): string {
  return PROVIDER_DISPLAY[provider] ?? provider;
}

async function openInBrowser(url: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url }).catch(() => window.open(url, "_blank"));
  } else {
    window.open(url, "_blank");
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Step = "connecting" | "show-url" | "show-code";

export function OAuthConnectFlow({ provider, onAuthenticated, onCancel, onError }: OAuthConnectFlowProps) {
  const providerDisplay = getProviderDisplay(provider);

  const [step, setStep] = useState<Step>("connecting");
  const [authUrl, setAuthUrl] = useState("");
  const [promptMessage, setPromptMessage] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = startDeviceCodeFlow(provider, (event: AuthEvent) => {
      if (event.type === "url") {
        setAuthUrl(event.url);
        setStep("show-url");
        openInBrowser(event.url);
      } else if (event.type === "prompt") {
        setPromptMessage(event.message);
        setStep("show-code");
      } else if (event.type === "done") {
        onAuthenticated(event.provider);
      } else if (event.type === "error") {
        onError(event.message);
      }
      // "progress" events are silently ignored (no UI update needed)
    });
    abortRef.current = abort;
    return () => abort.abort();
  }, [provider, onAuthenticated, onError]);

  const handleSubmitCode = async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    try {
      await submitDeviceCode(provider, code.trim());
      // Server resolves the promise — done/error event will arrive via SSE
    } catch {
      onError("Failed to submit code. Please try again.");
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    onCancel();
  };

  return (
    <div style={styles.container}>
      {/* Provider name */}
      <h2 style={styles.providerName}>{providerDisplay}</h2>

      {/* Step: connecting */}
      {step === "connecting" && (
        <>
          <p style={styles.statusHeading}>Starting authentication…</p>
          <div style={styles.spinnerWrapper}>
            <div className="gsd-oauth-spinner" style={styles.spinner} />
          </div>
        </>
      )}

      {/* Step: show-url — open browser */}
      {step === "show-url" && (
        <>
          <p style={styles.statusHeading}>Complete sign-in in your browser</p>
          <p style={styles.description}>
            Your browser should have opened automatically.
            <br />
            If not, click the button below.
          </p>
          <button
            onClick={() => openInBrowser(authUrl)}
            style={styles.openButton}
          >
            Open browser →
          </button>
          <p style={styles.hint}>
            After you approve access, return here — we'll continue automatically.
          </p>
          <div style={styles.spinnerWrapper}>
            <div className="gsd-oauth-spinner" style={styles.spinner} />
            <span className="gsd-oauth-pulse" style={styles.spinnerLabel}>Waiting for approval…</span>
          </div>
        </>
      )}

      {/* Step: show-code — user must paste code */}
      {step === "show-code" && (
        <>
          <p style={styles.statusHeading}>Enter your authorisation code</p>
          <p style={styles.description}>{promptMessage}</p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmitCode()}
            placeholder="Paste code here…"
            style={styles.codeInput}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <button
            onClick={handleSubmitCode}
            disabled={!code.trim() || submitting}
            style={{
              ...styles.submitButton,
              ...(!code.trim() || submitting ? styles.submitButtonDisabled : {}),
            }}
          >
            {submitting ? "Verifying…" : "Continue"}
          </button>
        </>
      )}

      {/* Cancel */}
      <button onClick={handleCancel} style={styles.cancelButton}>
        Cancel
      </button>

      {/* Keyframe animations */}
      <style>{`
        @keyframes gsd-oauth-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes gsd-oauth-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .gsd-oauth-spinner { animation: gsd-oauth-spin 1s linear infinite; }
        .gsd-oauth-pulse   { animation: gsd-oauth-pulse 2s ease-in-out infinite; }
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
    textAlign: "center",
  },
  description: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#94A3B8",
    margin: 0,
    textAlign: "center",
    lineHeight: "1.6",
  },
  hint: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
    color: "#64748B",
    margin: 0,
    textAlign: "center",
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
  } as React.CSSProperties,
  spinnerLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#F59E0B",
  },
  openButton: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: "14px",
    color: "#0F1419",
    background: "#5BC8F0",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    cursor: "pointer",
    fontWeight: 600,
  },
  codeInput: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "14px",
    color: "#FFFFFF",
    background: "#131C2B",
    border: "1px solid #1E2D3D",
    borderRadius: "6px",
    padding: "10px 14px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
    letterSpacing: "0.05em",
  } as React.CSSProperties,
  submitButton: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: "14px",
    color: "#0F1419",
    background: "#5BC8F0",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    cursor: "pointer",
    fontWeight: 600,
    width: "100%",
  },
  submitButtonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
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
  },
};
