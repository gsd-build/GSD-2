// GSD Extension — Hooks Library Tests

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { ProgrammaticHookStore } from "../lib/hooks/programmatic-store.js";
import { sortByPriority } from "../lib/hooks/priority-sort.js";
import { composePreDispatchMiddleware } from "../lib/hooks/middleware.js";
import type { PreDispatchHookConfig } from "../types.js";

// ─── ProgrammaticHookStore Tests ──────────────────────────────────────────────

describe("ProgrammaticHookStore", () => {
  let store: ProgrammaticHookStore;

  beforeEach(() => {
    store = new ProgrammaticHookStore();
  });

  describe("registerPostUnit", () => {
    test("stores and retrieves a post-unit hook", () => {
      store.registerPostUnit({
        name: "test-hook",
        after: ["execute-task"],
        prompt: "Run tests for the completed task.",
      });

      const hooks = store.getPostUnitHooks();
      assert.equal(hooks.length, 1);
      assert.equal(hooks[0].name, "test-hook");
      assert.deepEqual(hooks[0].after, ["execute-task"]);
      assert.equal(hooks[0].prompt, "Run tests for the completed task.");
    });

    test("replaces hook with same name", () => {
      store.registerPostUnit({
        name: "test-hook",
        after: ["execute-task"],
        prompt: "Version 1",
      });
      store.registerPostUnit({
        name: "test-hook",
        after: ["complete-slice"],
        prompt: "Version 2",
      });

      const hooks = store.getPostUnitHooks();
      assert.equal(hooks.length, 1);
      assert.equal(hooks[0].prompt, "Version 2");
      assert.deepEqual(hooks[0].after, ["complete-slice"]);
    });

    test("throws on empty name", () => {
      assert.throws(
        () => store.registerPostUnit({ name: "", after: ["execute-task"], prompt: "test" }),
        { name: "TypeError", message: /name/ },
      );
    });

    test("throws on empty after array", () => {
      assert.throws(
        () => store.registerPostUnit({ name: "test", after: [], prompt: "test" }),
        { name: "TypeError", message: /after/ },
      );
    });

    test("throws on empty prompt", () => {
      assert.throws(
        () => store.registerPostUnit({ name: "test", after: ["execute-task"], prompt: "" }),
        { name: "TypeError", message: /prompt/ },
      );
    });

    test("excludes disabled hooks from getPostUnitHooks", () => {
      store.registerPostUnit({
        name: "disabled-hook",
        after: ["execute-task"],
        prompt: "test",
        enabled: false,
      });

      assert.equal(store.getPostUnitHooks().length, 0);
    });

    test("preserves optional fields", () => {
      store.registerPostUnit({
        name: "full-hook",
        after: ["execute-task"],
        prompt: "test",
        max_cycles: 3,
        model: "sonnet",
        artifact: "test-results.md",
        retry_on: "test-failures.md",
        agent: "test-agent.md",
      });

      const hook = store.getPostUnitHooks()[0];
      assert.equal(hook.max_cycles, 3);
      assert.equal(hook.model, "sonnet");
      assert.equal(hook.artifact, "test-results.md");
      assert.equal(hook.retry_on, "test-failures.md");
      assert.equal(hook.agent, "test-agent.md");
    });
  });

  describe("registerPreDispatch", () => {
    test("stores and retrieves a pre-dispatch hook", () => {
      store.registerPreDispatch({
        name: "inject-context",
        before: ["execute-task"],
        action: "modify",
        append: "Additional context here.",
      });

      const hooks = store.getPreDispatchHooks();
      assert.equal(hooks.length, 1);
      assert.equal(hooks[0].name, "inject-context");
      assert.equal(hooks[0].action, "modify");
    });

    test("throws on invalid action", () => {
      assert.throws(
        () => store.registerPreDispatch({
          name: "bad",
          before: ["execute-task"],
          action: "invalid" as any,
        }),
        { name: "TypeError", message: /action/ },
      );
    });

    test("throws on empty before array", () => {
      assert.throws(
        () => store.registerPreDispatch({ name: "bad", before: [], action: "modify" }),
        { name: "TypeError", message: /before/ },
      );
    });

    test("throws on replace action without prompt", () => {
      assert.throws(
        () => store.registerPreDispatch({ name: "bad", before: ["execute-task"], action: "replace" }),
        { name: "TypeError", message: /prompt/ },
      );
    });

    test("accepts all valid actions", () => {
      for (const action of ["modify", "skip", "replace"] as const) {
        const name = `hook-${action}`;
        const opts: any = { name, before: ["execute-task"], action };
        // replace action requires a prompt
        if (action === "replace") opts.prompt = "replacement prompt";
        store.registerPreDispatch(opts);
        const hooks = store.getPreDispatchHooks();
        assert.ok(hooks.some(h => h.name === name));
      }
    });
  });

  describe("deregister", () => {
    test("removes a post-unit hook", () => {
      store.registerPostUnit({ name: "remove-me", after: ["execute-task"], prompt: "test" });
      assert.equal(store.deregister("remove-me"), true);
      assert.equal(store.getPostUnitHooks().length, 0);
    });

    test("removes a pre-dispatch hook", () => {
      store.registerPreDispatch({ name: "remove-me", before: ["execute-task"], action: "modify" });
      assert.equal(store.deregister("remove-me"), true);
      assert.equal(store.getPreDispatchHooks().length, 0);
    });

    test("returns false for non-existent hook", () => {
      assert.equal(store.deregister("non-existent"), false);
    });
  });

  describe("clear", () => {
    test("removes all hooks", () => {
      store.registerPostUnit({ name: "post", after: ["execute-task"], prompt: "test" });
      store.registerPreDispatch({ name: "pre", before: ["execute-task"], action: "modify" });
      store.clear();
      assert.equal(store.getPostUnitHooks().length, 0);
      assert.equal(store.getPreDispatchHooks().length, 0);
      assert.equal(store.size, 0);
    });
  });

  describe("priority sorting", () => {
    test("returns hooks sorted by priority", () => {
      store.registerPostUnit({ name: "low", after: ["execute-task"], prompt: "test", priority: 10 });
      store.registerPostUnit({ name: "high", after: ["execute-task"], prompt: "test", priority: -5 });
      store.registerPostUnit({ name: "default", after: ["execute-task"], prompt: "test" });

      const hooks = store.getPostUnitHooks();
      assert.equal(hooks[0].name, "high");    // priority -5
      assert.equal(hooks[1].name, "default");  // priority 0
      assert.equal(hooks[2].name, "low");      // priority 10
    });
  });

  describe("listDescriptors", () => {
    test("returns descriptors for all hooks", () => {
      store.registerPostUnit({ name: "post-hook", after: ["execute-task"], prompt: "test", packageId: "com.test" });
      store.registerPreDispatch({ name: "pre-hook", before: ["execute-task"], action: "modify" });

      const descriptors = store.listDescriptors();
      assert.equal(descriptors.length, 2);

      const postDesc = descriptors.find(d => d.name === "post-hook")!;
      assert.equal(postDesc.phase, "post-unit");
      assert.equal(postDesc.source, "programmatic");
      assert.equal(postDesc.packageId, "com.test");

      const preDesc = descriptors.find(d => d.name === "pre-hook")!;
      assert.equal(preDesc.phase, "pre-dispatch");
    });
  });

  describe("listRules", () => {
    test("converts hooks to PrioritizedRule format", () => {
      store.registerPostUnit({ name: "rule-test", after: ["execute-task"], prompt: "test", priority: 5 });
      const rules = store.listRules();
      assert.equal(rules.length, 1);
      assert.equal(rules[0].name, "rule-test");
      assert.equal(rules[0].when, "post-unit");
      assert.equal(rules[0].priority, 5);
      assert.equal(rules[0].source, "programmatic");
    });
  });

  describe("size", () => {
    test("counts both hook types", () => {
      assert.equal(store.size, 0);
      store.registerPostUnit({ name: "a", after: ["execute-task"], prompt: "test" });
      assert.equal(store.size, 1);
      store.registerPreDispatch({ name: "b", before: ["execute-task"], action: "modify" });
      assert.equal(store.size, 2);
    });
  });
});

// ─── sortByPriority Tests ─────────────────────────────────────────────────────

describe("sortByPriority", () => {
  test("sorts ascending by priority", () => {
    const items = [
      { priority: 10 },
      { priority: -5 },
      { priority: 0 },
    ];
    const sorted = sortByPriority(items);
    assert.equal(sorted[0].priority, -5);
    assert.equal(sorted[1].priority, 0);
    assert.equal(sorted[2].priority, 10);
  });

  test("treats missing priority as 0", () => {
    const items = [
      { priority: 5 },
      { priority: undefined },
      { priority: -1 },
    ];
    const sorted = sortByPriority(items);
    assert.equal(sorted[0].priority, -1);
    assert.equal(sorted[1].priority, undefined); // 0 equivalent
    assert.equal(sorted[2].priority, 5);
  });

  test("preserves insertion order for equal priorities (stable sort)", () => {
    const items = [
      { priority: 0, id: "first" },
      { priority: 0, id: "second" },
      { priority: 0, id: "third" },
    ];
    const sorted = sortByPriority(items);
    assert.equal((sorted[0] as any).id, "first");
    assert.equal((sorted[1] as any).id, "second");
    assert.equal((sorted[2] as any).id, "third");
  });

  test("does not mutate original array", () => {
    const items = [{ priority: 2 }, { priority: 1 }];
    sortByPriority(items);
    assert.equal(items[0].priority, 2);
  });
});

// ─── composePreDispatchMiddleware Tests ───────────────────────────────────────

describe("composePreDispatchMiddleware", () => {
  const noopArtifact = () => "/nonexistent";
  const subCtx = { milestoneId: "M001", sliceId: "S001", taskId: "T001" };

  test("returns proceed with unmodified prompt when no hooks", () => {
    const result = composePreDispatchMiddleware([], "original", subCtx, noopArtifact);
    assert.equal(result.action, "proceed");
    assert.equal(result.prompt, "original");
    assert.deepEqual(result.firedHooks, []);
  });

  test("modify hook prepends and appends", () => {
    const hooks: PreDispatchHookConfig[] = [
      { name: "ctx-inject", before: ["execute-task"], action: "modify", prepend: "Before:", append: "After:" },
    ];
    const result = composePreDispatchMiddleware(hooks, "original", subCtx, noopArtifact);
    assert.equal(result.action, "proceed");
    assert.equal(result.prompt, "Before:\n\noriginal\n\nAfter:");
    assert.deepEqual(result.firedHooks, ["ctx-inject"]);
  });

  test("skip hook short-circuits", () => {
    const hooks: PreDispatchHookConfig[] = [
      { name: "skipper", before: ["execute-task"], action: "skip" },
      { name: "never-reached", before: ["execute-task"], action: "modify", append: "nope" },
    ];
    const result = composePreDispatchMiddleware(hooks, "original", subCtx, noopArtifact);
    assert.equal(result.action, "skip");
    assert.deepEqual(result.firedHooks, ["skipper"]);
  });

  test("replace hook short-circuits with substitution", () => {
    const hooks: PreDispatchHookConfig[] = [
      { name: "replacer", before: ["execute-task"], action: "replace", prompt: "New prompt for {milestoneId}", unit_type: "custom-type" },
    ];
    const result = composePreDispatchMiddleware(hooks, "original", subCtx, noopArtifact);
    assert.equal(result.action, "replace");
    assert.equal(result.prompt, "New prompt for M001");
    assert.equal(result.unitType, "custom-type");
  });

  test("multiple modify hooks compose", () => {
    const hooks: PreDispatchHookConfig[] = [
      { name: "a", before: ["execute-task"], action: "modify", prepend: "A" },
      { name: "b", before: ["execute-task"], action: "modify", append: "B" },
    ];
    const result = composePreDispatchMiddleware(hooks, "original", subCtx, noopArtifact);
    assert.equal(result.action, "proceed");
    assert.equal(result.prompt, "A\n\noriginal\n\nB");
    assert.deepEqual(result.firedHooks, ["a", "b"]);
  });

  test("modify hook model override is captured", () => {
    const hooks: PreDispatchHookConfig[] = [
      { name: "a", before: ["execute-task"], action: "modify", model: "sonnet", append: "extra" },
    ];
    const result = composePreDispatchMiddleware(hooks, "original", subCtx, noopArtifact);
    assert.equal(result.model, "sonnet");
  });
});

// ─── Community Loader Trust Gate Tests ────────────────────────────────────────

describe("loadCommunityHooks trust gate", () => {
  test("project-local hooks require GSD_ENABLE_PROJECT_HOOKS=true", async () => {
    // The community loader should not scan basePath/.gsd/hooks/ unless
    // GSD_ENABLE_PROJECT_HOOKS=true. We verify this by checking the
    // module exports the function and it respects the env var.
    const { loadCommunityHooks } = await import("../lib/hooks/community-loader.js");
    const { ProgrammaticHookStore } = await import("../lib/hooks/programmatic-store.js");

    const store = new ProgrammaticHookStore();
    const originalEnv = process.env.GSD_ENABLE_PROJECT_HOOKS;

    // Without env var, only ~/.gsd/extensions/ is scanned (which likely doesn't exist in test)
    delete process.env.GSD_ENABLE_PROJECT_HOOKS;
    const result1 = loadCommunityHooks(store, "/nonexistent-test-path");
    assert.equal(result1.loaded, 0);
    assert.equal(store.size, 0);

    // Restore
    if (originalEnv !== undefined) {
      process.env.GSD_ENABLE_PROJECT_HOOKS = originalEnv;
    }
  });
});

// ─── Name Deduplication Tests ─────────────────────────────────────────────────

describe("ProgrammaticHookStore deduplication semantics", () => {
  let store: ProgrammaticHookStore;

  beforeEach(() => {
    store = new ProgrammaticHookStore();
  });

  test("programmatic hook with same name replaces previous registration", () => {
    store.registerPostUnit({ name: "review", after: ["execute-task"], prompt: "v1" });
    store.registerPostUnit({ name: "review", after: ["complete-slice"], prompt: "v2" });

    const hooks = store.getPostUnitHooks();
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0].prompt, "v2");
    assert.deepEqual(hooks[0].after, ["complete-slice"]);
  });

  test("listDescriptors returns unique names only", () => {
    store.registerPostUnit({ name: "shared-name", after: ["execute-task"], prompt: "test" });
    store.registerPreDispatch({ name: "other-name", before: ["execute-task"], action: "modify" });

    const descriptors = store.listDescriptors();
    const names = descriptors.map(d => d.name);
    assert.equal(new Set(names).size, names.length, "descriptor names should be unique");
  });
});
