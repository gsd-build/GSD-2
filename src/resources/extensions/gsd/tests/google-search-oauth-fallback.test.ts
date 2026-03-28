import test from "node:test";
import assert from "node:assert/strict";

import registerGoogleSearchExtension from "../../google-search/index.ts";

function createMockPi() {
  const tools = new Map<string, any>();
  const handlers = new Map<string, Array<() => unknown>>();

  return {
    registerCommand() {},
    registerShortcut() {},
    sendMessage() {},
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
    on(event: string, handler: () => unknown) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    tools,
    handlers,
  };
}

test("google_search rejects Gemini CLI OAuth fallback without calling Cloud Code Assist", async (t) => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;

  delete process.env.GEMINI_API_KEY;

  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("google_search should not attempt OAuth fallback fetch");
  }) as typeof fetch;

  t.after(() => {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
    globalThis.fetch = originalFetch;
  });

  const pi = createMockPi();
  registerGoogleSearchExtension(pi as any);

  const googleSearch = pi.tools.get("google_search");
  assert.ok(googleSearch, "google_search tool should register");

  const result = await googleSearch.execute(
    "tool-call-id",
    { query: "weather today in Austin, Texas" },
    undefined,
    async () => {},
    {
      modelRegistry: {
        async getApiKeyForProvider(provider: string) {
          assert.equal(provider, "google-gemini-cli");
          return JSON.stringify({ token: "oauth-token", projectId: "project-123" });
        },
      },
    } as any,
  );

  assert.equal(fetchCalls, 0, "OAuth-only path should not call the fallback fetch");
  assert.equal(result.isError, true, "OAuth-only auth should return a tool error");
  assert.match(
    result.content[0]?.text ?? "",
    /GEMINI_API_KEY/,
    "error should tell the user how to authenticate google_search",
  );
  assert.match(
    result.content[0]?.text ?? "",
    /OAuth fallback is currently unavailable/i,
    "error should explain why OAuth-only auth is rejected",
  );
  assert.match(
    (result.details?.error as string | undefined) ?? "",
    /^auth_error:/,
    "details should classify the failure as auth_error",
  );
});
