import test from "node:test";
import assert from "node:assert/strict";

import { getBudgetAlertLevel, getNewBudgetAlertLevel } from "../auto.js";

test("getBudgetAlertLevel returns the expected threshold bucket", () => {
  assert.equal(getBudgetAlertLevel(0.10), 0);
  assert.equal(getBudgetAlertLevel(0.75), 75);
  assert.equal(getBudgetAlertLevel(0.89), 75);
  assert.equal(getBudgetAlertLevel(0.90), 90);
  assert.equal(getBudgetAlertLevel(1.00), 100);
});

test("getNewBudgetAlertLevel only emits once per threshold", () => {
  assert.equal(getNewBudgetAlertLevel(0, 0.74), null);
  assert.equal(getNewBudgetAlertLevel(0, 0.75), 75);
  assert.equal(getNewBudgetAlertLevel(75, 0.80), null);
  assert.equal(getNewBudgetAlertLevel(75, 0.90), 90);
  assert.equal(getNewBudgetAlertLevel(90, 0.95), null);
});

test("getNewBudgetAlertLevel does not emit threshold alerts at or above the ceiling", () => {
  assert.equal(getNewBudgetAlertLevel(0, 1.0), null);
  assert.equal(getNewBudgetAlertLevel(75, 1.2), null);
});
