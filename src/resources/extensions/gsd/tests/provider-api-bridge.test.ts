import assert from "node:assert/strict";
import { test } from "node:test";

import { initializeProviderApiBridge } from "../bootstrap/provider-api-bridge.ts";

const PROVIDER_DEPS_KEY = Symbol.for("gsd-provider-deps");
const TOOL_REGISTRY_KEY = Symbol.for("gsd-tool-registry");

function restoreGlobalSymbol(symbolKey: symbol, previous: unknown): void {
  const g = globalThis as Record<symbol, unknown>;
  if (previous === undefined) {
    delete g[symbolKey];
  } else {
    g[symbolKey] = previous;
  }
}

test("initializeProviderApiBridge publishes deps and bridge tools", () => {
  const g = globalThis as Record<symbol, unknown>;
  const previousDeps = g[PROVIDER_DEPS_KEY];
  const previousTools = g[TOOL_REGISTRY_KEY];

  try {
    let waiterResolved = false;
    g[PROVIDER_DEPS_KEY] = {
      value: null,
      waiters: [
        () => { waiterResolved = true; },
      ],
    };
    g[TOOL_REGISTRY_KEY] = [];

    initializeProviderApiBridge();

    const depsStore = g[PROVIDER_DEPS_KEY] as {
      value: Record<string, unknown> | null;
      waiters?: unknown[];
    };
    assert.ok(depsStore.value, "provider deps must be published");
    assert.equal(waiterResolved, true, "pending waiters must be resolved");

    const deps = depsStore.value as Record<string, (...args: any[]) => unknown>;
    assert.equal(typeof deps.getSupervisorConfig, "function");
    assert.equal(typeof deps.getBasePath, "function");
    assert.equal(typeof deps.getUnitInfo, "function");
    assert.equal(typeof deps.getIsUnitDone(), "boolean");

    const registry = g[TOOL_REGISTRY_KEY] as Array<{ name: string }> & {
      has?: (name: string) => boolean;
      get?: (name: string) => unknown;
      set?: (name: string, value: unknown) => unknown;
      clear?: () => void;
    };
    assert.equal(Array.isArray(registry), true, "tool registry must remain array-compatible");
    assert.equal(typeof registry.has, "function", "tool registry must expose has()");
    assert.equal(typeof registry.get, "function", "tool registry must expose get()");
    assert.equal(typeof registry.set, "function", "tool registry must expose set()");
    assert.equal(typeof registry.clear, "function", "tool registry must expose clear()");
    assert.equal(registry.has?.("gsd_decision_save"), true, "canonical decision tool must be published");
    assert.equal(registry.has?.("gsd_save_decision"), true, "decision alias tool must be published");
    assert.equal(registry.has?.("gsd_milestone_generate_id"), true, "milestone id tool must be published");
    assert.equal(registry.has?.("gsd_generate_milestone_id"), true, "milestone id alias tool must be published");
  } finally {
    restoreGlobalSymbol(PROVIDER_DEPS_KEY, previousDeps);
    restoreGlobalSymbol(TOOL_REGISTRY_KEY, previousTools);
  }
});
