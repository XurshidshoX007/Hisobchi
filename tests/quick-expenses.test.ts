import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("quick expenses are user-triggered shortcuts, not recurring payments", () => {
  const schema = read("db/schema.ts");
  const mutations = read("lib/mutations.ts");
  const dashboard = read("app/page.tsx");
  const component = read("components/quick-expenses.tsx");

  assert.match(schema, /export const quickExpenses/);
  assert.match(mutations, /quickExpense: \["create", "update", "delete", "record"\]/);
  assert.match(mutations, /if \(input\.action === "record"\)/);
  assert.match(mutations, /date: today, note: preset\[0\]\.name/);
  assert.match(dashboard, /expenseDock=\{<QuickExpenses \/>\}/);
  assert.match(component, /Tezkor xarajatlarni ochish/);
  assert.doesNotMatch(component, /setInterval|recurring\.pay|nextDueDate/);
});

test("quick expense posting keeps category and account ownership guards", () => {
  const mutations = read("lib/mutations.ts");
  const start = mutations.indexOf('case "quickExpense"');
  const end = mutations.indexOf('case "transaction"');
  const section = mutations.slice(start, end);

  assert.match(section, /accountForPosting\(userId, accountId, user\.currency, "source"\)/);
  assert.match(section, /eq\(categories\.userId, userId\)/);
  assert.match(section, /eq\(categories\.type, "expense"\)/);
  assert.match(section, /eq\(categories\.isActive, true\)/);
});
