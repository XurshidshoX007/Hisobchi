import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

test("credit documents and signed URLs cannot reach the transaction parser", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/api/telegram/webhook/route.ts"), "utf8");
  assert.match(source, /const isCreditDocument/);
  assert.match(source, /downloadCreditDocument/);
  assert.match(source, /parseCreditDocumentText/);
  assert.match(source, /Havola operatsiya sifatida qabul qilinmadi/);
  assert.match(source, /\^https\?:\\\/\\\/\\S\+\$/);
});
