import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extractFromLines, parseLine } from "../src/lib/image/extract";
import { extractDueDay, extractDuration, normalizeAmount, normalizeDate, nextDueDateFor } from "../src/lib/image/normalize";
import { canonicalCategoryFor, classifyCategory, type UserCategory } from "../src/lib/image/categories";
import { clarificationsFor, needsUserDecision, validateExtraction } from "../src/lib/image/validate";
import { classifyImage, extractFinanceData, normalizeFinanceData } from "../src/lib/imageIntelligence";
import { StaticVisionProvider, parseProviderPayload } from "../src/lib/image/provider";
import { imageFingerprint, isSupportedDeclaredMime, pickPhotoSize, sniffImageMime } from "../src/lib/image/file-guards";
import { blockerMessage, draftBlockers, editDraftPayload, isImageDraft } from "../src/lib/image/draft-edit";
import { buildBatchMessage, buildCategoryKeyboard, buildItemMenu, summarizeCounts } from "../src/lib/image/ux";
import { parseCategoryPickCallback, parseDraftEditCallback } from "../src/lib/bot-routing";
import type { ExtractedEntity, ImageDraft } from "../src/lib/image/types";

const TODAY = "2026-08-16";

const CATEGORIES: UserCategory[] = [
  { id: 1, name: "Oziq-ovqat", type: "expense", isActive: true },
  { id: 2, name: "Transport", type: "expense", isActive: true },
  { id: 3, name: "Uy", type: "expense", isActive: true },
  { id: 4, name: "Farzandlar", type: "expense", isActive: true },
  { id: 5, name: "Kredit", type: "expense", isActive: true },
  { id: 6, name: "Ish haqi", type: "income", isActive: true },
  { id: 7, name: "Arxiv", type: "expense", isActive: false },
];

/* ======================== AMOUNT NORMALIZATION (§19) ======================== */

test("all Uzbek amount spellings normalize to the same number", () => {
  for (const raw of ["1 880 000", "1,880,000", "1.880.000", "1880000", "1 880 000 so'm"]) {
    const parsed = normalizeAmount(raw);
    assert.equal(parsed.value, 1_880_000, raw);
    assert.ok(parsed.confidence >= 0.9, raw);
  }
  assert.equal(normalizeAmount("1,5 mln").value, 1_500_000);
  assert.equal(normalizeAmount("2.5 mln").value, 2_500_000);
  assert.equal(normalizeAmount("150 ming").value, 150_000);
  assert.equal(normalizeAmount("3 mlrd").value, 3_000_000_000);
  assert.equal(normalizeAmount("7532,96 Uzum nasiya kredit").value, 7532.96);
  assert.equal(normalizeAmount("salom").value, null);
});

test("a bare tiny integer is never confidently read as money", () => {
  const parsed = normalizeAmount("12");
  assert.equal(parsed.value, 12);
  assert.ok(parsed.confidence <= 0.5);
});

/* ========================= DATE NORMALIZATION (§19) ========================= */

test("dates are read from every common Uzbek row format", () => {
  assert.equal(normalizeDate("17-avgust", TODAY).date, "2026-08-17");
  assert.equal(normalizeDate("20 avgust", TODAY).date, "2026-08-20");
  assert.equal(normalizeDate("12.08", TODAY).date, "2026-08-12");
  assert.equal(normalizeDate("12.08.2026", TODAY).date, "2026-08-12");
  assert.equal(normalizeDate("2026-08-15", TODAY).date, "2026-08-15");
  assert.equal(normalizeDate("kecha", TODAY).date, "2026-08-15");
  assert.equal(normalizeDate("hech qanday sana yo'q", TODAY).date, null);
  assert.equal(normalizeDate("40.13", TODAY).date, null);
});

test("a due day is a schedule anchor, not a calendar date", () => {
  assert.equal(extractDueDay("17-sana").dueDay, 17);
  assert.equal(extractDuration("12 oy").months, 12);
  assert.equal(extractDuration("900 oy").months, null);
  assert.equal(nextDueDateFor(17, TODAY), "2026-08-17");
  assert.equal(nextDueDateFor(5, TODAY), "2026-09-05");
  // "17-sana" must not be consumed as an amount.
  const line = parseLine("Kredit 1 880 000 17-sana 12 oy", TODAY);
  assert.deepEqual(line.amounts.map((a) => a.value), [1_880_000]);
  assert.equal(line.dueDay, 17);
  assert.equal(line.months, 12);
});

/* ========================== CATEGORY MAPPING (§8,§9,§31) ========================== */

test("existing user categories are reused and never duplicated", () => {
  const meat = classifyCategory("Go'sht", "expense", CATEGORIES);
  assert.equal(meat.categoryId, 1);
  assert.equal(meat.needsUser, false);

  const taxi = classifyCategory("Taksi", "expense", CATEGORIES);
  assert.equal(taxi.categoryId, 2);

  const credit = classifyCategory("Kredit", "expense", CATEGORIES);
  assert.equal(credit.categoryId, 5);

  const salary = classifyCategory("Maosh", "income", CATEGORIES);
  assert.equal(salary.categoryId, 6);
});

test("an unmapped item asks the user instead of inventing a category", () => {
  const medicine = classifyCategory("Dori", "expense", CATEGORIES);
  assert.equal(medicine.categoryId, null);
  assert.equal(medicine.suggested, "Sog'liq");
  assert.equal(medicine.needsUser, true);

  const nonsense = classifyCategory("Qwerty zzz", "expense", CATEGORIES);
  assert.equal(nonsense.categoryId, null);
  assert.equal(nonsense.suggested, null);
  assert.equal(nonsense.needsUser, true);

  // Archived categories are never selected silently.
  assert.equal(classifyCategory("Arxiv", "expense", CATEGORIES).categoryId, null);
});

test("semantic mapping covers the documented examples", () => {
  assert.equal(canonicalCategoryFor("Go'sht", "expense")?.canonical, "Oziq-ovqat");
  assert.equal(canonicalCategoryFor("Taksi", "expense")?.canonical, "Transport");
  assert.equal(canonicalCategoryFor("Dori", "expense")?.canonical, "Sog'liq");
  assert.equal(canonicalCategoryFor("Elektr", "expense")?.canonical, "Kommunal");
  assert.equal(canonicalCategoryFor("Internet", "expense")?.canonical, "Telefon / Internet");
  assert.equal(canonicalCategoryFor("Kredit", "expense")?.canonical, "Kredit");
});

/* ============================ TEST A — SHOPPING ============================ */

test("TEST A: a shopping list becomes four expense drafts totalling 180 000", () => {
  const result = extractFromLines(["Non 10 000", "Go'sht 120 000", "Sut 15 000", "Sabzavot 35 000"], TODAY);
  assert.equal(result.documentClass, "SHOPPING_LIST");
  assert.equal(result.entities.length, 4);
  assert.ok(result.entities.every((e) => e.kind === "expense"));
  const total = result.entities.reduce((sum, e) => sum + ("amount" in e ? e.amount : 0), 0);
  assert.equal(total, 180_000);
  const drafts = normalizeFinanceData(result.entities, { categories: CATEGORIES, today: TODAY, documentClass: result.documentClass });
  assert.ok(drafts.every((d) => d.kind === "transaction" && d.data.categoryId === 1));
  assert.ok(drafts.every((d) => (d.meta.issues ?? []).length === 0));
});

/* ========================= TEST B — CREDIT SCHEDULE ========================= */

test("TEST B: a credit schedule becomes one mandatory 12-installment plan", () => {
  const result = extractFromLines(["Kredit", "1 880 000", "17-sana", "12 oy"], TODAY);
  assert.equal(result.documentClass, "PAYMENT_SCHEDULE");
  assert.equal(result.entities.length, 1);
  const plan = result.entities[0];
  assert.equal(plan.kind, "payment_plan");
  if (plan.kind !== "payment_plan") return;
  assert.equal(plan.amount, 1_880_000);
  assert.equal(plan.frequency, "monthly");
  assert.equal(plan.planType, "term");
  assert.equal(plan.installmentCount, 12);
  assert.equal(plan.dueDay, 17);
  assert.equal(plan.mandatory, true);
  assert.ok(plan.confidence >= 0.9);

  const [draft] = normalizeFinanceData([plan], { categories: CATEGORIES, today: TODAY, documentClass: result.documentClass });
  assert.equal(draft.kind, "payment_plan");
  assert.equal(draft.data.certainty, "exact");
  assert.equal(draft.data.installmentCount, 12);
  assert.equal(draft.data.isMandatory, true);
  assert.equal(draft.data.categoryId, 5);
});

/* ========================= TEST C — EXPECTED INCOME ========================= */

test("TEST C: a future advance becomes an expected income plan, not a transaction", () => {
  const result = extractFromLines(["20 avgust", "Avans", "3 000 000"], TODAY);
  assert.equal(result.documentClass, "EXPECTED_INCOME");
  const income = result.entities[0];
  assert.equal(income.kind, "expected_income");
  if (income.kind !== "expected_income") return;
  assert.equal(income.amount, 3_000_000);
  assert.equal(income.expectedDate, "2026-08-20");
  const [draft] = normalizeFinanceData([income], { categories: CATEGORIES, today: TODAY, documentClass: result.documentClass });
  assert.equal(draft.kind, "expected_income");
  assert.notEqual(draft.kind, "transaction");
});

test("an income row without a future/expected marker stays a real transaction", () => {
  const result = extractFromLines(["Maosh 3 000 000", "Bonus 500 000", "Avans 1 000 000"], TODAY);
  assert.equal(result.documentClass, "INCOME_LIST");
  assert.equal(result.entities.length, 3);
  assert.ok(result.entities.every((e) => e.kind === "income"));
  assert.deepEqual(
    result.entities.map((e) => (e.kind === "income" ? e.incomeKind : null)),
    ["salary", "bonus", "advance"],
  );
});

/* ============================== TEST D — DEBTS ============================== */

test("TEST D: debt direction comes from the wording, never from the name", () => {
  const result = extractFromLines(
    ["Ali — menga 500 000 qarzdor", "Vali — men 700 000 berishim kerak"],
    TODAY,
  );
  assert.equal(result.documentClass, "DEBT_LIST");
  const [ali, vali] = result.entities;
  assert.equal(ali.kind, "debt");
  if (ali.kind !== "debt" || vali.kind !== "debt") return;
  assert.equal(ali.personName, "Ali");
  assert.equal(ali.direction, "owed_to_me");
  assert.equal(ali.amount, 500_000);
  assert.equal(vali.personName, "Vali");
  assert.equal(vali.direction, "i_owe");
  assert.equal(vali.amount, 700_000);
});

test("column headers drive the direction of every row below them", () => {
  const result = extractFromLines(
    ["Men berishim kerak:", "Vali 700 000", "Karim 200 000", "Menga qarzdor:", "Ali 500 000"],
    TODAY,
  );
  const directions = result.entities.map((e) => (e.kind === "debt" ? e.direction : null));
  assert.deepEqual(directions, ["i_owe", "i_owe", "owed_to_me"]);
});

test("an ambiguous debt row asks the user instead of guessing", () => {
  const result = extractFromLines(["Ali", "Qarz: 1 500 000", "To'langan: 500 000", "Qolgan: 1 000 000"], TODAY);
  assert.equal(result.entities.length, 1);
  const debt = result.entities[0];
  assert.equal(debt.kind, "debt");
  if (debt.kind !== "debt") return;
  assert.equal(debt.amount, 1_500_000);
  assert.equal(debt.paidAmount, 500_000);
  assert.equal(debt.remainingAmount, 1_000_000);
  assert.equal(debt.direction, null);
  assert.ok(debt.issues.includes("debt_direction_unknown"));
  assert.equal(needsUserDecision(debt), true);
});

/* ============================== TEST E — MIXED ============================== */

test("TEST E: one mixed image yields every entity type in a single batch", () => {
  const result = extractFromLines(
    [
      "Maosh 3 000 000",
      "Kredit 1 880 000 17-sana 12 oy",
      "Non 30 000",
      "Ali — menga 500 000 qarzdor",
    ],
    TODAY,
  );
  assert.equal(result.documentClass, "MIXED_FINANCE");
  assert.deepEqual(result.entities.map((e) => e.kind), ["income", "payment_plan", "expense", "debt"]);
  const drafts = normalizeFinanceData(result.entities, { categories: CATEGORIES, today: TODAY, documentClass: result.documentClass });
  assert.deepEqual(drafts.map((d) => d.kind), ["transaction", "payment_plan", "transaction", "debt"]);
});

/* ===================== MULTI-ROW CREDIT TABLE (§6) ===================== */

test("three credit rows never merge into one payment", () => {
  const result = extractFromLines(
    ["Kredit 1:", "1,880,000", "17 avgust", "Kredit 2:", "950 000", "22 avgust", "Kredit 3:", "450 000", "28 avgust"],
    TODAY,
  );
  assert.equal(result.entities.length, 3);
  assert.deepEqual(
    result.entities.map((e) => (e.kind === "payment_plan" ? e.amount : null)),
    [1_880_000, 950_000, 450_000],
  );
  assert.deepEqual(
    result.entities.map((e) => (e.kind === "payment_plan" ? e.name : null)),
    ["Kredit 1", "Kredit 2", "Kredit 3"],
  );
});

/* ==================== PLANNED vs REAL SEMANTICS (§20, §36) ==================== */

test("„to'landi“ books real money while a future date only books a plan", () => {
  const paid = extractFromLines(["17 avgust kredit to'landi 1 880 000"], TODAY).entities[0];
  assert.equal(paid.kind, "expense");
  assert.equal(paid.semantics, "real");

  const planned = extractFromLines(["Kredit 20 avgust 1 880 000"], TODAY).entities[0];
  assert.equal(planned.kind, "payment_plan");
  assert.equal(planned.semantics, "planned");

  const groceries = extractFromLines(["Bozorlik - 300 000"], TODAY).entities[0];
  assert.equal(groceries.kind, "expense");
  assert.equal(groceries.semantics, "real");
});

/* ============================ GLOBAL DATE (§10) ============================ */

test("one global date applies to every row that has no date of its own", () => {
  const result = extractFromLines(["12.08", "Ovqat 150 000", "Taksi 50 000", "Internet 80 000"], TODAY);
  assert.equal(result.entities.length, 3);
  assert.ok(result.entities.every((e) => e.kind === "expense" && e.date === "2026-08-12"));
});

/* ============================ BATCH + PARTIAL ============================ */

test("no row is silently dropped and unreadable rows are reported", () => {
  const lines = ["Non 30 000", "Go'sht 120 000", "??? ??? 0", "Sut 15 000"];
  const result = extractFromLines(lines, TODAY);
  assert.equal(result.entities.length, 3);
  assert.equal(result.unparsedRows.length, 1);
});

test("a huge table is capped instead of writing hundreds of records", () => {
  const lines = Array.from({ length: 120 }, (_, i) => `Mahsulot ${i + 1} ${10_000 + i} so'm`);
  const result = extractFromLines(lines, TODAY, { maxRows: 40 });
  assert.equal(result.entities.length, 40);
  assert.equal(result.truncatedRows, 80);
});

test("identical rows are flagged as possible duplicates, never merged away", () => {
  const result = extractFromLines(["Non 30 000", "Non 30 000"], TODAY);
  assert.equal(result.entities.length, 2);
  assert.ok(result.entities[1].issues.includes("duplicate_row"));
});

/* ============================== VALIDATION (§18) ============================== */

test("validation rejects impossible money and impossible schedules", () => {
  const entities = [
    { ...baseExpense(), amount: -5 },
    { ...baseExpense(), date: "2026-13-45" },
    {
      kind: "payment_plan",
      name: "Kredit",
      amount: 1_000,
      frequency: "monthly",
      planType: "term",
      installmentCount: 0,
      dueDay: 5,
      startDate: null,
      endDate: null,
      mandatory: true,
      categoryName: null,
      note: "",
      semantics: "planned",
      confidence: 0.9,
      fields: {},
      issues: [],
      rowIndex: 2,
    },
    baseExpense(),
  ] as ExtractedEntity[];
  const outcome = validateExtraction(entities, TODAY);
  assert.equal(outcome.valid.length, 1);
  assert.deepEqual(outcome.rejected.map((r) => r.reason), ["amount_invalid", "date_invalid", "installment_count_invalid"]);
});

test("low confidence fields become explicit questions", () => {
  const entity = { ...baseExpense(), confidence: 0.4, fields: { amount: 0.4 } } as ExtractedEntity;
  assert.ok(clarificationsFor(entity).includes("amount_unclear"));
  assert.equal(needsUserDecision(entity), true);
  assert.equal(needsUserDecision(baseExpense() as ExtractedEntity), false);
});

/* ======================= DRAFT SAFETY + ITEM EDIT (§22) ======================= */

test("a draft that still needs a decision cannot be saved", () => {
  const draft = debtDraft(null);
  assert.deepEqual(draftBlockers(draft as unknown as Record<string, unknown>), ["debt_direction_unknown"]);
  assert.match(blockerMessage(["debt_direction_unknown"]), /qarz yo'nalishi/);
  assert.equal(isImageDraft(draft as unknown as Record<string, unknown>), true);
  assert.equal(isImageDraft({ type: "expense", amount: 1000 }), false);
});

test("choosing a debt direction unblocks the draft", () => {
  const edited = editDraftPayload(debtDraft(null) as unknown as Record<string, unknown>, "dir", "owed_to_me");
  assert.equal(edited.ok, true);
  assert.equal((edited.payload as unknown as ImageDraft).data.direction, "owed_to_me");
  assert.deepEqual(draftBlockers(edited.payload), []);
});

test("editing type, date and category rewrites only the intended fields", () => {
  const draft = expenseDraft();
  const typed = editDraftPayload(draft as unknown as Record<string, unknown>, "type", "income");
  assert.equal((typed.payload as unknown as ImageDraft).data.type, "income");
  assert.equal((typed.payload as unknown as ImageDraft).data.categoryId, null);

  const dated = editDraftPayload(draft as unknown as Record<string, unknown>, "date", "yesterday", { today: TODAY });
  assert.equal((dated.payload as unknown as ImageDraft).data.date, "2026-08-15");

  const categorized = editDraftPayload(draft as unknown as Record<string, unknown>, "cat", "2", { categoryName: "Transport" });
  assert.equal((categorized.payload as unknown as ImageDraft).data.categoryId, 2);
  assert.ok(!(categorized.payload as unknown as ImageDraft).meta.issues.includes("category_unknown"));

  // The original payload is never mutated in place.
  assert.equal(draft.data.type, "expense");
});

/* ============================ CALLBACK ROUTING ============================ */

test("image callback data is parsed strictly and stays inside 64 bytes", () => {
  assert.deepEqual(parseDraftEditCallback("ed:42:menu"), { draftId: 42, action: "menu" });
  assert.deepEqual(parseDraftEditCallback("ed:42:dir:i_owe"), { draftId: 42, action: "dir", value: "i_owe" });
  assert.deepEqual(parseDraftEditCallback("ed:42:date:today"), { draftId: 42, action: "date", value: "today" });
  assert.equal(parseDraftEditCallback("ed:42:dir:whatever"), null);
  assert.equal(parseDraftEditCallback("ed:0:menu"), null);
  assert.equal(parseDraftEditCallback(`ed:1:menu${"x".repeat(70)}`), null);
  assert.deepEqual(parseCategoryPickCallback("ec:42:7"), { draftId: 42, categoryId: 7 });
  assert.equal(parseCategoryPickCallback("ec:42:0"), null);

  const keyboard = buildCategoryKeyboard(42, CATEGORIES, "expense");
  for (const row of keyboard) for (const button of row) assert.ok(button.callback_data.length <= 64);
});

/* ============================ CONFIRMATION UX ============================ */

test("the batch message lists every row, its totals and its open questions", () => {
  const result = extractFromLines(
    ["Non 30 000", "Taksi 50 000", "Dori 45 000", "Ali — menga 500 000 qarzdor", "Kredit 1 880 000 17-sana 12 oy"],
    TODAY,
  );
  const drafts = normalizeFinanceData(result.entities, { categories: CATEGORIES, today: TODAY, documentClass: result.documentClass });
  const items = drafts.map((payload, index) => ({ id: index + 1, payload }));
  const message = buildBatchMessage(items, { batchId: "abcd1234" });

  assert.match(message.text, /Rasm o‘qildi/);
  for (let i = 1; i <= items.length; i += 1) assert.ok(message.text.includes(`${i}. `), `row ${i} missing`);
  assert.match(message.text, /Aniqlashtirish kerak/); // "Dori" has no user category
  assert.equal(message.keyboard[0][0].callback_data, "batch:abcd1234:confirm");
  assert.equal(message.keyboard[0][1].callback_data, "batch:abcd1234:cancel");
  const flat = message.keyboard.flat();
  assert.equal(flat.filter((b) => b.callback_data.endsWith(":confirm") && b.callback_data.startsWith("draft:")).length, items.length);
  assert.equal(flat.filter((b) => b.callback_data.startsWith("ed:")).length, items.length);
  assert.deepEqual(summarizeCounts(drafts).length, 3);

  const menu = buildItemMenu(1, drafts[0]);
  assert.match(menu.text, /Tahrirlash/);
});

/* ============================ PROVIDER BOUNDARY ============================ */

test("provider output is parsed defensively and never trusted blindly", () => {
  const good = parseProviderPayload('{"documentHint":"SHOPPING_LIST","lines":["Non 30 000"]}', "test");
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.deepEqual(good.lines, ["Non 30 000"]);
    assert.equal(good.documentHint, "SHOPPING_LIST");
  }
  const fenced = parseProviderPayload('```json\n{"lines":["Sut 15 000"]}\n```', "test");
  assert.equal(fenced.ok, true);
  assert.equal(parseProviderPayload("not json at all", "test").ok, false);
  assert.equal(parseProviderPayload('{"lines":[]}', "test").ok, false);
  const hostile = parseProviderPayload('{"documentHint":"DROP TABLE","lines":["Non 30 000"]}', "test");
  assert.equal(hostile.ok && hostile.documentHint, undefined);
});

test("the pipeline runs end-to-end against a static provider", async () => {
  const provider = new StaticVisionProvider(["Non 30 000", "Go'sht 120 000"]);
  const vision = await provider.readFinancialImage({
    image: Buffer.from(""),
    mimeType: "image/png",
    hints: { today: TODAY, categoryNames: [] },
  });
  assert.equal(vision.ok, true);
  if (!vision.ok) return;
  assert.equal(classifyImage(vision.lines, TODAY), "SHOPPING_LIST");
  const extraction = extractFinanceData(vision.lines, TODAY);
  const drafts = normalizeFinanceData(extraction.entities, {
    categories: CATEGORIES,
    today: TODAY,
    documentClass: extraction.documentClass,
  });
  assert.equal(drafts.length, 2);
  assert.ok(drafts.every((d) => d.meta.source === "image"));
});

/* ======================= FILE GUARDS + DUPLICATES ======================= */

test("the real file type is decided by magic bytes, not by the declared name", () => {
  assert.equal(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
  assert.equal(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "image/png");
  assert.equal(sniffImageMime(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])), "image/webp");
  assert.equal(sniffImageMime(Buffer.from("%PDF-1.7 something")), null);
  assert.equal(sniffImageMime(Buffer.from("MZ")), null);
  assert.equal(isSupportedDeclaredMime("image/png"), true);
  assert.equal(isSupportedDeclaredMime("application/pdf"), false);
  assert.equal(isSupportedDeclaredMime(undefined), false);
});

test("the same image produces the same fingerprint, a different one does not", () => {
  const hashA = createHash("sha256").update("image-a").digest("hex");
  const hashB = createHash("sha256").update("image-b").digest("hex");
  assert.equal(imageFingerprint("uniq-1", hashA), imageFingerprint("uniq-1", hashA));
  assert.notEqual(imageFingerprint("uniq-1", hashA), imageFingerprint("uniq-1", hashB));
  assert.notEqual(imageFingerprint("uniq-1", hashA), imageFingerprint("uniq-2", hashA));
});

test("photo size selection respects the size budget", () => {
  const sizes = [
    { file_id: "s", file_unique_id: "u1", file_size: 20_000 },
    { file_id: "m", file_unique_id: "u2", file_size: 400_000 },
    { file_id: "l", file_unique_id: "u3", file_size: 9_000_000 },
  ];
  assert.equal(pickPhotoSize(sizes, 5_000_000)?.file_id, "m");
  assert.equal(pickPhotoSize(sizes, 10_000)?.file_id, "s");
  assert.equal(pickPhotoSize([], 10_000), null);
});

/* ================================ helpers ================================ */

function baseExpense() {
  return {
    kind: "expense" as const,
    date: TODAY,
    amount: 30_000,
    categoryName: "Oziq-ovqat",
    note: "Non",
    semantics: "real" as const,
    confidence: 0.92,
    fields: { amount: 0.99, date: 0.9, type: 0.9 },
    issues: [],
    rowIndex: 0,
  };
}

function expenseDraft(): ImageDraft {
  return {
    kind: "transaction",
    data: { type: "expense", amount: 30_000, date: TODAY, note: "Non", categoryId: 1, source: "bot" },
    meta: {
      source: "image",
      label: "−30 000 · Oziq-ovqat · 16-avg",
      entityKind: "expense",
      confidence: 0.92,
      issues: [],
      documentClass: "SHOPPING_LIST",
      rowIndex: 0,
      semantics: "real",
    },
  };
}

function debtDraft(direction: "i_owe" | "owed_to_me" | null): ImageDraft {
  return {
    kind: "debt",
    data: { personName: "Ali", direction, amount: 500_000, remainingAmount: 500_000, dueDate: null, note: "" },
    meta: {
      source: "image",
      label: "💳 Ali — 500 000",
      entityKind: "debt",
      confidence: 0.4,
      issues: direction ? [] : ["debt_direction_unknown"],
      documentClass: "DEBT_LIST",
      rowIndex: 0,
      semantics: "real",
    },
  };
}
