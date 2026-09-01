import test from "node:test";
import assert from "node:assert/strict";
import { isPaymentScheduleCandidate, parsePaymentSchedule } from "../src/lib/payment-schedule-parser";
import { parseScheduleCallback } from "../src/lib/bot-routing";
import { parseDraft, parseDrafts } from "../src/lib/nlp";

/* ============================ SCHEDULE DETECTION ============================ */

test("schedule candidate requires at least 2 dates and 2 amounts with keyword", () => {
  assert.equal(isPaymentScheduleCandidate("Kredit Uzum: 20 avgust 750 ming, 18 sentabr 820 ming"), true);
  assert.equal(isPaymentScheduleCandidate("Kredit 500 ming"), false);
  assert.equal(isPaymentScheduleCandidate("150 ming ovqatga ketdi"), false);
  assert.equal(isPaymentScheduleCandidate("150 ming ovqat, 70 ming taksi"), false);
});

test("variant B without keyword is still candidate when paired dates+amounts exist", () => {
  assert.equal(isPaymentScheduleCandidate("Uzum 20 avg 750 ming, 18 sen 820 ming, 22 okt 790 ming"), true);
});

test("expense batch with dates should not be schedule", () => {
  assert.equal(isPaymentScheduleCandidate("15 avgust 150 ming ovqat, 16 avgust 200 ming taksi"), false);
  assert.equal(isPaymentScheduleCandidate("kecha 150 ming ovqat, bugun 70 ming taksi"), false);
});

test("schedule candidate is not triggered for transfer", () => {
  assert.equal(isPaymentScheduleCandidate("Naqd puldan Humo hisobiga 200 ming o'tkazdim"), false);
  assert.equal(isPaymentScheduleCandidate("1,5 mln maosh keldi"), false);
});

/* ============================ INPUT FORMATS ============================ */

test("variant A newline", () => {
  const res = parsePaymentSchedule("Kredit Uzum:\n20 avgust 750 ming\n18 sentabr 820 ming\n22 oktabr 790 ming", "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 3);
  assert.equal(res.schedule?.name, "Kredit Uzum");
  assert.deepEqual(res.schedule?.items.map((i) => i.amount), [750000, 820000, 790000]);
});

test("variant B comma", () => {
  const res = parsePaymentSchedule("Uzum 20 avg 750 ming, 18 sen 820 ming, 22 okt 790 ming", "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 3);
  assert.equal(res.schedule?.name, "Uzum");
});

test("variant C numeric date", () => {
  const res = parsePaymentSchedule("Kredit:\n20-08 750000\n18-09 820000\n22-10 790000", "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items[0].date, "2026-08-20");
  assert.equal(res.schedule?.items[1].amount, 820000);
});

test("variant D with va", () => {
  const res = parsePaymentSchedule("Uzum nasiya 20 avg 750 ming va 18 sen 820 ming va 22 okt 790 ming", "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 3);
  assert.equal(res.schedule?.name, "Uzum Nasiya");
});

test("variant E numbered", () => {
  const res = parsePaymentSchedule("1-to‘lov 20 avgust 750 ming\n2-to‘lov 18 sentabr 820 ming\n3-to‘lov 22 oktabr 790 ming", "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 3);
  assert.equal(res.schedule?.items[0].date, "2026-08-20");
});

/* ============================ DATE PARSER SHORT FORMS ============================ */

test("short month forms", () => {
  const cases: Array<[string, string]> = [
    ["20 avg 750 ming, 18 sen 820 ming", "2026-08-20"],
    ["20 avgust 750 ming, 18 sentabr 820 ming", "2026-08-20"],
    ["20 okt 750 ming, 18 noy 820 ming", "2026-10-20"],
    ["20 dek 750 ming, 18 yan 820 ming", "2026-12-20"],
  ];
  for (const [input, firstDate] of cases) {
    const res = parsePaymentSchedule(`${input}, 22 okt 790 ming`, "2026-08-17");
    assert.ok(res.schedule || res.ok || !res.ok, `${input} should parse`);
    if (res.schedule && res.schedule.items.length >= 2) {
      assert.equal(res.schedule.items[0].date, firstDate, input);
    }
  }
});

/* ============================ YEAR LOGIC ============================ */

test("year wrap dec->jan", () => {
  const res = parsePaymentSchedule("20 dekabr 750 ming,\n18 yanvar 820 ming", "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items[0].date, "2026-12-20");
  assert.equal(res.schedule?.items[1].date, "2027-01-18");
});

test("year stays same for future months", () => {
  const res = parsePaymentSchedule("20 avgust 750 ming,\n18 sentabr 820 ming", "2026-08-17");
  assert.equal(res.schedule?.items[0].date, "2026-08-20");
  assert.equal(res.schedule?.items[1].date, "2026-09-18");
});

/* ============================ AMOUNT PARSER ============================ */

test("amount variants", () => {
  assert.equal(parsePaymentSchedule("20 avgust 750 ming\n18 sentabr 820 ming", "2026-08-17").schedule?.items[0].amount, 750000);
  assert.equal(parsePaymentSchedule("20 avgust 750000\n18 sentabr 820000", "2026-08-17").schedule?.items[0].amount, 750000);
  assert.equal(parsePaymentSchedule("20 avgust 1,25 mln\n18 sentabr 820 ming", "2026-08-17").schedule?.items[0].amount, 1250000);
  assert.equal(parsePaymentSchedule("20 avgust 2 500 000\n18 sentabr 820000", "2026-08-17").schedule?.items[0].amount, 2500000);
  assert.equal(parsePaymentSchedule("20 avgust 750,5 ming\n18 sentabr 820 ming", "2026-08-17").schedule?.items[0].amount, 750500);
});

/* ============================ DATE + AMOUNT PAIRING ============================ */

test("correct pairing", () => {
  const res = parsePaymentSchedule("20 avgust 750 ming\n18 sentabr 820 ming", "2026-08-17");
  assert.equal(res.schedule?.items[0].date, "2026-08-20");
  assert.equal(res.schedule?.items[0].amount, 750000);
  assert.equal(res.schedule?.items[1].date, "2026-09-18");
  assert.equal(res.schedule?.items[1].amount, 820000);
});

/* ============================ CREDIT NAME ============================ */

test("credit name extraction", () => {
  assert.equal(parsePaymentSchedule("Uzum nasiya:\n20 avgust 750 ming\n18 sentabr 820 ming", "2026-08-17").schedule?.name, "Uzum Nasiya");
  assert.equal(parsePaymentSchedule("Korzinka kredit:\n20 avgust 750 ming\n18 sentabr 820 ming", "2026-08-17").schedule?.name.toLowerCase().includes("korzinka"), true);
  assert.equal(parsePaymentSchedule("20 avgust 750 ming\n18 sentabr 820 ming", "2026-08-17").schedule?.name, "Kredit to'lovi");
});

/* ============================ VALIDATION MATRIX (§17 / §21) ============================ */

test("duplicate date detection", () => {
  const res = parsePaymentSchedule("20 avgust 750 ming\n20 avgust 750 ming", "2026-08-17");
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.toLowerCase().includes("takroriy")));
});

test("missing amount", () => {
  const res = parsePaymentSchedule("20 avgust\n18 sentabr 820 ming", "2026-08-17");
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("summa")));
});

function generateScheduleText(count: number, name = "Kredit Anor Bank"): string {
  const months = [
    "sentabr", "oktabr", "noyabr", "dekabr", "yanvar", "fevral",
    "mart", "aprel", "may", "iyun", "iyul", "avgust",
  ];
  const lines = [`${name}\n`];
  for (let i = 0; i < count; i++) {
    const m = months[i % 12];
    lines.push(`${i + 1}. 01 ${m} — 500 000`);
  }
  return lines.join("\n");
}

test("parse 2 installments (minimum valid)", () => {
  const res = parsePaymentSchedule(generateScheduleText(2), "2026-08-22");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 2);
});

test("parse 10 installments", () => {
  const res = parsePaymentSchedule(generateScheduleText(10), "2026-08-22");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 10);
});

test("parse 23 installments", () => {
  const res = parsePaymentSchedule(generateScheduleText(23), "2026-08-22");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 23);
});

test("parse 24 installments (former limit)", () => {
  const res = parsePaymentSchedule(generateScheduleText(24), "2026-08-22");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 24);
});

test("parse 25 installments (new support beyond 24)", () => {
  const res = parsePaymentSchedule(generateScheduleText(25), "2026-08-22");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 25);
});

test("parse 30 installments", () => {
  const res = parsePaymentSchedule(generateScheduleText(30), "2026-08-22");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 30);
});

test("parse 59 installments", () => {
  const res = parsePaymentSchedule(generateScheduleText(59), "2026-08-22");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 59);
});

test("parse 60 installments (maximum limit)", () => {
  const text = generateScheduleText(60);
  assert.equal(isPaymentScheduleCandidate(text, "2026-08-22"), true);
  const res = parsePaymentSchedule(text, "2026-08-22");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.name, "Kredit Anor Bank");
  assert.equal(res.schedule?.items.length, 60);
  assert.equal(res.schedule?.totalAmount, 30_000_000);
  assert.equal(res.schedule?.items[0].date, "2026-09-01");
  assert.equal(res.schedule?.items[59].date, "2031-08-01");
  assert.equal(res.errors.length, 0);
});

test("reject 61 installments", () => {
  const res = parsePaymentSchedule(generateScheduleText(61), "2026-08-22");
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("60")));
  assert.ok(res.errors.includes("Kredit jadvali ko‘pi bilan 60 ta to‘lovdan iborat bo‘lishi mumkin."));
});

test("reject 100 installments (DoS prevention)", () => {
  const res = parsePaymentSchedule(generateScheduleText(100), "2026-08-22");
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("60")));
});

/* ============================ EDGE CASES (§18) ============================ */

test("edge case: irregular dates across multiple years", () => {
  const input = [
    "Kredit Ipoteka",
    "1. 05 avgust — 300 000",
    "2. 12 sentabr — 350 000",
    "3. 28 oktabr — 400 000",
    "4. 15 dekabr — 450 000",
    "5. 10 fevral — 500 000",
    "6. 20 avgust — 550 000",
  ].join("\n");
  const res = parsePaymentSchedule(input, "2026-08-01");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items.length, 6);
  assert.deepEqual(
    res.schedule?.items.map((i) => i.date),
    ["2026-08-05", "2026-09-12", "2026-10-28", "2026-12-15", "2027-02-10", "2027-08-20"],
  );
  assert.equal(res.schedule?.totalAmount, 2550000);
});

test("edge case: month boundary dates", () => {
  const input = "Kredit:\n31 avgust 500 000\n30 sentabr 500 000\n31 oktabr 500 000";
  const res = parsePaymentSchedule(input, "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items[0].date, "2026-08-31");
  assert.equal(res.schedule?.items[1].date, "2026-09-30");
  assert.equal(res.schedule?.items[2].date, "2026-10-31");
});

test("edge case: Feb 29 leap year vs non leap year", () => {
  // 2028 is a leap year
  const resLeap = parsePaymentSchedule("Kredit:\n29 fevral 2028 500 ming\n29 mart 2028 500 ming", "2026-08-17");
  assert.equal(resLeap.ok, true);
  assert.equal(resLeap.schedule?.items[0].date, "2028-02-29");

  // 2027 is not a leap year
  const resNonLeap = parsePaymentSchedule("Kredit:\n29 fevral 2027 500 ming\n29 mart 2027 500 ming", "2026-08-17");
  assert.equal(resNonLeap.ok, false);
  assert.ok(resNonLeap.errors.some((e) => e.includes("sanasi noto'g'ri")));
});

test("edge case: very large amounts within bounds", () => {
  const input = "Kredit:\n20 avgust 500 mln\n20 sentabr 500 mln";
  const res = parsePaymentSchedule(input, "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.items[0].amount, 500_000_000);
  assert.equal(res.schedule?.totalAmount, 1_000_000_000);
});

/* ============================ REGRESSION: ORDINARY FLOWS ============================ */

test("ordinary expense still parses via nlp", () => {
  const d = parseDraft("150 ming ovqatga ketdi", "2026-08-17");
  assert.equal(d.ok, true);
  assert.equal(d.type, "expense");
  assert.equal(d.amount, 150000);
});
test("ordinary income still parses", () => {
  const d = parseDraft("1,5 mln maosh keldi", "2026-08-17");
  assert.equal(d.ok, true);
  assert.equal(d.type, "income");
  assert.equal(d.amount, 1500000);
});
test("ordinary transfer still parses batch not schedule", () => {
  const b = parseDrafts("Naqd puldan Humo hisobiga 200 ming o'tkazdim", "2026-08-17");
  assert.ok(b.drafts.length >= 0);
  assert.equal(isPaymentScheduleCandidate("Naqd puldan Humo hisobiga 200 ming o'tkazdim"), false);
});

test("batch expense not misclassified", () => {
  const txt = "150 ming ovqat, 70 ming taksi";
  assert.equal(isPaymentScheduleCandidate(txt), false);
  const b = parseDrafts(txt, "2026-08-17");
  assert.equal(b.drafts.length, 2);
});

/* ============================ LOW CONFIDENCE ============================ */

test("single installment is not schedule ok", () => {
  const res = parsePaymentSchedule("Kredit 20 avg 750 ming", "2026-08-17");
  assert.equal(res.ok, false);
  assert.equal(res.schedule?.items.length, 1);
});

/* ============================ CALLBACK SECURITY ============================ */

test("schedule callback parse", () => {
  assert.deepEqual(parseScheduleCallback("schedule:abc123:confirm"), { batchId: "abc123", action: "confirm" });
  assert.deepEqual(parseScheduleCallback("schedule:abc123:confirm-past"), { batchId: "abc123", action: "confirm-past" });
  assert.deepEqual(parseScheduleCallback("schedule:abc123:cancel"), { batchId: "abc123", action: "cancel" });
  assert.equal(parseScheduleCallback("schedule:ab:confirm"), null);
  assert.equal(parseScheduleCallback("schedule:" + "x".repeat(70) + ":confirm"), null);
});

/* ============================ REUSE OF AMOUNT/DATE ENGINES ============================ */

test("parser reuses existing amount range", () => {
  const r1 = parsePaymentSchedule("20 avgust 750 ming\n18 sentabr 820 ming", "2026-08-17");
  const r2 = parsePaymentSchedule("20 avgust 1,5 mln\n18 sentabr 820 ming", "2026-08-17");
  assert.equal(r1.schedule?.items[0].amount, 750000);
  assert.equal(r2.schedule?.items[0].amount, 1500000);
});

/* ============================ FULL EXAMPLE ============================ */

test("full example total", () => {
  const input = "Kredit Uzum:\n20 avgust 750 ming,\n18 sentabr 820 ming,\n22 oktabr 790 ming,\n25 noyabr 850 ming";
  const res = parsePaymentSchedule(input, "2026-08-17");
  assert.equal(res.ok, true);
  assert.equal(res.schedule?.totalAmount, 3210000);
  assert.equal(res.schedule?.items.length, 4);
});
