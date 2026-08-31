import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ONE add flow, ONE responsive contract.
 *
 * The add flow is horizontally LOCKED: FAB → sheet → form scrolls on the
 * y-axis only. These are structural guards for the geometry that makes that
 * true, so a future change cannot silently re-introduce:
 *
 *   - a sheet wider than the viewport,
 *   - a nested horizontal scroller inside a form,
 *   - a choice control whose selected state changes layout geometry,
 *   - a single-column page grid with an `auto` track (which stretches the
 *     mobile layout viewport — and with it every `position: fixed` sheet).
 */

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const css = read("app/globals.css");
const ui = read("components/ui.tsx");
const formKit = read("components/form-kit.tsx");
const quickAdd = read("components/quick-add.tsx");
const fab = read("components/fab.tsx");

const FORM_SOURCES = {
  "form-kit": formKit,
  "quick-add": quickAdd,
  plans: read("app/plans/page.tsx"),
  accounts: read("app/accounts/page.tsx"),
  debts: read("app/debts/page.tsx"),
  goals: read("app/goals/page.tsx"),
  budgets: read("app/budgets/page.tsx"),
};

const PAGE_SOURCES = {
  dashboard: read("app/page.tsx"),
  history: read("app/transactions/page.tsx"),
  plans: read("app/plans/page.tsx"),
  analytics: read("app/analytics/page.tsx"),
  accounts: read("app/accounts/page.tsx"),
  debts: read("app/debts/page.tsx"),
  goals: read("app/goals/page.tsx"),
  budgets: read("app/budgets/page.tsx"),
  menu: read("app/more/page.tsx"),
  bot: read("app/bot/page.tsx"),
  settings: read("app/settings/page.tsx"),
};

/* ==================== §2/§3/§32 sheet geometry ==================== */

test("the sheet layer stays viewport-bound without concealing page-width bugs", () => {
  const layerRule = css.match(/\.sheet-layer\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(layerRule, /width:\s*100%/);
  assert.match(layerRule, /max-width:\s*100vw/);
  assert.match(layerRule, /height:\s*var\(--app-viewport-height\)/);
  assert.doesNotMatch(layerRule, /overflow(?:-x)?:\s*(?:hidden|clip)/);
  assert.doesNotMatch(css, /(?:^|\n)body\s*\{[^}]*overflow-x:\s*(?:hidden|clip)/);
});

test("the sheet dialog can never exceed the layer", () => {
  assert.match(css, /\.sheet-dialog\s*\{[^}]*width:\s*100%/);
  assert.match(css, /\.sheet-dialog\s*\{[^}]*max-width:\s*100vw/);
  assert.match(css, /\.sheet-dialog\s*\{[^}]*min-width:\s*0/);
  assert.match(ui, /className="sheet-dialog/);
  // Desktop keeps a readable, centred column (§3) — stated in BOTH places so
  // neither the utility nor the stylesheet can silently widen the sheet.
  assert.match(ui, /sm:max-w-\[520px\]/);
  assert.match(css, /@media \(min-width: 640px\)\s*\{\s*\.sheet-dialog\s*\{[^}]*max-width:\s*min\(520px, 100vw\)/);
});

test("sheet CSS lives in the components layer so utilities still win", () => {
  // Unlayered CSS beats every Tailwind utility, which once made the desktop
  // sheet full-bleed by overriding `sm:max-w-[520px]`.
  assert.match(css, /@layer components \{[\s\S]*\.sheet-layer/);
  assert.match(css, /@layer components \{[\s\S]*\.sheet-form > \*/);
});

test("the sheet body scrolls vertically only", () => {
  assert.match(css, /\.sheet-body\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.sheet-body\s*\{[^}]*overflow-x:\s*hidden/);
  assert.match(ui, /className="sheet-body/);
  // `overflow-y-auto` alone computes `overflow-x: auto` — the old bug.
  assert.doesNotMatch(ui, /overflow-y-auto overscroll-contain px-5/);
});

test("one shared child-width rule replaces per-component patches (§5)", () => {
  assert.match(css, /\.sheet-form\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
  assert.match(css, /\.sheet-form\s*>\s*\*\s*\{[^}]*max-width:\s*100%/);
  assert.match(ui, /className="sheet-form/);
});

test("the sticky footer stays inside the sheet and wraps long CTAs (§15)", () => {
  assert.match(css, /\.sheet-footer\s*\{[^}]*width:\s*100%/);
  assert.match(ui, /sheet-footer[^"]*sticky/);
  assert.match(ui, /flex min-w-0 flex-wrap gap-2\.5 \[&>\*\]:min-w-0/);
  assert.match(formKit, /break-words rounded-\[18px\] bg-primary/);
});

/* ==================== §13 no horizontal scrolling in forms ==================== */

test("no add-flow form contains a horizontal scroll container", () => {
  for (const [name, source] of Object.entries(FORM_SOURCES)) {
    const formOnly = name === "form-kit" || name === "quick-add";
    if (formOnly) {
      assert.doesNotMatch(source, /overflow-x-auto/, `${name} must not scroll a form control sideways`);
    }
  }
  // Choice rows wrap instead of scrolling.
  assert.match(formKit, /flex w-full min-w-0 max-w-full flex-wrap gap-2/);
  // The amount ladder wraps below the field.
  assert.match(formKit, /flex min-w-0 flex-wrap gap-1\.5/);
});

test("form type switches use the compact grid, navigation keeps the scrollable Segmented", () => {
  // Forms: grid-based, non-scrolling.
  assert.match(quickAdd, /<CompactSegmented/);
  assert.doesNotMatch(quickAdd, /<Segmented/);
  // The debt FORM switches direction with ChoiceGrid, never Segmented.
  assert.match(FORM_SOURCES.debts, /<ChoiceGrid/);
  assert.equal((FORM_SOURCES.plans.match(/<CompactSegmented/g) ?? []).length, 2);
  // Navigation: Plans main tabs, the Accounts tabs and the Debts direction
  // FILTER still use the scrollable Segmented — long tab sets are the ONE
  // place where x-scroll is correct.
  assert.match(FORM_SOURCES.plans, /<Segmented\s+value=\{tab\}/);
  assert.match(FORM_SOURCES.accounts, /<Segmented\s+value=\{tab\}/);
  assert.match(FORM_SOURCES.debts, /<Segmented\s+value=\{filter\}/);
  // …and the filter is the ONLY Segmented on the Debts page.
  assert.equal((FORM_SOURCES.debts.match(/<Segmented/g) ?? []).length, 1);
  assert.match(ui, /data-segmented-scroll/);
});

/* ==================== §7/§9/§10/§26/§27 choice controls ==================== */

test("ChoiceGrid gives every option its own box, equal width and a 44px target", () => {
  assert.match(formKit, /export function ChoiceGrid/);
  assert.match(formKit, /role="radiogroup"/);
  assert.match(formKit, /role="radio"/);
  assert.match(formKit, /aria-checked=\{active\}/);
  // repeat(n, minmax(0, 1fr)) via Tailwind grid-cols-*, plus an 8px gap.
  assert.match(formKit, /\{ 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" \}/);
  assert.match(formKit, /grid \$\{template\} gap-2 \[&>\*\]:min-w-0/);
  assert.match(formKit, /min-h-11 py-1\.5/);
  assert.match(formKit, /min-h-12 py-2/);
});

test("the selected state uses an inset ring, never a thicker border (§10)", () => {
  // Both states carry exactly one 1px border; selection adds an INSET ring, so
  // the box size cannot change when an option becomes active.
  assert.match(formKit, /border-transparent bg-accent-soft font-semibold text-accent-text ring-2 ring-inset ring-accent/);
  assert.doesNotMatch(formKit, /border-2 /);
  assert.doesNotMatch(formKit, /-ml-px|margin-left:\s*-1px/);
});

test("choice lists in sheets share one boxed row grammar (§9/§24)", () => {
  for (const [name, source] of Object.entries({ fab, "form-kit": formKit, plans: FORM_SOURCES.plans })) {
    assert.doesNotMatch(source, /-mx-1\.5 space-y-0\.5/, `${name} must not use edge-to-edge merged rows`);
  }
  assert.match(fab, /min-w-0 space-y-2/);
});

/* ==================== §6/§8/§29/§30 shrinkable content ==================== */

test("controls and previews may always shrink instead of widening the sheet", () => {
  assert.match(ui, /w-full min-w-0 max-w-full rounded-xl border border-line bg-surface-2/); // inputs
  assert.match(formKit, /w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-surface-2/); // PreviewCard
  assert.match(formKit, /export function FormRow/);
  assert.match(formKit, /export function FormActions/);
  assert.match(formKit, /export const FormSection/);
  // The goal icon picker is a multi-column control; a fixed 88px side track
  // squeezes it on mobile. It must remain full-width within the sheet.
  assert.doesNotMatch(FORM_SOURCES.goals, /grid-cols-\[1fr_/);
  assert.doesNotMatch(FORM_SOURCES.goals, /grid-cols-\[minmax\(0,1fr\)_88px\]/);
  assert.match(FORM_SOURCES.goals, /<Field label="Ikona">/);
});

test("single-column page grids declare grid-cols-1 instead of an auto track", () => {
  for (const [name, source] of Object.entries(PAGE_SOURCES)) {
    assert.doesNotMatch(
      source,
      /className="grid gap-/,
      `${name}: an implicit auto column stretches to the widest card and drags the mobile layout viewport with it`,
    );
  }
});

/* ==================== §12/§37 touch targets & a11y ==================== */

test("sheet chrome keeps comfortable hit areas and accessible names", () => {
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /aria-label="Yopish"/);
  assert.match(ui, /data-hit="expanded"/); // 36px glyph, 48px hit area
  assert.match(formKit, /data-hit="expanded"/);
  assert.match(fab, /aria-expanded=\{open\}/);
  // Chips are 14px-radius now; the 44px minimum height is the touch-target
  // guarantee that must never move.
  assert.match(formKit, /min-h-11 min-w-0 max-w-full touch-manipulation items-center gap-1\.5 rounded-\[var\(--radius-chip\)\] border/);
});

/* ==================== §39 business logic untouched ==================== */

test("this is a presentation fix: mutations and finance calls are unchanged", () => {
  assert.match(quickAdd, /mutate\(\s*"transaction",/);
  assert.match(FORM_SOURCES.plans, /mutate\(\s*"recurring",/);
  assert.match(FORM_SOURCES.plans, /mutate\(\s*"expectedIncome",/);
  assert.match(FORM_SOURCES.debts, /mutate\(\s*"debt",/);
  assert.match(FORM_SOURCES.goals, /mutate\(\s*"goal",/);
  assert.match(FORM_SOURCES.budgets, /mutate\(\s*"budget",/);
  assert.match(FORM_SOURCES.accounts, /mutate\(\s*"account",/);
  assert.match(FORM_SOURCES.accounts, /mutate\(\s*"category",/);
});

test("debt opening date is explicit and reaches its linked History movement", () => {
  const mutations = read("lib/mutations.ts");
  assert.match(FORM_SOURCES.debts, /useState\(todayISO\(\)\)/);
  assert.match(FORM_SOURCES.debts, /label="Qarz olingan sana"/);
  assert.match(FORM_SOURCES.debts, /\.\.\.\(!editing \? \{ date \} : \{\}\)/);
  assert.match(mutations, /amount, date: isoDate\(d\.date, today\) \?\? today,/);
});
