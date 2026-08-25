import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, users } from "@/db/schema";
import { ensureSeed } from "./seed";
import { INIT_DATA_MAX_AGE_SECONDS, demoModeEnabled, requireVerifiedIdentity, telegramBotToken } from "./env";
import { MAX_MONEY } from "@hisobchi/shared/lib/money";
import { bootstrapNewUser } from "./bootstrap-user";

export type SessionUser = typeof users.$inferSelect;

const globalUserBootstrap = globalThis as typeof globalThis & {
  __hisobchiVerifiedBootstrapUsers?: Set<number>;
};
const verifiedBootstrapUsers =
  globalUserBootstrap.__hisobchiVerifiedBootstrapUsers ?? new Set<number>();
if (process.env.NODE_ENV !== "production") {
  globalUserBootstrap.__hisobchiVerifiedBootstrapUsers = verifiedBootstrapUsers;
}

/**
 * Single source of truth for identity. A Telegram Mini App sends verified
 * initData; without Telegram the demo user is used so the product is explorable.
 */
export async function resolveUser(input?: {
  telegramId?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}): Promise<SessionUser | null> {
  // Never seed shared demo data in a strict production environment.
  if (demoModeEnabled()) await ensureSeed();

  if (input?.telegramId) {
    // Concurrent first updates can arrive on several Telegram webhook
    // connections. The unique telegram_id index chooses one creator; losers
    // read that same row instead of surfacing a unique-constraint 500.
    const inserted = await db
      .insert(users)
      .values({
        telegramId: input.telegramId,
        firstName: input.firstName ?? "Foydalanuvchi",
        lastName: input.lastName ?? null,
        username: input.username ?? null,
      })
      .onConflictDoNothing({ target: users.telegramId })
      .returning();
    const user =
      inserted[0] ??
      (await db.select().from(users).where(eq(users.telegramId, input.telegramId)).limit(1))[0];
    if (!user || user.isBlocked) return null;

    // A previous process/DB interruption may have committed the identity before
    // older non-transactional bootstrap writes completed. Heal that state on
    // the next request. Check once per user/process; the bootstrap itself locks
    // the user and remains safe across replicas.
    if (!verifiedBootstrapUsers.has(user.id)) {
      const [account, category] = await Promise.all([
        db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, user.id)).limit(1),
        db.select({ id: categories.id }).from(categories).where(eq(categories.userId, user.id)).limit(1),
      ]);
      if (!account[0] || !category[0]) await bootstrapNewUser(user.id);
      if (verifiedBootstrapUsers.size >= 10_000) verifiedBootstrapUsers.clear();
      verifiedBootstrapUsers.add(user.id);
    }
    return user;
  }

  // No verified identity — only allow demo user when demo mode is enabled.
  if (!demoModeEnabled()) return null;

  const demo = await db.select().from(users).where(eq(users.isDemo, true)).limit(1);
  if (demo[0]) return demo[0];

  const any = await db.select().from(users).limit(1);
  if (any[0]) return any[0];

  const created = await db
    .insert(users)
    .values({ firstName: "Foydalanuvchi", isDemo: true })
    .returning();
  return created[0];
}

/** Verifies Telegram Mini App initData when a bot token is configured. */
export async function verifyInitData(initData: string | null): Promise<{
  telegramId: number | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
} | null> {
  if (!initData || initData.length > 16_384) return null;
  const token = telegramBotToken();
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const userRaw = params.get("user");
  params.delete("hash");

  if (!userRaw || userRaw.length > 4_096) return null;
  let parsed: { id?: number; first_name?: string; last_name?: string; username?: string } = {};
  try {
    parsed = JSON.parse(userRaw);
  } catch {
    return null;
  }
  if (!parsed.id || !Number.isSafeInteger(parsed.id) || parsed.id <= 0) return null;
  const identity = {
    telegramId: parsed.id,
    firstName: parsed.first_name?.slice(0, 128) ?? null,
    lastName: parsed.last_name?.slice(0, 128) ?? null,
    username: parsed.username?.slice(0, 64) ?? null,
  };

  if (!token || !hash) {
    // If verification is required but token/signature is absent → reject.
    if (requireVerifiedIdentity()) return null;
    return identity;
  }

  if (!/^[a-f0-9]{64}$/i.test(hash)) return null;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest();
  const supplied = Buffer.from(hash, "hex");
  if (supplied.length !== computed.length || !timingSafeEqual(computed, supplied)) return null;

  // auth_date is mandatory on a signed request; reject stale/future data.
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) return null;
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds < -30 || ageSeconds > INIT_DATA_MAX_AGE_SECONDS) return null;

  return identity;
}

export async function updateUserSettings(
  user: SessionUser,
  patch: Partial<SessionUser>,
): Promise<{ ok: boolean; message: string }> {
  // Currency is a ledger dimension, not a display preference. Relabelling an
  // existing UZS ledger as USD/EUR without an immutable FX conversion corrupts
  // every balance and report. Until a real multi-currency model exists, keep a
  // user's established ledger currency immutable.
  if (patch.currency !== undefined) {
    if (typeof patch.currency !== "string" || !["UZS", "USD", "EUR"].includes(patch.currency)) {
      return { ok: false, message: "Valyuta noto'g'ri" };
    }
    if (patch.currency !== user.currency) {
      return {
        ok: false,
        message: "Mavjud moliyaviy ma'lumotlar valyutasini avtomatik almashtirib bo'lmaydi",
      };
    }
  }

  // Explicit property authorization: role/isAdmin/isBlocked/telegramId are
  // intentionally absent and can never be changed by a user payload.
  const allowed: Partial<SessionUser> = {};
  if (typeof patch.firstName === "string") {
    const value = patch.firstName.trim();
    if (value && value.length <= 128) allowed.firstName = value;
  }
  if (typeof patch.currency === "string") allowed.currency = patch.currency;
  if (typeof patch.theme === "string" && ["light", "dark", "system"].includes(patch.theme)) {
    allowed.theme = patch.theme;
  }
  if (typeof patch.minReserve === "number" && Number.isFinite(patch.minReserve) && patch.minReserve >= 0 && patch.minReserve <= MAX_MONEY) {
    allowed.minReserve = Math.round(patch.minReserve * 100) / 100;
  }
  if (
    typeof patch.estimatedIncomeConfidence === "number" &&
    Number.isInteger(patch.estimatedIncomeConfidence) &&
    patch.estimatedIncomeConfidence >= 0 &&
    patch.estimatedIncomeConfidence <= 100
  ) {
    allowed.estimatedIncomeConfidence = patch.estimatedIncomeConfidence;
  }
  for (const key of ["notifyPayments", "notifyIncome", "notifyBudget", "notifyRisk"] as const) {
    if (typeof patch[key] === "boolean") allowed[key] = patch[key];
  }
  if (Object.keys(allowed).length === 0) return { ok: true, message: "O'zgarish yo'q" };
  await db.update(users).set(allowed).where(eq(users.id, user.id));
  return { ok: true, message: "Sozlamalar saqlandi" };
}

export async function findUserById(id: number) {
  const rows = await db.select().from(users).where(and(eq(users.id, id))).limit(1);
  return rows[0] ?? null;
}
