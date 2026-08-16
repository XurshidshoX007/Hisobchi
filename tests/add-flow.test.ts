import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ONE add flow, ONE form grammar.
 *
 * These are structural guards: they fail the build if a screen re-introduces
 * its own add button, its own sheet footer, its own amount input or its own
 * “are you sure” dialog instead of reusing the shared kit.
 */

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const formKit = read("components/form-kit.tsx");
const quickAdd = read("components/quick-add.tsx");
const ui = read("components/ui.tsx");
const css = read("app/globals.css");
const fab = read("components/fab.tsx");

const history = read("app/transactions/page.tsx");

const CREATE_PAGES = {
  dashboard: read("app/page.tsx"),
  plans: read("app/plans/page.tsx"),
  accounts: read("app/accounts/page.tsx"),
  debts: read("app/debts/page.tsx"),
  goals: read("app/goals/page.tsx"),
  budgets: read("app/budgets/page.tsx"),
  menu: read("app/more/page.tsx"),
};

/* ==================== §2 ONE global FAB, no duplicates ==================== */

test("every create screen registers with the global FAB instead of owning a + button", () => {
  for (const [name, source] of Object.entries(CREATE_PAGES)) {
    assert.match(source, /useFabPage\(/, `${name} must declare its FAB context`);
    assert.doesNotMatch(source, /GlobalAddFab/, `${name} must not mount a second FAB`);
  }
});

test("no page renders its own floating add control", () => {
  for (const [name, source] of Object.entries({ ...CREATE_PAGES, history })) {
    assert.doesNotMatch(source, /global-fab/, `${name} must not restyle the global FAB`);
    assert.doesNotMatch(source, /fixed bottom-\d/, `${name} must not float its own button`);
  }
});

test("History does not register transaction creation but keeps the shared editor", () => {
  assert.doesNotMatch(history, /useFabPage|useFab\(/);
  assert.match(history, /<QuickAddSheet[\s\S]*?editing=\{editing\}/);
  assert.doesNotMatch(history, /openCreate|defaultType/);
});

/* ==================== §5/§25 ONE sheet grammar, ONE primary action ==================== */

test("all create/edit sheets are built from the shared FormSheet", () => {
  const sheets: Array<[string, number]> = [
    ["quick-add", 1],
    ["plans", 2],
    ["accounts", 2],
    ["debts", 2],
    ["goals", 2],
    ["budgets", 1],
  ];
  const sources: Record<string, string> = { ...CREATE_PAGES, "quick-add": quickAdd };
  for (const [name, expected] of sheets) {
    const count = (sources[name].match(/<FormSheet/g) ?? []).length;
    assert.equal(count, expected, `${name} should compose ${expected} FormSheet(s), found ${count}`);
  }
});

test("FormSheet exposes exactly one primary action with a real state machine", () => {
  // disabled → “Saqlash”, loading → “Saqlanmoqda…”, success → “Saqlandi ✓”.
  assert.match(formKit, /submittingLabel = "Saqlanmoqda…"/);
  assert.match(formKit, /savedLabel = "Saqlandi ✓"/);
  assert.match(formKit, /disabled=\{!canSubmit \|\| busy\}/);
  // No duplicate submission: the handler is re-entrancy guarded.
  assert.match(formKit, /if \(busyRef\.current \|\| !canSubmit\) return;/);
  // Exactly one <button> in the footer slot.
  assert.equal((formKit.match(/footer=\{/g) ?? []).length, 1);
});

test("create sheets have no second competing footer button", () => {
  // FormSheet owns the footer, so a create flow structurally cannot add one.
  assert.doesNotMatch(formKit.slice(formKit.indexOf("export function FormSheet")), /footer\?:/);
  const sources: Record<string, string> = { ...CREATE_PAGES, "quick-add": quickAdd };
  for (const [name, source] of Object.entries(sources)) {
    for (const block of source.split("<FormSheet").slice(1)) {
      const body = block.slice(0, block.indexOf("</FormSheet>") + 1);
      assert.doesNotMatch(body, /footer=/, `${name}: a FormSheet must not pass its own footer`);
      assert.doesNotMatch(body, /Bekor qilish/, `${name}: a create sheet has one action, not two`);
    }
  }
  assert.doesNotMatch(quickAdd, /Bekor qilish/);
});

test("primary CTAs are concrete verbs, not four synonyms at once", () => {
  assert.match(CREATE_PAGES.plans, /submitLabel=\{editing \? "Saqlash" : "Rejani yaratish"\}/);
  assert.match(CREATE_PAGES.plans, /submitLabel=\{editing \? "Saqlash" : "Daromadni qo‘shish"\}/);
  assert.match(CREATE_PAGES.debts, /submitLabel="Qarzni saqlash"/);
  assert.match(CREATE_PAGES.goals, /submitLabel="Maqsadni saqlash"/);
  assert.match(CREATE_PAGES.budgets, /submitLabel="Budjetni saqlash"/);
  assert.match(CREATE_PAGES.accounts, /submitLabel="Hisobni saqlash"/);
  assert.match(CREATE_PAGES.accounts, /submitLabel="Kategoriyani saqlash"/);
});

/* ==================== §6/§8/§9/§10/§11/§12 field kit reuse ==================== */

test("the daily transaction form reuses every shared control", () => {
  for (const component of ["AmountField", "CategoryPicker", "DateField", "AccountPicker", "NoteField"]) {
    assert.match(quickAdd, new RegExp(`<${component}`), `quick add should use ${component}`);
  }
  // No always-visible textarea and no giant category <select> on quick add.
  assert.doesNotMatch(quickAdd, /<TextArea/);
  assert.doesNotMatch(quickAdd, /<Select/);
});

test("amount is entered through the shared money input everywhere", () => {
  for (const name of ["plans", "debts", "goals", "budgets", "accounts"] as const) {
    assert.match(CREATE_PAGES[name], /<AmountField/, `${name} should use AmountField`);
  }
  assert.match(formKit, /inputMode="decimal"/);
  assert.match(formKit, /formatAmountInput\(e\.target\.value\)/);
});

test("optional details are collapsed, never ten fields by default", () => {
  assert.match(formKit, /export function AdvancedSection/);
  assert.match(formKit, /label = "Qo‘shimcha"/);
  for (const name of ["plans", "goals", "accounts"] as const) {
    assert.match(CREATE_PAGES[name], /<AdvancedSection/, `${name} should collapse its secondary fields`);
  }
  assert.match(formKit, /export function NoteField/);
  assert.match(formKit, /Izoh qo‘shish/);
});

test("category picker starts from recent categories and hides the full list", () => {
  assert.match(formKit, /rankCategoryIds\(/);
  assert.match(formKit, /Barchasi →/);
  assert.match(formKit, /placeholder="Qidirish"/);
});

test("account selection is compact and auto-resolves the single-account case", () => {
  assert.match(formKit, /if \(onlyId && value !== onlyId\) onChange\(onlyId\)/);
  assert.match(formKit, /Boshqa faol hisob yo‘q/);
});

/* ==================== §13 TRANSFER ==================== */

test("transfer cannot target its own source account", () => {
  assert.match(quickAdd, /excludeId=\{toAccountId\}/);
  assert.match(quickAdd, /excludeId=\{accountId\}/);
  assert.match(quickAdd, /Boshqa hisobni tanlang/);
});

/* ==================== §14–§17 PLAN / INCOME forms ==================== */

test("plan forms only show the fields their type needs and preview the result", () => {
  const plans = CREATE_PAGES.plans;
  assert.match(plans, /planType === "term" \? \(/);
  assert.match(plans, /planType !== "one_time" \? \(/);
  assert.match(plans, /<PreviewCard>/);
  // Term preview: 1 880 000 × 12 = 22 560 000
  assert.match(plans, /\{formatAmount\(baseAmount\)\} × \{termCount \|\| 0\} = \{formatAmount\(termCount \* baseAmount\)\}/);
  // Recurring preview: cadence + day + annual load.
  assert.match(plans, /\{frequencyLabel\(frequency\)\} · \{nextDueDate \? `\$\{Number\(nextDueDate\.slice\(8, 10\)\)\}-sana`/);
});

/* ==================== §28 ERROR UX ==================== */

test("validation messages are field-specific, never a bare “Xatolik”", () => {
  const sources = [quickAdd, CREATE_PAGES.plans, CREATE_PAGES.debts, CREATE_PAGES.goals, CREATE_PAGES.budgets, CREATE_PAGES.accounts];
  for (const source of sources) {
    assert.doesNotMatch(source, /= "Xatolik"/);
  }
  assert.match(quickAdd, /Kategoriya tanlang/);
  assert.match(CREATE_PAGES.debts, /Shaxs yoki tashkilot nomini kiriting/);
  assert.match(CREATE_PAGES.plans, /Manba nomini kiriting/);
  // Server failures get a compact banner with a retry, not a dead end.
  assert.match(formKit, /role="alert"/);
  assert.match(formKit, /Qayta/);
});

/* ==================== §29 UNSAVED DATA ==================== */

test("unsaved-data protection exists once, in the shared sheet", () => {
  assert.match(formKit, /Saqlanmagan ma’lumot bor/);
  assert.match(formKit, /if \(dirty && status === "idle"\)/);
  for (const source of [quickAdd, CREATE_PAGES.plans, CREATE_PAGES.debts, CREATE_PAGES.goals]) {
    assert.match(source, /dirty=\{/, "each sheet reports its dirty state to FormSheet");
    assert.match(source, /isDirtyDraft\(/);
  }
});

/* ==================== §39 LAYERS ==================== */

test("the FAB recedes while any sheet is open", () => {
  assert.match(ui, /document\.body\.dataset\.sheetOpen = "1"/);
  assert.match(ui, /openSheetCount = Math\.max\(0, openSheetCount - 1\)/);
  assert.match(css, /body\[data-sheet-open\] \.global-fab/);
  assert.match(css, /pointer-events: none;/);
  // Layer order stays page → FAB → nav → sheet.
  assert.match(css, /--z-fab:\s*50/);
  assert.match(css, /--z-sheet:\s*80/);
});

/* ==================== §4 CONTEXTUAL ACTION SHEET ==================== */

test("a single-action context opens the form directly", () => {
  assert.match(fab, /if \(actions\.length === 1\) \{[\s\S]*invoke\(actions\[0\]\)/);
  assert.match(fab, /title="Nima qo‘shamiz\?"/);
});

/* ==================== §41 ACCESSIBILITY ==================== */

test("shared controls carry labels, states and 44px touch targets", () => {
  assert.match(formKit, /aria-invalid/);
  assert.match(formKit, /aria-describedby/);
  assert.match(formKit, /aria-pressed=\{active\}/);
  assert.match(formKit, /aria-expanded=\{open\}/);
  assert.match(formKit, /aria-busy/);
  assert.match(formKit, /min-h-11/);
  assert.match(ui, /aria-describedby=\{subtitle \? subtitleId : undefined\}/);
});
