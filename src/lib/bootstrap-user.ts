import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories } from "@/db/schema";
import { EXPENSE_TREE, INCOME_TREE } from "./seed";

/**
 * Bootstrap a fresh Telegram user with a minimal, ready-to-use financial world:
 *  - one Cash account (so the first NLP save from the bot doesn't fail with
 *    "Hisob topilmadi");
 *  - the standard expense/income category tree so operations get classified.
 *
 * Safe to call multiple times — guarded by row counts.
 */
export async function bootstrapNewUser(userId: number): Promise<void> {
  const existingAccount = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  if (existingAccount.length === 0) {
    await db.insert(accounts).values({
      userId,
      name: "Naqd pul",
      type: "cash",
      currency: "UZS",
      initialBalance: 0,
      sortOrder: 1,
    });
  }

  const existingCategory = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.userId, userId))
    .limit(1);
  if (existingCategory.length === 0) {
    let order = 0;
    for (const node of EXPENSE_TREE) {
      const [parent] = await db
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
        await db.insert(categories).values({
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
      await db.insert(categories).values({
        userId,
        name: node.name,
        type: "income",
        icon: node.icon,
        isSystem: true,
        sortOrder: order++,
      });
    }
  }
}
