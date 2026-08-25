import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  budgets,
  categories,
  debtPayments,
  debts,
  expectedIncomes,
  financialSnapshots,
  goalContributions,
  goals,
  notifications,
  recurringExpenses,
  transactions,
  users,
} from "@/db/schema";
import { addDays, addMonths, monthStart, todayISO } from "./money";

let seeding: Promise<void> | null = null;

export const EXPENSE_TREE: Array<{
  name: string;
  icon: string;
  essential: boolean;
  children?: Array<{ name: string; icon: string; essential: boolean }>;
}> = [
  {
    name: "Uy",
    icon: "🏠",
    essential: true,
    children: [
      { name: "Ijara", icon: "🔑", essential: true },
      { name: "Kommunal", icon: "💡", essential: true },
      { name: "Ta'mirlash", icon: "🛠", essential: false },
    ],
  },
  { name: "Oziq-ovqat", icon: "🥗", essential: true },
  { name: "Transport", icon: "🚕", essential: true },
  { name: "Kredit", icon: "🏦", essential: true },
  { name: "Telefon / Internet", icon: "📱", essential: true },
  { name: "Oila", icon: "👨‍👩‍👧", essential: true },
  { name: "Sog'liq", icon: "💊", essential: true },
  { name: "Ta'lim", icon: "📚", essential: false },
  { name: "Kiyim", icon: "👕", essential: false },
  { name: "Ko'ngilochar", icon: "🎬", essential: false },
  { name: "Boshqa", icon: "•", essential: false },
];

export const INCOME_TREE: Array<{ name: string; icon: string }> = [
  { name: "Ish haqi", icon: "💼" },
  { name: "Biznes daromadi", icon: "🏪" },
  { name: "Bonus", icon: "🎁" },
  { name: "Qo'shimcha daromad", icon: "✨" },
  { name: "Qarz qaytishi", icon: "🤝" },
  { name: "Boshqa daromad", icon: "•" },
];

export const ACCOUNT_PRESETS = [
  { name: "Naqd pul", type: "cash", initialBalance: 900_000, sortOrder: 1 },
  { name: "Uzcard", type: "uzcard", initialBalance: 2_400_000, sortOrder: 2 },
  { name: "Humo", type: "humo", initialBalance: 1_800_000, sortOrder: 3 },
  { name: "Bank jamg'arma", type: "bank", initialBalance: 4_500_000, sortOrder: 4 },
  { name: "Payme", type: "ewallet", initialBalance: 250_000, sortOrder: 5 },
];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function ensureSeed(): Promise<void> {
  if (seeding) return seeding;
  seeding = (async () => {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) return;
    await seedDemoWorld();
  })();
  try {
    await seeding;
  } finally {
    seeding = null;
  }
}

export async function seedDemoWorld(): Promise<void> {
  const today = todayISO();
  const rnd = mulberry32(20260818);

  const [user] = await db
    .insert(users)
    .values({
      firstName: "Sardor",
      lastName: "Karimov",
      username: "sardor_fin",
      isDemo: true,
      minReserve: 1_500_000,
      estimatedIncomeConfidence: 50,
      currency: "UZS",
    })
    .returning();
  const userId = user.id;

  const accountRows = await db
    .insert(accounts)
    .values(ACCOUNT_PRESETS.map((a) => ({ ...a, userId, currency: "UZS" })))
    .returning();
  const acc = (name: string) => accountRows.find((a) => a.name === name)!.id;

  const expenseCats: Array<{ id: number; name: string; essential: boolean }> = [];
  for (const [index, node] of EXPENSE_TREE.entries()) {
    const [parent] = await db
      .insert(categories)
      .values({
        userId,
        name: node.name,
        type: "expense",
        icon: node.icon,
        isEssential: node.essential,
        isSystem: true,
        sortOrder: index,
      })
      .returning();
    if (node.name === "Uy") expenseCats.push({ id: parent.id, name: parent.name, essential: true });
    for (const [ci, child] of (node.children ?? []).entries()) {
      const [c] = await db
        .insert(categories)
        .values({
          userId,
          parentId: parent.id,
          name: child.name,
          type: "expense",
          icon: child.icon,
          isEssential: child.essential,
          isSystem: true,
          sortOrder: index * 10 + ci,
        })
        .returning();
      expenseCats.push({ id: c.id, name: c.name, essential: child.essential });
    }
    if (!node.children) expenseCats.push({ id: parent.id, name: parent.name, essential: node.essential });
  }

  const incomeCats: Array<{ id: number; name: string }> = [];
  for (const [index, node] of INCOME_TREE.entries()) {
    const [c] = await db
      .insert(categories)
      .values({
        userId,
        name: node.name,
        type: "income",
        icon: node.icon,
        isSystem: true,
        sortOrder: index,
      })
      .returning();
    incomeCats.push({ id: c.id, name: c.name });
  }

  const cat = (name: string) => expenseCats.find((c) => c.name === name)?.id ?? null;
  const inc = (name: string) => incomeCats.find((c) => c.name === name)?.id ?? null;

  /* ---------------- recurring expenses (planned money) ---------------- */
  await db.insert(recurringExpenses).values([
    { userId, categoryId: cat("Ijara"), accountId: acc("Uzcard"), name: "Ijara", amount: 2_500_000, dueDay: 1, certainty: "exact", isMandatory: true, nextDueDate: nextDue(1, today), reminderDaysBefore: 2 },
    { userId, categoryId: cat("Kommunal"), accountId: acc("Uzcard"), name: "Elektr to'lovi", minAmount: 300_000, maxAmount: 500_000, dueDay: 20, certainty: "estimated", isMandatory: true, nextDueDate: nextDue(20, today), reminderDaysBefore: 2 },
    { userId, categoryId: cat("Kommunal"), accountId: acc("Uzcard"), name: "Suv va gaz", amount: 180_000, dueDay: 22, certainty: "exact", isMandatory: true, nextDueDate: nextDue(22, today) },
    { userId, categoryId: cat("Telefon / Internet"), accountId: acc("Payme"), name: "Internet (uzonline)", amount: 120_000, dueDay: 5, certainty: "exact", isMandatory: true, nextDueDate: nextDue(5, today) },
    { userId, categoryId: cat("Telefon / Internet"), accountId: acc("Payme"), name: "Mobil aloqa", amount: 60_000, dueDay: 15, certainty: "exact", isMandatory: false, nextDueDate: nextDue(15, today) },
    { userId, categoryId: cat("Kredit"), accountId: acc("Humo"), name: "Avtokredit", amount: 1_500_000, dueDay: 10, certainty: "exact", isMandatory: true, nextDueDate: nextDue(10, today), reminderDaysBefore: 3 },
    { userId, categoryId: cat("Oila"), accountId: acc("Naqd pul"), name: "Bolalar bog'chasi", amount: 800_000, dueDay: 3, certainty: "exact", isMandatory: true, nextDueDate: nextDue(3, today) },
    { userId, categoryId: cat("Ta'lim"), accountId: acc("Uzcard"), name: "Ingliz tili kursi", amount: 450_000, dueDay: 8, certainty: "exact", isMandatory: false, nextDueDate: nextDue(8, today) },
  ]);

  /* ---------------- expected income (planned money) ---------------- */
  await db.insert(expectedIncomes).values([
    { userId, sourceName: "Ish haqi (ASAKA)", amount: 8_000_000, expectedDate: nextDue(5, today), frequency: "monthly", certainty: "exact", accountId: acc("Uzcard"), categoryId: inc("Ish haqi") },
    { userId, sourceName: "Biznes daromadi", minAmount: 3_000_000, maxAmount: 5_000_000, expectedDate: nextDue(28, today), frequency: "monthly", certainty: "estimated", accountId: acc("Humo"), categoryId: inc("Biznes daromadi") },
    { userId, sourceName: "Rent (do'kon)", amount: 1_200_000, expectedDate: nextDue(12, today), frequency: "monthly", certainty: "exact", accountId: acc("Naqd pul"), categoryId: inc("Qo'shimcha daromad") },
  ]);

  /* ---------------- transactions (real money, 6 months) ---------------- */
  type NewTx = typeof transactions.$inferInsert;
  const txs: NewTx[] = [];
  const pick = (min: number, max: number) => min + rnd() * (max - min);
  const money = (n: number) => Math.round(n / 1000) * 1000;

  for (let back = 5; back >= 0; back--) {
    const mStart = monthStart(addMonths(monthStart(today), -back));
    const isCurrent = back === 0;
    const daysInMonth = new Date(
      Number(mStart.slice(0, 4)),
      Number(mStart.slice(5, 7)),
      0,
    ).getDate();
    const limit = isCurrent ? Number(today.slice(8, 10)) : daysInMonth;
    const monthEndIso = addDays(mStart, limit - 1);

    const push = (
      day: number,
      type: "income" | "expense" | "transfer",
      amount: number,
      categoryId: number | null,
      accountId: number,
      note: string | null,
    ) => {
      const d = Math.min(Math.max(1, day), limit);
      if (isCurrent && d > limit) return;
      txs.push({
        userId,
        accountId,
        categoryId,
        type,
        amount,
        date: addDays(mStart, d - 1),
        note,
        source: rnd() > 0.55 ? "bot" : "miniapp",
        currency: "UZS",
      });
    };

    // income
    push(5, "income", 8_000_000, inc("Ish haqi"), acc("Uzcard"), "Oylik maosh");
    push(Math.min(limit, daysInMonth - 2), "income", money(pick(3_000_000, 5_000_000)), inc("Biznes daromadi"), acc("Humo"), "Do'kon kassasi");
    push(12, "income", 1_200_000, inc("Qo'shimcha daromad"), acc("Naqd pul"), "Do'kon ijarasi");
    if (rnd() > 0.5) push(Math.floor(pick(14, 24)), "income", money(pick(500_000, 1_200_000)), inc("Bonus"), acc("Uzcard"), "Bonus");
    if (back === 2) push(18, "income", 2_000_000, inc("Qarz qaytishi"), acc("Naqd pul"), "Alisher qarzini qaytardi");

    // fixed expenses
    push(1, "expense", 2_500_000, cat("Ijara"), acc("Uzcard"), "Ijara to'lovi");
    push(10, "expense", 1_500_000, cat("Kredit"), acc("Humo"), "Avtokredit");
    push(3, "expense", 800_000, cat("Oila"), acc("Naqd pul"), "Bog'cha to'lovi");
    push(20, "expense", money(pick(300_000, 500_000)), cat("Kommunal"), acc("Uzcard"), "Elektr");
    push(22, "expense", 180_000, cat("Kommunal"), acc("Uzcard"), "Suv va gaz");
    push(5, "expense", 120_000, cat("Telefon / Internet"), acc("Payme"), "Internet");
    push(15, "expense", 60_000, cat("Telefon / Internet"), acc("Payme"), "Mobil aloqa");
    push(8, "expense", 450_000, cat("Ta'lim"), acc("Uzcard"), "Ingliz tili kursi");

    // variable groceries
    const groceryRuns = 11 + Math.floor(rnd() * 4);
    for (let i = 0; i < groceryRuns; i++) {
      const day = Math.floor(pick(1, limit + 1));
      if (isCurrent && day > limit) continue;
      push(day, "expense", money(pick(70_000, 260_000)), cat("Oziq-ovqat"), rnd() > 0.4 ? acc("Uzcard") : acc("Naqd pul"), rnd() > 0.6 ? "Korzinka / bazarsavdo" : null);
    }
    // transport
    const rides = 12 + Math.floor(rnd() * 6);
    for (let i = 0; i < rides; i++) {
      const day = Math.floor(pick(1, limit + 1));
      if (isCurrent && day > limit) continue;
      push(day, "expense", money(pick(10_000, 55_000)), cat("Transport"), rnd() > 0.5 ? acc("Payme") : acc("Naqd pul"), rnd() > 0.7 ? "Yandex" : null);
    }
    // discretionary
    for (let i = 0; i < 4; i++) {
      const day = Math.floor(pick(2, limit + 1));
      if (isCurrent && day > limit) continue;
      push(day, "expense", money(pick(100_000, 300_000)), cat("Ko'ngilochar"), acc("Uzcard"), rnd() > 0.5 ? "Kafe / kino" : null);
    }
    for (let i = 0; i < 2; i++) {
      const day = Math.floor(pick(2, limit + 1));
      if (isCurrent && day > limit) continue;
      push(day, "expense", money(pick(180_000, 500_000)), cat("Kiyim"), acc("Uzcard"), null);
    }
    if (rnd() > 0.35) {
      const day = Math.floor(pick(4, limit));
      push(day, "expense", money(pick(120_000, 350_000)), cat("Sog'liq"), acc("Naqd pul"), "Dorixona");
    }
    if (rnd() > 0.5) {
      const day = Math.floor(pick(6, limit));
      push(day, "expense", money(pick(150_000, 450_000)), cat("Ta'mirlash"), acc("Uzcard"), "Uy uchun xarid");
    }
    // internal transfer between accounts
    if (limit > 25) push(25, "transfer", 1_000_000, null, acc("Uzcard"), "Humo ga o'tkazish");

    // a couple of live "today" entries in the current month
    if (isCurrent) {
      const todayDay = Number(today.slice(8, 10));
      if (todayDay >= 2) push(todayDay, "expense", money(pick(60_000, 150_000)), cat("Oziq-ovqat"), acc("Uzcard"), "Non va sabzavot");
      if (todayDay >= 2) push(todayDay, "expense", money(pick(15_000, 40_000)), cat("Transport"), acc("Payme"), "Yandex");
      if (todayDay >= 3) push(todayDay - 1, "expense", money(pick(80_000, 200_000)), cat("Oziq-ovqat"), acc("Naqd pul"), null);
      void monthEndIso;
    }
  }

  for (let i = 0; i < txs.length; i += 200) {
    await db.insert(transactions).values(txs.slice(i, i + 200));
  }

  /**
   * Back-solve opening balances so every account lands on a realistic
   * target current balance (total 12 480 000 UZS) after 6 months of history.
   */
  const TARGET_BALANCE: Record<string, number> = {
    "Naqd pul": 1_480_000,
    Uzcard: 3_200_000,
    Humo: 2_800_000,
    "Bank jamg'arma": 4_620_000,
    Payme: 380_000,
  };
  const movement = new Map<number, number>();
  for (const t of txs) {
    const delta = t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : -t.amount;
    movement.set(t.accountId, (movement.get(t.accountId) ?? 0) + delta);
    if (t.type === "transfer" && t.toAccountId) {
      movement.set(t.toAccountId, (movement.get(t.toAccountId) ?? 0) + t.amount);
    }
  }
  for (const a of accountRows) {
    const target = TARGET_BALANCE[a.name] ?? 1_000_000;
    const initial = target - (movement.get(a.id) ?? 0);
    await db
      .update(accounts)
      .set({ initialBalance: Math.round(initial) })
      .where(eq(accounts.id, a.id));
  }

  /* ---------------- budgets for current + previous month ---------------- */
  const thisMonth = today.slice(0, 7);
  const prevMonth = addMonths(monthStart(today), -1).slice(0, 7);
  const budgetRows: Array<typeof budgets.$inferInsert> = [];
  for (const m of [prevMonth, thisMonth]) {
    budgetRows.push(
      { userId, categoryId: cat("Oziq-ovqat"), month: m, amount: 2_400_000 },
      { userId, categoryId: cat("Transport"), month: m, amount: 1_200_000 },
      { userId, categoryId: cat("Ko'ngilochar"), month: m, amount: 600_000 },
      { userId, categoryId: cat("Kiyim"), month: m, amount: 900_000 },
      { userId, categoryId: null, month: m, amount: 11_500_000 },
    );
  }
  await db.insert(budgets).values(budgetRows);

  /* ---------------- debts ---------------- */
  const debtRows = await db
    .insert(debts)
    .values([
      { userId, direction: "i_owe", personName: "Avtokredit (NBU)", amount: 24_000_000, remainingAmount: 9_000_000, dueDate: addMonths(monthStart(today), 6), note: "Har oy 10-sanada 1.5 mln" },
      { userId, direction: "i_owe", personName: "Alisher (do'st)", amount: 2_500_000, remainingAmount: 1_000_000, dueDate: addDays(today, 20), note: "Qismiy qaytarish" },
      { userId, direction: "owed_to_me", personName: "Jasur (hamkor)", amount: 4_000_000, remainingAmount: 2_200_000, dueDate: addDays(today, 12), note: "Turar joy remonti" },
      { userId, direction: "owed_to_me", personName: "Kamola (kollega)", amount: 800_000, remainingAmount: 500_000, dueDate: addDays(today, 5) },
    ])
    .returning();
  const alisher = debtRows.find((d) => d.personName.startsWith("Alisher"))!;
  await db.insert(debtPayments).values([
    { userId, debtId: alisher.id, amount: 750_000, date: addMonths(monthStart(today), -1), note: "Birinchi qism" },
    { userId, debtId: alisher.id, amount: 750_000, date: monthStart(today), note: "Ikkinchi qism" },
  ]);

  /* ---------------- goals ---------------- */
  const goalRows = await db
    .insert(goals)
    .values([
      { userId, name: "Mashina", icon: "🚗", targetAmount: 100_000_000, savedAmount: 25_000_000, targetDate: addMonths(monthStart(today), 14), monthlyContribution: 3_000_000, accountId: acc("Bank jamg'arma") },
      { userId, name: "Zaxira jamg'arma", icon: "🛟", targetAmount: 18_000_000, savedAmount: 11_400_000, targetDate: addMonths(monthStart(today), 5), monthlyContribution: 1_200_000, accountId: acc("Bank jamg'arma") },
      { userId, name: "Turkey sayohat", icon: "✈️", targetAmount: 12_000_000, savedAmount: 1_800_000, targetDate: addMonths(monthStart(today), 9), monthlyContribution: 900_000 },
    ])
    .returning();
  await db.insert(goalContributions).values(
    goalRows.flatMap((g) => [
      { userId, goalId: g.id, amount: g.monthlyContribution, date: addMonths(monthStart(today), -1) },
      { userId, goalId: g.id, amount: g.monthlyContribution, date: monthStart(today) },
    ]),
  );

  /* ---------------- snapshots ---------------- */
  await db.insert(financialSnapshots).values(
    [5, 4, 3, 2, 1, 0].map((back) => ({
      userId,
      snapshotDate: monthStart(addMonths(monthStart(today), -back)),
      totalBalance: 0,
      income: 0,
      expense: 0,
      savingsRate: 0,
      healthScore: 0,
    })),
  );

  /* ---------------- starter notifications ---------------- */
  await db.insert(notifications).values([
    {
      userId,
      type: "payment",
      severity: "info",
      title: "Ertaga to'lov bor",
      body: "Avtokredit — 1 500 000 so'm, Humo hisobidan.",
      refDate: addDays(today, 1),
      amount: 1_500_000,
    },
    {
      userId,
      type: "budget",
      severity: "warning",
      title: "Budjet chegarasi yaqin",
      body: "Oziq-ovqat budjetining katta qismi ishlatildi.",
      refDate: today,
    },
  ]);
}

function nextDue(day: number, today: string): string {
  const base = monthStart(today);
  const candidate = addDays(base, day - 1);
  return candidate >= today ? candidate : addMonths(candidate, 1);
}
