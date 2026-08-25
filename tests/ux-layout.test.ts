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
  for (const variable of ["--bottom-nav-height", "--fab-size", "--fab-gap", "--content-bottom-gap"]) {
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
  assert.match(css, /\.app-shell-layout\.has-global-fab[\s\S]*var\(--fab-size\)[\s\S]*var\(--content-bottom-gap\)/);
  assert.match(css, /--z-bottom-nav:\s*40/);
  assert.match(css, /--z-fab:\s*50/);
  assert.match(css, /--z-sheet:\s*80/);
});

test("Add and History filter reuse one viewport-fixed action foundation", () => {
  assert.match(ui, /export function FloatingActionButton/);
  assert.match(ui, /global-fab grid h-14 w-14/);
  assert.match(fab, /<FloatingActionButton/);
  assert.match(filterControls, /<FloatingActionButton\s+portal/);
  assert.match(ui, /return <BodyPortal>\{button\}<\/BodyPortal>/);
  assert.match(ui, /createPortal\(children, document\.body\)/);
});

test("global FAB remains solid and exposes the required dialog semantics", () => {
  assert.match(ui, /export function FloatingActionButton/);
  assert.match(ui, /bg-primary text-primary-fg/);
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

test("History keeps search visible, a minimal summary and only true filters in the shared sheet", () => {
  assert.doesNotMatch(history, /<PageHeader[^>]*title=/);
  assert.doesNotMatch(history, /<h1\b[^>]*>Tarix/);
  assert.match(history, /\+\{compact\(totals\.income\)\}/);
  assert.match(history, /−\{compact\(totals\.expense\)\}/);
  assert.match(history, /\{totals\.count\} ta/);
  assert.doesNotMatch(history, /\bSof\b|\bsof\b/);
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

test("History list, editor and summaries all consume the transaction amount field", () => {
  assert.match(history, /sum \+ transaction\.amount/);
  assert.match(history, /value=\{transaction\.type === "expense" \? -transaction\.amount : transaction\.amount\}/);
  assert.match(history, /setEditing\(transaction\)/);
  assert.doesNotMatch(history, /parseFloat|toLocaleString|Math\.round/);
});

test("History controls expose labelled search, floating dialog and active indicator semantics", () => {
  assert.match(history, /htmlFor="history-search"/);
  assert.match(history, /aria-label="Qidiruvni tozalash"/);
  assert.match(transactionFilter, /ariaLabel="Filtrlar"/);
  assert.match(filterControls, /aria-haspopup="dialog"/);
  assert.match(filterControls, /<FloatingActionButton/);
  assert.match(filterControls, /ta faol filtr/);
  assert.match(filterControls, /role="radiogroup"/);
  assert.match(transactionFilter, /overflow-y-auto overflow-x-hidden/);
});

test("History edit action renders a standard-oriented SVG pencil, not a text glyph", () => {
  // U+270E (“lower right pencil”) points to the lower RIGHT and reads mirrored;
  // its rendering is also font-dependent, so it must not come back as UI text.
  assert.doesNotMatch(history, />\s*✎\s*</);
  assert.doesNotMatch(history, /✏️?/);
  // The inline SVG pins the standard orientation: tip at the lower LEFT
  // (2,22), body rising to the upper right (17,3 → 21,7) — ╱, never ╲.
  assert.match(
    history,
    /<svg[^>]*viewBox="0 0 24 24"[^>]*stroke="currentColor"[^>]*>[\s\S]*<path d="M17 3a2\.828 2\.828 0 1 1 4 4L7\.5 20\.5 2 22l1\.5-5\.5L17 3z" \/>/,
  );
  assert.match(history, /strokeLinecap="round"/);
  assert.match(history, /strokeLinejoin="round"/);
  // Keep the icon optical and decorative: 18px, centred, hidden from AT while
  // the button keeps the semantics.
  assert.match(history, /<svg[^>]*width="18"[^>]*height="18"[^>]*aria-hidden="true"/);
  assert.match(history, /aria-label=\{transaction\.debtId \? "Qarz operatsiyasi Qarzdorlik bo‘limidan boshqariladi" : "Tahrirlash"\}/);
  // No mirroring tricks anywhere around it — orientation is drawn, not flipped.
  assert.doesNotMatch(history, /scaleX\(|-scale-x-|rotate-180|direction:\s*rtl/);
});

test("History edit and cancel icons share one button geometry", () => {
  // Exactly the two row actions (edit + cancel) — same 36px grid-centred box,
  // so the 18px pencil and the ✕ sit optically level with equal hit areas.
  const boxes =
    history.match(/grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3/g) ?? [];
  assert.equal(boxes.length, 2);
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

/* ============ §38: no section name is rendered as a top headline ============ */

test("every section page starts with content — no section-name headline at the top", () => {
  const pages: Array<{ page: string; name: string }> = [
    { page: "accounts", name: "Hisoblar" },
    { page: "bot", name: "Telegram bot" },
    { page: "budgets", name: "Budjetlar" },
    { page: "debts", name: "Qarzdorlik" },
    { page: "goals", name: "Maqsadlar" },
    { page: "more", name: "Menyu" },
    { page: "plans", name: "Reja" },
    { page: "settings", name: "Sozlamalar" },
    { page: "transactions", name: "Tarix" },
  ];
  for (const { page, name } of pages) {
    const src = readFileSync(new URL(`../src/app/${page}/page.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /<PageHeader[^>]*title=/, `${page} still renders a PageHeader section title`);
    assert.doesNotMatch(src, new RegExp(`<h1\\b[^>]*>${name}`), `${page} renders its name in an <h1> headline`);
    assert.doesNotMatch(src, /<h1\b/, `${page} renders a top-level <h1> headline`);
  }
  // The Tahlil section is a "coming soon" placeholder: it keeps its own content
  // message but never renders the section name ("Tahlil") as a headline.
  const analytics = readFileSync(new URL("../src/app/analytics/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(analytics, /<h1\b[^>]*>Tahlil/);
  assert.match(analytics, /<h1\b[^>]*>Tez kunda/);
});
