import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => {
  // Frontend fayli bo'lsa — o'z papkamizdan, shared modul bo'lsa —
  // ../../shared/src/lib dan o'qiladi (copy/money/finance...).
  const local = new URL(`../src/${path}`, import.meta.url);
  if (path.startsWith("lib/") && !existsSync(local)) {
    return readFileSync(new URL(`../../shared/src/${path}`, import.meta.url), "utf8");
  }
  return readFileSync(local, "utf8");
};

const history = read("pages/transactions.tsx");
const css = read("globals.css");
const component = read("components/swipe-actions.tsx");

test("History row actions are swipe-revealed, never permanently visible", () => {
  assert.match(history, /@\/components\/swipe-actions/);
  assert.match(history, /<SwipeActions/);
  assert.match(history, /actions=\{/);
  // The old visibility pattern (always shown on mobile, hover-only on
  // desktop) must not come back — reveal is the gesture's job now.
  assert.doesNotMatch(history, /sm:opacity-0 sm:group-hover:opacity-100/);
  // The page owns a single open row.
  assert.match(history, /const \[openRowId, setOpenRowId\] = useState<number \| null>\(null\)/);
  assert.match(history, /open=\{openRowId === transaction\.id\}/);
  assert.match(history, /onOpenChange=\{\(next\) => setOpenRowId\(next \? transaction\.id : null\)\}/);
});

test("the swipe reveal width is shared between the component and the CSS", () => {
  const width = component.match(/export const SWIPE_ACTIONS_WIDTH = (\d+)/)?.[1];
  assert.ok(width, "SWIPE_ACTIONS_WIDTH must be exported");
  assert.match(css, new RegExp(`--swipe-actions-reveal:\\s*${width}px`));
  // The underlay geometry that justifies the number: 2 × 36px buttons,
  // 2px gap, 4px inset per side.
  assert.match(component, /absolute inset-y-0 right-0 flex items-center gap-0\.5 px-1/);
});

test("pointer reveal is hover-gated and keyboard reveal is always available", () => {
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.swipe-actions:hover \.swipe-actions-foreground/);
  assert.match(css, /\.swipe-actions:focus-within \.swipe-actions-foreground/);
  assert.match(css, /\.swipe-actions-foreground[\s\S]*?translateX\(calc\(-1 \* var\(--swipe-actions-reveal\)\)\)/);
  // Reduced motion collapses the snap animation like every other motion.
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.swipe-actions-foreground/);
});

test("the gesture keeps vertical scroll native and claims only horizontal drags", () => {
  // pan-y + preventDefault only after the horizontal lock.
  assert.match(component, /touchAction: "pan-y"/);
  assert.match(component, /addEventListener\("touchmove", onTouchMove, \{ passive: false \}\)/);
  assert.match(component, /Vertical intent — hand the gesture back to native scrolling/);
  // State machine: rubber-band, snap ratio, flick and one-open-row event.
  assert.match(component, /SNAP_RATIO/);
  assert.match(component, /FLICK_MS/);
  assert.match(component, /rubber-band|Rubber-band/);
  assert.match(component, /ACTIVATE_EVENT/);
  // The lift-the-finger click that would otherwise toggle a hidden action.
  assert.match(component, /onClickCapture/);
});

test("an open row never moves the document: the strip is clipped to the row", () => {
  assert.match(component, /swipe-actions relative min-w-0 overflow-hidden/);
  // The covering foreground is opaque so hidden actions never bleed through.
  assert.match(component, /swipe-actions-foreground relative bg-bg/);
});
