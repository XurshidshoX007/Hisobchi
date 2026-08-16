import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  budgets,
  categories,
  debtPayments,
  debts,
  expectedIncomes,
  goalContributions,
  goals,
  notifications,
  recurringExpenses,
  transactions,
} from "@/db/schema";
import type { User } from "@/db/schema";
import { addMonths, monthKey, todayISO } from "./money";
import { parseDraft } from "./nlp";
import {
  advanceIncomeState,
  advanceRecurringState,
  canRestorePlan,
  occurrenceIdentity,
  resolveEditLifecycle,
  restoreIncomeState,
  restoreRecurringState,
  revertIncomeState,
  revertRecurringState,
  togglePlanError,
} from "./reconciliation";

export type MutateInput = {
  entity: string;
  action: string;
  data?: Record<string, unknown>;
};

const MAX_MONEY = 999_999_999_999_999;
const MAX_TEXT = 1_000;

/** Decimal-safe boundary normalization: finite, bounded, max 2 decimals. */
const num = (v: unknown, fallback: number | null = null): number | null => {
  if (v === null || v === undefined || v === "") return fallback;
  const raw = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > MAX_MONEY) return fallback;
  return Math.round(n * 100) / 100;
};
const str = (v: unknown, fallback: string | null = null): string | null => {
  if (v === null || v === undefined || v === "") return fallback;
  const value = String(v).trim();
  if (!value || value.length > MAX_TEXT || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) return fallback;
  return value;
};
const bool = (v: unknown, fallback = false): boolean => {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
};
const int = (v: unknown, fallback: number | null = null): number | null => {
  const n = num(v);
  if (n === null || !Number.isSafeInteger(n) || n <= 0) return fallback;
  return n;
};
const allowed = (value: string | null, values: readonly string[], fallback: string): string =>
  value && values.includes(value) ? value : fallback;
const isoDate = (value: unknown, fallback: string | null = null): string | null => {
  const parsed = str(value, fallback);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return fallback;
  const date = new Date(`${parsed}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== parsed ? fallback : parsed;
};

/** Shared plan-state helpers live in `reconciliation.ts`; see that module. */

export async function runMutation(user: User, input: MutateInput): Promise<{ ok: boolean; message: string; id?: number }> {
  const d = input.data ?? {};
  const userId = user.id;
  const today = todayISO();
  const contracts: Record<string, readonly string[]> = {
    transaction: ["create", "update", "delete"],
    account: ["create", "update"],
    category: ["create", "update"],
    recurring: ["create", "update", "pay", "toggle", "restore", "delete"],
    expectedIncome: ["create", "update", "receive", "toggle", "restore", "delete"],
    budget: ["upsert", "delete"],
    debt: ["create", "update", "pay", "delete"],
    goal: ["create", "contribute", "update", "delete"],
    notification: ["read", "readAll"],
  };
  if (!contracts[input.entity]?.includes(input.action)) {
    return { ok: false, message: "Noma'lum yoki ruxsat etilmagan amal" };
  }

  switch (input.entity) {
    /* ------------------------- transactions ------------------------- */
    case "transaction": {
      if (input.action === "create") {
        const type = allowed(str(d.type, "expense"), ["income", "expense", "transfer"], "expense") as
          | "income"
          | "expense"
          | "transfer";
        const amount = num(d.amount);
        if (!amount || amount <= 0) return { ok: false, message: "Summani kiriting" };
        const accountId = int(d.accountId) ?? (await defaultAccount(userId));
        if (!accountId) return { ok: false, message: "Hisob topilmadi" };

        // Ownership: the source account must belong to the current user.
        const ownsAccount = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
          .limit(1);
        if (!ownsAccount[0]) return { ok: false, message: "Hisob topilmadi" };

        if (type === "transfer") {
          const toId = int(d.toAccountId);
          if (!toId) return { ok: false, message: "Qaysi hisobga o'tkazish kerakligini tanlang" };
          if (toId === accountId) return { ok: false, message: "Bir xil hisobga transfer qilib bo'lmaydi" };
          const ownsTo = await db
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(eq(accounts.id, toId), eq(accounts.userId, userId)))
            .limit(1);
          if (!ownsTo[0]) return { ok: false, message: "Qabul qiluvchi hisob topilmadi" };
        }

        // Ownership: category (if any) must belong to the user.
        const catId =
          type === "transfer"
            ? null
            : int(d.categoryId) ?? (str(d.categoryName) ? await resolveCategoryId(userId, str(d.categoryName), type) : null);
        if (catId) {
          const ownsCat = await db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.id, catId), eq(categories.userId, userId)))
            .limit(1);
          if (!ownsCat[0]) return { ok: false, message: "Kategoriya topilmadi" };
        }
        const recurringId = int(d.recurringId);
        const expectedIncomeId = int(d.expectedIncomeId);
        let recRow: typeof recurringExpenses.$inferSelect | null = null;
        let incRow: typeof expectedIncomes.$inferSelect | null = null;
        if (recurringId) {
          const ownedRecurring = await db
            .select()
            .from(recurringExpenses)
            .where(and(eq(recurringExpenses.id, recurringId), eq(recurringExpenses.userId, userId)))
            .limit(1);
          if (!ownedRecurring[0] || type !== "expense") return { ok: false, message: "Doimiy to'lov topilmadi" };
          recRow = ownedRecurring[0];
        }
        if (expectedIncomeId) {
          const ownedIncome = await db
            .select()
            .from(expectedIncomes)
            .where(and(eq(expectedIncomes.id, expectedIncomeId), eq(expectedIncomes.userId, userId)))
            .limit(1);
          if (!ownedIncome[0] || type !== "income") return { ok: false, message: "Kutilayotgan daromad topilmadi" };
          incRow = ownedIncome[0];
        }

        // Occurrence identity: the *scheduled* date being fulfilled (not the
        // actual transaction date, which may be an early payment).
        const plannedDate = recRow ? recRow.nextDueDate : incRow ? incRow.expectedDate : null;
        const identity = plannedDate
          ? occurrenceIdentity(
              { startDate: recRow?.startDate ?? incRow?.startDate, nextDueDate: recRow ? recRow.nextDueDate : incRow!.expectedDate, frequency: recRow ? recRow.frequency : incRow!.frequency },
              plannedDate,
            )
          : null;

        const row = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(transactions)
            .values({
              userId,
              accountId,
              toAccountId: type === "transfer" ? int(d.toAccountId) : null,
              categoryId: catId,
              type,
              amount,
              date: isoDate(d.date, today) ?? today,
              note: str(d.note),
              source: allowed(str(d.source, "miniapp"), ["bot", "miniapp", "api", "auto"], "miniapp"),
              currency: user.currency,
              recurringId,
              expectedIncomeId,
              plannedDate: identity?.plannedDate ?? null,
              occurrenceNumber: identity?.occurrenceNumber ?? null,
            })
            .returning();
          // Symmetric advance of the parent plan, in the same transaction as
          // the money movement so a failure cannot leave a half-advanced plan.
          if (recRow && plannedDate) {
            await tx
              .update(recurringExpenses)
              .set(advanceRecurringState(recRow, plannedDate))
              .where(and(eq(recurringExpenses.id, recurringId!), eq(recurringExpenses.userId, userId)));
          }
          if (incRow && plannedDate) {
            await tx
              .update(expectedIncomes)
              .set(advanceIncomeState(incRow, plannedDate))
              .where(and(eq(expectedIncomes.id, expectedIncomeId!), eq(expectedIncomes.userId, userId)));
          }
          return created;
        });
        return {
          ok: true,
          id: row.id,
          message: `${type === "income" ? "Kirim" : type === "expense" ? "Chiqim" : "Transfer"} qo'shildi`,
        };
      }
      if (input.action === "update") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const existing = await db
          .select()
          .from(transactions)
          .where(and(eq(transactions.id, id), eq(transactions.userId, userId), eq(transactions.isDeleted, false)))
          .limit(1);
        if (!existing[0]) return { ok: false, message: "Operatsiya topilmadi yoki ruxsat yo'q" };

        const type = allowed(str(d.type, existing[0].type), ["income", "expense", "transfer"], existing[0].type) as
          | "income"
          | "expense"
          | "transfer";
        if (existing[0].recurringId && type !== "expense") return { ok: false, message: "Reja to'lovi chiqim bo'lib qolishi kerak" };
        if (existing[0].expectedIncomeId && type !== "income") return { ok: false, message: "Qabul qilingan daromad kirim bo'lib qolishi kerak" };
        const amount = d.amount !== undefined ? num(d.amount) : existing[0].amount;
        if (!amount || amount <= 0) return { ok: false, message: "Summani kiriting" };
        const accountId = d.accountId !== undefined ? int(d.accountId) : existing[0].accountId;
        if (!accountId || !(await ownsAccount(userId, accountId))) return { ok: false, message: "Hisob topilmadi" };

        const toAccountId = type === "transfer" ? (d.toAccountId !== undefined ? int(d.toAccountId) : existing[0].toAccountId) : null;
        if (type === "transfer") {
          if (!toAccountId || !(await ownsAccount(userId, toAccountId))) return { ok: false, message: "Qabul qiluvchi hisob topilmadi" };
          if (toAccountId === accountId) return { ok: false, message: "Bir xil hisobga transfer qilib bo'lmaydi" };
        }

        const categoryId = type === "transfer" ? null : d.categoryId !== undefined ? int(d.categoryId) : existing[0].categoryId;
        if (categoryId && !(await ownsCategory(userId, categoryId))) return { ok: false, message: "Kategoriya topilmadi" };
        const date = d.date !== undefined ? isoDate(d.date) : existing[0].date;
        if (!date) return { ok: false, message: "Sana noto'g'ri" };

        const updated = await db
          .update(transactions)
          .set({
            type,
            amount,
            accountId,
            toAccountId,
            categoryId,
            date,
            note: d.note !== undefined ? str(d.note) : existing[0].note,
            updatedAt: new Date(),
          })
          .where(and(eq(transactions.id, id), eq(transactions.userId, userId), eq(transactions.isDeleted, false)))
          .returning({ id: transactions.id });
        if (!updated[0]) return { ok: false, message: "Operatsiya topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: "Operatsiya yangilandi" };
      }
      if (input.action === "delete") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        // Business rule: soft delete / reversal instead of hard delete.
        // A plan-linked transaction (recurring payment or received expected
        // income) must also reconcile its parent plan: the fulfilled
        // occurrence is revoked, counters are decremented, the scheduled date
        // is restored and a completed plan is re-activated. This runs in a
        // single transaction so delete + revert are atomic.
        const existing = await db
          .select()
          .from(transactions)
          .where(and(eq(transactions.id, id), eq(transactions.userId, userId), eq(transactions.isDeleted, false)))
          .limit(1);
        if (!existing[0]) return { ok: false, message: "Operatsiya topilmadi yoki ruxsat yo'q" };

        const deleted = await db.transaction(async (tx) => {
          // Reconcile the parent plan BEFORE marking the transaction deleted so
          // a concurrent state read never observes a revoked occurrence without
          // its transaction (or vice-versa) mid-flight.
          if (existing[0].recurringId) {
            const rec = await tx
              .select()
              .from(recurringExpenses)
              .where(and(eq(recurringExpenses.id, existing[0].recurringId), eq(recurringExpenses.userId, userId)))
              .limit(1);
            if (rec[0]) {
              const plannedDate = existing[0].plannedDate ?? existing[0].date;
              await tx
                .update(recurringExpenses)
                .set(revertRecurringState(rec[0], plannedDate))
                .where(and(eq(recurringExpenses.id, rec[0].id), eq(recurringExpenses.userId, userId)));
            }
          }
          if (existing[0].expectedIncomeId) {
            const inc = await tx
              .select()
              .from(expectedIncomes)
              .where(and(eq(expectedIncomes.id, existing[0].expectedIncomeId), eq(expectedIncomes.userId, userId)))
              .limit(1);
            if (inc[0]) {
              const plannedDate = existing[0].plannedDate ?? existing[0].date;
              await tx
                .update(expectedIncomes)
                .set(revertIncomeState(inc[0], plannedDate))
                .where(and(eq(expectedIncomes.id, inc[0].id), eq(expectedIncomes.userId, userId)));
            }
          }
          const [row] = await tx
            .update(transactions)
            .set({ isDeleted: true, deletedAt: new Date() })
            .where(and(eq(transactions.id, id), eq(transactions.userId, userId), eq(transactions.isDeleted, false)))
            .returning({ id: transactions.id });
          return row;
        });
        if (!deleted) return { ok: false, message: "Operatsiya topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: deleted.id, message: "Operatsiya bekor qilindi" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    /* ------------------------- accounts ------------------------- */
    case "account": {
      if (input.action === "create") {
        const name = str(d.name);
        if (!name) return { ok: false, message: "Hisob nomi kerak" };
        const [row] = await db
          .insert(accounts)
          .values({
            userId,
            name,
            type: allowed(str(d.type, "cash"), ["cash", "uzcard", "humo", "bank", "ewallet", "other"], "cash"),
            currency: allowed(str(d.currency, user.currency), ["UZS", "USD", "EUR"], user.currency),
            initialBalance: num(d.initialBalance, 0) ?? 0,
            sortOrder: int(d.sortOrder, 99) ?? 99,
          })
          .returning();
        return { ok: true, id: row.id, message: `${name} hisobi qo'shildi` };
      }
      if (input.action === "update") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const existing = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).limit(1);
        if (!existing[0]) return { ok: false, message: "Hisob topilmadi yoki ruxsat yo'q" };
        const name = d.name !== undefined ? str(d.name) : existing[0].name;
        if (!name) return { ok: false, message: "Hisob nomi kerak" };
        const initialBalance = d.initialBalance !== undefined ? num(d.initialBalance) : existing[0].initialBalance;
        if (initialBalance === null) return { ok: false, message: "Boshlang'ich balans noto'g'ri" };
        const updated = await db
          .update(accounts)
          .set({
            name,
            type: allowed(str(d.type, existing[0].type), ["cash", "uzcard", "humo", "bank", "ewallet", "other"], existing[0].type),
            initialBalance,
            isActive: d.isActive !== undefined ? bool(d.isActive, existing[0].isActive) : existing[0].isActive,
          })
          .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
          .returning({ id: accounts.id });
        if (!updated[0]) return { ok: false, message: "Hisob topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: "Hisob yangilandi" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    /* ------------------------- categories ------------------------- */
    case "category": {
      if (input.action === "create") {
        const name = str(d.name);
        if (!name) return { ok: false, message: "Kategoriya nomi kerak" };
        const parentId = int(d.parentId);
        if (parentId && !(await ownsCategory(userId, parentId))) {
          return { ok: false, message: "Ota kategoriya topilmadi" };
        }
        const [row] = await db
          .insert(categories)
          .values({
            userId,
            parentId,
            name,
            type: allowed(str(d.type, "expense"), ["income", "expense"], "expense"),
            icon: str(d.icon, "•") ?? "•",
            isEssential: bool(d.isEssential, false),
            sortOrder: int(d.sortOrder, 50) ?? 50,
          })
          .returning();
        return { ok: true, id: row.id, message: `${name} yaratildi` };
      }
      if (input.action === "update") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const existing = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId))).limit(1);
        if (!existing[0]) return { ok: false, message: "Kategoriya topilmadi yoki ruxsat yo'q" };
        const name = d.name !== undefined ? str(d.name) : existing[0].name;
        if (!name) return { ok: false, message: "Kategoriya nomi kerak" };
        const type = allowed(str(d.type, existing[0].type), ["income", "expense"], existing[0].type);
        const parentId = d.parentId !== undefined ? int(d.parentId) : existing[0].parentId;
        if (parentId === id) return { ok: false, message: "Kategoriya o'ziga ota bo'la olmaydi" };
        if (parentId) {
          const parent = await db
            .select()
            .from(categories)
            .where(and(eq(categories.id, parentId), eq(categories.userId, userId), eq(categories.isActive, true)))
            .limit(1);
          if (!parent[0] || parent[0].type !== type || parent[0].parentId) return { ok: false, message: "Ota kategoriya topilmadi" };
        }
        const updated = await db
          .update(categories)
          .set({
            name,
            type,
            parentId,
            icon: d.icon !== undefined ? str(d.icon, "•") ?? "•" : existing[0].icon,
            isEssential: d.isEssential !== undefined ? bool(d.isEssential, existing[0].isEssential) : existing[0].isEssential,
            isActive: d.isActive !== undefined ? bool(d.isActive, existing[0].isActive) : existing[0].isActive,
          })
          .where(and(eq(categories.id, id), eq(categories.userId, userId)))
          .returning({ id: categories.id });
        if (!updated[0]) return { ok: false, message: "Kategoriya topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: "Kategoriya yangilandi" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    /* ------------------------- recurring expenses ------------------------- */
    case "recurring": {
      if (input.action === "create" || input.action === "update") {
        const name = str(d.name);
        if (!name) return { ok: false, message: "Nom kerak" };
        const certainty = allowed(str(d.certainty, "exact"), ["exact", "estimated"], "exact");
        const categoryId = int(d.categoryId);
        const accountId = int(d.accountId);
        if (categoryId && !(await ownsCategory(userId, categoryId))) return { ok: false, message: "Kategoriya topilmadi" };
        if (accountId && !(await ownsAccount(userId, accountId))) return { ok: false, message: "Hisob topilmadi" };
        const exactAmount = num(d.amount);
        const minAmount = num(d.minAmount);
        const maxAmount = num(d.maxAmount);
        if (certainty === "exact" && (!exactAmount || exactAmount <= 0)) {
          return { ok: false, message: "To'lov summasini kiriting (0 dan katta)" };
        }
        if (certainty === "estimated" && (!minAmount || minAmount <= 0)) {
          return { ok: false, message: "Minimal summani kiriting" };
        }
        if (certainty === "estimated" && (!maxAmount || maxAmount <= 0)) {
          return { ok: false, message: "Maksimal summani kiriting" };
        }
        if (certainty === "estimated" && minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
          return { ok: false, message: "Minimal summa maksimaldan katta bo'lmasligi kerak" };
        }
        const dueDay = Math.min(28, Math.max(1, int(d.dueDay, 1) ?? 1));
        const submittedDate = d.nextDueDate ?? d.dueDate;
        const nextDueDate =
          submittedDate !== undefined
            ? isoDate(submittedDate)
            : dueDay >= Number(today.slice(8, 10))
              ? thisMonthDate(dueDay)
              : addMonths(thisMonthDate(dueDay), 1);
        if (!nextDueDate) return { ok: false, message: "Keyingi to'lov sanasi noto'g'ri" };
        const frequency = allowed(str(d.frequency, "monthly"), ["once", "weekly", "monthly", "yearly"], "monthly");
        // Payment plan model: one_time | recurring | term.
        const planType = allowed(
          str(d.planType, frequency === "once" ? "one_time" : "recurring"),
          ["one_time", "recurring", "term"],
          frequency === "once" ? "one_time" : "recurring",
        );
        const installmentCount = planType === "term" ? int(d.installmentCount) : null;
        if (planType === "term" && !installmentCount) {
          return { ok: false, message: "Bo'lib to'lashlar sonini kiriting." };
        }
        if (planType === "term" && installmentCount !== null && (installmentCount < 1 || installmentCount > 600)) {
          return { ok: false, message: "Bo'lib to'lashlar soni 1 dan 600 gacha bo'lishi kerak." };
        }
        const values = {
          userId,
          categoryId,
          accountId,
          name,
          amount: certainty === "exact" ? exactAmount : null,
          minAmount: certainty === "estimated" ? minAmount : null,
          maxAmount: certainty === "estimated" ? maxAmount : null,
          dueDay,
          frequency: planType === "one_time" ? "once" : frequency === "once" ? "monthly" : frequency,
          isMandatory: bool(d.isMandatory, true),
          certainty,
          nextDueDate,
          reminderDaysBefore: int(d.reminderDaysBefore, 1) ?? 1,
          isActive: bool(d.isActive, true),
          planType,
          startDate: isoDate(d.startDate, nextDueDate),
          installmentCount,
          // New plans start active (or paused if explicitly created paused).
          status: bool(d.isActive, true) ? "active" : "paused",
        };
        if (input.action === "create") {
          const [row] = await db.insert(recurringExpenses).values({ ...values, installmentsPaid: 0 }).returning();
          return { ok: true, id: row.id, message: `${name} to'lov rejasiga qo'shildi` };
        }
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const existingRec = await db
          .select()
          .from(recurringExpenses)
          .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
          .limit(1);
        if (!existingRec[0]) return { ok: false, message: "To'lov topilmadi yoki ruxsat yo'q" };
        // §24: an edit must never corrupt already fulfilled occurrences —
        // 5/12 can become 5/24, never 5/4.
        if (planType === "term" && installmentCount !== null && installmentCount < existingRec[0].installmentsPaid) {
          return {
            ok: false,
            message: `Bo'lib to'lashlar soni to'langanidan kam bo'lmasligi kerak (allaqachon ${existingRec[0].installmentsPaid} ta to'langan).`,
          };
        }
        // Lifecycle-safe edit (§11): a cancelled plan is NEVER resurrected by
        // an ordinary Edit → Save (only the explicit `restore` action is);
        // a fully-paid term/one_time stays completed; otherwise the active/
        // paused intent from the form is honoured.
        const nextIsActive = bool(d.isActive, existingRec[0].isActive);
        const lifecycle = resolveEditLifecycle({
          previousStatus: existingRec[0].status,
          planType,
          frequency: values.frequency,
          total: installmentCount,
          done: existingRec[0].installmentsPaid,
          nextIsActive,
        });
        const updated = await db
          .update(recurringExpenses)
          .set({ ...values, isActive: lifecycle.isActive, status: lifecycle.status })
          .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
          .returning({ id: recurringExpenses.id });
        if (!updated[0]) return { ok: false, message: "To'lov topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: `${name} yangilandi` };
      }
      if (input.action === "pay") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const rec = await db
          .select()
          .from(recurringExpenses)
          .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
          .limit(1);
        if (!rec[0]) return { ok: false, message: "To'lov topilmadi" };
        // Pay is only valid for an ACTIVE plan with an open occurrence (§12):
        // paused / cancelled / completed plans can never be paid into.
        if (!rec[0].isActive || rec[0].status === "cancelled" || rec[0].status === "paused" || rec[0].status === "completed") {
          return { ok: false, message: "Bu to'lov rejasi faol emas" };
        }
        if (rec[0].planType === "term" && rec[0].installmentCount !== null && rec[0].installmentsPaid >= rec[0].installmentCount) {
          return { ok: false, message: "Bu to'lov muddati allaqachon tugagan" };
        }
        const amount = num(d.amount) ?? rec[0].amount ?? rec[0].maxAmount ?? 0;
        if (!amount || amount <= 0) return { ok: false, message: "Summa noto'g'ri" };
        const paymentAccountId = int(d.accountId) ?? rec[0].accountId ?? (await defaultAccount(userId));
        if (!paymentAccountId || !(await ownsAccount(userId, paymentAccountId))) return { ok: false, message: "Hisob topilmadi" };
        // The occurrence being paid is the plan's current scheduled date. The
        // actual transaction date may be earlier (early payment); the planned
        // date is stored separately so deletion can restore the exact schedule.
        const plannedDate = rec[0].nextDueDate;
        const identity = occurrenceIdentity(
          { startDate: rec[0].startDate, nextDueDate: rec[0].nextDueDate, frequency: rec[0].frequency },
          plannedDate,
        );
        const paid = await db.transaction(async (tx) => {
          // Claim this due date first: concurrent "pay" clicks compare the old
          // nextDueDate/installmentsPaid, so only one writes a transaction.
          const claimed = await tx
            .update(recurringExpenses)
            .set(advanceRecurringState(rec[0], plannedDate))
            .where(
              and(
                eq(recurringExpenses.id, id),
                eq(recurringExpenses.userId, userId),
                eq(recurringExpenses.isActive, true),
                eq(recurringExpenses.nextDueDate, rec[0].nextDueDate),
                eq(recurringExpenses.installmentsPaid, rec[0].installmentsPaid),
              ),
            )
            .returning({ id: recurringExpenses.id });
          if (!claimed[0]) return false;
          await tx.insert(transactions).values({
            userId,
            accountId: paymentAccountId,
            categoryId: rec[0].categoryId,
            type: "expense",
            amount,
            date: isoDate(d.date, today) ?? today,
            note: `${rec[0].name} (reja bajarildi)`,
            source: "auto",
            recurringId: rec[0].id,
            plannedDate: identity.plannedDate,
            occurrenceNumber: identity.occurrenceNumber,
            currency: user.currency,
          });
          return true;
        });
        if (!paid) return { ok: false, message: "Bu to'lov allaqachon qayd etilgan" };
        if (rec[0].planType === "term" && rec[0].installmentCount !== null) {
          const done = rec[0].installmentsPaid + 1;
          return {
            ok: true,
            message:
              done >= rec[0].installmentCount
                ? `${rec[0].name} yakunlandi 🎉 (${done}/${rec[0].installmentCount})`
                : `${rec[0].name} to'landi (${done}/${rec[0].installmentCount})`,
          };
        }
        return { ok: true, message: `${rec[0].name} to'landi` };
      }
      if (input.action === "toggle" || input.action === "restore" || input.action === "delete") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        // Semantics:
        //   toggle  → pause / resume (active ↔ paused). It must NEVER wake up
        //             a cancelled or completed plan (§13).
        //   restore → the ONLY way back from cancelled (§11). Atomic: the
        //             WHERE clause demands status='cancelled'.
        //   delete  → CANCEL the plan (future occurrences only). Historical
        //             transactions are deliberately untouched — financial
        //             history must never be destroyed by a plan cancellation.
        const current = await db
          .select({ status: recurringExpenses.status })
          .from(recurringExpenses)
          .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
          .limit(1);
        if (!current[0]) return { ok: false, message: "To'lov topilmadi yoki ruxsat yo'q" };

        if (input.action === "toggle") {
          const blocked = togglePlanError(current[0].status);
          if (blocked) return { ok: false, message: blocked };
          const updated = await db
            .update(recurringExpenses)
            .set({
              // Flip the active flag and keep the status in sync (active ↔ paused).
              isActive: sql<boolean>`not ${recurringExpenses.isActive}`,
              status: sql<string>`case when ${recurringExpenses.isActive} then 'paused' else 'active' end`,
            })
            .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
            .returning({ id: recurringExpenses.id });
          if (!updated[0]) return { ok: false, message: "To'lov topilmadi yoki ruxsat yo'q" };
          return { ok: true, id: updated[0].id, message: "Holati o'zgartirildi" };
        }

        if (input.action === "restore") {
          if (!canRestorePlan(current[0].status)) {
            return { ok: false, message: "Faqat bekor qilingan rejani qayta faollashtirish mumkin" };
          }
          const planRow = await db
            .select()
            .from(recurringExpenses)
            .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
            .limit(1);
          if (!planRow[0]) return { ok: false, message: "To'lov topilmadi yoki ruxsat yo'q" };
          // §26: reactivating must not silently revive a stale schedule. A plan
          // cancelled three months ago comes back on its NEXT real occurrence,
          // not on a due date that already passed while it was inactive.
          const schedule = restoreRecurringState(planRow[0], today);
          const restored = await db
            .update(recurringExpenses)
            .set(schedule)
            .where(
              and(
                eq(recurringExpenses.id, id),
                eq(recurringExpenses.userId, userId),
                eq(recurringExpenses.status, "cancelled"),
              ),
            )
            .returning({ id: recurringExpenses.id });
          if (!restored[0]) return { ok: false, message: "Reja allaqachon faollashtirilgan" };
          return {
            ok: true,
            id: restored[0].id,
            message: `Reja qayta faollashtirildi — keyingi to'lov ${schedule.nextDueDate}`,
          };
        }

        const updated = await db
          .update(recurringExpenses)
          .set({ isActive: false, status: "cancelled" })
          .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
          .returning({ id: recurringExpenses.id });
        if (!updated[0]) return { ok: false, message: "To'lov topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: "Reja bekor qilindi" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    /* ------------------------- expected income ------------------------- */
    case "expectedIncome": {
      if (input.action === "create" || input.action === "update") {
        const updateId = input.action === "update" ? int(d.id) : null;
        if (input.action === "update") {
          if (!updateId) return { ok: false, message: "ID kerak" };
          const owned = await db
            .select({ id: expectedIncomes.id })
            .from(expectedIncomes)
            .where(and(eq(expectedIncomes.id, updateId), eq(expectedIncomes.userId, userId)))
            .limit(1);
          if (!owned[0]) return { ok: false, message: "Daromad topilmadi yoki ruxsat yo'q" };
        }
        const sourceName = str(d.sourceName);
        if (!sourceName) return { ok: false, message: "Manba nomi kerak" };
        const certainty = allowed(str(d.certainty, "exact"), ["exact", "estimated"], "exact");
        const accountId = int(d.accountId);
        const categoryId = int(d.categoryId);
        if (accountId && !(await ownsAccount(userId, accountId))) return { ok: false, message: "Hisob topilmadi" };
        if (categoryId && !(await ownsCategory(userId, categoryId))) return { ok: false, message: "Kategoriya topilmadi" };
        const exactAmount = num(d.amount);
        const minAmount = num(d.minAmount);
        const maxAmount = num(d.maxAmount);
        if (certainty === "exact" && (!exactAmount || exactAmount <= 0)) {
          return { ok: false, message: "Daromad summasini kiriting (0 dan katta)" };
        }
        if (certainty === "estimated" && (!minAmount || minAmount <= 0)) {
          return { ok: false, message: "Minimal summani kiriting" };
        }
        if (certainty === "estimated" && (!maxAmount || maxAmount <= 0)) {
          return { ok: false, message: "Maksimal summani kiriting" };
        }
        if (certainty === "estimated" && minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
          return { ok: false, message: "Minimal summa maksimaldan katta bo'lmasligi kerak" };
        }
        const expectedDate = isoDate(d.expectedDate);
        if (!expectedDate) return { ok: false, message: "Kutilayotgan sana noto'g'ri" };
        const incomeFrequency = allowed(str(d.frequency, "monthly"), ["once", "weekly", "monthly", "yearly"], "monthly");
        const incomePlanType = allowed(
          str(d.planType, incomeFrequency === "once" ? "one_time" : "recurring"),
          ["one_time", "recurring", "term"],
          incomeFrequency === "once" ? "one_time" : "recurring",
        );
        const occurrenceCount = incomePlanType === "term" ? int(d.occurrenceCount) : null;
        if (incomePlanType === "term" && !occurrenceCount) {
          return { ok: false, message: "Takrorlanishlar sonini kiriting." };
        }
        if (incomePlanType === "term" && occurrenceCount !== null && (occurrenceCount < 1 || occurrenceCount > 600)) {
          return { ok: false, message: "Takrorlanishlar soni 1 dan 600 gacha bo'lishi kerak." };
        }
        const values = {
          userId,
          sourceName,
          amount: certainty === "exact" ? exactAmount : null,
          minAmount: certainty === "estimated" ? minAmount : null,
          maxAmount: certainty === "estimated" ? maxAmount : null,
          expectedDate,
          frequency: incomePlanType === "one_time" ? "once" : incomeFrequency === "once" ? "monthly" : incomeFrequency,
          certainty,
          accountId,
          categoryId,
          note: str(d.note),
          isActive: bool(d.isActive, true),
          planType: incomePlanType,
          occurrenceCount,
          startDate: isoDate(d.startDate, expectedDate),
          status: bool(d.isActive, true) ? "active" : "paused",
        };
        if (input.action === "create") {
          const [row] = await db.insert(expectedIncomes).values({ ...values, occurrencesReceived: 0 }).returning();
          return { ok: true, id: row.id, message: `${sourceName} kutilayotgan daromadga qo'shildi` };
        }
        const owned = await db
          .select({ isActive: expectedIncomes.isActive, status: expectedIncomes.status, occurrencesReceived: expectedIncomes.occurrencesReceived })
          .from(expectedIncomes)
          .where(and(eq(expectedIncomes.id, updateId!), eq(expectedIncomes.userId, userId)))
          .limit(1);
        // §24 (income parity): shrinking the schedule below what was already
        // received would corrupt fulfilled occurrences (3/5 → 3/2).
        if (incomePlanType === "term" && occurrenceCount !== null && occurrenceCount < (owned[0]?.occurrencesReceived ?? 0)) {
          return {
            ok: false,
            message: `Takrorlanishlar soni qabul qilinganidan kam bo'lmasligi kerak (allaqachon ${owned[0]?.occurrencesReceived ?? 0} ta qabul qilingan).`,
          };
        }
        // Lifecycle-safe edit (§11): a cancelled income plan is never
        // resurrected by Edit → Save; a fully-received term/one_time stays
        // completed; otherwise the form's active/paused intent is honoured.
        const lifecycle = resolveEditLifecycle({
          previousStatus: owned[0]?.status,
          planType: incomePlanType,
          frequency: values.frequency,
          total: occurrenceCount,
          done: owned[0]?.occurrencesReceived ?? 0,
          nextIsActive: bool(d.isActive, owned[0]?.isActive ?? true),
        });
        const updated = await db
          .update(expectedIncomes)
          .set({ ...values, isActive: lifecycle.isActive, status: lifecycle.status })
          .where(and(eq(expectedIncomes.id, updateId!), eq(expectedIncomes.userId, userId)))
          .returning({ id: expectedIncomes.id });
        if (!updated[0]) return { ok: false, message: "Daromad topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: `${sourceName} yangilandi` };
      }
      if (input.action === "receive") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const row = await db
          .select()
          .from(expectedIncomes)
          .where(and(eq(expectedIncomes.id, id), eq(expectedIncomes.userId, userId)))
          .limit(1);
        if (!row[0]) return { ok: false, message: "Daromad topilmadi" };
        const amount = num(d.amount) ?? row[0].amount ?? row[0].maxAmount ?? 0;
        if (!amount || amount <= 0) return { ok: false, message: "Summa noto'g'ri" };
        const incomeAccountId = int(d.accountId) ?? row[0].accountId ?? (await defaultAccount(userId));
        if (!incomeAccountId || !(await ownsAccount(userId, incomeAccountId))) return { ok: false, message: "Hisob topilmadi" };
        // Receive is only valid for an ACTIVE income plan (§12): paused /
        // cancelled / completed plans have no open occurrence to fulfil.
        if (!row[0].isActive || row[0].status === "cancelled" || row[0].status === "paused" || row[0].status === "completed") {
          return { ok: false, message: "Daromad faol emas" };
        }
        if (row[0].planType === "term" && row[0].occurrenceCount !== null && row[0].occurrencesReceived >= row[0].occurrenceCount) {
          return { ok: false, message: "Bu daromad rejasi allaqachon yakunlangan" };
        }
        // The occurrence being received is the plan's current scheduled date;
        // the actual transaction date may be earlier (early receive).
        const plannedDate = row[0].expectedDate;
        const identity = occurrenceIdentity(
          { startDate: row[0].startDate, nextDueDate: row[0].expectedDate, frequency: row[0].frequency },
          plannedDate,
        );
        const txRow = await db.transaction(async (tx) => {
          // Claim this exact occurrence before inserting money. Concurrent
          // clicks compare the old date/active state, so only one can win.
          const claimed = await tx
            .update(expectedIncomes)
            .set(advanceIncomeState(row[0], plannedDate))
            .where(
              and(
                eq(expectedIncomes.id, id),
                eq(expectedIncomes.userId, userId),
                eq(expectedIncomes.isActive, true),
                eq(expectedIncomes.expectedDate, row[0].expectedDate),
              ),
            )
            .returning({ id: expectedIncomes.id });
          if (!claimed[0]) return null;
          const [created] = await tx
            .insert(transactions)
            .values({
              userId,
              accountId: incomeAccountId,
              categoryId: row[0].categoryId,
              type: "income",
              amount,
              date: isoDate(d.date, today) ?? today,
              note: `${row[0].sourceName} (kutilgan daromad qabul qilindi)`,
              source: "api",
              expectedIncomeId: row[0].id,
              plannedDate: identity.plannedDate,
              occurrenceNumber: identity.occurrenceNumber,
              currency: user.currency,
            })
            .returning();
          return created;
        });
        if (!txRow) return { ok: false, message: "Bu daromad avval qabul qilingan" };
        return { ok: true, id: txRow.id, message: `${row[0].sourceName} kirim sifatida qayd etildi` };
      }
      if (input.action === "toggle" || input.action === "restore" || input.action === "delete") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        // Same lifecycle semantics as payment plans: toggle = pause/resume
        // (never wakes up cancelled/completed, §13); restore = the only way
        // back from cancelled (§11); delete = cancel future occurrences only
        // (historical received-income transactions are preserved).
        const current = await db
          .select({ status: expectedIncomes.status })
          .from(expectedIncomes)
          .where(and(eq(expectedIncomes.id, id), eq(expectedIncomes.userId, userId)))
          .limit(1);
        if (!current[0]) return { ok: false, message: "Daromad topilmadi yoki ruxsat yo'q" };

        if (input.action === "toggle") {
          const blocked = togglePlanError(current[0].status);
          if (blocked) return { ok: false, message: blocked };
          const updated = await db
            .update(expectedIncomes)
            .set({
              isActive: sql<boolean>`not ${expectedIncomes.isActive}`,
              status: sql<string>`case when ${expectedIncomes.isActive} then 'paused' else 'active' end`,
            })
            .where(and(eq(expectedIncomes.id, id), eq(expectedIncomes.userId, userId)))
            .returning({ id: expectedIncomes.id });
          if (!updated[0]) return { ok: false, message: "Daromad topilmadi yoki ruxsat yo'q" };
          return { ok: true, id: updated[0].id, message: "Holati o'zgartirildi" };
        }

        if (input.action === "restore") {
          if (!canRestorePlan(current[0].status)) {
            return { ok: false, message: "Faqat bekor qilingan rejani qayta faollashtirish mumkin" };
          }
          const incomeRow = await db
            .select()
            .from(expectedIncomes)
            .where(and(eq(expectedIncomes.id, id), eq(expectedIncomes.userId, userId)))
            .limit(1);
          if (!incomeRow[0]) return { ok: false, message: "Daromad topilmadi yoki ruxsat yo'q" };
          // §26: same rule as payments — restore re-anchors the schedule.
          const schedule = restoreIncomeState(incomeRow[0], today);
          const restored = await db
            .update(expectedIncomes)
            .set(schedule)
            .where(
              and(
                eq(expectedIncomes.id, id),
                eq(expectedIncomes.userId, userId),
                eq(expectedIncomes.status, "cancelled"),
              ),
            )
            .returning({ id: expectedIncomes.id });
          if (!restored[0]) return { ok: false, message: "Reja allaqachon faollashtirilgan" };
          return {
            ok: true,
            id: restored[0].id,
            message: `Daromad rejasi qayta faollashtirildi — keyingi qabul ${schedule.expectedDate}`,
          };
        }

        const updated = await db
          .update(expectedIncomes)
          .set({ isActive: false, status: "cancelled" })
          .where(and(eq(expectedIncomes.id, id), eq(expectedIncomes.userId, userId)))
          .returning({ id: expectedIncomes.id });
        if (!updated[0]) return { ok: false, message: "Daromad topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: "Daromad rejasi bekor qilindi" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    /* ------------------------- budgets ------------------------- */
    case "budget": {
      if (input.action === "upsert") {
        const month = str(d.month, monthKey(today)) ?? monthKey(today);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, message: "Oy formati noto'g'ri" };
        const categoryId = int(d.categoryId);
        if (categoryId && !(await ownsCategory(userId, categoryId))) return { ok: false, message: "Kategoriya topilmadi" };
        const amount = num(d.amount);
        if (amount === null || amount <= 0) return { ok: false, message: "Limit noto'g'ri" };
        const existing = await db
          .select()
          .from(budgets)
          .where(
            and(
              eq(budgets.userId, userId),
              eq(budgets.month, month),
              categoryId === null ? sql`${budgets.categoryId} is null` : eq(budgets.categoryId, categoryId),
            ),
          )
          .limit(1);
        if (existing[0]) {
          await db.update(budgets).set({ amount, isDeleted: false }).where(and(eq(budgets.id, existing[0].id), eq(budgets.userId, userId)));
          return { ok: true, message: "Budjet yangilandi" };
        }
        await db.insert(budgets).values({ userId, categoryId, month, amount });
        return { ok: true, message: "Budjet belgilandi" };
      }
      if (input.action === "delete") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const deleted = await db
          .update(budgets)
          .set({ isDeleted: true })
          .where(and(eq(budgets.id, id), eq(budgets.userId, userId), eq(budgets.isDeleted, false)))
          .returning({ id: budgets.id });
        if (!deleted[0]) return { ok: false, message: "Budjet topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: deleted[0].id, message: "Budjet o'chirildi" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    /* ------------------------- debts ------------------------- */
    case "debt": {
      if (input.action === "create") {
        const personName = str(d.personName);
        const amount = num(d.amount);
        if (!personName || !amount || amount <= 0) return { ok: false, message: "Ma'lumot to'liq emas" };
        const remainingAmount = num(d.remainingAmount, amount) ?? amount;
        if (remainingAmount < 0 || remainingAmount > amount) return { ok: false, message: "Qolgan qarz summasi noto'g'ri" };
        const direction = allowed(str(d.direction, "i_owe"), ["i_owe", "owed_to_me"], "i_owe");
        const accountId = int(d.accountId) ?? (await defaultAccount(userId));
        if (!accountId || !(await ownsAccount(userId, accountId))) return { ok: false, message: "Hisob topilmadi" };
        const [row] = await db.transaction(async (tx) => {
          const [created] = await tx.insert(debts).values({
            userId, direction, personName, amount, remainingAmount,
            dueDate: isoDate(d.dueDate), note: str(d.note),
          }).returning();
          // Creating a debt is itself a cash event: borrowed money arrives;
          // money lent out leaves the selected account.
          await tx.insert(transactions).values({
            userId, accountId, type: direction === "i_owe" ? "income" : "expense",
            amount, date: isoDate(d.date, today) ?? today,
            note: direction === "i_owe" ? `Qarz olindi: ${personName}` : `Qarz berildi: ${personName}`,
            source: "miniapp", currency: user.currency,
          });
          return [created];
        });
        return { ok: true, id: row.id, message: `${personName} qarzdorlikka qo'shildi` };
      }
      if (input.action === "update") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const existing = await db
          .select()
          .from(debts)
          .where(and(eq(debts.id, id), eq(debts.userId, userId), eq(debts.isDeleted, false)))
          .limit(1);
        if (!existing[0]) return { ok: false, message: "Qarz topilmadi yoki ruxsat yo'q" };
        const personName = str(d.personName);
        const amount = num(d.amount);
        if (!personName || !amount || amount <= 0) return { ok: false, message: "Ma'lumot to'liq emas" };
        const paidAmount = existing[0].amount - existing[0].remainingAmount;
        if (amount < paidAmount) return { ok: false, message: "Jami summa avval to'langan summadan kam bo'lmasligi kerak" };
        const direction = allowed(str(d.direction, existing[0].direction), ["i_owe", "owed_to_me"], existing[0].direction);
        if (direction !== existing[0].direction && paidAmount > 0) {
          return { ok: false, message: "To'lovli qarz yo'nalishini o'zgartirib bo'lmaydi" };
        }
        const dueDate = d.dueDate === null || d.dueDate === "" ? null : isoDate(d.dueDate);
        if (d.dueDate && !dueDate) return { ok: false, message: "Sana noto'g'ri" };
        const remainingAmount = amount - paidAmount;
        const updated = await db
          .update(debts)
          .set({
            direction,
            personName,
            amount,
            remainingAmount,
            dueDate,
            note: str(d.note),
            status: remainingAmount === 0 ? "settled" : "active",
          })
          .where(and(eq(debts.id, id), eq(debts.userId, userId), eq(debts.isDeleted, false)))
          .returning({ id: debts.id });
        if (!updated[0]) return { ok: false, message: "Qarz topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: "Qarz yangilandi" };
      }
      if (input.action === "pay") {
        const id = int(d.id);
        const amount = num(d.amount);
        if (!id || !amount || amount <= 0) return { ok: false, message: "Ma'lumot noto'g'ri" };
        const row = await db
          .select()
          .from(debts)
          .where(and(eq(debts.id, id), eq(debts.userId, userId)))
          .limit(1);
        if (!row[0]) return { ok: false, message: "Qarz topilmadi" };
        if (amount > row[0].remainingAmount) return { ok: false, message: "To'lov qolgan qarzdan katta bo'lmasligi kerak" };
        const paymentAccountId = int(d.accountId) ?? (await defaultAccount(userId));
        if (!paymentAccountId || !(await ownsAccount(userId, paymentAccountId))) return { ok: false, message: "Hisob topilmadi" };
        const remaining = Math.max(0, row[0].remainingAmount - amount);
        const paid = await db.transaction(async (tx) => {
          // The balance check belongs in the UPDATE predicate, not only in
          // the preflight read: concurrent payments must not overspend debt.
          const updated = await tx.update(debts)
            .set({ remainingAmount: sql`${debts.remainingAmount} - ${amount}`, status: sql`case when ${debts.remainingAmount} - ${amount} = 0 then 'settled' else 'active' end` })
            .where(and(eq(debts.id, id), eq(debts.userId, userId), eq(debts.isDeleted, false), sql`${debts.remainingAmount} >= ${amount}`))
            .returning({ id: debts.id });
          if (!updated[0]) return false;
          await tx.insert(debtPayments).values({ userId, debtId: id, amount, date: isoDate(d.date, today) ?? today, note: str(d.note) });
          // A repayment is also a real money movement.
          if (row[0].direction === "i_owe") {
            await tx.insert(transactions).values({
              userId,
              accountId: paymentAccountId,
              type: "expense",
              amount,
              date: isoDate(d.date, today) ?? today,
              note: `Qarz to'lovi: ${row[0].personName}`,
              source: "miniapp",
              currency: user.currency,
            });
          } else {
            await tx.insert(transactions).values({
              userId,
              accountId: paymentAccountId,
              type: "income",
              amount,
              date: isoDate(d.date, today) ?? today,
              note: `Qarz qaytdi: ${row[0].personName}`,
              source: "miniapp",
              currency: user.currency,
            });
          }
          return true;
        });
        if (!paid) return { ok: false, message: "To'lov allaqachon qayd etilgan yoki qolgan qarz yetarli emas" };
        return { ok: true, message: remaining === 0 ? "Qarz yopildi" : "To'lov qayd etildi" };
      }
      if (input.action === "delete") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const deleted = await db
          .update(debts)
          .set({ isDeleted: true })
          .where(and(eq(debts.id, id), eq(debts.userId, userId), eq(debts.isDeleted, false)))
          .returning({ id: debts.id });
        if (!deleted[0]) return { ok: false, message: "Qarz topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: deleted[0].id, message: "Qarz arxivlandi" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    /* ------------------------- goals ------------------------- */
    case "goal": {
      if (input.action === "create") {
        const name = str(d.name);
        const targetAmount = num(d.targetAmount);
        if (!name || !targetAmount || targetAmount <= 0) return { ok: false, message: "Ma'lumot to'liq emas" };
        const accountId = int(d.accountId);
        if (accountId && !(await ownsAccount(userId, accountId))) return { ok: false, message: "Hisob topilmadi" };
        const savedAmount = num(d.savedAmount, 0) ?? 0;
        const monthlyContribution = num(d.monthlyContribution, 0) ?? 0;
        if (savedAmount < 0 || savedAmount > targetAmount || monthlyContribution < 0) {
          return { ok: false, message: "Jamg'arma summasi noto'g'ri" };
        }
        const [row] = await db
          .insert(goals)
          .values({
            userId,
            name,
            icon: str(d.icon, "🎯") ?? "🎯",
            targetAmount,
            savedAmount,
            targetDate: isoDate(d.targetDate),
            monthlyContribution,
            accountId,
          })
          .returning();
        return { ok: true, id: row.id, message: `${name} maqsadi yaratildi` };
      }
      if (input.action === "contribute") {
        const id = int(d.id);
        const amount = num(d.amount);
        if (!id || !amount || amount <= 0) return { ok: false, message: "Ma'lumot noto'g'ri" };
        const row = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId), eq(goals.isDeleted, false))).limit(1);
        if (!row[0]) return { ok: false, message: "Maqsad topilmadi" };
        if (amount > row[0].targetAmount - row[0].savedAmount) {
          return { ok: false, message: "Jamg'arma qolgan maqsad summasidan katta bo'lmasligi kerak" };
        }
        const accountId = int(d.accountId) ?? row[0].accountId ?? (await defaultAccount(userId));
        if (!accountId || !(await ownsAccount(userId, accountId))) return { ok: false, message: "Hisob topilmadi" };
        const contributed = await db.transaction(async (tx) => {
          // Both the cap and increment are evaluated by the database, so two
          // concurrent clicks cannot push a goal beyond its target.
          const updated = await tx.update(goals)
            .set({ savedAmount: sql`${goals.savedAmount} + ${amount}`, status: sql`case when ${goals.savedAmount} + ${amount} >= ${goals.targetAmount} then 'reached' else 'active' end` })
            .where(and(eq(goals.id, id), eq(goals.userId, userId), sql`${goals.savedAmount} + ${amount} <= ${goals.targetAmount}`))
            .returning({ id: goals.id });
          if (!updated[0]) return false;
          await tx.insert(goalContributions).values({ userId, goalId: id, amount, date: isoDate(d.date, today) ?? today });
          await tx.insert(transactions).values({ userId, accountId, type: "expense", amount, date: isoDate(d.date, today) ?? today, note: `Maqsad: ${row[0].name}`, source: "miniapp", currency: user.currency });
          return true;
        });
        if (!contributed) return { ok: false, message: "Maqsad uchun qolgan summa yetarli emas" };
        return { ok: true, message: `${row[0].name} ga jamg'arma qo'shildi` };
      }
      if (input.action === "update") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const existing = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId), eq(goals.isDeleted, false))).limit(1);
        if (!existing[0]) return { ok: false, message: "Maqsad topilmadi yoki ruxsat yo'q" };
        const name = str(d.name, existing[0].name);
        const icon = str(d.icon, existing[0].icon);
        const targetAmount = d.targetAmount !== undefined ? num(d.targetAmount) : existing[0].targetAmount;
        const monthlyContribution = d.monthlyContribution !== undefined ? num(d.monthlyContribution) : existing[0].monthlyContribution;
        if (!name || !targetAmount || targetAmount < existing[0].savedAmount) {
          return { ok: false, message: "Maqsad summasi yig'ilgan summadan kam bo'lmasligi kerak" };
        }
        if (monthlyContribution === null || monthlyContribution < 0) return { ok: false, message: "Oylik jamg'arma noto'g'ri" };
        const targetDate = d.targetDate === null || d.targetDate === "" ? null : d.targetDate !== undefined ? isoDate(d.targetDate) : existing[0].targetDate;
        if (d.targetDate && !targetDate) return { ok: false, message: "Sana noto'g'ri" };
        const updated = await db
          .update(goals)
          .set({ name, icon: icon ?? "🎯", targetAmount, monthlyContribution, targetDate })
          .where(and(eq(goals.id, id), eq(goals.userId, userId), eq(goals.isDeleted, false)))
          .returning({ id: goals.id });
        if (!updated[0]) return { ok: false, message: "Maqsad topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: updated[0].id, message: "Maqsad yangilandi" };
      }
      if (input.action === "delete") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        const deleted = await db
          .update(goals)
          .set({ isDeleted: true })
          .where(and(eq(goals.id, id), eq(goals.userId, userId), eq(goals.isDeleted, false)))
          .returning({ id: goals.id });
        if (!deleted[0]) return { ok: false, message: "Maqsad topilmadi yoki ruxsat yo'q" };
        return { ok: true, id: deleted[0].id, message: "Maqsad arxivlandi" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    /* ------------------------- notifications ------------------------- */
    case "notification": {
      if (input.action === "read") {
        const id = int(d.id);
        if (!id) return { ok: false, message: "ID kerak" };
        await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
        return { ok: true, message: "O'qilgan" };
      }
      if (input.action === "readAll") {
        await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, userId));
        return { ok: true, message: "Barchasi o'qilgan" };
      }
      return { ok: false, message: "Noma'lum amal" };
    }

    default:
      return { ok: false, message: "Noma'lum modul" };
  }
}

function thisMonthDate(day: number): string {
  const today = todayISO();
  const d = new Date();
  void d;
  const iso = `${monthKey(today)}-${String(day).padStart(2, "0")}`;
  return iso;
}

async function defaultAccount(userId: number): Promise<number | null> {
  const rows = await db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.sortOrder).limit(1);
  return rows[0]?.id ?? null;
}

async function ownsAccount(userId: number, accountId: number): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.isActive, true)))
    .limit(1);
  return Boolean(rows[0]);
}

async function ownsCategory(userId: number, categoryId: number): Promise<boolean> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId), eq(categories.isActive, true)))
    .limit(1);
  return Boolean(rows[0]);
}

/** Quick-add from free text (bot + mini app quick input share this path). */
export async function quickAdd(
  user: User,
  text: string,
  overrides?: Record<string, unknown>,
): Promise<{ ok: boolean; message: string; draft?: ReturnType<typeof parseDraft> }> {
  const draft = parseDraft(text);
  if (!draft.ok || draft.amount === null) {
    return { ok: false, message: "Summani aniqlab bo'lmadi. Misol: \"150 ming ovqatga ketdi\"", draft };
  }
  const categoryId = await resolveCategoryId(user.id, draft.categoryName, draft.type);
  const result = await runMutation(user, {
    entity: "transaction",
    action: "create",
    data: {
      type: draft.type,
      amount: draft.amount,
      categoryId,
      date: draft.date,
      note: draft.note,
      source: "bot",
      ...overrides,
    },
  });
  return { ok: result.ok, message: result.message, draft };
}

async function resolveCategoryId(userId: number, name: string | null, type: string): Promise<number | null> {
  if (!name) return null;
  const rows = await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.name, name))).limit(1);
  if (rows[0]) return rows[0].id;
  const created = await db
    .insert(categories)
    .values({ userId, name, type: type === "income" ? "income" : "expense", icon: "•" })
    .returning();
  return created[0].id;
}
