# Native Search Cloud Code Assist Payload Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the native Anthropic web-search extension from emitting malformed Cloud Code Assist request payloads for Antigravity Claude models.

**Architecture:** Keep the fix inside the web-search extension hook. Add a regression for the Cloud Code Assist payload shape, then narrow the hook so it only mutates supported Anthropic-style payloads instead of treating every `claude-*` model as a direct Anthropic request.

**Tech Stack:** TypeScript, Node test runner, GSD extension hooks

---

## Chunk 1: Native Search Hook

### Task 1: Add the failing regression

**Files:**
- Modify: `src/tests/native-search.test.ts`
- Test: `src/tests/native-search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
test("before_provider_request does not inject top-level tools into Cloud Code Assist Claude payloads", async () => {
  const payload = {
    model: "claude-sonnet-4-6-20250514",
    request: {
      contents: [],
      tools: [{ functionDeclarations: [{ name: "bash" }] }],
    },
  };
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/native-search.test.ts`
Expected: FAIL because the hook currently creates `payload.tools` for the Cloud Code Assist request.

- [ ] **Step 3: Write minimal implementation**

```typescript
// Only mutate supported Anthropic payload shapes.
// Skip Cloud Code Assist / Antigravity request envelopes.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/native-search.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tests/native-search.test.ts src/resources/extensions/search-the-web/native-search.ts docs/superpowers/plans/2026-03-13-native-search-cloud-code-assist.md
git commit -m "fix: skip native search injection for cloud code assist payloads"
```
