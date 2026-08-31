import assert from "node:assert/strict";
import test from "node:test";
import { parseCreditCommand } from "../src/lib/credit-import";

test("/kredit accepts a complete, balanced principal allocation", () => {
  const result = parseCreditCommand(`/kredit Uzum Bank
2026-09-07 | 2358493.53 | 2061808.60 | 296684.93 | 0
2026-10-07 | 2358493.53 | 2179749.93 | 178743.60 | 0`);
  assert.equal(result.error, null);
  assert.equal(result.schedule?.items.length, 2);
  assert.equal(result.schedule?.items[0].principalAmount, 2061808.6);
});

test("/kredit rejects an allocation that would distort reports", () => {
  const result = parseCreditCommand(`/kredit Test
2026-09-07 | 1000 | 900 | 50 | 0
2026-10-07 | 1000 | 900 | 100 | 0`);
  assert.match(result.error ?? "", /teng/);
});
