# Antigravity Claude Tool Schema Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Antigravity Claude requests accept tool schemas generated from existing TypeBox tools without changing Gemini behavior.

**Architecture:** Keep the existing Cloud Code Assist request shape, but only sanitize tool schemas in the Antigravity Claude path before they are placed under legacy `parameters`. Leave Gemini and non-Claude flows on `parametersJsonSchema`. Add a focused top-level regression test that inspects the built request payload instead of calling the live API.

**Tech Stack:** TypeScript, Node test runner, workspace package imports, Cloud Code Assist request builder in `@gsd/pi-ai`

---

## Chunk 1: Reproduce and Lock the Payload Contract

### Task 1: Add a failing regression for Antigravity Claude tool schema conversion

**Files:**
- Create: `src/tests/antigravity-claude-tools.test.ts`
- Read: `packages/pi-ai/src/providers/google-gemini-cli.ts`
- Read: `packages/pi-ai/src/providers/google-shared.ts`
- Read: `packages/pi-ai/src/models.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest } from "../../packages/pi-ai/src/providers/google-gemini-cli.ts";
import { getModel } from "../../packages/pi-ai/src/models.ts";

test("buildRequest sanitizes legacy tool schemas for Antigravity Claude", () => {
  const model = getModel("google-antigravity", "claude-sonnet-4-5");
  const request = buildRequest(
    model,
    {
      messages: [{ role: "user", content: "hi", timestamp: 0 }],
      tools: [{
        name: "schema_probe",
        description: "probe",
        parameters: {
          type: "object",
          properties: {
            mode: { anyOf: [{ const: "a" }, { const: "b" }] },
            labels: { type: "object", patternProperties: { ".*": { type: "string" } } }
          },
          required: ["mode"]
        }
      }]
    },
    "test-project",
    {},
    true,
  );

  const decl = request.request.tools?.[0]?.functionDeclarations?.[0] as Record<string, any>;
  assert.ok(decl.parameters);
  assert.equal(decl.parameters.properties.mode.type, "string");
  assert.deepEqual(decl.parameters.properties.mode.enum, ["a", "b"]);
  assert.equal(decl.parameters.properties.mode.anyOf, undefined);
  assert.equal(decl.parameters.properties.labels.patternProperties, undefined);
  assert.deepEqual(decl.parameters.properties.labels.additionalProperties, { type: "string" });
});

test("buildRequest keeps parametersJsonSchema for Gemini models", () => {
  const model = getModel("google-antigravity", "gemini-3-flash");
  const request = buildRequest(
    model,
    {
      messages: [{ role: "user", content: "hi", timestamp: 0 }],
      tools: [{
        name: "schema_probe",
        description: "probe",
        parameters: {
          type: "object",
          properties: { mode: { anyOf: [{ const: "a" }, { const: "b" }] } }
        }
      }]
    },
    "test-project",
    {},
    true,
  );

  const decl = request.request.tools?.[0]?.functionDeclarations?.[0] as Record<string, any>;
  assert.ok(decl.parametersJsonSchema);
  assert.equal(decl.parameters, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails for the expected reason**

Run:
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/antigravity-claude-tools.test.ts
```

Expected: FAIL because `buildRequest()` still leaves `anyOf`/`const` and `patternProperties` intact in the Claude legacy `parameters` payload.

## Chunk 2: Implement the Narrow Sanitizer

### Task 2: Sanitize only the Antigravity Claude legacy `parameters` schema path

**Files:**
- Modify: `packages/pi-ai/src/providers/google-shared.ts`
- Modify: `packages/pi-ai/src/providers/google-gemini-cli.ts`
- Test: `src/tests/antigravity-claude-tools.test.ts`

- [ ] **Step 3: Add the minimal schema sanitizer**

Implementation notes:
- Add a helper in `packages/pi-ai/src/providers/google-shared.ts` dedicated to the Cloud Code Assist Claude compatibility path.
- Support only the transformations needed by the reproduced bug:
  - `const` -> single-value `enum`
  - `anyOf` containing only literal enums/consts -> inferred primitive `type` + merged `enum`
  - `patternProperties` -> `additionalProperties` using the first schema value
- Recurse through nested `properties`, `items`, `additionalProperties`, and array/object children without changing unrelated schema keys.
- Do not sanitize the default `parametersJsonSchema` path.

- [ ] **Step 4: Use the sanitizer only for Antigravity Claude requests**

Implementation notes:
- In `packages/pi-ai/src/providers/google-gemini-cli.ts`, replace the current broad `model.id.startsWith("claude-")` legacy-parameters switch with a narrow Antigravity Claude branch:
  - `model.provider === "google-antigravity" && model.id.startsWith("claude-")`
- Route only that branch through the sanitized legacy `parameters` helper.
- Keep Gemini and non-Claude behavior unchanged.
- Update the nearby comment so it matches the verified API behavior.

- [ ] **Step 5: Run the focused test to verify it passes**

Run:
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/antigravity-claude-tools.test.ts
```

Expected: PASS with both tests green.

## Chunk 3: Verify Against Real Integration Shape

### Task 3: Re-run targeted verification and capture the remaining repo baseline caveat

**Files:**
- None

- [ ] **Step 6: Run the focused provider-facing verification again**

Run:
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/antigravity-claude-tools.test.ts
```

Expected: PASS.

- [ ] **Step 7: Re-run the live Antigravity Claude probe if credentials are available**

Run the same probe used during debugging, but against the code in this worktree.

Expected: model returns a normal text response instead of the Cloud Code Assist `Unknown name "const"` / `Unknown name "patternProperties"` 400.

- [ ] **Step 8: Record the unrelated baseline caveat in the handoff**

Note in final report:
- Fresh-worktree `npm test` is still not a clean baseline because workspace `dist/` artifacts are not built by `npm ci` alone, and `@gsd/pi-coding-agent` still has the existing missing `src/core/export-html/vendor` asset issue.
- This fix is verified with targeted tests and the Antigravity Claude probe, not the full repo suite.
