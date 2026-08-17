import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAnalytics, computeLedgerBalances } from "../src/lib/finance";
import { selectDashboardFacts } from "../src/lib/dashboard";

const TODAY = "2026-08-16";
const ACCOUNTS = [{ id: 1, initialBalance: 100_000 }];
const CATEGORIES = [
  { id: 1, name: "Ish haqi", icon: "◉", isEssential: false },
  { id: 2, name: "Qo‘shimcha daromad", icon: "+", isEssential: false },
  { id: 3, name: "Oziq-ovqat", icon: "●", isEssential: true },
  { id: 4, name: "Transport", icon: "◆", isEssential: true },
];

type TestTx = {
  id: number;
  accountId: number;
  type: "income" | "expense";
  amount: number;
  date: string;
  categoryId: number | null;
  source?: "mini_app" | "bot";
  isDeleted?: boolean;
};

function dashboardFacts(transactions: TestTx[], categories = CATEGORIES, limit?: number) {
  const balances = computeLedgerBalances(ACCOUNTS, transactions, TODAY);
  const currentBalance = [...balances.values()].reduce((sum, account) => sum + account.currentBalance, 0);
  const analytics = buildAnalytics({
    transactions: transactions.map((transaction) => ({ ...transaction, note: null })),
    categories,
    recurringBase: 0,
    currentBalance,
    today: TODAY,
  });
  return selectDashboardFacts({ currentBalance, analytics }, limit);
}

test("balance, current-month totals and categories follow income/expense add and delete", () => {
  const rows: TestTx[] = [];
  assert.deepEqual(
    { balance: dashboardFacts(rows).balance, income: dashboardFacts(rows).income, expense: dashboardFacts(rows).expense },
    { balance: 100_000, income: 0, expense: 0 },
  );

  rows.push({ id: 1, accountId: 1, type: "income", amount: 1_000_000, date: TODAY, categoryId: 1, source: "mini_app" });
  let facts = dashboardFacts(rows);
  assert.equal(facts.balance, 1_100_000);
  assert.equal(facts.income, 1_000_000);
  assert.deepEqual(facts.incomeCategories.map(({ name, amount }) => ({ name, amount })), [
    { name: "Ish haqi", amount: 1_000_000 },
  ]);

  rows.push({ id: 2, accountId: 1, type: "expense", amount: 300_000, date: TODAY, categoryId: 3, source: "mini_app" });
  facts = dashboardFacts(rows);
  assert.equal(facts.balance, 800_000);
  assert.equal(facts.expense, 300_000);
  assert.deepEqual(facts.expenseCategories.map(({ name, amount }) => ({ name, amount })), [
    { name: "Oziq-ovqat", amount: 300_000 },
  ]);

  rows[1].isDeleted = true;
  facts = dashboardFacts(rows);
  assert.equal(facts.balance, 1_100_000);
  assert.equal(facts.expense, 0);
  assert.deepEqual(facts.expenseCategories, []);

  rows[0].isDeleted = true;
  facts = dashboardFacts(rows);
  assert.equal(facts.balance, 100_000);
  assert.equal(facts.income, 0);
  assert.deepEqual(facts.incomeCategories, []);
});

test("a two-decimal transaction stays identical in balance, summary and category totals", () => {
  const facts = dashboardFacts([
    { id: 96, accountId: 1, type: "expense", amount: 7532.96, date: TODAY, categoryId: 3, source: "bot" },
  ]);

  assert.equal(facts.balance, 92_467.04);
  assert.equal(facts.expense, 7532.96);
  assert.equal(facts.expenseCategories[0]?.amount, 7532.96);
});

test("transaction amount/category edit replaces the old aggregation instead of adding to it", () => {
  const before = dashboardFacts([
    { id: 1, accountId: 1, type: "expense", amount: 200_000, date: TODAY, categoryId: 3 },
  ]);
  assert.equal(before.balance, -100_000);
  assert.equal(before.expenseCategories[0]?.name, "Oziq-ovqat");
  assert.equal(before.expenseCategories[0]?.amount, 200_000);

  // runMutation updates this database row in place. Rebuilding state must see
  // only its new amount and category, with no residual value under the old one.
  const after = dashboardFacts([
    { id: 1, accountId: 1, type: "expense", amount: 350_000, date: TODAY, categoryId: 4 },
  ]);
  assert.equal(after.balance, -250_000);
  assert.equal(after.expense, 350_000);
  assert.deepEqual(after.expenseCategories.map(({ name, amount }) => ({ name, amount })), [
    { name: "Transport", amount: 350_000 },
  ]);
});

test("Mini App and bot transactions enter the same shared ledger and category aggregation", () => {
  const facts = dashboardFacts([
    { id: 1, accountId: 1, type: "income", amount: 500_000, date: TODAY, categoryId: 1, source: "mini_app" },
    { id: 2, accountId: 1, type: "income", amount: 250_000, date: TODAY, categoryId: 1, source: "bot" },
    { id: 3, accountId: 1, type: "expense", amount: 90_000, date: TODAY, categoryId: 3, source: "bot" },
  ]);

  assert.equal(facts.balance, 760_000);
  assert.equal(facts.income, 750_000);
  assert.equal(facts.expense, 90_000);
  assert.equal(facts.incomeCategories[0]?.amount, 750_000);
  assert.equal(facts.expenseCategories[0]?.amount, 90_000);
});

test("future income/payment are excluded; previous-month operations affect balance but not this month", () => {
  const facts = dashboardFacts([
    { id: 1, accountId: 1, type: "income", amount: 500_000, date: "2026-07-31", categoryId: 1 },
    { id: 2, accountId: 1, type: "expense", amount: 50_000, date: "2026-07-31", categoryId: 3 },
    { id: 3, accountId: 1, type: "income", amount: 2_000_000, date: "2026-08-17", categoryId: 2 },
    { id: 4, accountId: 1, type: "expense", amount: 700_000, date: "2026-08-18", categoryId: 4 },
  ]);

  assert.equal(facts.balance, 550_000, "only completed operations may change today's balance");
  assert.equal(facts.income, 0, "the dashboard movement is current month only");
  assert.equal(facts.expense, 0);
  assert.deepEqual(facts.incomeCategories, []);
  assert.deepEqual(facts.expenseCategories, []);
  assert.equal(facts.monthLabel, "Avgust 2026");
});

test("category identity is based on id, positive rows are sorted and the dashboard list is capped", () => {
  const categories = Array.from({ length: 8 }, (_, index) => ({
    id: index + 10,
    name: index < 2 ? "Bir xil nom" : `Kategoriya ${index}`,
    icon: "•",
    isEssential: false,
  }));
  const rows: TestTx[] = categories.slice(0, 7).map((category, index) => ({
    id: index + 1,
    accountId: 1,
    type: "expense",
    amount: (index + 1) * 10_000,
    date: TODAY,
    categoryId: category.id,
  }));
  rows.push({ id: 99, accountId: 1, type: "expense", amount: 900_000, date: "2026-07-15", categoryId: categories[7].id });

  const facts = dashboardFacts(rows, categories, 5);
  assert.deepEqual(facts.expenseCategories.map((category) => category.amount), [70_000, 60_000, 50_000, 40_000, 30_000]);
  assert.equal(facts.hasMoreExpenseCategories, true);
  assert.equal(facts.expenseCategories.some((category) => category.amount <= 0), false);

  const sameName = dashboardFacts(rows, categories, 10).expenseCategories.filter((category) => category.name === "Bir xil nom");
  assert.deepEqual(sameName.map((category) => category.id).sort(), [10, 11]);
});

test("Dashboard presentation contains only the approved hierarchy and preserves shared add/error flows", () => {
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const components = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  const visibleSource = `${page}\n${components}`;

  assert.match(visibleSource, /Balans/i);
  assert.match(visibleSource, /Daromad kategoriyalari/);
  assert.match(visibleSource, /Xarajat kategoriyalari/);
  assert.doesNotMatch(page, /Dashboard oyi|<time\b/);
  assert.doesNotMatch(components, />Hamyon<\/p>/);
  assert.match(
    components,
    /items-start justify-between[\s\S]{0,500}>Balans<\/p>[\s\S]{0,500}<Money whole value=\{facts\.balance\}[\s\S]{0,500}<WalletIcon/,
  );
  assert.equal((components.match(/<Money whole/g) ?? []).length, 4, "every dashboard amount must hide fractional tiyin");
  assert.doesNotMatch(visibleSource, /sof natija|safe.?to.?spend|prognoz|kutilayotgan daromad|majburiy to['‘’]?lov|cash.?flow|insight/i);
  assert.doesNotMatch(page, /charts|buildForecast|buildMonthlyView/);
  assert.match(page, /useFabPage/);
  assert.match(page, /QuickAddSheet/);
  assert.match(page, /Qayta urinish/);
  assert.match(components, /md:grid-cols-2/);
  assert.match(components, /min-w-0/);
});

test("sync and user-isolation guards remain in the shared state/mutation paths", () => {
  const provider = readFileSync(new URL("../src/components/providers.tsx", import.meta.url), "utf8");
  const bot = readFileSync(new URL("../src/lib/bot.ts", import.meta.url), "utf8");
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  const state = readFileSync(new URL("../src/lib/state.ts", import.meta.url), "utf8");

  assert.match(provider, /if \(json\.state\) setState\(json\.state\)/, "Mini App mutation must install rebuilt server state");
  assert.match(provider, /addEventListener\("focus"/);
  assert.match(provider, /addEventListener\("pageshow"/);
  assert.match(provider, /addEventListener\("visibilitychange"/);
  assert.match(bot, /quickAdd\(user/);
  assert.match(bot, /buildAppState\(user\)/);
  assert.match(state, /eq\(transactions\.userId, user\.id\)/);
  assert.match(mutations, /eq\(transactions\.userId, userId\)/);
});

test("responsive contract keeps 320/375/390/430 mobile layouts stacked and desktop two-column", () => {
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../src/components/ui.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  // Tailwind's md breakpoint is 768px: all required phone widths therefore use
  // the base one-column layout, while wider layouts opt into two columns.
  for (const viewport of [320, 375, 390, 430]) {
    assert.ok(viewport < 768, `${viewport}px must remain in the stacked layout`);
  }
  assert.match(page, /grid min-w-0 gap-5 md:grid-cols-2/);
  assert.match(dashboard, /grid min-w-0 grid-cols-2/);
  assert.match(ui, /Money[\s\S]*break-words/);
  assert.doesNotMatch(dashboard, /overflow-x-auto|whitespace-nowrap/);

  // The shared shell reserves bottom-nav + FAB + safe-area height, preventing
  // the final category row from sitting under the floating add control.
  assert.match(css, /\.app-shell-layout\.has-global-fab[\s\S]*var\(--fab-size\)[\s\S]*var\(--fab-gap\)/);
  assert.match(css, /--app-safe-area-bottom:[\s\S]*env\(safe-area-inset-bottom, 0px\)/);
});
