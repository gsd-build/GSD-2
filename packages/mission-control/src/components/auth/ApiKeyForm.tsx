import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { saveApiKey } from "@/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PROVIDER_OPTIONS = ["openai", "anthropic", "gemini", "other"] as const;
type FlexibleProvider = (typeof PROVIDER_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApiKeyFormProps {
  provider: string; // "openrouter" | "api-key"
  onSaved: (provider: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiKeyForm({ provider, onSaved, onCancel, onError }: ApiKeyFormProps) {
  const isOpenRouter = provider === "openrouter";

  // If provider is "openrouter", lock the name; otherwise let user choose.
  const [providerName, setProviderName] = useState<string>(
    isOpenRouter ? "openrouter" : "openai",
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = apiKey.trim().length > 0 && providerName.trim().length > 0;

  const handleSave = async () => {
    if (!isValid || saving) return;

    setError(null);
    setSaving(true);

    try {
      const success = await saveApiKey(providerName, apiKey.trim());
      if (success) {
        onSaved(providerName);
      } else {
        setError("Failed to save key. Please try again.");
        setSaving(false);
      }
    } catch (e) {
      console.error("[ApiKeyForm] saveApiKey threw:", e);
      setError("Failed to save key. Please try again.");
      setSaving(false);
      onError("Failed to save key. Please try again.");
    }
  };

  return (
    <div style={styles.container}>
      {/* Header row */}
      <div style={styles.headerRow}>
        <button onClick={onCancel} style={styles.backButton} aria-label="Back">
          &#8592;
        </button>
        <h2 style={styles.title}>API Key Setup</h2>
      </div>

      {/* Provider selector (only shown for generic "api-key" provider) */}
      {!isOpenRouter && (
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Provider</label>
          <select
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            style={styles.select}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Provider locked label when openrouter */}
      {isOpenRouter && (
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Provider</label>
          <div style={styles.lockedProvider}>OpenRouter</div>
        </div>
      )}

      {/* API Key input */}
      <div style={styles.fieldGroup}>
        <label style={styles.label}>API Key</label>
        <div style={styles.inputWrapper}>
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your API key..."
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            style={styles.eyeButton}
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? (
              <EyeOff size={16} color="#94A3B8" />
            ) : (
              <Eye size={16} color="#94A3B8" />
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && <p style={styles.errorText}>{error}</p>}

      {/* Actions */}
      <div style={styles.actions}>
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          style={{
            ...styles.saveButton,
            ...(!isValid || saving ? styles.saveButtonDisabled : {}),
          }}
        >
          {saving ? "Saving..." : "Save and continue"}
        </button>
        <button onClick={onCancel} style={styles.cancelButton}>
          Cancel
        </button>
      </div>
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
    gap: "20px",
    width: "100%",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  backButton: {
    background: "transparent",
    border: "none",
    color: "#94A3B8",
    cursor: "pointer",
    fontSize: "20px",
    padding: "4px 8px",
    lineHeight: 1,
  },
  title: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: "18px",
    color: "#FFFFFF",
    margin: 0,
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  select: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "14px",
    color: "#FFFFFF",
    background: "#131C2B",
    border: "1px solid #1E2D3D",
    borderRadius: "6px",
    padding: "10px 12px",
    outline: "none",
    cursor: "pointer",
    appearance: "auto",
  },
  lockedProvider: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "14px",
    color: "#FFFFFF",
    background: "#131C2B",
    border: "1px solid #1E2D3D",
    borderRadius: "6px",
    padding: "10px 12px",
  },
  inputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  input: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "14px",
    color: "#FFFFFF",
    background: "#131C2B",
    border: "1px solid #1E2D3D",
    borderRadius: "6px",
    padding: "10px 40px 10px 12px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  eyeButton: {
    position: "absolute",
    right: "10px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: "4px",
  },
  errorText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "13px",
    color: "#EF4444",
    margin: 0,
  },
  actions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  saveButton: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: "14px",
    color: "#0F1419",
    background: "#5BC8F0",
    border: "none",
    borderRadius: "6px",
    padding: "10px 20px",
    cursor: "pointer",
    fontWeight: 600,
    flex: 1,
  },
  saveButtonDisabled: {
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
    padding: "10px 20px",
    cursor: "pointer",
  },
};
