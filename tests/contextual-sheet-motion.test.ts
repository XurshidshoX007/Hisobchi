import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Structural regression guards for ONE contextual sheet motion system. */
const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const css = read("app/globals.css");
const ui = read("components/ui.tsx");
const fab = read("components/fab.tsx");
const formKit = read("components/form-kit.tsx");
const transactionFilter = read("components/transaction-filter.tsx");
const planFilter = read("components/plan-status-filter.tsx");

const sheetRule = css.match(/\.sheet-dialog\s*\{[^}]*\}/)?.[0] ?? "";
const openSheetRule = css.match(/\.sheet-layer\[data-motion-state="open"\] \.sheet-dialog\s*\{[^}]*\}/)?.[0] ?? "";
const backdropRule = css.match(/\.sheet-backdrop\s*\{[^}]*\}/)?.[0] ?? "";

/** Add Flow and both Filter entry points must resolve to the exact same primitive. */
test("Add Flow, FormSheet and Filter share ContextualBottomSheet", () => {
  for (const [name, source] of Object.entries({ fab, formKit, transactionFilter, planFilter })) {
    assert.match(source, /import \{ ContextualBottomSheet(?:, [^}]*)? \} from "\.\/ui";/, `${name} imports the shared primitive`);
    assert.match(source, /<ContextualBottomSheet\b/, `${name} renders the shared primitive`);
    assert.doesNotMatch(source, /createPortal|@keyframes|animate-sheet|translate[XY]\(/, `${name} owns no local modal motion`);
  }
  assert.equal((ui.match(/createPortal\(/g) ?? []).length, 1, "one portal implementation");
  assert.match(ui, /export const Sheet = ContextualBottomSheet/);
});

test("sheet enter and exit use one tokenized timing/easing vocabulary", () => {
  assert.match(css, /--motion-duration-sheet-enter:\s*260ms/);
  assert.match(css, /--motion-duration-sheet-exit:\s*210ms/);
  assert.match(css, /--motion-ease-standard:\s*cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(sheetRule, /var\(--motion-duration-sheet-exit\) var\(--motion-ease-standard\)/);
  assert.match(openSheetRule, /transition-duration:\s*var\(--motion-duration-sheet-enter\)/);
  assert.doesNotMatch(css, /@keyframes sheet-|\.animate-sheet/);
});

test("all sheet breakpoints move only bottom to top", () => {
  assert.match(sheetRule, /transform:\s*translateY\(var\(--motion-distance-sheet\)\)/);
  assert.match(openSheetRule, /transform:\s*translateY\(0\)/);
  assert.doesNotMatch(sheetRule + openSheetRule, /translateX|\bleft:|\bright:/);
  assert.match(ui, /sheet-layer fixed inset-0 flex items-end justify-center sm:px-4/);
  assert.doesNotMatch(ui, /sheet-layer[^"\n]*items-center/);
});

test("backdrop and panel enter/exit from the same state machine", () => {
  assert.match(backdropRule, /opacity:\s*0/);
  assert.match(backdropRule, /var\(--motion-duration-sheet-exit\) var\(--motion-ease-standard\)/);
  assert.match(css, /\.sheet-layer\[data-motion-state="open"\] \.sheet-backdrop\s*\{[^}]*opacity:\s*1/);
  assert.match(css, /\.sheet-layer\[data-motion-state="open"\] \.sheet-backdrop\s*\{[^}]*var\(--motion-duration-sheet-enter\)/);
  assert.match(ui, /data-motion-state=\{motionState\}/);
});

test("exit presence survives close and rapid reversal", () => {
  assert.match(ui, /const \[present, setPresent\] = useState\(open\)/);
  assert.match(ui, /else if \(present\)[\s\S]*setMotionState\("closed"\)/);
  assert.match(ui, /event\.propertyName === "transform" && !open[\s\S]*completeExit\(\)/);
  assert.match(ui, /window\.clearTimeout\(exitTimer\)/);
  assert.match(ui, /if \(open\) \{[\s\S]*contentRef\.current = \{ title, subtitle, children, footer \}/);
});

test("sheet-to-sheet actions wait for visual exit instead of doubling backdrops", () => {
  assert.match(ui, /onExitComplete\?: \(\) => void/);
  assert.match(fab, /pendingActionRef/);
  assert.match(fab, /onExitComplete=\{completeActionHandoff\}/);
  assert.match(fab, /setOpen\(false\)[\s\S]*onExitComplete=\{completeActionHandoff\}/);
});

test("shared lifecycle owns scroll, keyboard, Telegram back and focus", () => {
  assert.match(ui, /body\.style\.position = "fixed"/);
  assert.match(ui, /window\.scrollTo\(snapshot\.scrollX, snapshot\.scrollY\)/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(ui, /event\.key !== "Tab"/);
  assert.match(ui, /BackButton/);
  assert.match(ui, /telegramBackButton\?\.onClick/);
  assert.match(ui, /opener\.focus\(\{ preventScroll: true \}\)/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-modal="true"/);
});

test("Telegram viewport, safe area and reduced motion stay in the primitive contract", () => {
  assert.match(css, /--app-viewport-height:\s*var\(--tg-viewport-height, 100dvh\)/);
  assert.match(css, /--app-safe-area-bottom:[\s\S]*--tg-safe-area-inset-bottom/);
  assert.match(css, /\.sheet-footer-safe\s*\{[^}]*var\(--app-safe-area-bottom\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sheet-backdrop,[\s\S]*\.sheet-dialog[\s\S]*0\.01ms/);
});
