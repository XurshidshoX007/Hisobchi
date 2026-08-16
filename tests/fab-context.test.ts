import test from "node:test";
import assert from "node:assert/strict";
import { getFabActions, normalizePath, supportsFab, type FabContext } from "../src/lib/fab";

/* ============================ FAB CONTEXT RESOLVER ============================ */

function ids(ctx: FabContext) {
  return getFabActions(ctx).map((a) => `${a.id}${a.type ? `:${a.type}` : ""}`);
}

test("normalizePath strips query/hash and normalizes root", () => {
  assert.equal(normalizePath("/plans?tab=income"), "/plans");
  assert.equal(normalizePath("/transactions?plan=3#x"), "/transactions");
  assert.equal(normalizePath("/accounts/"), "/accounts");
  assert.equal(normalizePath("/"), "/");
});

test("Dashboard resolves to the three transaction directions", () => {
  const actions = getFabActions({ pathname: "/" });
  assert.deepEqual(ids({ pathname: "/" }), ["transaction:income", "transaction:expense", "transaction:transfer"]);
  assert.equal(actions[0].label, "Kirim");
  assert.equal(actions[1].label, "Chiqim");
  assert.equal(actions[2].label, "Transfer");
});

test("History has no create action or FAB support", () => {
  assert.deepEqual(ids({ pathname: "/transactions" }), []);
  assert.deepEqual(ids({ pathname: "/transactions?plan=3" }), []);
  assert.equal(supportsFab("/transactions"), false);
  assert.equal(supportsFab("/transactions?income=4"), false);
});

test("Plans tab decides the plan action", () => {
  assert.deepEqual(ids({ pathname: "/plans" }), ["payment_plan"]);
  assert.deepEqual(ids({ pathname: "/plans", tab: "payments" }), ["payment_plan"]);
  assert.deepEqual(ids({ pathname: "/plans", tab: "income" }), ["expected_income"]);
});

test("Plans cash-flow offers no misleading create action", () => {
  assert.deepEqual(getFabActions({ pathname: "/plans", tab: "cashflow" }), []);
});

test("Analytics has no create action", () => {
  assert.deepEqual(ids({ pathname: "/analytics" }), []);
  assert.equal(supportsFab("/analytics"), false);
});

test("Menu exposes the 5 secondary-tool entities", () => {
  assert.deepEqual(ids({ pathname: "/more" }), ["account", "debt", "goal", "budget", "category"]);
});

test("Accounts sub-tab switches between account and category", () => {
  assert.deepEqual(ids({ pathname: "/accounts" }), ["account"]);
  assert.deepEqual(ids({ pathname: "/accounts", accountsTab: "accounts" }), ["account"]);
  assert.deepEqual(ids({ pathname: "/accounts", accountsTab: "categories" }), ["category"]);
});

test("Debts, goals and budgets map to their own sheets", () => {
  assert.deepEqual(ids({ pathname: "/debts" }), ["debt"]);
  assert.deepEqual(ids({ pathname: "/goals" }), ["goal"]);
  assert.deepEqual(ids({ pathname: "/budgets" }), ["budget"]);
});

test("Settings and unknown routes have no FAB and no actions", () => {
  assert.deepEqual(getFabActions({ pathname: "/settings" }), []);
  assert.deepEqual(getFabActions({ pathname: "/bot" }), []);
  assert.deepEqual(getFabActions({ pathname: "/unknown" }), []);
  assert.equal(supportsFab("/settings"), false);
  assert.equal(supportsFab("/bot"), false);
  assert.equal(supportsFab("/unknown"), false);
});

test("All create routes support the FAB", () => {
  for (const path of ["/", "/plans", "/more", "/accounts", "/debts", "/goals", "/budgets"]) {
    assert.equal(supportsFab(path), true, path);
  }
});

test("action lists stay compact (never a giant menu)", () => {
  for (const ctx of [
    { pathname: "/" },
    { pathname: "/plans" },
    { pathname: "/plans", tab: "income" as const },
    { pathname: "/more" },
    { pathname: "/accounts" },
    { pathname: "/debts" },
    { pathname: "/goals" },
    { pathname: "/budgets" },
  ]) {
    const count = getFabActions(ctx).length;
    assert.ok(count >= 1 && count <= 5, `${ctx.pathname}: ${count} actions`);
  }
});
