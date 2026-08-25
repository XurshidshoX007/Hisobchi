import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, users } from "@/db/schema";
import { EXPENSE_TREE, INCOME_TREE } from "./seed";

/**
 * Bootstrap a fresh Telegram user with a minimal, ready-to-use financial world:
 *  - one Cash account (so the first NLP save from the bot doesn't fail with
 *    "Hisob topilmadi");
 *  - the standard expense/income category tree so operations get classified.
 *
 * The user row is locked and every insert runs in one transaction. Concurrent
 * first updates therefore serialize, and a database interruption rolls the
 * whole bootstrap back instead of leaving a half-created financial world.
 */
export async function bootstrapNewUser(userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock the stable parent row; unlike an advisory lock this is released
    // automatically at transaction end and also proves the user still exists.
    const locked = await tx.execute(
      sql`select id, currency from users where id = ${userId} for update`,
    );
    if (locked.rowCount !== 1) throw new Error("bootstrap_user_missing");
    const currency = String((locked.rows[0] as { currency?: unknown }).currency ?? "UZS");

    const existingAccount = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .limit(1);
    if (existingAccount.length === 0) {
      await tx.insert(accounts).values({
        userId,
        name: "Naqd pul",
        type: "cash",
        currency,
        initialBalance: 0,
        sortOrder: 1,
      });
    }

    const existingCategory = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.userId, userId))
      .limit(1);
    if (existingCategory.length === 0) {
      let order = 0;
      for (const node of EXPENSE_TREE) {
        const [parent] = await tx
          .insert(categories)
          .values({
            userId,
            name: node.name,
            type: "expense",
            icon: node.icon,
            isEssential: node.essential,
            isSystem: true,
            sortOrder: order++,
          })
          .returning();
        for (const child of node.children ?? []) {
          await tx.insert(categories).values({
            userId,
            parentId: parent.id,
            name: child.name,
            type: "expense",
            icon: child.icon,
            isEssential: child.essential,
            isSystem: true,
            sortOrder: order++,
          });
        }
      }
      for (const node of INCOME_TREE) {
        await tx.insert(categories).values({
          userId,
          name: node.name,
          type: "income",
          icon: node.icon,
          isSystem: true,
          sortOrder: order++,
        });
      }
    }
  });
}
