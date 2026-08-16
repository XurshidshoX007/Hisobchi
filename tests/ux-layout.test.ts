import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8");
const fab = readFileSync(new URL("../src/components/fab.tsx", import.meta.url), "utf8");
const plans = readFileSync(new URL("../src/app/plans/page.tsx", import.meta.url), "utf8");
const planFilter = readFileSync(new URL("../src/components/plan-status-filter.tsx", import.meta.url), "utf8");

test("mobile chrome uses shared geometry instead of magic FAB offsets", () => {
  for (const variable of ["--bottom-nav-height", "--fab-size", "--fab-gap"]) {
    assert.match(css, new RegExp(variable));
  }
  assert.match(css, /--app-safe-area-bottom:[\s\S]*env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /bottom:\s*calc\(var\(--app-safe-area-bottom\) \+ var\(--bottom-nav-height\) \+ var\(--fab-gap\)\)/);
  assert.doesNotMatch(shell, /148px/);
  assert.doesNotMatch(css, /bottom:\s*(72|80)px/);
});

test("AppShell mounts one global FAB and reserves contextual scroll clearance", () => {
  assert.equal((shell.match(/<GlobalAddFab\s*\/>/g) ?? []).length, 1);
  assert.match(shell, /hasGlobalFab \? "has-global-fab"/);
  assert.match(css, /\.app-shell-layout\.has-global-fab/);
  assert.match(css, /--z-bottom-nav:\s*40/);
  assert.match(css, /--z-fab:\s*50/);
  assert.match(css, /--z-sheet:\s*80/);
});

test("global FAB remains solid and exposes the required dialog semantics", () => {
  assert.match(fab, /bg-primary text-primary-fg/);
  assert.match(fab, /aria-label="Qo‘shish"/);
  assert.match(fab, /aria-expanded=\{open\}/);
  assert.match(fab, /aria-haspopup="dialog"/);
  assert.doesNotMatch(fab, /bg-primary\//);
});

test("plans share one compact single-select status filter", () => {
  assert.equal((plans.match(/<PlanStatusFilter/g) ?? []).length, 2);
  assert.doesNotMatch(plans, /STATUS_TABS/);
  for (const label of ["Faol", "Pauza", "Yakunlangan", "Bekor qilingan"]) {
    assert.match(planFilter, new RegExp(label));
  }
  assert.match(planFilter, /To‘lovlarni filtrlash/);
  assert.match(planFilter, /aria-expanded=\{open\}/);
  assert.doesNotMatch(planFilter, /Apply|Qo‘llash/);
});
