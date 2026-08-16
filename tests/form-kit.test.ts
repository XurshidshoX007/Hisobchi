import test from "node:test";
import assert from "node:assert/strict";
import {
  addQuickAmount,
  amountError,
  dateChipLabel,
  dateQuickChips,
  formatAmountInput,
  isDirtyDraft,
  matchesQuery,
  parseAmountInput,
  quickAmountLabel,
  rankCategoryIds,
  resolveDefaultAccountId,
  savedMessage,
} from "../src/lib/form-kit";

/* ============================ §8 AMOUNT INPUT ============================ */

test("amount input groups thousands live without changing the stored value", () => {
  assert.equal(formatAmountInput("1200000"), "1 200 000");
  assert.equal(formatAmountInput("150000"), "150 000");
  assert.equal(formatAmountInput("1"), "1");
  assert.equal(formatAmountInput("1234567890"), "1 234 567 890");
  // The parsed value is always the plain number the mutation receives.
  assert.equal(parseAmountInput("1 200 000"), 1_200_000);
  assert.equal(parseAmountInput(formatAmountInput("1200000")), 1_200_000);
});

test("amount input tolerates human typing", () => {
  assert.equal(formatAmountInput(""), "");
  assert.equal(formatAmountInput("abc"), "");
  assert.equal(formatAmountInput("0"), "0");
  assert.equal(formatAmountInput("007"), "7");
  assert.equal(formatAmountInput("1500,75"), "1 500.75");
  assert.equal(formatAmountInput("1.2.3"), "1.23");
  assert.equal(formatAmountInput("12 345"), "12 345");
  assert.equal(parseAmountInput("1 500,75"), 1500.75);
  assert.equal(parseAmountInput(""), null);
  assert.equal(parseAmountInput("   "), null);
  assert.equal(parseAmountInput("abc"), null);
});

test("amount validation speaks in specific sentences, never “Xatolik”", () => {
  assert.equal(amountError(""), "Summani kiriting");
  assert.equal(amountError("0"), "Summa 0 dan katta bo‘lishi kerak");
  assert.equal(amountError("-5"), "Summa 0 dan katta bo‘lishi kerak");
  assert.equal(amountError("150 000"), null);
  assert.equal(amountError("", "Limitni kiriting"), "Limitni kiriting");
  for (const message of [amountError(""), amountError("0")]) {
    assert.doesNotMatch(String(message), /xatolik/i);
  }
});

test("quick amounts add to the current value and stay compact", () => {
  assert.equal(addQuickAmount("", 50_000), "50 000");
  assert.equal(addQuickAmount("150 000", 50_000), "200 000");
  assert.equal(addQuickAmount("1 000 000", 1_000_000), "2 000 000");
  assert.equal(quickAmountLabel(50_000), "+50k");
  assert.equal(quickAmountLabel(500_000), "+500k");
  assert.equal(quickAmountLabel(1_000_000), "+1 mln");
});

/* ============================ §9 CATEGORY UX ============================ */

test("categories are ranked recent-first, then frequent", () => {
  const usage = [
    { categoryId: 3, date: "2026-08-16" }, // most recent
    { categoryId: 1, date: "2026-08-15" },
    { categoryId: 1, date: "2026-08-14" },
    { categoryId: 1, date: "2026-08-13" },
    { categoryId: 2, date: "2026-07-02" },
  ];
  const ranked = rankCategoryIds(usage, [1, 2, 3, 4, 5], 5);
  assert.equal(ranked[0], 3, "the category used today comes first");
  assert.equal(ranked[1], 1, "the habitual category comes next");
  assert.deepEqual(ranked, [3, 1, 2, 4, 5]);
});

test("ranking ignores unknown/inactive categories and fills the rest", () => {
  const usage = [
    { categoryId: 99, date: "2026-08-16" },
    { categoryId: null, date: "2026-08-16" },
    { categoryId: 2, date: "2026-08-10" },
  ];
  assert.deepEqual(rankCategoryIds(usage, [1, 2, 3], 3), [2, 1, 3]);
  assert.deepEqual(rankCategoryIds([], [7, 8], 5), [7, 8]);
  assert.equal(rankCategoryIds([], [1, 2, 3, 4, 5, 6, 7, 8], 5).length, 5);
});

test("category search matches case-insensitively", () => {
  assert.equal(matchesQuery("Oziq-ovqat", "oziq"), true);
  assert.equal(matchesQuery("Transport", "PORT"), true);
  assert.equal(matchesQuery("Transport", ""), true);
  assert.equal(matchesQuery("Transport", "uy"), false);
});

/* ============================ §10 DATE UX ============================ */

test("date chips default to today and reach two days back", () => {
  const chips = dateQuickChips("2026-08-16");
  assert.deepEqual(
    chips.map((c) => c.label),
    ["Bugun", "Kecha", "Oldingi kun"],
  );
  assert.deepEqual(
    chips.map((c) => c.value),
    ["2026-08-16", "2026-08-15", "2026-08-14"],
  );
  assert.equal(dateChipLabel("2026-08-15", "2026-08-16"), "Kecha");
  assert.equal(dateChipLabel("2026-01-01", "2026-08-16"), null);
});

/* ============================ §11/§37 SMART DEFAULTS ============================ */

test("account default prefers the remembered account, then a single account", () => {
  const accounts = [
    { id: 1, isActive: true },
    { id: 2, isActive: true },
    { id: 3, isActive: false },
  ];
  assert.equal(resolveDefaultAccountId(accounts, 2), 2);
  assert.equal(resolveDefaultAccountId(accounts, 3), 1, "an archived remembered account is never reused");
  assert.equal(resolveDefaultAccountId(accounts, null), 1);
  assert.equal(resolveDefaultAccountId([{ id: 9, isActive: true }], null), 9);
  assert.equal(resolveDefaultAccountId([], null), null);
});

/* ============================ §29 DATA LOSS PROTECTION ============================ */

test("only meaningful changes count as unsaved data", () => {
  const initial = { amount: "", categoryId: "", note: "", date: "2026-08-16" };
  assert.equal(isDirtyDraft({ ...initial }, initial), false, "untouched form never prompts");
  assert.equal(isDirtyDraft({ ...initial, amount: "150 000" }, initial), true);
  assert.equal(isDirtyDraft({ ...initial, note: "   " }, initial), false, "whitespace is not data");
  assert.equal(isDirtyDraft({ ...initial, date: "2026-08-15" }, initial), true);
  // Edit flow: prefilled values equal to the record are not "unsaved data".
  const record = { name: "Ijara", amount: "2 500 000", mandatory: true };
  assert.equal(isDirtyDraft({ ...record }, record), false);
  assert.equal(isDirtyDraft({ ...record, mandatory: false }, record), true);
});

/* ============================ §27 SUCCESS FEEDBACK ============================ */

test("success copy names the amount and the direction", () => {
  assert.equal(savedMessage("expense", 150_000), "150 000 so‘mlik xarajat saqlandi");
  assert.equal(savedMessage("income", 3_000_000), "3 000 000 so‘mlik daromad saqlandi");
  assert.equal(savedMessage("transfer", 500_000), "500 000 so‘mlik transfer saqlandi");
  assert.equal(savedMessage("expense", null), "Xarajat saqlandi");
  assert.equal(savedMessage("expense", 0), "Xarajat saqlandi");
});
