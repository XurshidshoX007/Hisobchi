import test from "node:test";
import assert from "node:assert/strict";
import { computeLedgerBalances, ledgerBalanceCheck, type LedgerTx } from "@hisobchi/shared/lib/finance";
import { todayISOAt } from "@hisobchi/shared/lib/money";
import { showsProfileHeader } from "../src/lib/navigation";

const TODAY = "2026-08-16";

const ACCOUNTS = [
  { id: 1, name: "Naqd pul", initialBalance: 100_000, isActive: true },
  { id: 2, name: "Uzcard", initialBalance: 29_614, isActive: true },
  { id: 3, name: "Yopilgan karta", initialBalance: 0, isActive: false },
];

/* ==================== REAL BALANCE = HISTORY (§13/§17) ==================== */

test("acceptance: 129 614 → bot income +100 000 → 229 614 → bot expense 45 000 → 184 614", () => {
  const ledger: LedgerTx[] = [];
  const balance = () =>
    [...computeLedgerBalances(ACCOUNTS, ledger, TODAY).values()]
      .filter((a) => ACCOUNTS.find((x) => x.id === a.accountId)?.isActive)
      .reduce((s, a) => s + a.currentBalance, 0);

  assert.equal(balance(), 129_614);
  ledger.push({ accountId: 1, type: "income", amount: 100_000, date: TODAY });
  assert.equal(balance(), 229_614);
  ledger.push({ accountId: 1, type: "expense", amount: 45_000, date: TODAY });
  assert.equal(balance(), 184_614);
});

test("a transaction visible in History is visible in the balance (same eligibility rules)", () => {
  const ledger: LedgerTx[] = [
    { accountId: 1, type: "income", amount: 1_000_000, date: "2026-08-01" },
    { accountId: 2, type: "expense", amount: 250_000, date: "2026-08-15" },
  ];
  const check = ledgerBalanceCheck(ACCOUNTS, ledger, TODAY);
  assert.equal(check.realIncome, 1_000_000);
  assert.equal(check.realExpense, 250_000);
  assert.equal(check.computedBalance, 129_614 + 1_000_000 - 250_000);
  assert.equal(check.activeBalance, check.computedBalance);
  assert.equal(check.excludedBalance, 0);
  assert.ok(check.balanced);
});

test("soft-deleted transactions are not money", () => {
  const check = ledgerBalanceCheck(
    ACCOUNTS,
    [{ accountId: 1, type: "income", amount: 500_000, date: TODAY, isDeleted: true }],
    TODAY,
  );
  assert.equal(check.realIncome, 0);
  assert.equal(check.activeBalance, 129_614);
});

test("a future-dated real transaction stays out of today's balance and is reported separately", () => {
  const check = ledgerBalanceCheck(
    ACCOUNTS,
    [{ accountId: 1, type: "income", amount: 1_000_000, date: "2026-08-20" }],
    TODAY,
  );
  assert.equal(check.activeBalance, 129_614);
  assert.equal(check.futureIncome, 1_000_000);
  assert.equal(check.realIncome, 0);
});

/* ==================== THE ROOT CAUSE: ARCHIVED ACCOUNT ==================== */

test("money posted to an archived account is reported as an explicit gap, never silently lost", () => {
  // This is the exact bug shape: the bot booked income on an archived account,
  // History showed it, the dashboard total (active accounts) did not move.
  const check = ledgerBalanceCheck(
    ACCOUNTS,
    [{ accountId: 3, type: "income", amount: 100_000, date: TODAY }],
    TODAY,
  );
  assert.equal(check.realIncome, 100_000);
  assert.equal(check.computedBalance, 229_614);
  assert.equal(check.activeBalance, 129_614);
  assert.equal(check.excludedBalance, 100_000);
  assert.deepEqual(check.excludedAccounts, [{ id: 3, name: "Yopilgan karta", balance: 100_000 }]);
  assert.ok(check.balanced, "active + excluded must always reconcile to the full ledger");
});

/* ==================== TRANSFERS (§14) ==================== */

test("a transfer moves money between accounts and leaves the global balance unchanged", () => {
  const before = ledgerBalanceCheck(ACCOUNTS, [], TODAY).activeBalance;
  const ledger: LedgerTx[] = [{ accountId: 1, toAccountId: 2, type: "transfer", amount: 100_000, date: TODAY }];
  const balances = computeLedgerBalances(ACCOUNTS, ledger, TODAY);
  assert.equal(balances.get(1)?.currentBalance, 0);
  assert.equal(balances.get(2)?.currentBalance, 129_614);
  assert.equal(ledgerBalanceCheck(ACCOUNTS, ledger, TODAY).activeBalance, before);
});

test("transfer legs are attributed to the right side", () => {
  const balances = computeLedgerBalances(
    ACCOUNTS,
    [{ accountId: 1, toAccountId: 2, type: "transfer", amount: 40_000, date: TODAY }],
    TODAY,
  );
  assert.equal(balances.get(1)?.transferOut, 40_000);
  assert.equal(balances.get(1)?.transferIn, 0);
  assert.equal(balances.get(2)?.transferIn, 40_000);
  assert.equal(balances.get(2)?.transferOut, 0);
});

/* ==================== DATE / TIMEZONE SEMANTICS (§3) ==================== */

test("Uzbekistan day boundary: 00:05 local is already the new financial day", () => {
  // 2026-08-16 19:05 UTC === 2026-08-17 00:05 in Tashkent (UTC+5).
  assert.equal(todayISOAt(new Date("2026-08-16T19:05:00Z"), "Asia/Tashkent"), "2026-08-17");
  // 2026-08-16 18:50 UTC === 2026-08-16 23:50 in Tashkent.
  assert.equal(todayISOAt(new Date("2026-08-16T18:50:00Z"), "Asia/Tashkent"), "2026-08-16");
});

test("early-morning Tashkent hours do not fall back to the UTC yesterday", () => {
  // 2026-08-16 00:30 UTC === 2026-08-16 05:30 Tashkent — same day.
  assert.equal(todayISOAt(new Date("2026-08-16T00:30:00Z"), "Asia/Tashkent"), "2026-08-16");
  // 2026-08-15 20:30 UTC === 2026-08-16 01:30 Tashkent — the NEW day, not the 15th.
  assert.equal(todayISOAt(new Date("2026-08-15T20:30:00Z"), "Asia/Tashkent"), "2026-08-16");
});

test("a transaction booked at 00:05 Tashkent lands in the new month, not the previous one", () => {
  const day = todayISOAt(new Date("2026-08-31T19:05:00Z"), "Asia/Tashkent");
  assert.equal(day, "2026-09-01");
  const check = ledgerBalanceCheck(ACCOUNTS, [{ accountId: 1, type: "income", amount: 100_000, date: day }], day);
  assert.equal(check.realIncome, 100_000, "the same day value must make the money visible in the balance");
});

/* ==================== HEADER ROUTE VISIBILITY ==================== */

test("the profile header renders on the Menu route only", () => {
  assert.equal(showsProfileHeader("/"), false);
  assert.equal(showsProfileHeader("/transactions"), false);
  assert.equal(showsProfileHeader("/plans"), false);
  assert.equal(showsProfileHeader("/analytics"), false);
  assert.equal(showsProfileHeader("/more"), true);
});

test("internal pages never show the profile header — Menu owns it exclusively", () => {
  for (const route of ["/accounts", "/budgets", "/debts", "/goals", "/settings", "/bot"]) {
    assert.equal(showsProfileHeader(route), false, route);
  }
  // Nested routes and query strings must not resurrect the header either.
  assert.equal(showsProfileHeader("/accounts/1"), false);
  assert.equal(showsProfileHeader("/accounts?tab=categories"), false);
  assert.equal(showsProfileHeader("/debts/archive"), false);
  assert.equal(showsProfileHeader("/transactions?plan=3"), false);
  // The Menu route keeps it, with or without a query string.
  assert.equal(showsProfileHeader("/more"), true);
  assert.equal(showsProfileHeader("/more?x=1"), true);
});
