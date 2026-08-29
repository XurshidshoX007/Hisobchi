import assert from "node:assert/strict";
import test from "node:test";
import { hasEnoughAnalyticsData, MIN_ANALYTICS_TRANSACTIONS, onboardingStorageKey, shouldStartOnboarding } from "../src/lib/onboarding";

test("analytics preview remains until two completed operations exist", () => {
  assert.equal(MIN_ANALYTICS_TRANSACTIONS, 2);
  assert.equal(hasEnoughAnalyticsData([]), false);
  assert.equal(hasEnoughAnalyticsData([{ isDeleted: false }]), false);
  assert.equal(hasEnoughAnalyticsData([{ isDeleted: false }, { isDeleted: false }]), true);
  assert.equal(hasEnoughAnalyticsData([{ isDeleted: false }, { isDeleted: true }, { isDeleted: false }]), true);
});

test("onboarding starts only for a completely new finance space", () => {
  const blank = { transactions: [], recurring: [], expectedIncomes: [], goals: [], budgets: [], debts: [] };
  assert.equal(shouldStartOnboarding(blank), true);
  assert.equal(shouldStartOnboarding({ ...blank, transactions: [{ isDeleted: false }] }), false);
  assert.equal(shouldStartOnboarding({ ...blank, recurring: [{}] }), false);
  assert.equal(shouldStartOnboarding({ ...blank, transactions: [{ isDeleted: true }] }), true);
});

test("onboarding progress is isolated per user", () => {
  assert.equal(onboardingStorageKey(17), "hisobchi:onboarding:v1:user-17");
  assert.notEqual(onboardingStorageKey(17), onboardingStorageKey(18));
});
