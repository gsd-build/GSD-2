import test from "node:test";
import assert from "node:assert/strict";
import googleSearchExtension from "../resources/extensions/google-search/index.ts";

function createMockPI() {
  const handlers: any[] = [];
  let registeredTool: any = null;

  return {
    handlers,
    registeredTool,
    on(event: string, handler: any) {
      handlers.push({ event, handler });
    },
    registerTool(tool: any) {
      this.registeredTool = tool;
    },
    async fire(event: string, eventData: any, ctx: any) {
      for (const h of handlers) {
        if (h.event === event) {
          await h.handler(eventData, ctx);
        }
      }
    }
  };
}

/**
 * Build a mock modelRegistry whose getApiKeyForProvider returns the given
 * JSON string (matching what the real OAuth provider's getApiKey produces).
 */
function mockModelRegistry(oauthJson?: string) {
  return {
    authStorage: {
      hasAuth: async (_id: string) => !!oauthJson,
    },
    getApiKeyForProvider: async (_provider: string) => oauthJson,
  };
}

test("fix: google-search rejects OAuth-only auth when GEMINI_API_KEY is missing", async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  (global as any).fetch = async () => {
    fetchCalls += 1;
    throw new Error("google_search should not attempt OAuth fallback fetch");
  };

  t.after(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalKey;
  });
  const pi = createMockPI();
  googleSearchExtension(pi as any);

  const oauthJson = JSON.stringify({ token: "mock-token", projectId: "mock-project" });
  const mockCtx = {
    ui: { notify() {} },
    modelRegistry: mockModelRegistry(oauthJson),
  };

  await pi.fire("session_start", {}, mockCtx);
  const registeredTool = (pi as any).registeredTool;
  const result = await registeredTool.execute("call-1", { query: "test" }, new AbortController().signal, () => {}, mockCtx);

  assert.equal(fetchCalls, 0, "Should not call the unsupported OAuth fallback");
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("GEMINI_API_KEY"));
  assert.ok(result.content[0].text.includes("OAuth fallback is currently unavailable"));
});

test("google-search warns if NO authentication is present", async (t) => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  t.after(() => process.env.GEMINI_API_KEY = originalKey);
  const pi = createMockPI();
  googleSearchExtension(pi as any);

  const notifications: any[] = [];
  const mockCtx = {
    ui: { notify(msg: string, level: string) { notifications.push({ msg, level }); } },
    modelRegistry: mockModelRegistry(undefined),
  };

  await pi.fire("session_start", {}, mockCtx);
  assert.equal(notifications.length, 1);
  assert.ok(notifications[0].msg.includes("GEMINI_API_KEY"));

  const registeredTool = (pi as any).registeredTool;
  const result = await registeredTool.execute("call-2", { query: "test" }, new AbortController().signal, () => {}, mockCtx);
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("GEMINI_API_KEY"));
});

test("google-search uses GEMINI_API_KEY if present (precedence)", async (t) => {
  process.env.GEMINI_API_KEY = "mock-api-key";

  t.after(() => delete process.env.GEMINI_API_KEY);
  const pi = createMockPI();
  googleSearchExtension(pi as any);

  const notifications: any[] = [];
  const mockCtx = {
    ui: { notify(msg: string, level: string) { notifications.push({ msg, level }); } },
    modelRegistry: mockModelRegistry(JSON.stringify({ token: "should-not-be-used", projectId: "mock-project" })),
  };

  await pi.fire("session_start", {}, mockCtx);
  assert.equal(notifications.length, 0, "Should NOT notify if API Key is present");
});
