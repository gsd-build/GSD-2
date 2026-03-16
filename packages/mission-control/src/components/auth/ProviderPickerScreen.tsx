import { useState } from "react";
import { GsdLogo } from "@/components/sidebar/GsdLogo";
import { OAuthConnectFlow } from "./OAuthConnectFlow";
import { ApiKeyForm } from "./ApiKeyForm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProviderID = "anthropic" | "github-copilot" | "openrouter" | "api-key";
type FlowState = "idle" | "oauth-pending" | "api-key-form" | "error";
type AuthType = "oauth" | "api-key";

interface ProviderCard {
  id: ProviderID;
  displayName: string;
  subtitle: string;
  authType: AuthType;
}

const PROVIDERS: ProviderCard[] = [
  {
    id: "anthropic",
    displayName: "Claude Max",
    subtitle: "Anthropic · OAuth — instant setup",
    authType: "oauth",
  },
  {
    id: "github-copilot",
    displayName: "GitHub Copilot",
    subtitle: "OAuth via GitHub — instant setup",
    authType: "oauth",
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    subtitle: "Multi-model routing · Paste your API key",
    authType: "api-key",
  },
  {
    id: "api-key",
    displayName: "API Key",
    subtitle: "Any provider · Paste your API key",
    authType: "api-key",
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProviderPickerScreenProps {
  heading?: string;
  onAuthenticated: (provider: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProviderPickerScreen({
  heading = "Connect your AI provider to start building",
  onAuthenticated,
}: ProviderPickerScreenProps) {
  const [selected, setSelected] = useState<ProviderID | null>(null);
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleConnect = () => {
    if (!selected) return;

    const provider = PROVIDERS.find((p) => p.id === selected);
    if (!provider) return;

    setError(null);

    if (provider.authType === "oauth") {
      setFlowState("oauth-pending");
    } else {
      setFlowState("api-key-form");
    }
  };

  // --- OAuth device-code flow in progress ---
  if (flowState === "oauth-pending" && selected) {
    return (
      <div style={styles.fullScreen}>
        <div style={styles.card}>
          <OAuthConnectFlow
            provider={selected}
            onAuthenticated={onAuthenticated}
            onCancel={() => setFlowState("idle")}
            onError={(msg) => {
              setError(msg);
              setFlowState("idle");
            }}
          />
        </div>
      </div>
    );
  }

  // --- API key form ---
  if (flowState === "api-key-form" && selected) {
    return (
      <div style={styles.fullScreen}>
        <div style={styles.card}>
          <ApiKeyForm
            provider={selected}
            onSaved={onAuthenticated}
            onCancel={() => setFlowState("idle")}
            onError={(msg) => {
              setError(msg);
              setFlowState("idle");
            }}
          />
        </div>
      </div>
    );
  }

  // --- Provider picker ---
  return (
    <div style={styles.fullScreen}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <GsdLogo className="h-10 w-10" />
        </div>

        {/* Heading */}
        <h1 style={styles.heading}>GSD Mission Control</h1>
        <p style={styles.subheading}>{heading}</p>

        {/* Provider grid */}
        <div style={styles.grid}>
          {PROVIDERS.map((provider) => {
            const isSelected = selected === provider.id;
            return (
              <button
                key={provider.id}
                onClick={() => setSelected(provider.id)}
                style={{
                  ...styles.providerCard,
                  ...(isSelected ? styles.providerCardSelected : {}),
                }}
              >
                <span style={styles.providerName}>{provider.displayName}</span>
                <span style={styles.providerSubtitle}>{provider.subtitle}</span>
              </button>
            );
          })}
        </div>

        {/* Error display */}
        {error && <p style={styles.errorText}>{error}</p>}

        {/* CTA button */}
        <button
          onClick={handleConnect}
          disabled={selected === null}
          style={{
            ...styles.ctaButton,
            ...(selected === null ? styles.ctaButtonDisabled : {}),
          }}
        >
          Connect and start building
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline — GSD design system)
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  fullScreen: {
    position: "fixed",
    inset: 0,
    background: "#0F1419",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    padding: "48px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    background: "#131C2B",
    borderRadius: "12px",
    border: "1px solid #1E2D3D",
  },
  logoRow: {
    display: "flex",
    justifyContent: "center",
  },
  heading: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: "20px",
    color: "#FFFFFF",
    margin: 0,
    textAlign: "center",
  },
  subheading: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "14px",
    color: "#94A3B8",
    margin: 0,
    textAlign: "center",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  providerCard: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "20px",
    background: "#131C2B",
    border: "1px solid #1E2D3D",
    borderRadius: "8px",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 0.15s, background 0.15s",
  },
  providerCardSelected: {
    borderColor: "#5BC8F0",
    background: "rgba(91,200,240,0.08)",
  },
  providerName: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: "14px",
    color: "#FFFFFF",
    fontWeight: 600,
  },
  providerSubtitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
    color: "#94A3B8",
  },
  errorText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#EF4444",
    margin: 0,
    textAlign: "center",
  },
  ctaButton: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: "15px",
    color: "#0F1419",
    background: "#5BC8F0",
    border: "none",
    borderRadius: "8px",
    padding: "14px 24px",
    cursor: "pointer",
    fontWeight: 600,
    transition: "opacity 0.15s",
  },
  ctaButtonDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
};
