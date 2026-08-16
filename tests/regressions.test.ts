import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { botIntent, isStartCommand, parseBatchCallback, parseDraftCallback } from "../src/lib/bot-routing";
import { buildAnalytics, buildForecast, buildPlanned, remainingOccurrences } from "../src/lib/finance";
import { extractDate, parseDraft, parseDrafts, splitOperations } from "../src/lib/nlp";
import { addDays, addMonths, dayDiff, monthEnd, monthKey, monthStart } from "../src/lib/money";
import { readFileSync } from "node:fs";
import { Segmented } from "../src/components/ui";

/* ============================ BOT ROUTING ============================ */

test("Telegram commands support BotFather suffixes and deep-link payloads", () => {
  assert.equal(botIntent("/start@hisobchi_bot referral-42"), "start");
  assert.equal(isStartCommand("/start campaign"), true);
  assert.equal(botIntent("/report@hisobchi_bot"), "report");
  assert.equal(botIntent("/forecast"), "forecast");
  assert.equal(botIntent("/help"), "help");
});

test("main/more menu buttons route to the correct intents", () => {
  assert.equal(botIntent("📂 Boshqa bo'limlar"), "more-menu");
  assert.equal(botIntent("⬅️ Asosiy menyu"), "main-menu");
  assert.equal(botIntent("➕ Kirim"), "add-income");
  assert.equal(botIntent("➖ Chiqim"), "add-expense");
  assert.equal(botIntent("↔️ Transfer"), "add-transfer");
  assert.equal(botIntent("💳 Hisoblar"), "accounts");
  assert.equal(botIntent("🎯 Budjet"), "budget");
});

test("amount-bearing Telegram prose stays in the NLP flow", () => {
  assert.equal(botIntent("150 ming qarz qaytdi"), "natural");
  assert.equal(botIntent("8 mln daromad keldi"), "natural");
  const draft = parseDraft("150 ming ovqatga ketdi", "2026-08-15");
  assert.equal(draft.ok, true);
  assert.equal(draft.type, "expense");
  assert.equal(draft.amount, 150_000);
  assert.equal(draft.categoryName, "Oziq-ovqat");
});

test("draft callback parser rejects malformed or replay-shaped input", () => {
  assert.deepEqual(parseDraftCallback("draft:42:confirm"), { draftId: 42, action: "confirm" });
  assert.deepEqual(parseDraftCallback("draft:42:cancel"), { draftId: 42, action: "cancel" });
  assert.equal(parseDraftCallback("draft:0:confirm"), null);
  assert.equal(parseDraftCallback("draft:42:delete"), null);
  assert.equal(parseDraftCallback(`draft:${"1".repeat(70)}:confirm`), null);
});

test("batch callback parser accepts valid ids and rejects malformed ones", () => {
  assert.deepEqual(parseBatchCallback("batch:a1b2c3d4:confirm"), { batchId: "a1b2c3d4", action: "confirm" });
  assert.deepEqual(parseBatchCallback("batch:a1b2c3d4:cancel"), { batchId: "a1b2c3d4", action: "cancel" });
  assert.equal(parseBatchCallback("batch:ab:confirm"), null);
  assert.equal(parseBatchCallback("batch:a1b2c3d4:delete"), null);
  assert.equal(parseBatchCallback(`batch:${"x".repeat(64)}:confirm`), null);
});

/* ============================ BATCH PARSER ============================ */

test("one message with five operations yields five drafts", () => {
  const batch = parseDrafts(
    "150 ming ovqatga ketdi, 200 ming taksiga ketdi, 1 mln maosh keldi, 300 ming bonus oldim, 50 ming cashback keldi",
    "2026-08-16",
  );
  assert.equal(batch.drafts.length, 5);
  assert.equal(batch.failed.length, 0);
  assert.deepEqual(
    batch.drafts.map((d) => d.type),
    ["expense", "expense", "income", "income", "income"],
  );
  assert.deepEqual(
    batch.drafts.map((d) => d.amount),
    [150_000, 200_000, 1_000_000, 300_000, 50_000],
  );
});

test("two-operation and three-operation messages split correctly", () => {
  const two = parseDrafts("2 mln ijara to'ladim, 500 ming maosh keldi", "2026-08-16");
  assert.equal(two.drafts.length, 2);
  assert.equal(two.drafts[0].type, "expense");
  assert.equal(two.drafts[1].type, "income");

  const three = parseDrafts("150 ming ovqat, 70 ming taksi, 40 ming kofe", "2026-08-16");
  assert.equal(three.drafts.length, 3);
  assert.ok(three.drafts.every((d) => d.type === "expense"));

  const incomes = parseDrafts("1 mln maosh, 300 ming bonus, 200 ming qarzdorlik qaytdi", "2026-08-16");
  assert.equal(incomes.drafts.length, 3);
  assert.ok(incomes.drafts.every((d) => d.type === "income"));
});

test("decimal commas are not treated as operation separators", () => {
  const batch = parseDrafts("1,5 mln maosh keldi", "2026-08-16");
  assert.equal(batch.drafts.length, 1);
  assert.equal(batch.drafts[0].amount, 1_500_000);
});

test("partial success: a bad segment does not drop the others", () => {
  const segments = splitOperations("150 ming ovqat\nqandaydir 77 xato matn siz\n200 ming taksi");
  assert.equal(segments.length, 3);
  const batch = parseDrafts("150 ming ovqat, 200 ming taksi, salom dunyo", "2026-08-16");
  assert.equal(batch.drafts.length, 2);
});

/* ============================ BOT DATE SUPPORT ============================ */

test("kecha / bugun / ertaga resolve against the base date", () => {
  assert.equal(parseDraft("kecha 150 ming ovqatga ketdi", "2026-08-16").date, "2026-08-15");
  assert.equal(parseDraft("bugun 1 mln maosh keldi", "2026-08-16").date, "2026-08-16");
  assert.equal(parseDraft("ertaga 90 ming to'lov", "2026-08-16").date, "2026-08-17");
});

test("explicit Uzbek dates parse and never leak into the amount", () => {
  const d = parseDraft("15-avgust 500 ming ijara to'ladim", "2026-08-16");
  assert.equal(d.date, "2026-08-15");
  assert.equal(d.amount, 500_000);
  const d2 = parseDraft("3 sentabr 250 ming kurs to'lovi", "2026-08-16");
  assert.equal(d2.date, "2026-09-03");
  assert.equal(d2.amount, 250_000);
});

test("a leading date phrase applies to the whole batch, items may override", () => {
  const batch = parseDrafts("kecha 150 ming ovqat, 70 ming taksi", "2026-08-16");
  assert.deepEqual(
    batch.drafts.map((d) => d.date),
    ["2026-08-15", "2026-08-15"],
  );
  const mixed = parseDrafts("kecha 150 ming ovqat, bugun 70 ming taksi", "2026-08-16");
  assert.deepEqual(
    mixed.drafts.map((d) => d.date),
    ["2026-08-15", "2026-08-16"],
  );
});

test("extractDate handles ISO dates and cleans matched tokens", () => {
  const r = extractDate("2026-08-15 500 ming ijara", "2026-08-16");
  assert.equal(r.date, "2026-08-15");
  assert.equal(r.explicit, true);
  assert.ok(!r.cleaned.includes("2026-08-15"));
});

/* ============================ DATE ENGINE ============================ */

test("date helpers survive month and year boundaries", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-30", 2), "2027-01-30");
  assert.equal(monthEnd("2026-02-10"), "2026-02-28");
  assert.equal(monthStart("2026-08-16"), "2026-08-01");
  assert.equal(monthKey("2026-08-16"), "2026-08");
  assert.equal(dayDiff("2026-08-15", "2026-08-16"), 1);
  assert.equal(dayDiff("2026-12-31", "2027-01-01"), 1);
});

test("analytics buckets transactions by transaction.date, not createdAt", () => {
  const today = "2026-08-16";
  const a = buildAnalytics({
    transactions: [
      // Entered *today* but dated yesterday: must count in yesterday, not today.
      { id: 1, type: "expense", amount: 150_000, date: "2026-08-15", categoryId: 1, note: null },
      { id: 2, type: "expense", amount: 40_000, date: today, categoryId: 1, note: null },
      { id: 3, type: "income", amount: 1_000_000, date: today, categoryId: 2, note: null },
      // Future-dated income must not inflate "today".
      { id: 4, type: "income", amount: 500_000, date: "2026-08-20", categoryId: 2, note: null },
    ],
    categories: [
      { id: 1, name: "Oziq-ovqat", icon: "🍞", isEssential: true },
      { id: 2, name: "Ish haqi", icon: "💼", isEssential: false },
    ],
    recurringBase: 0,
    currentBalance: 2_000_000,
    today,
  });
  assert.equal(a.today.expense, 40_000);
  assert.equal(a.today.income, 1_000_000);
  // Month totals include yesterday's expense entered today.
  assert.equal(a.monthTotals.expense, 190_000);
  assert.equal(a.monthTotals.income, 1_000_000);
});

test("month boundary: a yesterday transaction from the 1st lands in the previous month", () => {
  const a = buildAnalytics({
    transactions: [{ id: 1, type: "expense", amount: 90_000, date: "2026-07-31", categoryId: null, note: null }],
    categories: [],
    recurringBase: 0,
    currentBalance: 0,
    today: "2026-08-01",
  });
  assert.equal(a.monthTotals.expense, 0);
  assert.equal(a.monthly[a.monthly.length - 2].expense, 90_000);
});

/* ============================ INCOME SEMANTICS ============================ */

test("one-time expected income creates exactly one forecast occurrence", () => {
  const planned = buildPlanned(
    [],
    [
      {
        id: 1,
        sourceName: "Bonus",
        amount: 1_000_000,
        minAmount: null,
        maxAmount: null,
        expectedDate: "2026-08-20",
        frequency: "once",
        certainty: "exact",
        isActive: true,
        linkedTransactionId: null,
      },
    ],
    "2026-08-15",
    120,
  );
  assert.equal(planned.length, 1);
  assert.equal(planned[0].date, "2026-08-20");
});

test("exact/estimated income representations do not leak stale values into forecast", () => {
  const exact = buildForecast({
    currentBalance: 0,
    recurring: [],
    incomes: [
      {
        id: 1,
        sourceName: "Ish haqi",
        amount: 2_000_000,
        minAmount: null,
        maxAmount: null,
        expectedDate: "2026-08-20",
        frequency: "once",
        certainty: "exact",
        isActive: true,
        linkedTransactionId: null,
      },
    ],
    minReserve: 0,
    estimatedConfidence: 50,
    today: "2026-08-15",
    horizonDays: 35,
  });
  assert.equal(exact.income.exactBase, 2_000_000);
  assert.equal(exact.income.estimatedBase, 0);

  const estimated = buildForecast({
    currentBalance: 0,
    recurring: [],
    incomes: [
      {
        id: 1,
        sourceName: "Ish haqi",
        amount: null,
        minAmount: 1_000_000,
        maxAmount: 3_000_000,
        expectedDate: "2026-08-20",
        frequency: "once",
        certainty: "estimated",
        isActive: true,
        linkedTransactionId: null,
      },
    ],
    minReserve: 0,
    estimatedConfidence: 50,
    today: "2026-08-15",
    horizonDays: 35,
  });
  assert.equal(estimated.income.exactBase, 0);
  assert.equal(estimated.income.estimatedBase, 2_000_000);
  assert.equal(estimated.income.estimatedMin, 1_000_000);
  // MIN scenario counts only confirmed income; estimated may not arrive.
  assert.equal(estimated.income.min, 0);
  assert.equal(estimated.income.max, 3_000_000);
});

/* ============================ PAYMENT PLANS ============================ */

test("remainingOccurrences: one_time=1, recurring=null, term=remaining", () => {
  assert.equal(remainingOccurrences({ planType: "one_time", frequency: "once" }), 1);
  assert.equal(remainingOccurrences({ planType: "recurring", frequency: "monthly" }), null);
  assert.equal(remainingOccurrences({ planType: "term", frequency: "monthly", installmentCount: 12, installmentsPaid: 6 }), 6);
  assert.equal(remainingOccurrences({ planType: "term", frequency: "monthly", installmentCount: 12, installmentsPaid: 12 }), 0);
  assert.equal(remainingOccurrences({ frequency: "once" }), 1);
  assert.equal(remainingOccurrences({ frequency: "monthly" }), null);
});

test("term expense projects only the remaining installments in the forecast", () => {
  const term = {
    id: 1,
    name: "Kredit",
    amount: 1_500_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-20",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "term",
    installmentCount: 12,
    installmentsPaid: 10, // 2 remaining
  };
  const planned = buildPlanned([term], [], "2026-08-15", 180);
  assert.equal(planned.length, 2);
  assert.deepEqual(
    planned.map((p) => p.date),
    ["2026-08-20", "2026-09-20"],
  );
});

test("a finished term plan disappears from forecast and upcoming payments", () => {
  const finished = {
    id: 1,
    name: "Kredit",
    amount: 1_500_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-20",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "term",
    installmentCount: 12,
    installmentsPaid: 12,
  };
  const f = buildForecast({
    currentBalance: 1_000_000,
    recurring: [finished],
    incomes: [],
    minReserve: 0,
    estimatedConfidence: 50,
    today: "2026-08-15",
    horizonDays: 35,
  });
  assert.equal(f.planned.length, 0);
  assert.equal(f.upcomingPayments.length, 0);
  assert.equal(f.expense.base, 0);
});

test("term expected income projects only remaining occurrences", () => {
  const contract = {
    id: 1,
    sourceName: "Kontrakt",
    amount: 2_000_000,
    minAmount: null,
    maxAmount: null,
    expectedDate: "2026-08-25",
    frequency: "monthly",
    certainty: "exact",
    isActive: true,
    linkedTransactionId: null,
    planType: "term",
    occurrenceCount: 3,
    occurrencesReceived: 2,
  };
  const planned = buildPlanned([], [contract], "2026-08-15", 180);
  assert.equal(planned.length, 1);
  assert.equal(planned[0].date, "2026-08-25");
});

/* ============================ FORECAST SCENARIOS ============================ */

test("min/base/max scenarios order correctly with mixed certainty", () => {
  const f = buildForecast({
    currentBalance: 5_000_000,
    recurring: [
      {
        id: 1,
        name: "Ijara",
        amount: 1_200_000,
        minAmount: null,
        maxAmount: null,
        nextDueDate: "2026-08-20",
        frequency: "monthly",
        isMandatory: true,
        certainty: "exact",
        isActive: true,
        categoryId: null,
      },
      {
        id: 2,
        name: "Kommunal",
        amount: null,
        minAmount: 200_000,
        maxAmount: 400_000,
        nextDueDate: "2026-08-22",
        frequency: "monthly",
        isMandatory: true,
        certainty: "estimated",
        isActive: true,
        categoryId: null,
      },
    ],
    incomes: [
      {
        id: 1,
        sourceName: "Maosh",
        amount: 8_000_000,
        minAmount: null,
        maxAmount: null,
        expectedDate: "2026-09-05",
        frequency: "monthly",
        certainty: "exact",
        isActive: true,
        linkedTransactionId: null,
      },
      {
        id: 2,
        sourceName: "Freelance",
        amount: null,
        minAmount: 1_000_000,
        maxAmount: 3_000_000,
        expectedDate: "2026-08-28",
        frequency: "monthly",
        certainty: "estimated",
        isActive: true,
        linkedTransactionId: null,
      },
    ],
    minReserve: 500_000,
    estimatedConfidence: 50,
    today: "2026-08-15",
    horizonDays: 35,
  });
  assert.ok(f.scenarios.min.balance <= f.scenarios.base.balance);
  assert.ok(f.scenarios.base.balance <= f.scenarios.max.balance);
  // MIN uses only exact income and max expenses.
  assert.equal(f.income.min, f.income.exactMin);
});

/* ============================ SECURITY REGRESSION ============================ */

test("ownership and callback replay guards remain in server mutation paths", () => {
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  const webhook = readFileSync(new URL("../src/app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(mutations, /eq\(expectedIncomes\.userId, userId\)/);
  assert.match(mutations, /eq\(expectedIncomes\.expectedDate, row\[0\]\.expectedDate\)/);
  assert.match(webhook, /eq\(pendingDrafts\.userId, user\.id\)/);
  assert.match(webhook, /eq\(pendingDrafts\.chatId, chatId\)/);
  assert.match(webhook, /eq\(pendingDrafts\.status, "pending"\)/);
  assert.match(webhook, /status: "processing"/);
});

test("batch confirm keeps per-draft atomic claims and user scoping", () => {
  const webhook = readFileSync(new URL("../src/app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /parseBatchCallback/);
  assert.match(webhook, /eq\(pendingDrafts\.batchId, batchId\)/);
  // every batch query is scoped to the calling user
  const batchBlocks = webhook.split("parseBatchCallback(data)")[1] ?? "";
  assert.match(batchBlocks, /eq\(pendingDrafts\.userId, user\.id\)/);
});

test("recurring pay claims the due date before inserting a transaction", () => {
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  assert.match(mutations, /eq\(recurringExpenses\.nextDueDate, rec\[0\]\.nextDueDate\)/);
  assert.match(mutations, /eq\(recurringExpenses\.installmentsPaid, rec\[0\]\.installmentsPaid\)/);
});

/* ============================ UI ============================ */

test("segmented controls render complete labels without ellipsis", () => {
  const html = renderToStaticMarkup(
    createElement(Segmented, {
      value: "all",
      onChange: () => undefined,
      options: [
        { value: "all", label: "Hammasi" },
        { value: "income", label: "Kirim" },
        { value: "expense", label: "Chiqim" },
        { value: "transfer", label: "Transfer" },
      ],
    }),
  );
  for (const label of ["Hammasi", "Kirim", "Chiqim", "Transfer"]) assert.match(html, new RegExp(`>${label}<`));
  assert.match(html, /data-segmented-scroll/);
  assert.doesNotMatch(html, /truncate/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /--segmented-active/);
});

test("received expected income is reconciled and never forecast twice", () => {
  const tx = { date: "2026-08-20", type: "income", amount: 3_000_000, expectedIncomeId: 7, recurringId: null };
  const planned = buildPlanned([], [{ id: 7, sourceName: "Avans", amount: 3_000_000, minAmount: null, maxAmount: null, expectedDate: "2026-08-20", frequency: "once", certainty: "exact", isActive: true, linkedTransactionId: 7 }], "2026-08-16", 31, [tx]);
  assert.equal(planned.filter((x) => x.source === "expected").length, 0);
});

test("paid recurring occurrence is removed from the planned timeline", () => {
  const planned = buildPlanned([{ id: 8, name: "Kredit", amount: 1_880_000, minAmount: null, maxAmount: null, nextDueDate: "2026-08-17", frequency: "once", isMandatory: true, certainty: "exact", isActive: true, categoryId: null }], [], "2026-08-16", 31, [{ date: "2026-08-17", type: "expense", amount: 1_880_000, recurringId: 8 }]);
  assert.equal(planned.length, 0);
});

test("conservative forecast includes estimated minimum income", () => {
  const forecast = buildForecast({
    currentBalance: 100_000,
    recurring: [{ id: 1, name: "Kredit", amount: 1_880_000, minAmount: null, maxAmount: null, nextDueDate: "2026-08-17", frequency: "once", isMandatory: true, certainty: "exact", isActive: true, categoryId: null }],
    incomes: [{ id: 2, sourceName: "Avans", amount: null, minAmount: 1_000_000, maxAmount: 2_000_000, expectedDate: "2026-08-20", frequency: "once", certainty: "estimated", isActive: true, linkedTransactionId: null }],
    minReserve: 0,
    estimatedConfidence: 100,
    today: "2026-08-16",
    horizonDays: 31,
  });
  assert.equal(forecast.scenarios.min.balance, -780_000);
  assert.equal(forecast.riskDates[0]?.date, "2026-08-17");
});
