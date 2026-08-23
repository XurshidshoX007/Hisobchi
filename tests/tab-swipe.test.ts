import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canScrollHorizontally,
  COMMIT_RATIO,
  decideSwipeCommit,
  EDGE_ZONE,
  FLICK_MS,
  FLICK_PX,
  LOCK_PX,
  RESET_DURATION,
  RESET_EASING,
  rubberBandDisplacement,
  swipeTarget,
} from "../src/lib/tab-swipe";
import { TAB_ORDER } from "../src/app/plans/page";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const plansPage = read("app/plans/page.tsx");
const globalsCss = read("app/globals.css");
const tabSwipeComponent = read("components/tab-swipe.tsx");
const swipeActions = read("components/swipe-actions.tsx");
const tabSwipeLib = read("lib/tab-swipe.ts");

/* ============================ Pure helper tests ============================ */

test("TAB_ORDER defines the exact 3 sections in sequential order", () => {
  assert.deepEqual(TAB_ORDER, ["payments", "income", "cashflow"]);
});

test("swipeTarget correctly maps horizontal displacement to adjacent sections", () => {
  // From payments
  assert.equal(swipeTarget("payments", TAB_ORDER, -50), "income", "swipe left from payments moves to income");
  assert.equal(swipeTarget("payments", TAB_ORDER, 50), null, "swipe right from payments is boundary (rubber-band)");

  // From income
  assert.equal(swipeTarget("income", TAB_ORDER, -50), "cashflow", "swipe left from income moves to cashflow");
  assert.equal(swipeTarget("income", TAB_ORDER, 50), "payments", "swipe right from income moves to payments");

  // From cashflow
  assert.equal(swipeTarget("cashflow", TAB_ORDER, -50), null, "swipe left from cashflow is boundary (rubber-band)");
  assert.equal(swipeTarget("cashflow", TAB_ORDER, 50), "income", "swipe right from cashflow moves to income");

  // Zero displacement / unknown
  assert.equal(swipeTarget("payments", TAB_ORDER, 0), null, "zero displacement has no target");
  assert.equal(swipeTarget("unknown" as "payments", TAB_ORDER, -50), null, "unknown tab has no target");
});

test("decideSwipeCommit accurately distinguishes flicks, distance thresholds, and cancels", () => {
  const width = 360;

  // 1. Distance threshold (>= 28% of width = 100.8px)
  assert.equal(
    decideSwipeCommit({ dx: -105, width, elapsedMs: 600 }),
    true,
    "distance >= 28% commits regardless of slow duration",
  );
  assert.equal(
    decideSwipeCommit({ dx: 105, width, elapsedMs: 600 }),
    true,
    "positive distance >= 28% commits",
  );
  assert.equal(
    decideSwipeCommit({ dx: -60, width, elapsedMs: 600 }),
    false,
    "slow distance < 28% does not commit",
  );

  // 2. Flick commit (>= 20px within <= 250ms)
  assert.equal(
    decideSwipeCommit({ dx: -25, width, elapsedMs: 150 }),
    true,
    "quick flick >= 20px within 250ms commits",
  );
  assert.equal(
    decideSwipeCommit({ dx: 25, width, elapsedMs: 200 }),
    true,
    "positive quick flick commits",
  );
  assert.equal(
    decideSwipeCommit({ dx: -15, width, elapsedMs: 100 }),
    false,
    "fast flick with displacement < 20px does not commit",
  );
  assert.equal(
    decideSwipeCommit({ dx: -25, width, elapsedMs: 350 }),
    false,
    "displacement >= 20px exceeding flick time window does not flick-commit",
  );

  // 3. Velocity-based commit
  assert.equal(
    decideSwipeCommit({ dx: -20, width, vx: 0.1 }),
    true,
    "velocity >= threshold commits",
  );

  // 4. Edge cases
  assert.equal(decideSwipeCommit({ dx: -100, width: 0 }), false, "zero width does not commit");
});

test("rubberBandDisplacement dampens and caps boundary pull", () => {
  // 30% factor
  assert.equal(rubberBandDisplacement(100), 30);
  assert.equal(rubberBandDisplacement(-100), -30);

  // Capped at 60px
  assert.equal(rubberBandDisplacement(300), 60);
  assert.equal(rubberBandDisplacement(-300), -60);
  assert.equal(rubberBandDisplacement(1000), 60);
  assert.equal(rubberBandDisplacement(-1000), -60);
});

test("canScrollHorizontally honours explicit ignore markers and invalid elements", () => {
  assert.equal(canScrollHorizontally(null, null, -10), false);

  // Simulated element with data-tab-swipe-ignore
  const dummyIgnoreEl = {
    closest: (selector: string) => (selector.includes("data-tab-swipe-ignore") ? {} : null),
    parentElement: null,
    scrollWidth: 100,
    clientWidth: 100,
  } as unknown as Element;
  assert.equal(canScrollHorizontally(dummyIgnoreEl, null, -10), true);

  // Simulated element with data-segmented-scroll
  const dummySegmentedEl = {
    closest: (selector: string) => (selector.includes("data-segmented-scroll") ? {} : null),
    parentElement: null,
    scrollWidth: 100,
    clientWidth: 100,
  } as unknown as Element;
  assert.equal(canScrollHorizontally(dummySegmentedEl, null, -10), true);
});

/* ============================ Architectural & integration tests ============================ */

test("Plans page integrates TabSwipe with TAB_ORDER and render prop", () => {
  assert.match(plansPage, /import\s*\{\s*TabSwipe\s*\}\s*from\s*["']@\/components\/tab-swipe["']/);
  assert.match(plansPage, /export const TAB_ORDER: readonly Tab\[\] = \["payments", "income", "cashflow"\] as const;/);
  assert.match(plansPage, /<TabSwipe\s+value=\{tab\}\s+order=\{TAB_ORDER\}\s+onChange=\{setTab\}\s+render=\{/);
});

test("CashFlowStrip wrapper carries data-tab-swipe-ignore attribute", () => {
  assert.match(
    plansPage,
    /<div[^>]*data-tab-swipe-ignore[^>]*className="overflow-x-auto[^"]*"\s*>\s*<CashFlowStrip/,
  );
});

test("globals.css scopes overflow-x clip to body[data-tab-swipe]", () => {
  assert.match(globalsCss, /body\[data-tab-swipe\]/);
  assert.match(globalsCss, /body\[data-swipe-back\],\s*body\[data-tab-swipe\]\s*\{\s*overflow-x:\s*clip;\s*\}/);
});

test("swipe-actions.tsx exports lightImpact for shared haptic feedback", () => {
  assert.match(swipeActions, /export function lightImpact\(\)/);
});

test("TabSwipe implements ghost-pane rendering model with aria-hidden", () => {
  // Ghost pane is mounted only when ghostTab is set and carries aria-hidden="true"
  assert.match(tabSwipeComponent, /ghostTab !== null/);
  assert.match(tabSwipeComponent, /aria-hidden="true"/);
  assert.match(tabSwipeComponent, /pointer-events:\s*none|pointerEvents:\s*["']none["']/);
  assert.match(tabSwipeComponent, /style=\{\{\s*touchAction:\s*["']pan-y["']\s*\}\}/);
});

test("TabSwipe enforces gesture constraints and motion specifications", () => {
  // Axis lock at LOCK_PX (6px)
  assert.equal(LOCK_PX, 6);
  assert.match(tabSwipeComponent, /LOCK_PX/);

  // Safe edge zone (24px)
  assert.equal(EDGE_ZONE, 24);
  assert.match(tabSwipeComponent, /EDGE_ZONE/);

  // Flick constants
  assert.equal(FLICK_PX, 20);
  assert.equal(FLICK_MS, 250);

  // Commit ratio (28%)
  assert.equal(COMMIT_RATIO, 0.28);

  // Reset duration and easing
  assert.equal(RESET_DURATION, 280);
  assert.equal(RESET_EASING, "cubic-bezier(0.22, 1, 0.36, 1)");

  // Sheet open guard
  assert.match(tabSwipeComponent, /data-sheet-open/);

  // Temporary body attribute
  assert.match(tabSwipeComponent, /data-tab-swipe/);

  // Reduced motion handling
  assert.match(tabSwipeComponent, /prefers-reduced-motion/);

  // Click capture after dragging
  assert.match(tabSwipeComponent, /onClickCapture/);
});
