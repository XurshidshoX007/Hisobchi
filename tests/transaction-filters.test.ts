import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TRANSACTION_FILTERS,
  DEFAULT_TRANSACTION_FILTER_STATE,
  composeTransactionFilters,
  filterTransactions,
  localTransactionFilterCount,
  transactionCategoryOptions,
  type TransactionFilters,
} from "../src/lib/transaction-filters";

const transactions = [
  {
    id: 1,
    type: "expense" as const,
    categoryId: 10,
    note: "Haftalik bozor",
    categoryName: "Oziq-ovqat",
    accountName: "Uzcard",
    amount: 150_000,
    recurringId: 7,
    expectedIncomeId: null,
  },
  {
    id: 2,
    type: "income" as const,
    categoryId: 20,
    note: "Avgust",
    categoryName: "Maosh",
    accountName: "Humo",
    amount: 3_000_000,
    recurringId: null,
    expectedIncomeId: 8,
  },
  {
    id: 3,
    type: "transfer" as const,
    categoryId: null,
    note: null,
    categoryName: null,
    accountName: "Naqd pul",
    amount: 500_000,
    recurringId: null,
    expectedIncomeId: null,
  },
];

const defaults = (): TransactionFilters => ({ ...DEFAULT_TRANSACTION_FILTERS });

test("transaction filters preserve note, category, account and amount matching", () => {
  for (const query of ["bozor", "oziq", "uzcard", "150000"]) {
    const result = filterTransactions(transactions, { ...defaults(), query }, { planId: null, incomeId: null });
    assert.deepEqual(result.map((transaction) => transaction.id), [1], query);
  }
});

test("localized decimal amount search uses the same value shown in History", () => {
  const decimal = { ...transactions[0], id: 96, note: "Uzum nasiya kredit", amount: 7532.96 };
  for (const query of ["7532.96", "7532,96", "7 532,96"]) {
    const result = filterTransactions([decimal], { ...defaults(), query }, { planId: null, incomeId: null });
    assert.deepEqual(result.map((transaction) => transaction.id), [96], query);
  }
});

test("route context combines with type and category using AND semantics", () => {
  const result = filterTransactions(
    transactions,
    { type: "expense", categoryId: "10", query: "bozor" },
    { planId: 7, incomeId: null },
  );
  assert.deepEqual(result.map((transaction) => transaction.id), [1]);

  const wrongType = filterTransactions(
    transactions,
    { type: "income", categoryId: "10", query: "" },
    { planId: 7, incomeId: null },
  );
  assert.deepEqual(wrongType, []);
});

test("income route context remains independent from local reset", () => {
  const result = filterTransactions(transactions, defaults(), { planId: null, incomeId: 8 });
  assert.deepEqual(result.map((transaction) => transaction.id), [2]);
  assert.deepEqual(DEFAULT_TRANSACTION_FILTERS, { type: "all", categoryId: "", query: "" });
});

test("category options are active, type-aware and de-duplicated by name", () => {
  const categories = [
    { id: 10, name: "Oziq-ovqat", type: "expense" as const, isActive: true },
    { id: 11, name: "Transport", type: "expense" as const, isActive: true },
    { id: 12, name: "Eski", type: "expense" as const, isActive: false },
    { id: 20, name: "Maosh", type: "income" as const, isActive: true },
    { id: 21, name: "Oziq-ovqat", type: "income" as const, isActive: true },
  ];

  assert.deepEqual(transactionCategoryOptions(categories, "expense").map((category) => category.id), [10, 11]);
  assert.deepEqual(transactionCategoryOptions(categories, "income").map((category) => category.id), [20, 21]);
  assert.deepEqual(transactionCategoryOptions(categories, "all").map((category) => category.id), [10, 11, 20]);
  assert.deepEqual(transactionCategoryOptions(categories, "transfer"), []);
});

test("inactive categories never hide old history unless a user filter is explicitly selected", () => {
  const result = filterTransactions(transactions, defaults(), { planId: null, incomeId: null });
  assert.equal(result.length, transactions.length);
});

test("active local filter count excludes search and route-owned context", () => {
  assert.equal(localTransactionFilterCount(DEFAULT_TRANSACTION_FILTER_STATE), 0);
  assert.equal(localTransactionFilterCount({ type: "expense", categoryId: "10" }), 2);
});

test("independent search and filter state compose with AND semantics", () => {
  const filterState = { type: "expense" as const, categoryId: "" };
  const combined = composeTransactionFilters(filterState, "bozor");
  const result = filterTransactions(transactions, combined, { planId: null, incomeId: null });

  assert.deepEqual(result.map((transaction) => transaction.id), [1]);
  assert.deepEqual(filterState, { type: "expense", categoryId: "" });
});

test("clearing either search or filters preserves the other state", () => {
  const filterState = { type: "expense" as const, categoryId: "10" };
  assert.deepEqual(composeTransactionFilters(filterState, ""), { ...filterState, query: "" });
  assert.deepEqual(composeTransactionFilters(DEFAULT_TRANSACTION_FILTER_STATE, "bozor"), {
    ...DEFAULT_TRANSACTION_FILTER_STATE,
    query: "bozor",
  });
});
