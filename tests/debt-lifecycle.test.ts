import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterDebtsByTab, isSettledDebt } from "../src/lib/debt-lifecycle";

const debtPage = readFileSync(new URL("../src/app/debts/page.tsx", import.meta.url), "utf8");

const debts = [
  { id: 1, direction: "i_owe" as const, remainingAmount: 50_000 },
  { id: 2, direction: "owed_to_me" as const, remainingAmount: 21_000 },
  { id: 3, direction: "owed_to_me" as const, remainingAmount: 0 },
];

test("zero remaining debt is settled even if a legacy status field drifted", () => {
  assert.equal(isSettledDebt({ remainingAmount: 0 }), true);
  assert.equal(isSettledDebt({ remainingAmount: 0.01 }), false);
});

test("the default active tab hides settled debts", () => {
  assert.deepEqual(filterDebtsByTab(debts, "active").map((debt) => debt.id), [1, 2]);
});

test("direction tabs include active debts only and settled has its own tab", () => {
  assert.deepEqual(filterDebtsByTab(debts, "i_owe").map((debt) => debt.id), [1]);
  assert.deepEqual(filterDebtsByTab(debts, "owed_to_me").map((debt) => debt.id), [2]);
  assert.deepEqual(filterDebtsByTab(debts, "settled").map((debt) => debt.id), [3]);
});

test("settled debt UI is historical and cannot accept another payment", () => {
  assert.match(debtPage, /useState<DebtListFilter>\("active"\)/);
  assert.match(debtPage, /\{ value: "settled", label: "Yopilgan" \}/);
  assert.match(debtPage, /\{!settled \? \([\s\S]{0,500}?setPayFor\(d\)/);
  assert.match(debtPage, /✓ To‘liq to‘langan/);
  assert.match(debtPage, /tone=\{settled \? "positive" : "auto"\}/);
});
