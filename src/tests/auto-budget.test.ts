import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getBudgetAlertLevel, getNewBudgetAlertLevel, getBudgetEnforcementAction } from "../resources/extensions/gsd/auto-budget.js";

describe("auto-budget", () => {
  describe("getBudgetAlertLevel", () => {
    it("returns 0 for low usage", () => {
      assert.equal(getBudgetAlertLevel(0), 0);
      assert.equal(getBudgetAlertLevel(0.5), 0);
      assert.equal(getBudgetAlertLevel(0.74), 0);
    });

    it("returns 75 at 75%", () => {
      assert.equal(getBudgetAlertLevel(0.75), 75);
      assert.equal(getBudgetAlertLevel(0.79), 75);
    });

    it("returns 80 at 80%", () => {
      assert.equal(getBudgetAlertLevel(0.80), 80);
      assert.equal(getBudgetAlertLevel(0.89), 80);
    });

    it("returns 90 at 90%", () => {
      assert.equal(getBudgetAlertLevel(0.90), 90);
      assert.equal(getBudgetAlertLevel(0.99), 90);
    });

    it("returns 100 at 100%+", () => {
      assert.equal(getBudgetAlertLevel(1.0), 100);
      assert.equal(getBudgetAlertLevel(1.5), 100);
    });
  });

  describe("getNewBudgetAlertLevel", () => {
    it("returns null when at same or lower level", () => {
      assert.equal(getNewBudgetAlertLevel(75, 0.75), null);
      assert.equal(getNewBudgetAlertLevel(90, 0.80), null);
      assert.equal(getNewBudgetAlertLevel(80, 0.5), null);
    });

    it("returns new level when crossing up", () => {
      assert.equal(getNewBudgetAlertLevel(0, 0.75), 75);
      assert.equal(getNewBudgetAlertLevel(75, 0.80), 80);
      assert.equal(getNewBudgetAlertLevel(80, 0.90), 90);
      assert.equal(getNewBudgetAlertLevel(90, 1.0), 100);
    });

    it("returns null for 0% usage", () => {
      assert.equal(getNewBudgetAlertLevel(0, 0), null);
    });
  });

  describe("getBudgetEnforcementAction", () => {
    it("returns none when under budget", () => {
      assert.equal(getBudgetEnforcementAction("halt", 0.5), "none");
      assert.equal(getBudgetEnforcementAction("pause", 0.99), "none");
    });

    it("returns halt when at ceiling with halt enforcement", () => {
      assert.equal(getBudgetEnforcementAction("halt", 1.0), "halt");
    });

    it("returns pause when at ceiling with pause enforcement", () => {
      assert.equal(getBudgetEnforcementAction("pause", 1.0), "pause");
    });

    it("returns warn when at ceiling with warn enforcement", () => {
      assert.equal(getBudgetEnforcementAction("warn", 1.0), "warn");
    });
  });
});
