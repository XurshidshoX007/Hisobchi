import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { botIntent, isStartCommand, parseBatchCallback, parseDraftCallback } from "../src/lib/bot-routing";
import {
  BUTTON,
  draftSummary,
  HELP,
  MINI_APP_INTRO,
  PROMPT,
  startNew,
  startReturning,
} from "../src/lib/bot-copy";
import { buildAnalytics, buildForecast, buildPlanned, remainingOccurrences } from "../src/lib/finance";
import { extractDate, parseDraft, parseDrafts, splitOperations } from "../src/lib/nlp";
import { addDays, addMonths, dayDiff, monthEnd, monthKey, monthStart } from "../src/lib/money";
import { readFileSync, readdirSync } from "node:fs";
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

/* ============================ COPY / TERMINOLOGY ============================ */

test("the Telegram main keyboard is exactly the three core finance actions", () => {
  // Product spec: the persistent MAIN keyboard shows only
  // 💰 Daromad / 💸 Xarajat / 🔄 Transfer — one row, three buttons.
  // The keyboard is read from source: importing lib/bot would pull in the DB.
  const botSource = readFileSync(new URL("../src/lib/bot.ts", import.meta.url), "utf8");
  const mainMenu = botSource.slice(botSource.indexOf("export const MAIN_MENU"), botSource.indexOf("export const MORE_MENU"));
  const rows = [...mainMenu.matchAll(/\[[^\][]+\]/g)].map((row) => [...row[0].matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  assert.equal(rows.length, 1, "MAIN_MENU must be a single row");
  assert.deepEqual(rows[0], ["💰 Daromad", "💸 Xarajat", "🔄 Transfer"], "exactly the three core finance actions, in order");
  // The keyboard buttons and the Mini App speak ONE vocabulary.
  assert.equal(botIntent("💰 Daromad"), "add-income");
  assert.equal(botIntent("💸 Xarajat"), "add-expense");
  assert.equal(botIntent("🔄 Transfer"), "add-transfer");
  for (const button of rows[0]) {
    assert.notEqual(botIntent(button), "natural", `${button} must route to an intent`);
  }
});

test("retained MORE_MENU buttons still route to real intents", () => {
  // MORE_MENU is retained on purpose: deep-section flows answer with it, and
  // typed text can still reach it. Every remaining button must resolve to a
  // concrete intent — never fall through to the natural-language parser.
  const botSource = readFileSync(new URL("../src/lib/bot.ts", import.meta.url), "utf8");
  const moreMenu = botSource.slice(botSource.indexOf("export const MORE_MENU"), botSource.indexOf("const mon ="));
  const buttons = [...moreMenu.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(buttons.length >= 9, "MORE_MENU buttons should be discovered");
  for (const button of buttons) {
    assert.notEqual(botIntent(button), "natural", `${button} must route to an intent`);
  }
  assert.equal(botIntent("📌 To‘lovlar"), "payments");
  assert.equal(botIntent("📅 Reja"), "forecast");
});

test("removed main-menu buttons keep their text routing (backward compatibility)", () => {
  // The buttons left the MAIN keyboard, not the routing: a user who types the
  // old label — or answers from a stale pinned keyboard — lands in the same
  // flow as before the simplification.
  assert.equal(botIntent("/report@hisobchi_bot"), "report");
  assert.equal(botIntent("Hisobot"), "report");
  assert.equal(botIntent("📊 Hisobot"), "report");
  assert.equal(botIntent("Reja"), "forecast");
  assert.equal(botIntent("📅 Reja"), "forecast");
  assert.equal(botIntent("Hisoblar"), "accounts");
  assert.equal(botIntent("Kategoriyalar"), "categories");
  assert.equal(botIntent("📌 To‘lovlar"), "payments");
  assert.equal(botIntent("Kutilayotgan daromad"), "income-plans");
  assert.equal(botIntent("Budjet"), "budget");
  assert.equal(botIntent("Qarzdorlik"), "debts");
  assert.equal(botIntent("Maqsadlar"), "goals");
  assert.equal(botIntent("Eslatmalar"), "alerts");
  assert.equal(botIntent("Sozlamalar"), "settings");
  assert.equal(botIntent("⬅️ Asosiy menyu"), "main-menu");
  assert.equal(botIntent("📂 Boshqa bo'limlar"), "more-menu");
  // Legacy keyboards pinned in existing chats keep working (Kirim/Chiqim, ’/').
  assert.equal(botIntent("➕ Kirim"), "add-income");
  assert.equal(botIntent("➖ Chiqim"), "add-expense");
  assert.equal(botIntent("↔️ Transfer"), "add-transfer");
  assert.equal(botIntent("📌 Majburiy to'lovlar"), "payments");
  assert.equal(botIntent("📌 Majburiy to‘lovlar"), "payments");
});

test("Mini App and bot never mix synonyms for one concept", () => {
  const uiSources = [
    "app/page.tsx",
    "app/transactions/page.tsx",
    "app/plans/page.tsx",
    "app/settings/page.tsx",
    "app/bot/page.tsx",
    "lib/bot-copy.ts",
    "components/dashboard.tsx",
    "components/quick-add.tsx",
    "components/transaction-filter.tsx",
    "components/app-shell.tsx",
  ].map((path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"));
  const bot = readFileSync(new URL("../src/lib/bot.ts", import.meta.url), "utf8");
  for (const source of [...uiSources, bot]) {
    // "Kirim"/"Chiqim" are retired user-facing synonyms of Daromad/Xarajat.
    assert.doesNotMatch(source, /"[^"]*\bKirim\b[^"]*"/, "user-facing copy must say Daromad");
    assert.doesNotMatch(source, /"[^"]*\bChiqim\b[^"]*"/, "user-facing copy must say Xarajat");
    // Untranslated English finance terms never reach a label.
    // Code identifiers (CashFlowStrip, safeToSpend) are INTERNAL and stay;
    // only quoted, user-visible copy is audited.
    for (const literal of source.match(/"[^"\n]*"/g) ?? []) {
      if (literal.startsWith('"@/') || literal.startsWith('"./')) continue;
      assert.doesNotMatch(literal, /Safe-to-Spend|Cash[ -]flow/i, `English finance term in UI copy: ${literal}`);
    }
  }
  // The bot reads the SAME dictionary the Mini App does.
  assert.match(bot, /TERMS\.safeToSpend/);
  const copy = readFileSync(new URL("../src/lib/copy.ts", import.meta.url), "utf8");
  assert.match(copy, /safeToSpend: "Sarflash mumkin"/);
});

/* ============================ BOT ONBOARDING COPY ============================ */

test("/start for a new account onboards without a wall of zeroes", () => {
  const text = startNew("Xurshid");
  assert.match(text, /^Assalomu alaykum, Xurshid/, "the first line greets the person");
  assert.ok(text.includes("Hisobchi"), "the second line says what the product is");
  for (const label of [BUTTON.income, BUTTON.expense, BUTTON.transfer]) {
    assert.ok(text.includes(label), `the three core actions are named: ${label}`);
  }
  // A brand-new account has only zeroes; a welcome message must not report them.
  assert.doesNotMatch(text, /\d{1,3}(\s\d{3})+|so‘m/, "no account figures in the welcome message");
  assert.doesNotMatch(text, /Balans|Prognoz|Sarflash mumkin|Hisobot/i, "no dashboard vocabulary at first contact");
  // Scannability: the whole message stays inside one Telegram screen.
  assert.ok(text.split("\n").filter(Boolean).length <= 9, "at most 9 non-empty lines");
  assert.ok(text.trimEnd().endsWith("👇"), "the message ends by pointing at the keyboard");
});

test("/start for a returning user states two facts and one action", () => {
  const text = startReturning({
    firstName: "Xurshid",
    balance: 12_480_000,
    monthIncome: 4_200_000,
    monthExpense: 1_950_000,
    monthLabel: "Avgust",
  });
  assert.ok(text.includes("Balans"), "the balance is the one number that matters after login");
  assert.ok(text.includes("Avgust"), "the month is stated once");
  assert.ok(text.split("\n").filter(Boolean).length <= 5, "a launchpad, not a report");
  assert.doesNotMatch(text, /Sarflash mumkin|Majburiy|Prognoz/, "forecast vocabulary belongs to /forecast");
});

test("the bot never advertises a Mini App feature as its own", () => {
  const botCopy = readFileSync(new URL("../src/lib/bot-copy.ts", import.meta.url), "utf8");
  const miniAppFeatures = /budjet|qarzdorlik|maqsad|tahlil/i;
  // Those words may appear ONLY in a sentence that names the Mini App.
  for (const literal of botCopy.match(/"[^"\n]*"/g) ?? []) {
    if (!miniAppFeatures.test(literal)) continue;
    assert.match(literal, /Mini App/, `Mini App feature promised without naming the Mini App: ${literal}`);
  }
  assert.match(MINI_APP_INTRO, /Mini App/);
  assert.ok(!startNew("A").includes("Mini App"), "the first message keeps ONE call to action");
});

test("an action prompt never repeats the button the user just pressed", () => {
  const pairs: Array<[string, string]> = [
    [BUTTON.income, PROMPT.income],
    [BUTTON.expense, PROMPT.expense],
    [BUTTON.transfer, PROMPT.transfer],
  ];
  for (const [label, prompt] of pairs) {
    const word = label.replace(/[^\p{L}]/gu, "");
    assert.doesNotMatch(prompt, new RegExp(word, "i"), `${word} is already on the button`);
    assert.ok(prompt.includes("Masalan:"), "every prompt shows exactly one example");
    assert.ok(prompt.split("\n").filter(Boolean).length === 2, "one question + one example");
  }
});

test("bot copy speaks one vocabulary and one apostrophe", () => {
  const sources = ["lib/bot-copy.ts", "lib/bot.ts"].map((path) =>
    readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"),
  );
  for (const source of sources) {
    for (const literal of source.match(/"[^"\n]*"/g) ?? []) {
      if (literal.startsWith('"@/') || literal.startsWith('"./')) continue;
      // §18: one spelling of o‘/g‘ across the product.
      assert.doesNotMatch(literal, /[a-z]'[a-z]/, `straight apostrophe in bot copy: ${literal}`);
      // A record is an "operatsiya" everywhere — never a second synonym.
      assert.doesNotMatch(literal, /\byozuv/i, `use "operatsiya": ${literal}`);
    }
  }
  // The draft confirmation exists once and is shared by both bot surfaces.
  const webhook = readFileSync(new URL("../src/app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /draftSummary\(/);
  assert.match(webhook, /batchSummary\(/);
  assert.doesNotMatch(webhook, /Quyidagi operatsiyani topdim/);
});

test("a draft confirmation shows the three facts a user verifies", () => {
  const text = draftSummary({ type: "expense", amount: 150_000, categoryName: "Ovqat", date: "2026-08-22" });
  assert.ok(text.includes("Xarajat"));
  assert.ok(text.includes("150 000"));
  assert.ok(text.includes("Ovqat"));
  assert.ok(text.split("\n").filter(Boolean).length <= 4, "confirmation stays scannable");
});

test("/help explains the bot without promising deeper sections", () => {
  assert.ok(HELP.includes("/report") && HELP.includes("/forecast"));
  assert.ok(HELP.includes(MINI_APP_INTRO), "the deeper sections are attributed to the Mini App");
  assert.doesNotMatch(HELP, /Valyuta|Minimal zaxira/, "settings are not help");
});

test("the dashboard hero states only balance and current-month real movement (§3/§7/§15)", () => {
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  const components = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  const dashboard = `${page}\n${components}`;
  // The month context appears once above the card; labels do not repeat
  // "current", "real", or "this month" beside every amount.
  assert.doesNotMatch(dashboard, /REAL · |Joriy real balans|Bu oy · daromad|Bu oy · xarajat/i);
  assert.match(components, />Balans</);
  assert.match(components, />Daromad</);
  assert.match(components, />Xarajat</);
  assert.doesNotMatch(dashboard, /TERMS\.safeToSpend|Sarflash mumkin|Sof natija/i);
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

test("decimal commas are not treated as operation separators or rounded away", () => {
  const batch = parseDrafts("1,5 mln maosh keldi", "2026-08-16");
  assert.equal(batch.drafts.length, 1);
  assert.equal(batch.drafts[0].amount, 1_500_000);

  const credit = parseDraft("7532,96 Uzum nasiya kredit", "2026-08-16");
  assert.equal(credit.amount, 7532.96);
  assert.equal(credit.note, "7532,96 Uzum nasiya kredit");
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
  // MIN scenario uses the configured lower bound for estimated income.
  assert.equal(estimated.income.min, 1_000_000);
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
  // MIN includes the declared lower bound of estimated income.
  assert.equal(f.income.min, f.income.exactMin + f.income.estimatedMin);
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

/* ============================ MIGRATION INTEGRITY ============================ */

test("every SQL migration file is registered in the drizzle journal", () => {
  const journal = JSON.parse(
    readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  ) as { entries: Array<{ tag: string }> };
  const journalTags = new Set(journal.entries.map((e) => e.tag));

  const sqlFiles = readdirSync(new URL("../drizzle", import.meta.url))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.replace(/\.sql$/, ""));

  assert.ok(sqlFiles.length > 0, "expected at least one migration SQL file");

  // A migration file that exists on disk but is missing from the journal is
  // silently skipped by scripts/migrate.mjs — the table/column it defines never
  // reaches the database, which breaks every query that touches it (e.g. the
  // `goals.is_deleted` column required by buildAppState).
  for (const file of sqlFiles) {
    assert.ok(journalTags.has(file), `migration "${file}.sql" is missing from drizzle/meta/_journal.json`);
  }
  // Conversely, a journal entry pointing at a file that no longer exists makes
  // migrate.mjs throw at deploy time.
  for (const tag of journalTags) {
    assert.ok(sqlFiles.includes(tag), `journal entry "${tag}" has no matching .sql file`);
  }

  // drizzle-kit generates from the latest snapshot, not by replaying the SQL
  // journal. Missing snapshots for manual migrations make the next generated
  // migration recreate existing tables/columns and fail in production.
  const latest = journal.entries[journal.entries.length - 1]?.tag;
  assert.ok(latest, "journal has no latest migration");
  const prefix = latest.slice(0, 4);
  const snapshot = JSON.parse(
    readFileSync(new URL(`../drizzle/meta/${prefix}_snapshot.json`, import.meta.url), "utf8"),
  ) as { tables?: Record<string, unknown> };
  assert.ok(snapshot.tables?.["public.credit_installments"], "latest snapshot misses credit_installments");
  assert.ok(snapshot.tables?.["public.image_intakes"], "latest snapshot misses image_intakes");
  assert.ok(snapshot.tables?.["public.transactions"], "latest snapshot misses transactions");
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

/* ============================ MONEY PRECISION BOUND ============================ */

test("MAX_MONEY keeps every accepted amount exact in the IEEE-754 cents domain", async () => {
  const { MAX_MONEY, roundMoney } = await import("../src/lib/money");
  // amount×100 must stay an exactly-representable integer (< 2^53), otherwise
  // numeric(18,2) ⇄ JS number round-trips could silently lose tiyin precision.
  assert.ok(Math.round(MAX_MONEY * 100) <= Number.MAX_SAFE_INTEGER);
  // The bound itself round-trips through the canonical two-decimal contract.
  assert.equal(roundMoney(MAX_MONEY), MAX_MONEY);
  // One tiyin below the bound is still distinguishable — no precision collapse.
  const nearBound = roundMoney(MAX_MONEY - 0.01);
  assert.notEqual(nearBound, MAX_MONEY);
  assert.equal(Math.round((MAX_MONEY - nearBound) * 100), 1);
});

test("debt ledger rows are linked and managed from the debt module", () => {
  const schema = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
  const mutations = readFileSync(new URL("../src/lib/mutations.ts", import.meta.url), "utf8");
  const history = readFileSync(new URL("../src/app/transactions/page.tsx", import.meta.url), "utf8");
  const debtsPage = readFileSync(new URL("../src/app/debts/page.tsx", import.meta.url), "utf8");

  assert.match(schema, /debtId: integer\("debt_id"\)\.references\(\(\) => debts\.id/);
  assert.match(schema, /debtPaymentId: integer\("debt_payment_id"\)\.references\(\(\) => debtPayments\.id/);
  assert.match(mutations, /debt: \["create", "update", "pay", "delete", "cancel"\]/);
  assert.match(mutations, /debtId: created\.id/);
  assert.match(mutations, /Keep the debt-owned opening cash movement in History in sync/);
  assert.match(mutations, /debtPaymentId: payment\.id/);
  assert.match(mutations, /Qarzga bog'langan operatsiyani Qarzdorlik bo'limidan boshqaring/);
  assert.match(mutations, /Qarz va uning boshlang'ich operatsiyasi bekor qilindi/);
  assert.match(history, /transaction\.debtId \? <Badge/);
  assert.match(history, /disabled=\{Boolean\(transaction\.debtId\)\}/);
  assert.match(debtsPage, /mutate\("debt", "cancel"/);
});
