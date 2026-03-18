import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AuthStorage,
  InMemoryAuthStorageBackend,
} from "@gsd/pi-coding-agent";
import {
  maskKey,
  formatDuration,
  describeCredential,
  findProvider,
  getAllKeyStatuses,
  formatKeyDashboard,
  formatTestResults,
  runKeyDoctor,
  formatDoctorFindings,
  PROVIDER_REGISTRY,
  type TestResult,
  type ProviderInfo,
} from "../key-manager.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeAuth(data: Record<string, any> = {}): AuthStorage {
  return AuthStorage.inMemory(data);
}

// ─── maskKey ────────────────────────────────────────────────────────────────────

describe("maskKey", () => {
  it("masks a normal API key showing first 4 and last 4", () => {
    expect(maskKey("sk-ant-api03-abcdefghijklmnop")).toBe("sk-a***mnop");
  });

  it("masks a short key showing first 2 and last 2", () => {
    expect(maskKey("abc12345")).toBe("ab***45");
  });

  it("returns (empty) for empty string", () => {
    expect(maskKey("")).toBe("(empty)");
  });

  it("handles very short keys gracefully", () => {
    expect(maskKey("ab")).toBe("ab***ab");
  });

  it("handles 12-char boundary", () => {
    expect(maskKey("123456789012")).toBe("1234***9012");
  });
});

// ─── formatDuration ─────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(30_000)).toBe("30s");
  });

  it("formats minutes", () => {
    expect(formatDuration(5 * 60_000)).toBe("5m");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
  });

  it("formats exact hours without minutes", () => {
    expect(formatDuration(2 * 60 * 60_000)).toBe("2h");
  });

  it("returns expired for zero or negative", () => {
    expect(formatDuration(0)).toBe("expired");
    expect(formatDuration(-1000)).toBe("expired");
  });
});

// ─── describeCredential ─────────────────────────────────────────────────────────

describe("describeCredential", () => {
  it("describes an API key with masked value", () => {
    const result = describeCredential({ type: "api_key", key: "sk-ant-test-key-12345" });
    expect(result).toContain("API key");
    expect(result).toContain("sk-a");
    expect(result).toContain("2345");
  });

  it("describes an empty API key", () => {
    expect(describeCredential({ type: "api_key", key: "" })).toBe("empty key");
  });

  it("describes an OAuth token with expiry", () => {
    const result = describeCredential({
      type: "oauth",
      access: "token",
      refresh: "refresh",
      expires: Date.now() + 60 * 60_000,
    });
    expect(result).toContain("OAuth");
    expect(result).toContain("expires in");
  });

  it("describes an expired OAuth token", () => {
    const result = describeCredential({
      type: "oauth",
      access: "token",
      refresh: "refresh",
      expires: Date.now() - 1000,
    });
    expect(result).toContain("expired");
  });
});

// ─── findProvider ───────────────────────────────────────────────────────────────

describe("findProvider", () => {
  it("finds by exact ID", () => {
    expect(findProvider("anthropic")?.id).toBe("anthropic");
  });

  it("finds by ID case-insensitively", () => {
    expect(findProvider("OPENAI")?.id).toBe("openai");
  });

  it("finds by label", () => {
    expect(findProvider("Brave Search")?.id).toBe("brave");
  });

  it("returns undefined for unknown", () => {
    expect(findProvider("nonexistent")).toBeUndefined();
  });
});

// ─── PROVIDER_REGISTRY ──────────────────────────────────────────────────────────

describe("PROVIDER_REGISTRY", () => {
  it("has at least 15 providers", () => {
    expect(PROVIDER_REGISTRY.length).toBeGreaterThanOrEqual(15);
  });

  it("has unique IDs", () => {
    const ids = PROVIDER_REGISTRY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every provider has id, label, and category", () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(["llm", "tool", "search", "remote"]).toContain(p.category);
    }
  });

  it("includes all major LLM providers", () => {
    const ids = PROVIDER_REGISTRY.map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("google");
    expect(ids).toContain("groq");
  });

  it("includes all tool/search providers", () => {
    const ids = PROVIDER_REGISTRY.map((p) => p.id);
    expect(ids).toContain("tavily");
    expect(ids).toContain("brave");
    expect(ids).toContain("context7");
    expect(ids).toContain("jina");
  });
});

// ─── getAllKeyStatuses ───────────────────────────────────────────────────────────

describe("getAllKeyStatuses", () => {
  it("shows unconfigured providers as not configured", () => {
    const auth = makeAuth();
    const statuses = getAllKeyStatuses(auth);
    const anthropic = statuses.find((s) => s.provider.id === "anthropic");
    expect(anthropic?.configured).toBe(false);
    expect(anthropic?.source).toBe("none");
  });

  it("detects keys in auth.json", () => {
    const auth = makeAuth({ anthropic: { type: "api_key", key: "sk-ant-test" } });
    const statuses = getAllKeyStatuses(auth);
    const anthropic = statuses.find((s) => s.provider.id === "anthropic");
    expect(anthropic?.configured).toBe(true);
    expect(anthropic?.source).toBe("auth.json");
    expect(anthropic?.credentialCount).toBe(1);
  });

  it("detects multiple keys", () => {
    const auth = makeAuth({
      openai: [
        { type: "api_key", key: "sk-key1" },
        { type: "api_key", key: "sk-key2" },
      ],
    });
    const statuses = getAllKeyStatuses(auth);
    const openai = statuses.find((s) => s.provider.id === "openai");
    expect(openai?.configured).toBe(true);
    expect(openai?.credentialCount).toBe(2);
    expect(openai?.description).toContain("round-robin");
  });

  it("detects empty keys as not configured", () => {
    const auth = makeAuth({ groq: { type: "api_key", key: "" } });
    const statuses = getAllKeyStatuses(auth);
    const groq = statuses.find((s) => s.provider.id === "groq");
    expect(groq?.configured).toBe(false);
    expect(groq?.description).toContain("empty");
  });

  it("detects env var keys", () => {
    const original = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-env-test";
    try {
      const auth = makeAuth();
      const statuses = getAllKeyStatuses(auth);
      const openai = statuses.find((s) => s.provider.id === "openai");
      expect(openai?.configured).toBe(true);
      expect(openai?.source).toBe("env");
    } finally {
      if (original === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = original;
      }
    }
  });
});

// ─── formatKeyDashboard ─────────────────────────────────────────────────────────

describe("formatKeyDashboard", () => {
  it("includes header and category sections", () => {
    const auth = makeAuth({ anthropic: { type: "api_key", key: "sk-ant-test-key" } });
    const statuses = getAllKeyStatuses(auth);
    const output = formatKeyDashboard(statuses);

    expect(output).toContain("GSD API Key Manager");
    expect(output).toContain("LLM Providers");
    expect(output).toContain("Search Providers");
    expect(output).toContain("Tool Keys");
    expect(output).toContain("Remote Integrations");
  });

  it("shows configured/unconfigured counts", () => {
    const auth = makeAuth({
      anthropic: { type: "api_key", key: "sk-ant-test" },
      tavily: { type: "api_key", key: "tvly-test" },
    });
    const statuses = getAllKeyStatuses(auth);
    const output = formatKeyDashboard(statuses);
    expect(output).toContain("configured");
    expect(output).toContain("auth.json");
  });
});

// ─── formatTestResults ──────────────────────────────────────────────────────────

describe("formatTestResults", () => {
  it("formats valid results with checkmark", () => {
    const results: TestResult[] = [
      {
        provider: { id: "anthropic", label: "Anthropic", category: "llm" },
        status: "valid",
        message: "valid",
        latencyMs: 142,
      },
    ];
    const output = formatTestResults(results);
    expect(output).toContain("✓");
    expect(output).toContain("anthropic");
    expect(output).toContain("142ms");
    expect(output).toContain("1 valid");
  });

  it("formats invalid results with X", () => {
    const results: TestResult[] = [
      {
        provider: { id: "groq", label: "Groq", category: "llm" },
        status: "invalid",
        message: "invalid key (401)",
        latencyMs: 89,
      },
    ];
    const output = formatTestResults(results);
    expect(output).toContain("✗");
    expect(output).toContain("invalid");
  });

  it("formats skipped results with dash", () => {
    const results: TestResult[] = [
      {
        provider: { id: "jina", label: "Jina", category: "tool" },
        status: "skipped",
        message: "not configured",
      },
    ];
    const output = formatTestResults(results);
    expect(output).toContain("—");
    expect(output).toContain("1 skipped");
  });

  it("shows summary counts for mixed results", () => {
    const results: TestResult[] = [
      { provider: { id: "a", label: "A", category: "llm" }, status: "valid", message: "ok", latencyMs: 100 },
      { provider: { id: "b", label: "B", category: "llm" }, status: "invalid", message: "401", latencyMs: 50 },
      { provider: { id: "c", label: "C", category: "tool" }, status: "skipped", message: "n/a" },
    ];
    const output = formatTestResults(results);
    expect(output).toContain("1 valid");
    expect(output).toContain("1 invalid");
    expect(output).toContain("1 skipped");
  });
});

// ─── runKeyDoctor ───────────────────────────────────────────────────────────────

describe("runKeyDoctor", () => {
  it("reports empty keys", () => {
    const auth = makeAuth({ groq: { type: "api_key", key: "" } });
    const findings = runKeyDoctor(auth);
    const emptyFinding = findings.find((f) => f.message.includes("empty key"));
    expect(emptyFinding).toBeDefined();
    expect(emptyFinding?.severity).toBe("warning");
  });

  it("reports expired OAuth", () => {
    const auth = makeAuth({
      anthropic: { type: "oauth", access: "t", refresh: "r", expires: Date.now() - 10_000 },
    });
    const findings = runKeyDoctor(auth);
    const oauthFinding = findings.find((f) => f.message.includes("expired"));
    expect(oauthFinding).toBeDefined();
    expect(oauthFinding?.severity).toBe("warning");
  });

  it("reports soon-to-expire OAuth as info", () => {
    const auth = makeAuth({
      anthropic: { type: "oauth", access: "t", refresh: "r", expires: Date.now() + 2 * 60_000 },
    });
    const findings = runKeyDoctor(auth);
    const oauthFinding = findings.find((f) => f.message.includes("expires in"));
    expect(oauthFinding).toBeDefined();
    expect(oauthFinding?.severity).toBe("info");
  });

  it("reports missing LLM provider", () => {
    // Temporarily clear any LLM env vars that would mask the finding
    const llmEnvVars = [
      "ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN", "OPENAI_API_KEY",
      "GEMINI_API_KEY", "GROQ_API_KEY", "XAI_API_KEY", "OPENROUTER_API_KEY",
      "MISTRAL_API_KEY", "GITHUB_TOKEN", "GH_TOKEN", "COPILOT_GITHUB_TOKEN",
      "OLLAMA_API_KEY", "CUSTOM_OPENAI_API_KEY", "CEREBRAS_API_KEY",
      "AZURE_OPENAI_API_KEY",
    ];
    const saved: Record<string, string | undefined> = {};
    for (const v of llmEnvVars) {
      saved[v] = process.env[v];
      delete process.env[v];
    }
    try {
      const auth = makeAuth();
      const findings = runKeyDoctor(auth);
      const missingLlm = findings.find((f) => f.message.includes("No LLM provider"));
      expect(missingLlm).toBeDefined();
      expect(missingLlm?.severity).toBe("error");
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v !== undefined) process.env[k] = v;
        else delete process.env[k];
      }
    }
  });

  it("does not report missing LLM when one is configured", () => {
    const auth = makeAuth({ anthropic: { type: "api_key", key: "sk-ant-test" } });
    const findings = runKeyDoctor(auth);
    const missingLlm = findings.find((f) => f.message.includes("No LLM provider"));
    expect(missingLlm).toBeUndefined();
  });

  it("reports duplicate keys across providers", () => {
    const auth = makeAuth({
      openai: { type: "api_key", key: "shared-key-123" },
      groq: { type: "api_key", key: "shared-key-123" },
    });
    const findings = runKeyDoctor(auth);
    const dupFinding = findings.find((f) => f.message.includes("Same key used"));
    expect(dupFinding).toBeDefined();
    expect(dupFinding?.severity).toBe("warning");
  });

  it("reports env var conflicts", () => {
    const original = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "env-key";
    try {
      const auth = makeAuth({ openai: { type: "api_key", key: "different-key" } });
      const findings = runKeyDoctor(auth);
      const conflict = findings.find((f) => f.message.includes("differs from auth.json"));
      expect(conflict).toBeDefined();
      expect(conflict?.severity).toBe("warning");
    } finally {
      if (original === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = original;
      }
    }
  });

  it("returns empty when everything is healthy", () => {
    const auth = makeAuth({ anthropic: { type: "api_key", key: "sk-ant-healthy" } });
    const findings = runKeyDoctor(auth);
    // May have some findings from file permissions check, filter to non-file issues
    const nonFileFindings = findings.filter((f) => !f.message.includes("auth.json permissions"));
    expect(nonFileFindings.length).toBe(0);
  });
});

// ─── formatDoctorFindings ───────────────────────────────────────────────────────

describe("formatDoctorFindings", () => {
  it("shows all-clear for no findings", () => {
    const output = formatDoctorFindings([]);
    expect(output).toContain("All checks passed");
  });

  it("shows findings with appropriate icons", () => {
    const output = formatDoctorFindings([
      { severity: "error", message: "No LLM provider configured" },
      { severity: "warning", provider: "groq", message: "Empty key" },
      { severity: "fixed", message: "Permissions fixed" },
    ]);
    expect(output).toContain("✗");
    expect(output).toContain("⚠");
    expect(output).toContain("✓");
    expect(output).toContain("1 error");
    expect(output).toContain("1 warning");
    expect(output).toContain("1 fixed");
  });
});
