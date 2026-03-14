import test from "node:test";
import assert from "node:assert/strict";

// Instead of trying to mock out the entire `index.ts` extension initialization which touches
// the disk and parses files, we test the logic via the standard test methods, or we can
// just test that `resolveModelWithFallbacksForUnit` returns the correct format since
// the fallback rotation logic itself was verified manually.

import { getNextFallbackModel } from "../preferences.ts";

test("getNextFallbackModel selects next fallback if current is a fallback", () => {
    const modelConfig = { primary: "model-a", fallbacks: ["model-b", "model-c"] };
    const currentModelId = "model-b";

    const nextModelId = getNextFallbackModel(currentModelId, modelConfig);

    assert.equal(nextModelId, "model-c", "should select next model after current fallback");
});

test("getNextFallbackModel returns undefined if fallbacks exhausted", () => {
    const modelConfig = { primary: "model-a", fallbacks: ["model-b", "model-c"] };
    const currentModelId = "model-c";

    const nextModelId = getNextFallbackModel(currentModelId, modelConfig);

    assert.equal(nextModelId, undefined, "should return undefined when exhausted");
});

test("getNextFallbackModel finds current model when formatted with provider", () => {
    const modelConfig = { primary: "p/model-a", fallbacks: ["p/model-b"] };
    const currentModelId = "model-a"; // context model doesn't always have provider in ID

    const nextModelId = getNextFallbackModel(currentModelId, modelConfig);

    assert.equal(nextModelId, "p/model-b", "should select next model after current with provider format");
});

test("getNextFallbackModel returns primary if current model is not in the list", () => {
    const modelConfig = { primary: "model-a", fallbacks: ["model-b", "model-c"] };
    const currentModelId = "model-x"; // completely different model manually selected

    const nextModelId = getNextFallbackModel(currentModelId, modelConfig);

    assert.equal(nextModelId, "model-a", "should default to primary if current is unknown");
});

test("getNextFallbackModel returns primary if current model is undefined", () => {
    const modelConfig = { primary: "model-a", fallbacks: ["model-b", "model-c"] };
    const currentModelId = undefined;

    const nextModelId = getNextFallbackModel(currentModelId, modelConfig);

    assert.equal(nextModelId, "model-a", "should default to primary if current is undefined");
});
