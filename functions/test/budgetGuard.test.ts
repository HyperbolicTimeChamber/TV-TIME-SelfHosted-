import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldCutBilling } from "../src/hooks/budgetGuard";

test("cuts only once cost reaches the budget", () => {
  assert.equal(shouldCutBilling({ costAmount: 9.99, budgetAmount: 10 }), false);
  assert.equal(shouldCutBilling({ costAmount: 10, budgetAmount: 10 }), true);
  assert.equal(shouldCutBilling({ costAmount: 50, budgetAmount: 10 }), true);
});

test("malformed or empty notifications never cut", () => {
  assert.equal(shouldCutBilling(null), false);
  assert.equal(shouldCutBilling({}), false);
  assert.equal(shouldCutBilling({ costAmount: 5 }), false);
  assert.equal(shouldCutBilling({ costAmount: 5, budgetAmount: 0 }), false);
});
