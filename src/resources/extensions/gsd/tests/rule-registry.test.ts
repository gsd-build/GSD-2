// GSD Extension — Rule Registry Tests
//
// Tests the RuleRegistry class, UnifiedRule types, singleton accessors,
// and evaluation methods using mock rules.

import { test, describe, beforeEach } from "node:test";
import { createTestContext } from "./test-helpers.ts";
import {
  RuleRegistry,
  getRegistry,
  setRegistry,
  initRegistry,
  resetRegistry,
  convertDispatchRules,
  getOrCreateRegistry,
} from "../rule-registry.ts";
import type { UnifiedRule } from "../rule-types.ts";
import type { DispatchAction, DispatchContext } from "../auto-dispatch.ts";
import { DISPATCH_RULES, getDispatchRuleNames } from "../auto-dispatch.ts";
import type { GSDState } from "../types.ts";

// ─── Mock Rule Factories ──────────────────────────────────────────────────

function mockDispatchRule(name: string, matchPhase: string): UnifiedRule {
  return {
    name,
    when: "dispatch",
    evaluation: "first-match",
    where: async (ctx: DispatchContext): Promise<DispatchAction | null> => {
      if (ctx.state.phase === matchPhase) {
        return {
          action: "dispatch",
          unitType: `test-${matchPhase}`,
          unitId: "test-id",
          prompt: `Prompt for ${matchPhase}`,
        };
      }
      return null;
    },
    then: () => {},
    description: `Mock rule for ${matchPhase}`,
  };
}

function makeContext(phase: string): DispatchContext {
  return {
    basePath: "/tmp/test",
    mid: "M001",
    midTitle: "Test Milestone",
    state: {
      phase: phase as any,
      activeMilestone: { id: "M001", title: "Test" },
      activeSlice: null,
      activeTask: null,
      recentDecisions: [],
      blockers: [],
      nextAction: "",
      registry: [],
    },
    prefs: undefined,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("RuleRegistry", () => {
  const { assertEq, assertTrue } = createTestContext();

  beforeEach(() => {
    resetRegistry();
  });

  test("construct with dispatch rules, listRules returns them", () => {
    const rules: UnifiedRule[] = [
      mockDispatchRule("rule-a", "planning"),
      mockDispatchRule("rule-b", "executing"),
      mockDispatchRule("rule-c", "complete"),
    ];
    const registry = new RuleRegistry(rules);
    const listed = registry.listRules();

    // At minimum, dispatch rules are returned (hook rules depend on prefs)
    const dispatchRules = listed.filter(r => r.when === "dispatch");
    assertEq(dispatchRules.length, 3, "listRules returns 3 dispatch rules");
    assertEq(dispatchRules[0].name, "rule-a", "first rule name is rule-a");
    assertEq(dispatchRules[1].name, "rule-b", "second rule name is rule-b");
    assertEq(dispatchRules[2].name, "rule-c", "third rule name is rule-c");
  });

  test("listRules returns correct fields on each rule", () => {
    const rules: UnifiedRule[] = [
      mockDispatchRule("check-fields", "planning"),
    ];
    const registry = new RuleRegistry(rules);
    const listed = registry.listRules();
    const rule = listed.find(r => r.name === "check-fields")!;

    assertTrue(rule !== undefined, "rule found by name");
    assertEq(rule.when, "dispatch", "when field is dispatch");
    assertEq(rule.evaluation, "first-match", "evaluation is first-match");
    assertTrue(typeof rule.where === "function", "where is a function");
    assertTrue(typeof rule.then === "function", "then is a function");
    assertEq(rule.description, "Mock rule for planning", "description is set");
  });

  test("evaluateDispatch returns first matching rule", async () => {
    const rules: UnifiedRule[] = [
      mockDispatchRule("rule-planning", "planning"),
      mockDispatchRule("rule-executing", "executing"),
      mockDispatchRule("rule-complete", "complete"),
    ];
    const registry = new RuleRegistry(rules);
    const ctx = makeContext("executing");
    const result = await registry.evaluateDispatch(ctx);

    assertEq(result.action, "dispatch", "result is a dispatch action");
    if (result.action === "dispatch") {
      assertEq(result.unitType, "test-executing", "matched the executing rule");
      assertEq(result.prompt, "Prompt for executing", "prompt from matched rule");
    }
  });

  test("evaluateDispatch returns stop when no rule matches", async () => {
    const rules: UnifiedRule[] = [
      mockDispatchRule("only-planning", "planning"),
    ];
    const registry = new RuleRegistry(rules);
    const ctx = makeContext("blocked");
    const result = await registry.evaluateDispatch(ctx);

    assertEq(result.action, "stop", "result is a stop action");
    if (result.action === "stop") {
      assertTrue(result.reason.includes("blocked"), "stop reason mentions phase");
    }
  });

  test("evaluateDispatch works with async where predicate", async () => {
    const asyncRule: UnifiedRule = {
      name: "async-rule",
      when: "dispatch",
      evaluation: "first-match",
      where: async (ctx: DispatchContext): Promise<DispatchAction | null> => {
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 1));
        if (ctx.state.phase === "planning") {
          return {
            action: "dispatch",
            unitType: "async-test",
            unitId: "async-id",
            prompt: "Async prompt",
          };
        }
        return null;
      },
      then: () => {},
    };

    const registry = new RuleRegistry([asyncRule]);
    const ctx = makeContext("planning");
    const result = await registry.evaluateDispatch(ctx);

    assertEq(result.action, "dispatch", "async dispatch resolved");
    if (result.action === "dispatch") {
      assertEq(result.unitType, "async-test", "async rule matched");
    }
  });

  test("resetState clears all mutable state", () => {
    const registry = new RuleRegistry([]);

    // Set up some state
    registry.activeHook = {
      hookName: "test-hook",
      triggerUnitType: "execute-task",
      triggerUnitId: "M001/S01/T01",
      cycle: 2,
      pendingRetry: false,
    };
    registry.hookQueue.push({
      config: { name: "q", after: [], prompt: "p" },
      triggerUnitType: "execute-task",
      triggerUnitId: "M001/S01/T02",
    });
    registry.cycleCounts.set("test/key", 3);
    registry.retryPending = true;
    registry.retryTrigger = { unitType: "execute-task", unitId: "M001/S01/T01", retryArtifact: "RETRY" };

    // Reset
    registry.resetState();

    assertEq(registry.getActiveHook(), null, "activeHook cleared");
    assertEq(registry.hookQueue.length, 0, "hookQueue cleared");
    assertEq(registry.cycleCounts.size, 0, "cycleCounts cleared");
    assertEq(registry.isRetryPending(), false, "retryPending cleared");
    assertEq(registry.consumeRetryTrigger(), null, "retryTrigger cleared");
  });

  test("singleton getRegistry throws when not initialized", () => {
    let threw = false;
    try {
      getRegistry();
    } catch (e: any) {
      threw = true;
      assertTrue(e.message.includes("not initialized"), "error mentions not initialized");
    }
    assertTrue(threw, "getRegistry threw");
  });

  test("setRegistry / getRegistry round-trips", () => {
    const registry = new RuleRegistry([mockDispatchRule("singleton-test", "planning")]);
    setRegistry(registry);

    const retrieved = getRegistry();
    assertEq(retrieved, registry, "getRegistry returns the same instance");

    const listed = retrieved.listRules().filter(r => r.when === "dispatch");
    assertEq(listed.length, 1, "singleton has 1 dispatch rule");
    assertEq(listed[0].name, "singleton-test", "rule name matches");
  });

  test("initRegistry creates and sets singleton", () => {
    const rules = [mockDispatchRule("init-test", "executing")];
    const registry = initRegistry(rules);

    assertEq(getRegistry(), registry, "initRegistry sets the singleton");
    const listed = getRegistry().listRules().filter(r => r.when === "dispatch");
    assertEq(listed.length, 1, "singleton has the rule");
  });

  test("evaluateDispatch respects rule order (first match wins)", async () => {
    // Both rules match "planning" but rule-first should win
    const ruleFirst: UnifiedRule = {
      name: "rule-first",
      when: "dispatch",
      evaluation: "first-match",
      where: async (ctx: DispatchContext) => {
        if (ctx.state.phase === "planning") {
          return { action: "dispatch" as const, unitType: "first-wins", unitId: "id", prompt: "first" };
        }
        return null;
      },
      then: () => {},
    };
    const ruleSecond: UnifiedRule = {
      name: "rule-second",
      when: "dispatch",
      evaluation: "first-match",
      where: async (ctx: DispatchContext) => {
        if (ctx.state.phase === "planning") {
          return { action: "dispatch" as const, unitType: "second-loses", unitId: "id", prompt: "second" };
        }
        return null;
      },
      then: () => {},
    };

    const registry = new RuleRegistry([ruleFirst, ruleSecond]);
    const ctx = makeContext("planning");
    const result = await registry.evaluateDispatch(ctx);

    assertEq(result.action, "dispatch", "dispatch action returned");
    if (result.action === "dispatch") {
      assertEq(result.unitType, "first-wins", "first rule won over second");
    }
  });

  // ── Dispatch rule conversion tests ─────────────────────────────────

  test("convertDispatchRules produces correct count of UnifiedRule objects", () => {
    const converted = convertDispatchRules(DISPATCH_RULES);
    assertEq(converted.length, DISPATCH_RULES.length, `convertDispatchRules produces ${DISPATCH_RULES.length} rules`);
  });

  test("each converted rule has correct when, evaluation, and original name", () => {
    const converted = convertDispatchRules(DISPATCH_RULES);
    for (let i = 0; i < converted.length; i++) {
      const rule = converted[i];
      assertEq(rule.when, "dispatch", `rule ${i} has when:"dispatch"`);
      assertEq(rule.evaluation, "first-match", `rule ${i} has evaluation:"first-match"`);
      assertEq(rule.name, DISPATCH_RULES[i].name, `rule ${i} preserves name "${DISPATCH_RULES[i].name}"`);
      assertTrue(typeof rule.where === "function", `rule ${i} has a where function`);
      assertTrue(typeof rule.then === "function", `rule ${i} has a then function`);
    }
  });

  test("listRules after construction with real dispatch rules returns correct count", () => {
    const converted = convertDispatchRules(DISPATCH_RULES);
    const registry = new RuleRegistry(converted);
    const listed = registry.listRules().filter(r => r.when === "dispatch");
    assertEq(listed.length, DISPATCH_RULES.length, `listRules returns ${DISPATCH_RULES.length} dispatch rules`);
  });

  test("rule names from listRules match getDispatchRuleNames in exact order", () => {
    const converted = convertDispatchRules(DISPATCH_RULES);
    const registry = new RuleRegistry(converted);
    const listedNames = registry.listRules()
      .filter(r => r.when === "dispatch")
      .map(r => r.name);
    const originalNames = getDispatchRuleNames();

    assertEq(listedNames.length, originalNames.length, "same number of names");
    for (let i = 0; i < originalNames.length; i++) {
      assertEq(listedNames[i], originalNames[i], `name at index ${i} matches: "${originalNames[i]}"`);
    }
  });

  // ── getOrCreateRegistry (lazy init for facades) ────────────────────

  test("getOrCreateRegistry lazily creates a registry with empty dispatch rules", () => {
    // After resetRegistry(), getRegistry() would throw. getOrCreateRegistry() should not.
    const registry = getOrCreateRegistry();
    assertTrue(registry instanceof RuleRegistry, "returns a RuleRegistry instance");
    const dispatchRules = registry.listRules().filter(r => r.when === "dispatch");
    assertEq(dispatchRules.length, 0, "lazily-created registry has 0 dispatch rules");
  });

  test("getOrCreateRegistry returns existing registry when initialized", () => {
    const rules = [mockDispatchRule("explicit-init", "planning")];
    const explicit = initRegistry(rules);
    const lazy = getOrCreateRegistry();
    assertEq(lazy, explicit, "getOrCreateRegistry returns the same singleton as initRegistry");
    const dispatchRules = lazy.listRules().filter(r => r.when === "dispatch");
    assertEq(dispatchRules.length, 1, "singleton has the explicitly initialized dispatch rule");
  });

  // ── Hook-derived rules in listRules ────────────────────────────────

  test("listRules returns only dispatch rules when no hooks are configured", () => {
    const converted = convertDispatchRules(DISPATCH_RULES);
    const registry = new RuleRegistry(converted);
    const allRules = registry.listRules();
    const postUnitRules = allRules.filter(r => r.when === "post-unit");
    const preDispatchRules = allRules.filter(r => r.when === "pre-dispatch");

    // No preferences file = no hooks
    assertEq(postUnitRules.length, 0, "no post-unit rules when no hooks configured");
    assertEq(preDispatchRules.length, 0, "no pre-dispatch rules when no hooks configured");
    assertEq(allRules.length, DISPATCH_RULES.length, "total rules equals dispatch rules only");
  });

  test("listRules dispatch rules appear first, hooks after", () => {
    const converted = convertDispatchRules(DISPATCH_RULES);
    const registry = new RuleRegistry(converted);
    const allRules = registry.listRules();

    // Verify dispatch rules come first (indices 0..N-1)
    for (let i = 0; i < converted.length; i++) {
      assertEq(allRules[i].when, "dispatch", `rule at index ${i} is a dispatch rule`);
      assertEq(allRules[i].name, converted[i].name, `dispatch rule at index ${i} has correct name`);
    }
  });

  // ── Facade delegation (post-unit-hooks.ts imports work through registry) ──

  test("evaluatePostUnit returns null for hook-on-hook prevention", () => {
    const registry = new RuleRegistry([]);
    const result = registry.evaluatePostUnit("hook/code-review", "M001/S01/T01", "/tmp/test");
    assertEq(result, null, "hook units don't trigger other hooks");
  });

  test("evaluatePostUnit returns null for triage-captures", () => {
    const registry = new RuleRegistry([]);
    const result = registry.evaluatePostUnit("triage-captures", "M001/S01/T01", "/tmp/test");
    assertEq(result, null, "triage-captures skipped");
  });

  test("evaluatePostUnit returns null for quick-task", () => {
    const registry = new RuleRegistry([]);
    const result = registry.evaluatePostUnit("quick-task", "M001/S01/T01", "/tmp/test");
    assertEq(result, null, "quick-task skipped");
  });

  test("evaluatePreDispatch bypasses hook units", () => {
    const registry = new RuleRegistry([]);
    const result = registry.evaluatePreDispatch("hook/review", "M001/S01/T01", "prompt", "/tmp/test");
    assertEq(result.action, "proceed", "hook units always proceed");
    assertEq(result.prompt, "prompt", "prompt unchanged");
    assertEq(result.firedHooks.length, 0, "no hooks fired");
  });

  test("evaluatePreDispatch proceeds with empty hooks", () => {
    const registry = new RuleRegistry([]);
    const result = registry.evaluatePreDispatch("execute-task", "M001/S01/T01", "original prompt", "/tmp/test");
    assertEq(result.action, "proceed", "proceeds when no hooks");
    assertEq(result.prompt, "original prompt", "prompt unchanged");
  });

  // ── matchedRule provenance (S02 journal support) ───────────────────

  test("evaluateDispatch result includes matchedRule on dispatch match", async () => {
    const rules: UnifiedRule[] = [
      mockDispatchRule("my-planning-rule", "planning"),
    ];
    const registry = new RuleRegistry(rules);
    const ctx = makeContext("planning");
    const result = await registry.evaluateDispatch(ctx);

    assertEq(result.action, "dispatch", "result is a dispatch action");
    assertEq(result.matchedRule, "my-planning-rule", "matchedRule is the rule name");
  });

  test("evaluateDispatch result includes matchedRule '<no-match>' on fallback stop", async () => {
    const rules: UnifiedRule[] = [
      mockDispatchRule("only-planning", "planning"),
    ];
    const registry = new RuleRegistry(rules);
    const ctx = makeContext("some-unknown-phase");
    const result = await registry.evaluateDispatch(ctx);

    assertEq(result.action, "stop", "result is a stop action");
    assertEq(result.matchedRule, "<no-match>", "matchedRule is '<no-match>' on fallback");
  });
});
