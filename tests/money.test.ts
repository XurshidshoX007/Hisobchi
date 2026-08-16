import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Money } from "../src/components/ui";
import {
  formatAmount,
  formatCompactAmount,
  formatMoney,
  formatShortAmount,
  formatSigned,
} from "../src/lib/money";

const exactCases: Array<[number, string]> = [
  [0, "0"],
  [100, "100"],
  [999, "999"],
  [1_000, "1 000"],
  [12_000, "12 000"],
  [100_000, "100 000"],
  [850_000, "850 000"],
  [999_999, "999 999"],
  [1_000_000, "1 000 000"],
  [1_001_000, "1 001 000"],
  [1_050_000, "1 050 000"],
  [1_200_000, "1 200 000"],
  [1_250_000, "1 250 000"],
  [1_999_000, "1 999 000"],
  [2_000_000, "2 000 000"],
  [12_500_000, "12 500 000"],
  [999_999_999, "999 999 999"],
  [1_000_000_000, "1 000 000 000"],
  [1_200_000_000, "1 200 000 000"],
  [-1_200_000, "−1 200 000"],
  [1_200.5, "1 200.50"],
];

test("formatAmount renders exact financial values with one grouping and sign convention", () => {
  for (const [value, expected] of exactCases) assert.equal(formatAmount(value), expected, String(value));
  assert.equal(formatAmount(12_500_000.25), "12 500 000.25");
  assert.equal(formatAmount(1_200_000.0), "1 200 000");
});

const compactCases: Array<[number, string]> = [
  [0, "0"],
  [100, "100"],
  [999, "999"],
  [1_000, "1 ming"],
  [12_000, "12 ming"],
  [100_000, "100 ming"],
  [850_000, "850 ming"],
  [999_999, "999 ming 999"],
  [1_000_000, "1 mln"],
  [1_001_000, "1 mln 1 ming"],
  [1_050_000, "1 mln 50 ming"],
  [1_200_000, "1 mln 200 ming"],
  [1_250_000, "1 mln 250 ming"],
  [1_999_000, "1 mln 999 ming"],
  [2_000_000, "2 mln"],
  [12_500_000, "12 mln 500 ming"],
  [999_999_999, "999 mln 999 ming 999"],
  [1_000_000_000, "1 mlrd"],
  [1_200_000_000, "1 mlrd 200 mln"],
  [-1_200_000, "−1 mln 200 ming"],
];

test("formatCompactAmount decomposes values without awkward lower-unit overflow or rounding loss", () => {
  for (const [value, expected] of compactCases) assert.equal(formatCompactAmount(value), expected, String(value));
  assert.equal(formatCompactAmount(2_500_000_000), "2 mlrd 500 mln");
  assert.equal(formatCompactAmount(12_750_000_000), "12 mlrd 750 mln");
  assert.equal(formatCompactAmount(1_200.5), "1 200.50");
});

test("formatShortAmount is explicitly rounded and always promotes unit boundaries", () => {
  assert.equal(formatShortAmount(1_200_000), "1,2 mln");
  assert.equal(formatShortAmount(-1_200_000), "−1,2 mln");
  assert.equal(formatShortAmount(999_999), "1 mln");
  assert.equal(formatShortAmount(1_250_000_000), "1,3 mlrd");
  assert.ok(!formatShortAmount(1_200_000).includes("1200 ming"));
});

test("money composition and signed values reuse the canonical exact formatter", () => {
  assert.equal(formatMoney(1_200_000, "so‘m"), "1 200 000 so‘m");
  assert.equal(formatMoney(-1_200_000, "UZS"), "−1 200 000 UZS");
  assert.equal(formatSigned(1_200_000), "+1 200 000");
  assert.equal(formatSigned(-1_200_000), "−1 200 000");
  assert.equal(formatSigned(0), "0");
});

test("Money keeps negative signs even when a leading plus was not requested", () => {
  assert.match(renderToStaticMarkup(createElement(Money, { value: -1_200_000 })), /−1 200 000/);
  assert.match(renderToStaticMarkup(createElement(Money, { value: 1_200_000, signed: true })), /\+1 200 000/);
});

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = `${root}/${name}`;
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(path) ? [path] : [];
  });
}

test("presentation code has no ad-hoc money scaling or locale formatter", () => {
  const files = [
    ...sourceFiles("src/app"),
    ...sourceFiles("src/components"),
    "src/lib/bot.ts",
    "src/lib/finance.ts",
    "src/lib/state.ts",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\.toLocaleString\s*\(/, file);
    assert.doesNotMatch(source, /\/\s*(?:1_?000_?000_?000|1_?000_?000|1_?000)\b/, file);
    assert.doesNotMatch(source, /\bcompact\s*\(/, file);
  }
});
