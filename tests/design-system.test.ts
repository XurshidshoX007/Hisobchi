import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Card, FinancialRow, PrimaryFinancialCard } from "../src/components/ui";

const read = (path: string) => readFileSync(path, "utf8");

test("container primitives expose the three-level hierarchy", () => {
  const primary = renderToStaticMarkup(createElement(PrimaryFinancialCard, null, "Balance"));
  const section = renderToStaticMarkup(createElement(Card, null, "Summary"));
  const row = renderToStaticMarkup(createElement(FinancialRow, null, "Transaction"));

  assert.match(primary, /data-container-level="1"/);
  assert.match(primary, /primary-card/);
  assert.match(section, /data-container-level="2"/);
  assert.match(section, /section-card/);
  assert.match(row, /data-container-level="3"/);
  assert.doesNotMatch(row, /primary-card|section-card/);
});

test("financial records and plan items are row-first rather than card-per-record", () => {
  const history = read("src/app/transactions/page.tsx");
  const plans = read("src/app/plans/page.tsx");

  assert.doesNotMatch(history, /<Card\b/);
  assert.match(history, /<FinancialRow/);
  assert.match(plans, /function PaymentPlanCard[\s\S]*?<FinancialRow/);
  assert.match(plans, /function IncomePlanCard[\s\S]*?<FinancialRow/);
});

test("dashboard and analytics reserve elevation for primary decisions and charts", () => {
  const dashboard = read("src/app/page.tsx");
  const analytics = read("src/app/analytics/page.tsx");

  assert.doesNotMatch(dashboard, /<Card\b/);
  assert.ok((dashboard.match(/<PrimaryFinancialCard/g) ?? []).length >= 3);
  assert.ok((dashboard.match(/<Section/g) ?? []).length >= 2);
  assert.doesNotMatch(analytics, /<Card\b|flat-card/);
  assert.match(analytics, /Bu oyning asosiy signali/);
});

test("motion remains subtle and is disabled for reduced-motion users", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.money-transition/);
  assert.match(css, /\.chart-enter/);
  assert.match(css, /animation: none !important/);
});

test("shared Sheet retains a fixed footer and keyboard focus trap", () => {
  const ui = read("src/components/ui.tsx");
  assert.match(ui, /e\.key !== "Tab"/);
  assert.match(ui, /sticky bottom-0/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-modal="true"/);
});
