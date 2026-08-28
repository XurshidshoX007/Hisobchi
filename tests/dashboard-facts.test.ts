import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAnalytics, computeLedgerBalances, type AccountView } from "../src/lib/finance";
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
  assert.equal(facts.month, "2026-08");
});

test("category identity is based on id, positive rows are sorted and every current-month expense category is kept", () => {
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
  assert.deepEqual(facts.expenseCategories.map((category) => category.amount), [70_000, 60_000, 50_000, 40_000, 30_000, 20_000, 10_000]);
  assert.equal(facts.hasMoreExpenseCategories, false);
  assert.equal(facts.expenseCategories.some((category) => category.amount <= 0), false);

  const sameName = dashboardFacts(rows, categories, 10).expenseCategories.filter((category) => category.name === "Bir xil nom");
  assert.deepEqual(sameName.map((category) => category.id).sort(), [10, 11]);
});

function makeAccount(overrides: Partial<AccountView> & Pick<AccountView, "id" | "name" | "type" | "currentBalance">): AccountView {
  return {
    currency: "UZS",
    initialBalance: overrides.currentBalance,
    isActive: true,
    inflow: 0,
    outflow: 0,
    txCount: 0,
    ...overrides,
  };
}

test("balanceGroups collapses card families, drops empty types and shares only positive totals", () => {
  const balances = computeLedgerBalances(ACCOUNTS, [], TODAY);
  const currentBalance = [...balances.values()].reduce((sum, account) => sum + account.currentBalance, 0);
  const analytics = buildAnalytics({
    transactions: [],
    categories: CATEGORIES,
    recurringBase: 0,
    currentBalance,
    today: TODAY,
  });

  const accounts: AccountView[] = [
    makeAccount({ id: 1, name: "Naqd", type: "cash", currentBalance: 5_220_000 }),
    makeAccount({ id: 2, name: "Uzcard", type: "uzcard", currentBalance: 3_130_000 }),
    makeAccount({ id: 3, name: "Humo", type: "humo", currentBalance: 2_500_000 }),
    makeAccount({ id: 4, name: "Kapital", type: "bank", currentBalance: 1_600_000 }),
    makeAccount({ id: 5, name: "Payme", type: "ewallet", currentBalance: 0 }),
    makeAccount({ id: 6, name: "Arxiv", type: "cash", currentBalance: 900_000, isActive: false }),
  ];

  const facts = selectDashboardFacts({ currentBalance, analytics, accounts });

  // Cash + cards + bank stay; the zero ewallet and inactive account drop out.
  assert.deepEqual(
    facts.balanceGroups.map((group) => ({ key: group.key, amount: group.amount, accounts: group.accounts.length })),
    [
      { key: "cash", amount: 5_220_000, accounts: 1 },
      { key: "cards", amount: 5_630_000, accounts: 2 },
      { key: "bank", amount: 1_600_000, accounts: 1 },
    ],
  );

  const total = facts.balanceGroups.reduce((sum, group) => sum + group.amount, 0);
  assert.equal(total, 12_450_000);
  const sharesSum = facts.balanceGroups.reduce((sum, group) => sum + group.share, 0);
  assert.ok(Math.abs(sharesSum - 1) < 1e-9, "positive shares must sum to 1");
  assert.equal(facts.hasBalanceBreakdown, true);

  // Cards are sorted inside their bucket by balance desc so the sheet reads Uzcard first.
  const cards = facts.balanceGroups.find((group) => group.key === "cards");
  assert.deepEqual(cards?.accounts.map((account) => account.type), ["uzcard", "humo"]);
});

test("balanceGroups tolerates missing accounts and hides the breakdown when it would say nothing new", () => {
  const balances = computeLedgerBalances(ACCOUNTS, [], TODAY);
  const currentBalance = [...balances.values()].reduce((sum, account) => sum + account.currentBalance, 0);
  const analytics = buildAnalytics({
    transactions: [],
    categories: CATEGORIES,
    recurringBase: 0,
    currentBalance,
    today: TODAY,
  });

  // Legacy call sites (no `accounts`) keep working.
  const legacy = selectDashboardFacts({ currentBalance, analytics });
  assert.deepEqual(legacy.balanceGroups, []);
  assert.equal(legacy.hasBalanceBreakdown, false);

  // A single non-empty group is not worth a dedicated peek.
  const single = selectDashboardFacts({
    currentBalance,
    analytics,
    accounts: [makeAccount({ id: 1, name: "Naqd", type: "cash", currentBalance: 100_000 })],
  });
  assert.equal(single.balanceGroups.length, 1);
  assert.equal(single.hasBalanceBreakdown, false);
});

test("Dashboard presentation contains only the approved hierarchy and preserves shared add/error flows", () => {
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const components = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  const visibleSource = `${page}\n${components}`;

  // ONE primary number, then one primary action set, then context. The month
  // appears once, in the header, and never again beside an amount.
  assert.match(components, />Umumiy balans</);
  assert.match(components, /<Money whole value=\{facts\.balance\} size="hero"/);
  assert.doesNotMatch(page, /Dashboard oyi|<time\b/);
  assert.equal((components.match(/<Money whole/g) ?? []).length, 2, "every dashboard amount must hide fractional tiyin");

  // The per-category income + expense lists moved to Analytics; the screen now
  // answers "where did it go?" with a single chart instead of two long lists.
  assert.doesNotMatch(visibleSource, /Daromad kategoriyalari|Xarajat kategoriyalari/);
  assert.match(components, /<CategoryDonut/);
  assert.match(components, /Xarajat taqsimoti/);

  // Ownership boundary: forecast/insight vocabulary still belongs to Reja.
  assert.doesNotMatch(visibleSource, /sof natija|safe.?to.?spend|prognoz|kutilayotgan daromad|majburiy to['‘’]?lov|cash.?flow|insight/i);
  assert.doesNotMatch(page, /buildForecast|buildMonthlyView/);

  // Shared flows survive the redesign.
  assert.match(page, /QuickAddSheet/);
  assert.match(page, /Qayta urinish/);
  assert.match(components, /min-w-0/);

  // The balance composition reference lives inside the hero (single card) and
  // opens the peek sheet from the same page — no new card, no new tab.
  assert.match(components, /BalanceSegments/);
  assert.match(page, /BalanceBreakdownSheet/);
  assert.match(page, /onOpenBreakdown/);
});

test("the balance panel is one object, not a card inside a card", () => {
  const components = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  const hero = components.slice(components.indexOf("export function DashboardHero"), components.indexOf("function BalanceSegments"));

  // Exactly one <Card> opens the hero; the account split is a bar plus a
  // divided footer row inside it, never a nested card.
  assert.equal((hero.match(/<Card\b/g) ?? []).length, 1);
  assert.match(hero, /border-t border-line/);

  // The privacy toggle masks amounts globally through <Money>, so no screen can
  // leak a figure by formatting it its own way.
  assert.match(components, /aria-pressed=\{hidden\}/);
  const ui = readFileSync(new URL("../src/components/ui.tsx", import.meta.url), "utf8");
  assert.match(ui, /const hidden = useBalanceHidden\(\)/);
  assert.match(ui, /if \(hidden\) \{/);
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
  // The screen is a single column at every phone width. The only side-by-side
  // groups are fixed small grids (4 quick actions, 2 month cells) that fit at
  // 320px because their content is an icon plus a short label.
  assert.match(dashboard, /grid grid-cols-4 gap-2/);
  assert.match(dashboard, /grid min-w-0 grid-cols-2 gap-2\.5/);
  assert.match(ui, /Money[\s\S]*break-words/);
  assert.doesNotMatch(dashboard, /overflow-x-auto|whitespace-nowrap/);

  // The shared shell reserves bottom-nav + FAB + safe-area height, preventing
  // the final category row from sitting under the floating add control.
  assert.match(css, /\.app-shell-layout\.has-global-fab[\s\S]*var\(--fab-size\)[\s\S]*var\(--fab-gap\)/);
  assert.match(css, /--app-safe-area-bottom:[\s\S]*env\(safe-area-inset-bottom, 0px\)/);
});
