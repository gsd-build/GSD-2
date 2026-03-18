<overview>
Model and provider management — switching models, registering custom providers with OAuth, and reacting to model changes.
</overview>

<switching_models>
```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-sonnet-4-5");
if (model) {
  const success = await pi.setModel(model);
  if (!success) ctx.ui.notify("No API key for this model", "error");
}

// Thinking level
pi.getThinkingLevel();  // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
pi.setThinkingLevel("high");  // Clamped to model capabilities
```
</switching_models>

<register_provider>
```typescript
pi.registerProvider("my-proxy", {
  baseUrl: "https://proxy.example.com",
  apiKey: "PROXY_API_KEY",  // Env var name or literal
  api: "anthropic-messages",  // or "openai-completions", "openai-responses"
  headers: { "X-Custom": "value" },  // Optional custom headers
  authHeader: true,  // Auto-add Authorization: Bearer header
  models: [
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude 4 Sonnet (proxy)",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384,
    }
  ],
});

// Override just baseUrl for an existing provider (keeps all models)
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com",
});

// Remove a provider (restores any overridden built-in models)
pi.unregisterProvider("my-proxy");
```

Takes effect immediately after initial load phase — no `/reload` required.
</register_provider>

<oauth_provider>
Register a provider with OAuth support for `/login`:

```typescript
pi.registerProvider("corporate-ai", {
  baseUrl: "https://ai.corp.com",
  api: "openai-responses",
  models: [/* ... */],
  oauth: {
    name: "Corporate AI (SSO)",
    async login(callbacks) {
      callbacks.onAuth({ url: "https://sso.corp.com/..." });
      const code = await callbacks.onPrompt({ message: "Enter code:" });
      return { refresh: code, access: code, expires: Date.now() + 3600000 };
    },
    async refreshToken(credentials) {
      return credentials;  // Refresh logic
    },
    getApiKey(credentials) {
      return credentials.access;
    },
  },
});
```
</oauth_provider>

<model_events>
React to model changes:

```typescript
pi.on("model_select", async (event, ctx) => {
  // event.model — newly selected model
  // event.previousModel — previous model (undefined if first)
  // event.source — "set" | "cycle" | "restore"
  ctx.ui.setStatus("model", `${event.model.provider}/${event.model.id}`);
});
```
</model_events>
