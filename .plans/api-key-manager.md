# API Key Manager — Implementation Plan

## Problem Statement

GSD has solid API key infrastructure (AuthStorage, OAuth flows, rate-limit backoff, multi-key rotation) but lacks a user-facing CLI for day-to-day key management. Users currently must either:
- Run the full onboarding wizard to add keys
- Manually edit `~/.gsd/agent/auth.json`
- Use the limited `/gsd setup keys` flow (only covers 5 tool keys, no LLM keys)

There's no way to list, test, remove, or inspect key health from the CLI.

## Scope

Build `/gsd keys` — a comprehensive API key management command with subcommands:

```
/gsd keys                    → Show key status dashboard
/gsd keys list               → List all configured keys with status
/gsd keys add <provider>     → Add/replace a key for a provider
/gsd keys remove <provider>  → Remove a key for a provider
/gsd keys test [provider]    → Validate key(s) by making a lightweight API call
/gsd keys rotate <provider>  → Remove old key and prompt for new one
/gsd keys doctor             → Health check all keys (expired OAuth, empty keys, backoff state)
```

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/resources/extensions/gsd/key-manager.ts` | Core key manager logic (list, add, remove, test, rotate, doctor) |
| `src/resources/extensions/gsd/tests/key-manager.test.ts` | Unit tests |

### Modified Files

| File | Change |
|------|--------|
| `src/resources/extensions/gsd/commands.ts` | Add `/gsd keys` subcommand routing + completions |

### No changes to core packages

All work stays in the GSD extension layer. We use `AuthStorage` as-is — no modifications to `pi-coding-agent` or `pi-ai`.

---

## Phase 1: Key Status Dashboard (`/gsd keys` and `/gsd keys list`)

### What it shows

```
GSD API Key Manager

  LLM Providers
  ✓ anthropic        — OAuth (expires in 23h 41m)
  ✓ openai           — API key (sk-...a4Bf)
  ✗ google           — not configured
  ✗ groq             — not configured (env: GROQ_API_KEY)

  Tool Keys
  ✓ tavily           — API key (tvly-...x92k)
  ✓ context7         — API key (c7-...m3np)
  ✗ brave            — not configured (env: BRAVE_API_KEY)
  ✗ jina             — not configured (env: JINA_API_KEY)

  Remote Integrations
  ✓ discord_bot      — API key (configured)
  ✗ slack_bot        — not configured
  ✗ telegram_bot     — not configured

  Search Providers
  ✓ tavily           — API key (tvly-...x92k)

  Source: ~/.gsd/agent/auth.json
  3 keys configured | 2 from env vars | 1 OAuth token
```

### Implementation

- Read all known provider IDs from `env-api-keys.ts` envMap + LLM_PROVIDER_IDS + TOOL_KEYS
- Check `authStorage.has()`, `authStorage.get()`, and `getEnvApiKey()` for each
- For API keys: show masked preview (first 4 + last 4 chars)
- For OAuth: show expiration time remaining
- For env vars: indicate source is environment
- Group by category (LLM, Tools, Remote, Search)
- Show backoff status if any keys are currently backed off

---

## Phase 2: Add Key (`/gsd keys add <provider>`)

### Flow

1. If `<provider>` not specified → show interactive provider picker (grouped by category)
2. If provider has OAuth available → offer "Browser login" or "API key" choice
3. For API key: masked password input → prefix validation → save to auth.json
4. For OAuth: delegate to existing `authStorage.login()` flow
5. Confirm save with masked preview

### Provider Registry

Build a unified provider registry that merges:
- `LLM_PROVIDER_IDS` from onboarding.ts
- `TOOL_KEYS` from commands.ts
- `envMap` from env-api-keys.ts
- Remote bot tokens (discord_bot, slack_bot, telegram_bot)

Each entry has:
```typescript
interface ProviderInfo {
  id: string
  label: string
  category: 'llm' | 'tool' | 'search' | 'remote'
  envVar?: string           // Known env var name
  prefixes?: string[]       // Expected key prefixes for validation
  hasOAuth?: boolean        // Whether OAuth login is available
  dashboardUrl?: string     // Where to get the key
}
```

---

## Phase 3: Remove Key (`/gsd keys remove <provider>`)

### Flow

1. If `<provider>` not specified → show picker of configured keys only
2. Confirm removal (show what will be removed)
3. Call `authStorage.remove(provider)`
4. Clear corresponding env var from process.env
5. Notify success

### Multi-key handling

If a provider has multiple keys (round-robin), show:
```
anthropic has 3 API keys configured:
  [1] sk-ant-...a4Bf
  [2] sk-ant-...x92k
  [3] sk-ant-...m3np
Remove: all | specific index?
```

---

## Phase 4: Test Key (`/gsd keys test [provider]`)

### Validation Strategy

For each provider, make the lightest possible API call:

| Provider | Test Method |
|----------|------------|
| anthropic | `POST /v1/messages` with `max_tokens: 1` and a trivial prompt |
| openai | `GET /v1/models` (list models endpoint) |
| google | `GET /v1beta/models` |
| groq | `GET /openai/v1/models` |
| brave | `GET /res/v1/web/search?q=test&count=1` |
| tavily | `POST /search` with minimal params |
| context7 | Lightweight search query |
| jina | `GET /` health check |
| discord_bot | `GET /api/v10/users/@me` |
| slack_bot | `POST auth.test` |
| telegram_bot | `GET /getMe` |

### Output

```
Testing API keys...

  ✓ anthropic     — valid (claude-sonnet-4-20250514 available)    142ms
  ✓ openai        — valid (gpt-4o available)                      89ms
  ✗ groq          — invalid (401 Unauthorized)
  ✓ tavily        — valid                                         203ms
  ⚠ brave         — rate limited (retry in 28s)
  — jina          — skipped (not configured)

3 valid | 1 invalid | 1 rate-limited | 1 skipped
```

### Error Classification

- 401/403 → "invalid key"
- 429 → "rate limited (retry in Xs)"
- 5xx → "server error"
- timeout → "unreachable"
- success → "valid" + model info if available

---

## Phase 5: Rotate Key (`/gsd keys rotate <provider>`)

### Flow

1. Show current key (masked)
2. Prompt for new key
3. Validate prefix format
4. Optionally test the new key before saving (`/gsd keys test` logic)
5. Replace in auth.json
6. Update process.env
7. Confirm

---

## Phase 6: Key Doctor (`/gsd keys doctor`)

### Checks

1. **Expired OAuth tokens** — OAuth credentials past their expiration
2. **Empty keys** — Providers with empty string keys (from skipped onboarding)
3. **Duplicate keys** — Same key stored under multiple providers
4. **Missing required keys** — LLM provider not configured at all
5. **Backoff state** — Keys currently in rate-limit backoff
6. **Env var conflicts** — Key in auth.json differs from env var
7. **File permissions** — auth.json not 0o600

### Output

```
API Key Health Check

  ⚠ anthropic: OAuth token expires in 4m — will auto-refresh
  ✗ groq: empty key stored (from skipped setup) — run /gsd keys add groq
  ⚠ openai: env var OPENAI_API_KEY differs from auth.json — env takes priority
  ✗ auth.json permissions: 0644 (should be 0600) — fixing...
  ✓ No duplicate keys found
  ✓ No keys in backoff state

2 warnings | 1 issue fixed | 1 action needed
```

---

## Integration Points

### Command Registration (commands.ts)

Add to the `/gsd` subcommand router:
```typescript
if (trimmed === "keys" || trimmed.startsWith("keys ")) {
  const keysArgs = trimmed.replace(/^keys\s*/, "").trim();
  await handleKeys(keysArgs, ctx);
  return;
}
```

Add tab completions for `keys` subcommands:
```typescript
if (parts[0] === "keys" && parts.length <= 2) {
  // list, add, remove, test, rotate, doctor
}
```

### Redirect `/gsd setup keys`

Update `handleSetup` to route `keys` to the new handler instead of `handleConfig`.

### Help Text

Add to the help output in the appropriate category.

---

## Testing Strategy

### Unit Tests (`key-manager.test.ts`)

1. **Provider registry** — All known providers have correct metadata
2. **Key masking** — Masks correctly for various key lengths
3. **Status formatting** — Dashboard output matches expected format
4. **Add key** — Stores via AuthStorage.inMemory()
5. **Remove key** — Removes correctly, handles multi-key providers
6. **Doctor checks** — Detects expired OAuth, empty keys, permission issues
7. **Test key result formatting** — Correct status symbols and messages

### Integration-level (manual)

- Full add → test → rotate → remove flow
- OAuth provider login flow
- Multi-key round-robin after adding multiple keys

---

## Implementation Order

1. **Phase 1** — `key-manager.ts` with provider registry + list/status dashboard
2. **Phase 2** — Add key (interactive picker + validation)
3. **Phase 3** — Remove key (with multi-key handling)
4. **Phase 4** — Test key (lightweight API calls per provider)
5. **Phase 5** — Rotate key (remove + add in one flow)
6. **Phase 6** — Key doctor (health checks)
7. **Wire up** — Command registration, completions, help text, redirect setup keys
8. **Tests** — Unit tests for all phases

---

## Out of Scope

- Encrypted-at-rest storage (would require a master password / keyring integration — separate effort)
- Per-project key scoping (would require project-level auth.json — separate effort)
- Key usage tracking/audit log (would require persistent metrics — separate effort)
- Changes to `pi-coding-agent` or `pi-ai` packages
