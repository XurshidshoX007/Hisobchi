# Plans tab swipe navigation

Design + implementation plan. Status: **proposal** (2026-08-23). Owner scope: `/plans` page
(`src/app/plans/page.tsx`) — the three sections **To‘lovlar → Daromad → Pul oqimi**.

---

## 1. Problem and goal

Today the three Plans sections can only be switched by tapping the `Segmented` tab strip
pinned at the top of the page. On a tall phone the strip leaves the thumb zone as soon as
the user scrolls a list, so every switch is a scroll-up + reach + tap.

**Goal:** let the user switch sections with a horizontal swipe anywhere on the section
content, following the finger, with the tab strip remaining the visible source of truth.

**Success criteria:**

- One fluid horizontal gesture moves To‘lovlar ⇄ Daromad ⇄ Pul oqimi (adjacent hops only).
- Vertical scrolling stays 100 % native — a diagonal pull never nudges the page sideways.
- Zero regressions in the gestures this app already ships (swipe-back, row swipe-actions,
  sheet interactions, horizontal chart scroll).
- 60 fps on a mid-range Android inside Telegram WebView; respects `prefers-reduced-motion`.

---

## 2. Current-state audit (grounded)

| Fact | Where |
| --- | --- |
| Tabs are `type Tab = "payments" \| "income" \| "cashflow"` local state, switched by `Segmented` | `src/app/plans/page.tsx` (top of `PlansPage`) |
| Only the ACTIVE tab is mounted — `{tab === "payments" ? … : null}` ×3 | same file |
| `Segmented` is a real `role="tablist"` with ArrowLeft/Right/Home/End keyboard nav; its labels row is horizontally scrollable (`data-segmented-scroll`, `overscroll-x-contain`) | `src/components/ui.tsx` → `Segmented` |
| `/plans` is a PRIMARY route → `<SwipeBack enabled={isSub}>` is **disabled** here; no swipe-back conflict on this page | `src/components/app-shell.tsx`, `src/lib/navigation.ts` |
| An open sheet sets `document.body.dataset.sheetOpen = "1"` | `src/components/ui.tsx` (Sheet effect, ~L384/L422) |
| Established gesture conventions: raw touch listeners, per-frame state in refs, direct style writes, re-render only on commit; axis lock at **6 px** (`LOCK_PX`); flick = **20 px / 250 ms**; snap ratio **0.45**; page-level back threshold **0.28 × viewport**; settle curve **280 ms `cubic-bezier(0.22, 1, 0.36, 1)`**; overflow clipped via a temporary `body[data-swipe-back]` attribute | `src/components/swipe-actions.tsx`, `src/components/swipe-back.tsx`, `src/app/globals.css` |
| Telegram haptics helper `lightImpact()` (`HapticFeedback.impactOccurred("light")`, try/catch, never fatal) | `src/components/swipe-actions.tsx` (~L55) |
| `prefers-reduced-motion` is already honoured globally | `src/app/globals.css` (~L610) |
| No animation/gesture dependency (and no intent to add one — see `docs/CONTEXTUAL-SHEET-MOTION.md`) | `package.json` |

### Conflict map inside the three sections

| Zone | Risk | Verdict |
| --- | --- | --- |
| Plan rows (payments/income) | None — rows on this page have NO horizontal row-swipe (that lives only in History) | Free for page swipe |
| `•••` menus, forms, confirms | All are Sheets | Blocked via `data-sheet-open` guard |
| **Pul oqimi** — `<div className="overflow-x-auto …"><CashFlowStrip/></div>` | Real horizontal scroller | Must be excluded from tab swipe while it can scroll |
| `Segmented` strip itself (`data-segmented-scroll`) | Scrollable when labels overflow | Excluded generically |
| Pul oqimi month nav ‹ › | Plain tap buttons | No conflict |
| System edges (iOS back-edge, Android gesture nav both edges) | OS steals the gesture | Dead zones at both edges |
| Global FAB reacts to `{ tab }` via `useFabPage` | Must keep switching actions with the committed tab | Commit-only state change |

---

## 3. Design decision

**Build one reusable, dependency-free `<TabSwipe>` component in `src/components/tab-swipe.tsx`**
that mirrors the codebase's existing gesture style (raw listeners + refs + direct DOM writes,
React re-renders only when the committed value changes).

```tsx
type TabSwipeProps<T extends string> = {
  value: T;                          // committed tab — changes ONLY on swipe commit
  order: readonly T[];               // ["payments", "income", "cashflow"]
  onChange: (next: T) => void;
  render: (tab: T) => React.ReactNode;
  className?: string;
};
```

### Rendering model — *ghost pane*, not a 300 %-wide track

The active pane stays in normal flow. The moment a horizontal drag locks, the adjacent pane
in the drag direction is mounted as an absolutely positioned **ghost** beside the active one;
both translate with the finger via direct `style.transform` writes. This is the smallest
possible change to the page's mount model:

- Inactive panes stay unmounted at rest — identical cost to today (no always-mounted chart,
  no hidden-list observers, identical memory/scroll semantics).
- Only one extra React render happens per gesture (ghost mount on lock; cleanup on settle).
- No page-wide horizontal overflow games — the same temporary `body[data-tab-swipe] →
  overflow-x: clip` pattern as `swipe-back` guards the two frames during the gesture.

### The gesture engine follows `swipe-actions` / `swipe-back` mechanics

1. **touchstart** (passive): bail if `data-sheet-open` is set; bail if the touch starts within
   **24 px of either screen edge** (OS edge gestures); bail if `target.closest(
   "[data-tab-swipe-ignore], [data-segmented-scroll]")` matches, or if any ancestor is a
   horizontal scroller that can still move in the swipe direction
   (`scrollWidth > clientWidth` and not at the relevant edge). Record `startX/startY`.
2. **touchmove** (`passive: false`): do nothing until displacement ≥ **6 px**, then decide the
   axis once. Vertical wins → abort permanently (`touch-action: pan-y` means the browser has
   been scrolling natively all along). Horizontal wins → `preventDefault()` from now on,
   mount the ghost pane once, and translate both panes `dx` per frame.
3. **Boundary (first tab swiping right / last tab swiping left):** rubber-band —
   `rendered = dx × 0.3`, capped at ~60 px, no ghost pane, then spring back. This gives the
   "you're at the end" hint without inventing a new visual language.
4. **touchend:** commit if `|dx| ≥ 0.28 × viewportWidth` **or** the release was a flick
   (≥ 20 px within 250 ms with consistent direction — same constants as History rows).
   Otherwise spring back. Settle uses the house curve: `280 ms cubic-bezier(0.22, 1, 0.36, 1)`.
   On commit: `lightImpact()` haptic + `onChange(next)`.
5. **Cleanup:** after the settle transition, unmount the ghost and clear inline transforms —
   the DOM returns to exactly today's shape: one mounted pane, no transforms.

### Why not the alternatives

- **Gesture library / carousel (embla, swiper, react-swipeable):** the repo deliberately has
  zero animation/drawer dependencies; hand-rolled gestures are the house style and keep the
  bundle and the haptics/curve vocabulary identical to the rest of the app.
- **Flick-only switch with a fade (no follow-finger):** simpler, but loses the physical
  "page follows finger" feedback that makes swipe discoverable. Kept as the reduced-motion
  fallback instead.
- **CSS scroll-snap pager:** panes have wildly different heights; nested vertical scroll
  inside a horizontally snapping scroller is janky on iOS/WebView (scroll chaining), turns
  "which tab am I on" into scroll-position state, and fights the mount-on-demand model.

---

## 4. UX specification (designer view)

| Aspect | Spec |
| --- | --- |
| Gesture affordance | Follow-finger: content sticks to the finger 1:1 from the first locked pixel |
| Direction map | Swipe left → next section (To‘lovlar→Daromad→Pul oqimi); swipe right → previous |
| Commit | 28 % of viewport width, or a quick flick (~20 px / 250 ms) |
| Cancel | Anything short of that springs back with the 280 ms house curve |
| End-of-list | Rubber-band ~30 % drag factor, ≤ 60 px, then release-back — no bounce tab change |
| Tab strip | Active pill updates on commit (existing `Segmented` transition). The strip itself is unchanged, tappable and keyboard-navigable — swipe is an *additional* modality, never the only one |
| Haptics | One light Telegram impact on commit, same `lightImpact()` as History rows |
| Reduced motion | `@media (prefers-reduced-motion: reduce)`: no follow-finger, no rubber-band; a committed flick switches instantly |
| State preservation | Per-section state (`planTab`, `incomeTab`, `cashMonth`) lives in the page component, not in panes → survives every swipe, exactly as today on tap-switch |
| Scroll position | Inactive panes unmount on settle (same as today). No new scroll-restoration promise is made |
| During-animation input | A new touch during the 280 ms settle is ignored (engine owns an `animating` flag); taps keep working |

---

## 5. Implementation plan (phases)

### Phase 1 — `src/components/tab-swipe.tsx` (new, ~230 lines)

- `<TabSwipe>` + internal gesture engine as specced in §3.
- Export two **pure helpers for unit tests**, mirroring how finance logic is testable in `lib/`:
  - `decideSwipeCommit({ dx, vx, width }) → boolean`
  - `swipeTarget(current, order, dx) → next | null` (null = boundary/rubber-band)
- `touch-action: pan-y` on the root; `will-change: transform` applied only while dragging.
- Temporary `body[data-tab-swipe]` attribute during the gesture; add the matching
  `overflow-x: clip` rule in `globals.css` next to the existing `data-swipe-back` rule.
- `lightImpact` is imported from `swipe-actions.tsx` (export it there if not already).

### Phase 2 — wire into `src/app/plans/page.tsx`

- Replace the three `{tab === "x" ? … : null}` conditionals with one
  `<TabSwipe value={tab} order={TAB_ORDER} onChange={setTab} render={renderTab} />`,
  where `renderTab` returns today's exact JSX per tab (moved as-is; CashflowTab gets its
  existing props unchanged).
- `Segmented` stays where it is; `useFabPage({ tab }, …)` and the routed-create `consume()`
  effect are untouched — they react to the same committed `tab` state.
- Tag the ghost pane container with `aria-hidden="true"` while dragged so screen readers
  never see two tab trees at once.

### Phase 3 — conflict annotations

- Add `data-tab-swipe-ignore` to the `overflow-x-auto` CashFlowStrip wrapper in
  `CashflowTab` (the engine also auto-detects `[data-segmented-scroll]` and generic
  horizontal scrollers, but the chart strip gets an explicit, future-proof marker).

### Phase 4 — motion polish & accessibility

- Reduced-motion branch; settle-time input lock; ghost `aria-hidden`; confirm the Segmented
  pill transition reads as connected to the swipe direction (it already animates `transition-all`).
- Manual pass on 320 px and on desktop (touch listeners simply never fire with a mouse —
  verified in person, no pointer emulation).

### Phase 5 — verification

- `tests/tab-swipe.test.ts` (tsx --test, same style as the existing suite):
  - commit/cancel decision table (distance vs flick vs boundary `null`);
  - direction mapping (`payments`→left→`income`; `cashflow`→left→`null`).
- `npm run lint && npm run typecheck && npm test` — all green.
- Manual script (device or DevTools touch emulation), see §7.

### Phase 6 — docs

- Keep this file as the reference; add one line to the swipe-back/swipe-actions headers noting
  the sibling gesture on `/plans` so the next contributor knows all three coexist by design
  (edge-gated vs row-scoped vs page-scoped).

---

## 6. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Diagonal scroll hijacks vertical list scrolling | 6 px axis lock + `pan-y` + abort-on-vertical; identical to History rows |
| Chart strip (Pul oqimi) can't be scrolled horizontally | `data-tab-swipe-ignore` + generic scrollable-ancestor detection |
| Swipe fires while a sheet/menu is closing | `data-sheet-open` guard on touchstart, same as swipe-back |
| Ghost pane flashes wrong height/bg during drag | Ghost is absolutely positioned over `bg-bg`; both panes translate together; overflow clipped via `body[data-tab-swipe]` |
| Double-swipe mid-settle corrupts state | `animating` flag swallows touches until cleanup |
| Jank on low-end WebView | No re-render during move (refs + style writes only); ≤2 re-renders per gesture; compositor-only `transform` |
| RTL/locale future | Direction table is one map (`order` array); flipping it flips the gesture |

---

## 7. Acceptance criteria

1. To‘lovlar → (swipe left) → Daromad → (swipe left) → Pul oqimi and back, thumb-only,
   while scrolled halfway down a list.
2. A slow diagonal pull down a long payments list scrolls vertically — zero sideways shift.
3. CashFlowStrip still scrolls horizontally inside Pul oqimi; its swipe never changes the tab.
4. With any sheet open (filter, add, •••), swipes do nothing.
5. Swipe starting in the outer 24 px of the screen does nothing (OS keeps its edges).
6. Tab strip pill, FAB action and deep-linked create flow all follow the committed tab.
7. `prefers-reduced-motion`: instant switch, no drag physics.
8. Keyboard: `Tab`→ tab strip → Arrow keys — unchanged behaviour.
9. CI: lint, typecheck and the full tsx test suite pass.
