import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { extractCreditDocumentText, parseCreditDocumentText } from "../src/lib/credit-document";

test("local document parser accepts reconciled rows without AI", () => {
  const schedule = parseCreditDocumentText(`To'lov jadvali\n07.09.2026 | 2 358 493,53 | 2 061 808,60 | 296 684,93 | 0\n07.10.2026 | 2 358 493,53 | 2 179 749,93 | 178 743,60 | 0`, "TBC kredit.pdf");
  assert.equal(schedule?.items.length, 2);
  assert.equal(schedule?.items[0].date, "2026-09-07");
  assert.equal(schedule?.items[0].principalAmount, 2061808.6);
});

test("local document parser never guesses a broken allocation", () => {
  assert.equal(parseCreditDocumentText(`07.09.2026 | 1000 | 800 | 50\n07.10.2026 | 1000 | 800 | 50`), null);
});

test("local document parser accepts reordered bank columns and split PDF rows", () => {
  const schedule = parseCreditDocumentText(`To'lov jadvali\n07.09.2026\n2 061 808,60\n296 684,93\n2 358 493,53\n12 000 000\n07.10.2026 | 2 179 749,93 | 178 743,60 | 2 358 493,53 | 9 820 250,07`);
  assert.equal(schedule?.items.length, 2);
  assert.equal(schedule?.items[0].amount, 2358493.53);
  assert.equal(schedule?.items[0].principalAmount, 2061808.6);
});

test("extracts CSV, Word and Excel table text locally", async () => {
  const csv = await extractCreditDocumentText(Buffer.from("07.09.2026,1000,900,100,0"), "jadval.csv");
  assert.match(csv ?? "", /07\.09\.2026/);

  const docx = Buffer.from(zipSync({
    "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:t>07.09.2026 | 1000 | 900 | 100 | 0</w:t></w:r></w:p></w:body></w:document>'),
  }));
  const word = await extractCreditDocumentText(docx, "jadval.docx");
  assert.match(word ?? "", /1000/);

  const xlsx = Buffer.from(zipSync({
    "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>07.09.2026</t></is></c><c r="B1"><v>1000</v></c></row></sheetData></worksheet>'),
  }));
  const excel = await extractCreditDocumentText(xlsx, "jadval.xlsx");
  assert.match(excel ?? "", /07\.09\.2026 \| 1000/);
});
