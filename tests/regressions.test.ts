import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { botIntent, isStartCommand, parseDraftCallback } from "../src/lib/bot-routing";
import { buildForecast, buildPlanned } from "../src/lib/finance";
import { parseDraft } from "../src/lib/nlp";
import { readFileSync } from "node:fs";
import { Segmented } from "../src/components/ui";

test("Telegram commands support BotFather suffixes and deep-link payloads", () => {
  assert.equal(botIntent("/start@hisobchi_bot referral-42"), "start");
  assert.equal(isStartCommand("/start campaign"), true);
  assert.equal(botIntent("/report@hisobchi_bot"), "report");
  assert.equal(botIntent("/forecast"), "forecast");
  assert.equal(botIntent("/help"), "help");
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
  assert.equal(estimated.income.min, 1_000_000);
  assert.equal(estimated.income.max, 3_000_000);
});

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
