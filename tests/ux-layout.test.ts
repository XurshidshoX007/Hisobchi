import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("AppShell mounts one global FAB and reserves contextual scroll clearance", () => {
  assert.equal((shell.match(/<GlobalAddFab\s*\/>/g) ?? []).length, 1);
  assert.match(shell, /hasGlobalFab \? "has-global-fab"/);
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

test("History is list-first and composes all local filters in one shared sheet", () => {
  assert.match(history, /action=\{/);
  assert.match(history, /<TransactionFilter/);
  assert.match(transactionFilter, /title="Tarixni filtrlash"/);
  assert.match(transactionFilter, /Operatsiya turi/);
  assert.match(transactionFilter, /Kategoriya/);
  assert.match(transactionFilter, /Qidiruv/);
  assert.match(transactionFilter, /Filtrlarni tozalash/);
  assert.match(transactionFilter, /status=\{localCount \|\| undefined\}/);
  assert.doesNotMatch(transactionFilter, /localCount \+ contexts\.length/);
  assert.doesNotMatch(history, /<Segmented|<Select|<TextInput/);
  assert.doesNotMatch(history, /pastdagi \+ tugmasi/);
});

test("History filter controls expose dialog, radio and labelled-search semantics", () => {
  assert.match(transactionFilter, /ariaLabel="Tarixni filtrlash"/);
  assert.match(filterControls, /aria-haspopup="dialog"/);
  assert.match(filterControls, /role="radiogroup"/);
  assert.match(transactionFilter, /htmlFor=\{searchId\}/);
  assert.match(transactionFilter, /overflow-y-auto overflow-x-hidden/);
});

/* ==================== Plans → To‘lovlar: ONE compact monthly surface ==================== */

const planSummary = readFileSync(new URL("../src/components/plan-summary.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/components/ui.tsx", import.meta.url), "utf8");

test("payments tab renders one monthly summary plus one flat metrics strip", () => {
  assert.equal((plans.match(/<MonthlyPlanSummary/g) ?? []).length, 1);
  assert.equal((plans.match(/<SecondaryPlanMetrics/g) ?? []).length, 1);
  // The old heavy composition is gone: no MonthLoadCard, no StatCard grid on payments.
  assert.doesNotMatch(plans, /MonthLoadCard/);
  assert.doesNotMatch(plans, /Ixtiyoriy \/ oy|Yillik yuklama|Muddatli qoldiq|label="Faol rejalar"/);
});

test("monthly summary is a single surface — no nested Card and no per-metric frames", () => {
  assert.doesNotMatch(planSummary, /<Card\b/);
  assert.doesNotMatch(planSummary, /flat-card/);
  // Exactly one framed surface (`card`), the metrics strip stays borderless.
  assert.equal((planSummary.match(/className="card /g) ?? []).length, 2); // primary + empty state variant
  assert.doesNotMatch(planSummary, /border border-line/);
  assert.match(planSummary, /rounded-2xl bg-surface-2/);
});

test("secondary metrics degrade to 2x2 on narrow screens and 4 columns from 390px", () => {
  // Container query: 362px == a 390px viewport minus the shell's page gutters.
  assert.match(planSummary, /@container/);
  assert.match(planSummary, /grid-cols-2[\s\S]*@min-\[362px\]:grid-cols-4/);
  for (const label of ["Ixtiyoriy", "Faol", "Yillik", "Muddatli"]) {
    assert.match(planSummary, new RegExp(`label: "${label}"`));
  }
});

test("monthly summary keeps every level of the hierarchy", () => {
  assert.match(planSummary, /Bu oy · \{monthLabel\}/);
  assert.match(planSummary, /majburiy yuk/);
  assert.match(planSummary, /To‘langan/);
  assert.match(planSummary, /Qolgan/);
  assert.match(planSummary, /Eng yaqin to‘lov/);
  // Global balance / safe-to-spend belong to the Dashboard, never here (§14).
  assert.doesNotMatch(planSummary, /Safe-to-spend|Haqiqiy balans|Oy oxiri/i);
});

test("compact states live inside the same summary card", () => {
  assert.match(planSummary, /Faol to‘lov rejasi yo‘q\./); // empty
  assert.match(planSummary, /✓ Reja yakunlangan/); // completed
  assert.match(planSummary, /Kechikkan/); // overdue nearest row
  assert.match(planSummary, /ta kechikkan to‘lov/); // overdue rollup, still inline
});

test("progress exposes accessible values and stays visually light", () => {
  assert.match(ui, /role="progressbar"/);
  assert.match(ui, /aria-valuenow=/);
  assert.match(ui, /aria-valuemin=\{0\}/);
  assert.match(ui, /aria-valuemax=\{100\}/);
  assert.match(planSummary, /height=\{5\}/);
  assert.match(planSummary, /ariaLabel=\{`Bu oy majburiy to‘lovlar bajarildi: \$\{pct\}%`\}/);
});

test("plans page keeps the global FAB as the only creation entry point", () => {
  assert.doesNotMatch(plans, /Yangi to‘lov rejasi/);
  assert.match(plans, /pastdagi \+ tugmasi/);
});
