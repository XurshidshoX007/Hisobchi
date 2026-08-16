# Contextual sheet motion audit

Audit date: 2026-08-16

## Scope and inventory

The repository has no Framer Motion/Motion dependency and no third-party drawer,
modal or bottom-sheet library. Before this change, every contextual layer already
reached the `Sheet` component in `src/components/ui.tsx`, but the primitive only
owned an enter keyframe. The triggers and content owners were:

| Context | Trigger/content owner | Before | Unified path |
| --- | --- | --- | --- |
| Main transaction add | global `+` → `QuickAddSheet` → `FormSheet` | shared `Sheet`, enter only | `FormSheet` → `ContextualBottomSheet` |
| Multi-action Add Flow | `GlobalFabControl` | shared `Sheet`, enter only | `ContextualBottomSheet` |
| History Filter | floating `FilterButton` → `TransactionFilter` | shared `Sheet`, enter only | `ContextualBottomSheet` |
| Plans payment/income Filter | inline `FilterButton` → `PlanStatusFilter` | shared `Sheet`, enter only | `ContextualBottomSheet` |
| Plans payment / expected income | global `+` → page form | `FormSheet` → shared `Sheet` | `FormSheet` → `ContextualBottomSheet` |
| Accounts, categories, debts, payments, goals, contributions, budgets | global `+` or contextual row action → page form | `FormSheet` → shared `Sheet` | `FormSheet` → `ContextualBottomSheet` |
| Plan menus, cancel/restore confirms, transaction delete, notifications | contextual trigger | shared `Sheet` | compatibility alias to `ContextualBottomSheet` |

There is one portal (`createPortal(..., document.body)`) and one fixed modal
layer. `Sheet` remains only as a backwards-compatible alias, not a second
implementation.

## Duplicate/fragmented motion found

There were not separate Add and Filter drawer components. The inconsistency was
inside the shared behavior and trigger lifecycle:

- `.animate-sheet` / `@keyframes sheet-up` animated **entry only** for 220 ms.
- Closing immediately returned `null`, so no panel or backdrop exit existed.
- The backdrop appeared at full opacity without a transition.
- Mobile used bottom alignment while `sm` changed the dialog to a centered
  modal (`sm:items-center`), changing the apparent travel origin.
- Clearing page-owned selected records could remove or change content before a
  close animation was possible.
- Body scroll lock and focus return ended as soon as `open` became false rather
  than when visual presence ended.
- Add's FAB had a local re-entry guard while Filter opened directly. The sheet
  itself had no rapid reversal state machine.

Other transforms found by the repository scan are unrelated: page fade-up,
toast pop, navigation indicator/icon feedback, chart tooltips and the settings
toggle. They do not position a contextual overlay.

## Root cause

The former primitive coupled DOM presence to the `open` prop:

```text
open=false → return null
```

That made a close transition impossible and let content/state cleanup happen in
the same frame. Entry was a one-shot keyframe, while backdrop visibility and
scroll/focus behavior were separate immediate side effects. The desktop
breakpoint also changed final positioning from bottom to center. Different
content heights and autofocus then made otherwise shared sheets look as if they
used different motion.

The historical horizontal drift had two intrinsic-size causes documented in
`ADD-FLOW.md`: implicit single-column grid tracks and controls that could not
shrink. The shared rules (`min-width: 0`, `max-width: 100%`, full-width dialog)
fix those causes. Global `body { overflow-x: hidden }` and layer overflow
clipping are no longer used to conceal page-width defects. The sheet body still
states `overflow-x: hidden` only to prevent CSS from computing an x-axis scroll
container when its required `overflow-y: auto` is active; direct children are
independently constrained.

## Unified primitive

`ContextualBottomSheet` owns:

- one body portal and fixed, bottom-aligned viewport layer;
- panel and backdrop enter/exit from one `data-motion-state` state machine;
- retained DOM/content until `transitionend`, plus a timeout fallback;
- `onExitComplete` hand-offs, so an action menu exits before its next form
  enters instead of rendering two backdrops;
- rapid close/open reversal with cancelled frames/timers;
- stacked-sheet-safe body scroll lock and exact scroll restoration;
- internal vertical scrolling and safe-area footer/bottom padding;
- Escape, backdrop, visible close button and Telegram `BackButton` close paths;
- top-most-sheet-only keyboard handling and Tab focus containment;
- focus entry and focus return after exit;
- `role="dialog"`, `aria-modal`, labelled title/description;
- reduced-motion behavior;
- dynamic viewport height via Telegram's `--tg-viewport-height`, falling back
  to `100dvh` for keyboard/visual viewport changes.

Swipe-to-dismiss was not added because the existing architecture had no swipe
gesture system; introducing a separate gesture animation would violate the one
motion implementation rule.

## Motion tokens and geometry

```css
--motion-duration-fast: 180ms;
--motion-duration-sheet-enter: 260ms;
--motion-duration-sheet-exit: 210ms;
--motion-ease-standard: cubic-bezier(0.22, 1, 0.36, 1);
--motion-distance-sheet: 100%;
```

Closed panel: `translateY(100%)`; open panel: `translateY(0)`. No sheet rule
uses `translateX`, `left` or `right` travel. The backdrop changes opacity `0 →
1` and `1 → 0` with the same state, easing and corresponding duration as the
panel.

All breakpoints finish at the viewport bottom. Mobile is full width; from 640
px the sheet is horizontally centered and capped at 520 px, while staying
bottom-aligned. Content height may differ and is capped at `92dvh` mobile /
`88dvh` larger screens.

Layer order is page → bottom navigation (`40`) → FAB (`50`) → sheet layer
(`80`), with the panel above its backdrop inside the isolated sheet stacking
context. The FAB becomes non-interactive while any sheet presence is mounted.

## Regression guards

`tests/contextual-sheet-motion.test.ts` prevents local Add/Filter portals or
motion, checks motion tokens/direction/backdrop, verifies retained exit
presence, and guards scroll/focus/Escape/Telegram/reduced-motion behavior.
Existing add-flow responsive tests continue to guard intrinsic width, vertical
scrolling, safe form children, 320 px-compatible controls and business mutation
paths.
