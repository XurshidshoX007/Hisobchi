import assert from "node:assert/strict";
import test from "node:test";
import { buildFinanceXlsx } from "../src/lib/xlsx-export";
import type { AppState } from "../src/lib/types";
import { readFileSync } from "node:fs";

function centralNames(zip: Buffer): string[] {
  const names: string[] = [];
  for (let offset = 0; offset + 46 <= zip.length; offset += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength - 1;
  }
  return names;
}

test("Excel export is a real xlsx package with ledger and account sheets", () => {
  const state = {
    user: { firstName: "Xurshid", currency: "UZS" },
    transactions: [{ id: 7, isDeleted: false, date: "2026-08-31", type: "expense", amount: 1_700, currency: "UZS", categoryName: "Transport", accountName: "Karta", toAccountName: null, note: "Metro", source: "miniapp" }],
    accounts: [{ name: "Karta", type: "uzcard", initialBalance: 0, currentBalance: 170_849, currency: "UZS", isActive: true, inflow: 200_000, outflow: 29_151, txCount: 1 }],
  } as unknown as AppState;

  const output = buildFinanceXlsx(state);
  assert.equal(output.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(output.filename, /^hisobchi-eksport-\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.deepEqual(output.body.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert.deepEqual(centralNames(output.body).sort(), [
    "[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml",
    "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml",
  ].sort());
});

test("Telegram export waits for the user to press the download link", () => {
  const provider = readFileSync("src/components/providers.tsx", "utf8");
  const morePage = readFileSync("src/app/more/page.tsx", "utf8");

  assert.doesNotMatch(provider, /anchor\.click\(\)/, "an async programmatic click is blocked by iOS WebView");
  assert.match(provider, /return \{ ok: true, message, url, filename \}/, "provider returns the ready file to UI");
  assert.match(morePage, /t\("menu\.exportAction"\)/, "Menu shows a localized user-initiated download control");
  assert.match(morePage, /download=\{exportReady\.filename\}/, "the file name survives to the download control");
});
