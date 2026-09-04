import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCALE,
  needsLocaleConfirmation,
  normalizeLocale,
  translate,
  translateCategory,
} from "../src/lib/i18n";
import { botLocaleCopy } from "../src/lib/bot-i18n";

test("legacy and Telegram locale codes normalize to product locales", () => {
  assert.equal(normalizeLocale("uz"), "uz-Latn");
  assert.equal(normalizeLocale("uz-Cyrl-UZ"), "uz-Cyrl");
  assert.equal(normalizeLocale("ru-RU"), "ru");
  assert.equal(normalizeLocale("en"), DEFAULT_LOCALE);
});

test("translations interpolate values without exposing unknown placeholders", () => {
  assert.equal(translate("uz-Latn", "common.accountCount", { count: 3 }), "3 hisob");
  assert.equal(translate("uz-Cyrl", "common.accountCount", { count: 3 }), "3 ҳисоб");
  assert.equal(translate("ru", "common.accountCount", { count: 3 }), "Счетов: 3");
});

test("only built-in category names are localized", () => {
  assert.equal(translateCategory("ru", "Oziq-ovqat"), "Продукты");
  assert.equal(translateCategory("uz-Cyrl", "Sog‘liq"), "Соғлиқ");
  assert.equal(translateCategory("ru", "Xot dog"), "Xot dog");
});

test("bot primary keyboard follows the saved locale", () => {
  assert.deepEqual(botLocaleCopy("ru").mainMenu, [["💰 Доход", "💸 Расход", "🔄 Перевод"]]);
  assert.deepEqual(botLocaleCopy("uz-Cyrl").mainMenu, [["💰 Даромад", "💸 Харажат", "🔄 Ўтказма"]]);
});

test("language choice is required only until the profile confirms it", () => {
  assert.equal(needsLocaleConfirmation(null), true);
  assert.equal(needsLocaleConfirmation(undefined), true);
  assert.equal(needsLocaleConfirmation("2026-09-04T12:00:00.000Z"), false);
});
