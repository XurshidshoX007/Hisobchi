import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8");
const fab = readFileSync(new URL("../src/components/fab.tsx", import.meta.url), "utf8");
const plans = readFileSync(new URL("../src/app/plans/page.tsx", import.meta.url), "utf8");
const planFilter = readFileSync(new URL("../src/components/plan-status-filter.tsx", import.meta.url), "utf8");
const filterControls = readFileSync(new URL("../src/components/filter-controls.tsx", import.meta.url), "utf8");
const transactionFilter = readFileSync(new URL("../src/components/transaction-filter.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/app/transactions/page.tsx", import.meta.url), "utf8");

test("mobile chrome uses shared geometry instead of magic FAB offsets", () => {
  for (const variable of ["--bottom-nav-height", "--fab-size", "--fab-gap"]) {
    assert.match(css, new RegExp(variable));
  }
  assert.match(css, /--app-safe-area-bottom:[\s\S]*env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /bottom:\s*calc\(var\(--app-safe-area-bottom\) \+ var\(--bottom-nav-height\) \+ var\(--fab-gap\)\)/);
  assert.doesNotMatch(shell, /148px/);
  assert.doesNotMatch(css, /bottom:\s*(72|80)px/);
});

test("AppShell mounts one global add FAB and reserves the shared slot for History filters", () => {
  assert.equal((shell.match(/<GlobalAddFab\s*\/>/g) ?? []).length, 1);
  assert.match(shell, /const hasContextualFab = pathname === "\/transactions"/);
  assert.match(shell, /hasGlobalFab \|\| hasContextualFab/);
  assert.match(shell, /hasFloatingAction \? "has-global-fab"/);
  assert.match(css, /\.app-shell-layout\.has-global-fab/);
  assert.match(css, /--z-bottom-nav:\s*40/);
  assert.match(css, /--z-fab:\s*50/);
  assert.match(css, /--z-sheet:\s*80/);
});

test("global FAB remains solid and exposes the required dialog semantics", () => {
  assert.match(fab, /bg-primary text-primary-fg/);
  assert.match(fab, /aria-label="Qo‘shish"/);
  assert.match(fab, /aria-expanded=\{open\}/);
  assert.match(fab, /aria-haspopup="dialog"/);
  assert.doesNotMatch(fab, /bg-primary\//);
});

test("plans share one compact single-select status filter", () => {
  assert.equal((plans.match(/<PlanStatusFilter/g) ?? []).length, 2);
  assert.doesNotMatch(plans, /STATUS_TABS/);
  for (const label of ["Faol", "Pauza", "Yakunlangan", "Bekor qilingan"]) {
    assert.match(planFilter, new RegExp(label));
  }
  assert.match(planFilter, /To‘lovlarni filtrlash/);
  assert.match(planFilter, /<FilterButton/);
  assert.match(filterControls, /aria-expanded=\{open\}/);
  assert.match(filterControls, /aria-haspopup="dialog"/);
  assert.doesNotMatch(planFilter + transactionFilter, /Apply|Qo‘llash/);
});

test("History keeps search visible and only true filters in the shared sheet", () => {
  assert.match(history, /<PageHeader title="Tarix"/);
  assert.match(history, /<TextInput/);
  assert.match(history, /placeholder="Kategoriya, izoh yoki summa"/);
  assert.match(history, /const \[searchQuery, setSearchQuery\]/);
  assert.match(history, /const \[filterState, setFilterState\]/);
  assert.match(history, /composeTransactionFilters\(filterState, searchQuery\)/);
  assert.match(history, /<TransactionFilter/);
  assert.match(transactionFilter, /title="Tarixni filtrlash"/);
  assert.match(transactionFilter, /Operatsiya turi/);
  assert.match(transactionFilter, /Kategoriya/);
  assert.doesNotMatch(transactionFilter, /label="Qidiruv"|Tarixdan qidirish/);
  assert.match(transactionFilter, /Filtrlarni tozalash/);
  assert.match(transactionFilter, /status=\{localCount \|\| undefined\}/);
  assert.match(transactionFilter, /floating/);
});

test("History controls expose labelled search, floating dialog and active indicator semantics", () => {
  assert.match(history, /htmlFor="history-search"/);
  assert.match(history, /aria-label="Qidiruvni tozalash"/);
  assert.match(transactionFilter, /ariaLabel="Filtrlar"/);
  assert.match(filterControls, /aria-haspopup="dialog"/);
  assert.match(filterControls, /global-fab/);
  assert.match(filterControls, /ta faol filtr/);
  assert.match(filterControls, /role="radiogroup"/);
  assert.match(transactionFilter, /overflow-y-auto overflow-x-hidden/);
});

/* ============ Plans → To‘lovlar / Daromad: no summary cards above the lists ============ */

const ui = readFileSync(new URL("../src/components/ui.tsx", import.meta.url), "utf8");

test("the plan summary component no longer exists in the tree", () => {
  assert.equal(existsSync(new URL("../src/components/plan-summary.tsx", import.meta.url)), false);
  assert.doesNotMatch(plans, /plan-summary/);
  assert.doesNotMatch(plans, /MonthlyPlanSummary|SecondaryPlanMetrics|MonthLoadCard|StatCard/);
});

test("payments tab renders no monthly summary block", () => {
  const paymentsTab = plans.slice(plans.indexOf('{tab === "payments" ?'), plans.indexOf('{tab === "income" ?'));
  for (const removed of ["Bu oy · ", "majburiy yuk", "Eng yaqin to‘lov", "<Progress", "Yillik yuklama", "Muddatli qoldiq"]) {
    assert.equal(paymentsTab.includes(removed), false, `payments summary leftover: ${removed}`);
  }
  // The list heading + its filter is the FIRST thing under the tabs.
  // The list heading + its filter is the FIRST rendered element under the tabs.
  assert.match(paymentsTab, /<div className="space-y-3[\s\S]{0,600}?To‘lovlar<\/h2>/);
});

test("income tab renders no expected-income summary block", () => {
  const incomeTab = plans.slice(plans.indexOf('{tab === "income" ?'), plans.indexOf('{tab === "cashflow" ?'));
  for (const removed of ["Kutilayotgan daromad", "90 kunlik prognoz", "taxminiy ", 'label="Aniq"']) {
    assert.equal(incomeTab.includes(removed), false, `income summary leftover: ${removed}`);
  }
  assert.match(incomeTab, /<div className="space-y-3[\s\S]{0,600}?Daromad rejalari<\/h2>/);
});

test("both lists keep their reusable status filter next to the heading", () => {
  assert.match(plans, /To‘lovlar<\/h2>\s*<PlanStatusFilter value=\{planTab\} onChange=\{setPlanTab\} kind="payments" \/>/);
  assert.match(plans, /Daromad rejalari<\/h2>\s*<PlanStatusFilter value=\{incomeTab\} onChange=\{setIncomeTab\} kind="income" \/>/);
});

test("spacing collapses after the removed summaries — no stale gap under the tabs", () => {
  // Tab strip carries no bottom margin of its own any more.
  assert.doesNotMatch(plans, /className="mb-1 sm:mb-4"/);
  for (const tabKey of ['{tab === "payments" ?', '{tab === "income" ?']) {
    const block = plans.slice(plans.indexOf(tabKey), plans.indexOf(tabKey) + 400);
    assert.match(block, /className="space-y-3 sm:space-y-3\.5"/);
  }
});

test("the business logic behind the removed summaries is still available", () => {
  const state = readFileSync(new URL("../src/lib/state.ts", import.meta.url), "utf8");
  const finance = readFileSync(new URL("../src/lib/finance.ts", import.meta.url), "utf8");
  assert.match(state, /currentMonthPlan/);
  assert.match(state, /currentMonthIncome/);
  assert.match(finance, /export function buildCurrentMonthPlan/);
  assert.match(finance, /export function isActivePlanLoad/);
});

test("progress exposes accessible values and stays visually light", () => {
  assert.match(ui, /role="progressbar"/);
  assert.match(ui, /aria-valuenow=/);
  assert.match(ui, /aria-valuemin=\{0\}/);
  assert.match(ui, /aria-valuemax=\{100\}/);
});

test("plans page keeps the global FAB as the only creation entry point", () => {
  assert.doesNotMatch(plans, /Yangi to‘lov rejasi/);
  assert.match(plans, /[Pp]astdagi \+ tugmasi/);
});
