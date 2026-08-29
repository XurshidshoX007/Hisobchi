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

test("direction tabs include active debts only", () => {
  assert.deepEqual(filterDebtsByTab(debts, "i_owe").map((debt) => debt.id), [1]);
  assert.deepEqual(filterDebtsByTab(debts, "owed_to_me").map((debt) => debt.id), [2]);
});

test("debt UI exposes only the two open-balance directions", () => {
  assert.match(debtPage, /useState<DebtListFilter>\("i_owe"\)/);
  assert.match(debtPage, /\{ value: "i_owe", label: "Men qarzdorman" \}/);
  assert.match(debtPage, /\{ value: "owed_to_me", label: "Menga qarzdor" \}/);
  assert.doesNotMatch(debtPage, /label: "Faol"|label: "Yopilgan"|label: "Hammasi"/);
  assert.match(debtPage, /\{activeDebts\.length \? \(/);
});

test("debt payment action stays compact and never becomes full width", () => {
  assert.match(debtPage, /min-h-9 min-w-\[84px\]/);
  assert.doesNotMatch(debtPage, /To‘lov[\s\S]{0,100}?flex-1/);
  assert.doesNotMatch(debtPage, /<RowActionsButton[\s\S]{0,160}?comfortable/);
});
