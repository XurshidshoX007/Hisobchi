import test from "node:test";
import assert from "node:assert/strict";
import { buildForecast, buildMonthlyView, buildMonthlySeries, buildAnalytics } from "../src/lib/finance";
import { addDays, monthKey, monthStart, todayISO } from "../src/lib/money";

/* ============================ Example from spec ============================ */

test("Spec example: 100k balance, 1.88m payment 17 Aug, 3m advance 20 Aug", () => {
  const today = "2026-08-15";
  const currentBalance = 100_000;

  const recurring = [
    {
      id: 1,
      name: "Kredit",
      amount: 1_880_000,
      minAmount: null,
      maxAmount: null,
      nextDueDate: "2026-08-17",
      frequency: "once",
      isMandatory: true,
      certainty: "exact",
      isActive: true,
      categoryId: null,
      planType: "one_time",
    },
  ];
  const incomes = [
    {
      id: 1,
      sourceName: "Avans",
      amount: 3_000_000,
      minAmount: null,
      maxAmount: null,
      expectedDate: "2026-08-20",
      frequency: "once",
      certainty: "exact",
      isActive: true,
      linkedTransactionId: null,
      planType: "one_time",
    },
  ];

  const f = buildForecast({
    currentBalance,
    recurring,
    incomes,
    minReserve: 0,
    estimatedConfidence: 50,
    today,
    horizonDays: 35,
  });

  // Forecast must contain both events
  assert.ok(f.planned.some((p) => p.date === "2026-08-17" && p.kind === "expense"));
  assert.ok(f.planned.some((p) => p.date === "2026-08-20" && p.kind === "income"));

  // Cashflow
  const day17 = f.cashflow.find((c) => c.date === "2026-08-17");
  const day20 = f.cashflow.find((c) => c.date === "2026-08-20");
  assert.ok(day17);
  assert.ok(day20);

  // 15 Aug balance = 100k
  // 17 Aug projected = 100k -1.88m = -1.78m
  assert.equal(day17?.projectedBase, 100_000 - 1_880_000);
  // Risk must be detected before payment date
  assert.ok(f.riskDates.some((r) => r.date === "2026-08-17"));
  const risk17 = f.riskDates.find((r) => r.date === "2026-08-17");
  assert.ok(risk17 && risk17.deficit > 0);
  // 20 Aug projected = -1.78m +3m = 1.22m
  assert.equal(day20?.projectedBase, 100_000 - 1_880_000 + 3_000_000);

  // Forecast balance = 1.22m
  assert.equal(f.scenarios.base.balance, 1_220_000);

  // Expected income must NOT be in REAL balance
  assert.equal(f.currentBalance, 100_000);
  // Expected income affects forecast but not real
  assert.equal(f.income.base, 3_000_000);

  // Safe-to-spend: balance + confirmed income - mandatory
  // For August, safe window includes both: 100k +3m -1.88m = 1.22m
  assert.ok(f.safeToSpend > 0);
});

test("Past transaction date belongs to past, not today", () => {
  const today = "2026-08-16";
  const analytics = buildAnalytics({
    transactions: [
      { id: 1, type: "expense", amount: 150_000, date: "2026-08-15", categoryId: 1, note: null },
      { id: 2, type: "expense", amount: 40_000, date: today, categoryId: 1, note: null },
    ],
    categories: [{ id: 1, name: "Oziq-ovqat", icon: "🍞", isEssential: true }],
    recurringBase: 0,
    currentBalance: 1_000_000,
    today,
  });
  assert.equal(analytics.today.expense, 40_000);
  assert.equal(analytics.monthTotals.expense, 190_000);
});

test("Expected income received: no double counting", () => {
  const today = "2026-08-15";
  // Before receiving: forecast includes 3m income
  const before = buildForecast({
    currentBalance: 100_000,
    recurring: [],
    incomes: [
      {
        id: 1,
        sourceName: "Avans",
        amount: 3_000_000,
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
    today,
    horizonDays: 30,
  });
  assert.equal(before.income.base, 3_000_000);
  assert.equal(before.scenarios.base.balance, 3_100_000);

  // After receiving: income plan becomes inactive (one_time), and real transaction increases balance
  const afterRealBalance = 100_000 + 3_000_000;
  const after = buildForecast({
    currentBalance: afterRealBalance,
    recurring: [],
    incomes: [
      {
        id: 1,
        sourceName: "Avans",
        amount: 3_000_000,
        minAmount: null,
        maxAmount: null,
        expectedDate: "2026-08-20",
        frequency: "once",
        certainty: "exact",
        isActive: false, // marked inactive after receive
        linkedTransactionId: 10,
      },
    ],
    minReserve: 0,
    estimatedConfidence: 50,
    today: "2026-08-20",
    horizonDays: 30,
  });
  // Forecast should not count the same 3m twice; income base should be 0 now
  assert.equal(after.income.base, 0);
  // Real balance increased exactly once
  assert.equal(after.currentBalance, 3_100_000);
});

test("Monthly view: opening, daily cashflow, deficit detection", () => {
  const today = "2026-08-15";
  const currentBalance = 100_000;
  const txs = [
    { date: "2026-08-10", type: "expense", amount: 20_000 },
    { date: "2026-08-14", type: "income", amount: 50_000 },
  ];
  // Analytics for current month: real income 50k, expense 20k
  const analytics = buildAnalytics({
    transactions: txs.map((t, i) => ({ id: i + 1, type: t.type, amount: t.amount, date: t.date, categoryId: null, note: null })),
    categories: [],
    recurringBase: 0,
    currentBalance,
    today,
  });

  const forecast = buildForecast({
    currentBalance,
    recurring: [
      {
        id: 1,
        name: "Kredit",
        amount: 1_880_000,
        minAmount: null,
        maxAmount: null,
        nextDueDate: "2026-08-17",
        frequency: "monthly",
        isMandatory: true,
        certainty: "exact",
        isActive: true,
        categoryId: null,
      },
    ],
    incomes: [
      {
        id: 1,
        sourceName: "Avans",
        amount: 3_000_000,
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
    today,
    horizonDays: 90,
  });

  const monthly = buildMonthlyView({
    monthKey: "2026-08",
    today,
    currentBalance,
    transactions: txs,
    planned: forecast.planned,
    cashflow: forecast.cashflow,
    analytics,
    forecast,
  });

  assert.equal(monthly.monthKey, "2026-08");
  assert.ok(monthly.daily.length === 31);
  // Opening balance = current - month net (50k-20k=30k) => 70k
  // Actually analytics month net = 30k, so opening = 100k -30k =70k
  assert.equal(monthly.openingBalance, 70_000);

  // Check daily projections include risk on 17th
  const day17 = monthly.daily.find((d) => d.date === "2026-08-17");
  assert.ok(day17);
  assert.ok(day17?.isRisk || day17?.projectedMin < 0);

  // Forecast closing = opening + realNet + expected - mandatory
  // 70k +30k +3m -1.88m = 1.22m
  assert.equal(monthly.forecastClosingBase, 1_220_000);
  assert.equal(monthly.deficitDays, 3); // 17,18,19 negative before 20th income
});

test("Term recurring expense: only remaining installments", () => {
  const today = "2026-08-15";
  const term = {
    id: 1,
    name: "Kredit 12 oy",
    amount: 1_880_000,
    minAmount: null,
    maxAmount: null,
    nextDueDate: "2026-08-17",
    frequency: "monthly",
    isMandatory: true,
    certainty: "exact",
    isActive: true,
    categoryId: null,
    planType: "term",
    installmentCount: 12,
    installmentsPaid: 10,
  };
  const f = buildForecast({
    currentBalance: 0,
    recurring: [term],
    incomes: [],
    minReserve: 0,
    estimatedConfidence: 50,
    today,
    horizonDays: 90,
  });
  // 2 remaining
  assert.equal(f.planned.length, 2);
  assert.equal(f.expense.base, 1_880_000 * 2);
});

test("Temporary recurring income: contract Sep-Dec", () => {
  const today = "2026-08-15";
  const contract = {
    id: 2,
    sourceName: "Kontrakt",
    amount: 5_000_000,
    minAmount: null,
    maxAmount: null,
    expectedDate: "2026-09-01",
    frequency: "monthly",
    certainty: "exact",
    isActive: true,
    linkedTransactionId: null,
    planType: "term",
    occurrenceCount: 4,
    occurrencesReceived: 0,
  };
  const f = buildForecast({
    currentBalance: 0,
    recurring: [],
    incomes: [contract],
    minReserve: 0,
    estimatedConfidence: 50,
    today,
    horizonDays: 150,
  });
  // Should project Sep, Oct, Nov, Dec = 4 occurrences
  assert.equal(f.planned.filter((p) => p.kind === "income").length, 4);
});

test("Safe-to-spend conservative: includes optional and weighted estimated", () => {
  const today = "2026-08-15";
  const f = buildForecast({
    currentBalance: 1_000_000,
    recurring: [
      {
        id: 1,
        name: "Majburiy",
        amount: 500_000,
        minAmount: null,
        maxAmount: null,
        nextDueDate: "2026-08-20",
        frequency: "once",
        isMandatory: true,
        certainty: "exact",
        isActive: true,
        categoryId: null,
      },
      {
        id: 2,
        name: "Ixtiyoriy",
        amount: 200_000,
        minAmount: null,
        maxAmount: null,
        nextDueDate: "2026-08-22",
        frequency: "once",
        isMandatory: false,
        certainty: "exact",
        isActive: true,
        categoryId: null,
      },
    ],
    incomes: [
      {
        id: 1,
        sourceName: "Taxminiy",
        amount: null,
        minAmount: 400_000,
        maxAmount: 800_000,
        expectedDate: "2026-08-18",
        frequency: "once",
        certainty: "estimated",
        isActive: true,
        linkedTransactionId: null,
      },
    ],
    minReserve: 100_000,
    estimatedConfidence: 50,
    today,
    horizonDays: 30,
  });
  // Balance 1m + weighted estimated 600k*0.5=300k - mandatory 500k - optional 200k - reserve 100k = 500k
  // 1_000_000 + 300_000 - 500_000 -200_000 -100_000 = 500_000
  assert.equal(f.safeToSpend, 500_000);
});

test("Monthly series builds 6 months", () => {
  const today = "2026-08-15";
  const analytics = buildAnalytics({
    transactions: [],
    categories: [],
    recurringBase: 0,
    currentBalance: 0,
    today,
  });
  const forecast = buildForecast({
    currentBalance: 0,
    recurring: [],
    incomes: [],
    minReserve: 0,
    estimatedConfidence: 50,
    today,
    horizonDays: 120,
  });
  const series = buildMonthlySeries({
    today,
    currentBalance: 0,
    transactions: [],
    planned: forecast.planned,
    cashflow: forecast.cashflow,
    analytics,
    forecast,
    monthsBefore: 1,
    monthsAfter: 4,
  });
  assert.equal(series.length, 6);
  assert.ok(series.some((m) => m.isCurrent));
  assert.ok(series.some((m) => m.isFuture));
});
