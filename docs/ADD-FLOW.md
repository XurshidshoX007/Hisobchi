# Global “+” Add Flow — action map & form grammar

> **Qoida:** “Qo‘shish jarayoni foydalanuvchini emas, foydalanuvchining
> maqsadini kuzatishi kerak.”
>
> ONE global FAB → context action → ONE sheet grammar → ONE primary action.

## 1. Audit — every creation entry point

The Global FAB architecture (`FabProvider` / `GlobalAddFab` / `getFabActions()` /
`useFabPage()`) is the **only** creation entry point in the product. Pages own
the sheets; the FAB owns the decision of *which* sheet a context may open.

| Route (+ context) | FAB actions | Sheet opened | Mutation (unchanged) |
| --- | --- | --- | --- |
| `/` Dashboard | Kirim · Chiqim · Transfer | `QuickAddSheet` | `transaction.create` |
| `/transactions` History | — (read/filter/edit/delete only) | `QuickAddSheet` for an existing row only | `transaction.update/delete` |
| `/plans` → To‘lovlar | To‘lov rejasi (1 → opens directly) | `RecurringSheet` | `recurring.create/update` |
| `/plans` → Daromad | Kutilayotgan daromad (1 → opens directly) | `IncomeSheet` | `expectedIncome.create/update` |
| `/plans` → Cash-flow | — (analysis only) | — | — |
| `/analytics` | — (interpretation only) | — | — |
| `/accounts` → Hisoblar | Hisob | `AccountSheet` | `account.create/update` |
| `/accounts` → Kategoriyalar | Kategoriya | `CategorySheet` | `category.create/update` |
| `/debts` | Qarz | `DebtSheet` | `debt.create/update` |
| `/goals` | Maqsad | `GoalSheet` | `goal.create/update` |
| `/budgets` | Budjet | `BudgetSheet` | `budget.upsert` |
| `/more` Menu | Hisob · Qarz · Maqsad · Budjet · Kategoriya | routes to the owning page, which opens **its own** sheet | as above |
| `/settings`, `/bot` | — | — | — |
| Reminder / Eslatma | **not offered** — the product has no user-facing reminder-creation mutation, so the flow is not invented | — | — |

Secondary (non-creation) sheets that intentionally keep their own confirm
grammar: `PlanActionsSheet`, `CancelPlanConfirm`, `RestorePlanConfirm`,
transaction `DeleteConfirm`. Status/Edit/Delete/Pause never live inside a
creation form.

## 2. Universal interaction pattern

```
OPEN → (CHOOSE TYPE only if the context genuinely has several) → CORE DATA
     → OPTIONAL DETAILS (collapsed) → PREVIEW → SAVE → SUCCESS
```

A context with exactly one action never shows an action sheet: `+` opens the
form directly (Plans → To‘lovlar, Debts, Goals, Budgets, Accounts…).

## 3. Shared kit

Pure, testable helpers — `src/lib/form-kit.ts`:

| Helper | Purpose |
| --- | --- |
| `formatAmountInput` / `parseAmountInput` | live `1 200 000` grouping; the stored numeric value never changes |
| `amountError` | one validation vocabulary (“Summani kiriting”, “Summa 0 dan katta bo‘lishi kerak”) |
| `rankCategoryIds` | recent-first, then frequent — no 30-item grid |
| `dateQuickChips` | Bugun / Kecha / Oldingi kun |
| `resolveDefaultAccountId`, `lastAccountId` | smart, visible, editable account default |
| `isDirtyDraft` | unsaved-data prompt only when data is meaningful |
| `savedMessage` | “150 000 so‘mlik chiqim saqlandi” |

UI primitives — `src/components/form-kit.tsx`:

`FormSheet` (header/body/footer + one CTA + state machine + unsaved guard +
error banner & retry), `AmountField`, `CategoryPicker`, `DateField`,
`AccountPicker`, `NoteField`, `AdvancedSection`, `PreviewCard`, `Chip`,
`ChoiceList`, `haptic()`.

Layout primitives (§6) — `FormSection` (= `FormGroup`), `FormRow`,
`FormActions`, `ChoiceGrid`, `CompactSegmented`. Pages compose these instead of
inventing per-screen grids, chip rows or type switches.

## 4. Field budget per form

| Form | Default (visible) fields | Collapsed |
| --- | --- | --- |
| Operatsiya (chiqim/kirim) | summa · kategoriya · sana · hisob | izoh, tabiiy til |
| Transfer | summa · qayerdan · qayerga · sana | izoh |
| To‘lov rejasi | nomi · summa · tur · sana (+ type-specific) · preview | kategoriya, hisob, majburiylik, holat |
| Kutilayotgan daromad | manba · summa · tur · sana · preview | kategoriya, hisob, holat, izoh |
| Qarz | yo‘nalish · shaxs · summa · muddat | izoh |
| Maqsad | nomi · kerakli summa · preview | hozirgi summa, ikona, muddat, oylik |
| Budjet | kategoriya · limit · oy · preview | — |
| Hisob | nomi · turi · boshlang‘ich balans | — |
| Kategoriya | turi · nomi | ikona, muhimlik, ota kategoriya |

## 5. Layers

```
page → bottom nav (z 40) → FAB (z 50) → sheet overlay/panel (z 80)
```

While any sheet is open, `document.body[data-sheet-open]` makes the FAB recede
(opacity 0, `pointer-events: none`), so it can never sit above a modal and a
second tap cannot open a sheet behind the overlay.

`ContextualBottomSheet` is the only motion primitive for Add, Filter, action
menus and confirms. It retains DOM presence through a 260ms bottom-to-top enter
and 210ms top-to-bottom exit; backdrop and panel share one easing/state. See
[`CONTEXTUAL-SHEET-MOTION.md`](./CONTEXTUAL-SHEET-MOTION.md) for the audit.

## 6. Responsive contract — the add flow is horizontally LOCKED

A form sheet has **exactly one scroll axis: vertical**. Horizontal scrolling is
allowed in exactly one place in the product: a genuinely long *navigation* tab
strip (`Segmented` in `ui.tsx`, e.g. Plans tabs). Never for
form fields, choice controls, button groups or summary cards.

### Why the sheet used to drift sideways

1. **A page-level intrinsic width leaked into the sheet.** A single-column
   `grid gap-*` (no `grid-cols-1`) creates an implicit **`auto`** track, whose
   minimum is the *min-content* of its widest item. A `truncate` (i.e.
   `white-space: nowrap`) account/goal/category name contributes its FULL text
   width there, so the grid grew to ~407px inside a 320px screen. On mobile the
   layout viewport then expands to the content (`innerWidth` 422 vs
   `clientWidth` 320) — and because `position: fixed` is sized by that layout
   viewport, **the sheet itself became 422px wide and panned with the page.**
   Fix: single-column grids declare `grid-cols-1` → `repeat(1, minmax(0,1fr))`.
2. **The sheet body was an implicit x-scroller.** `overflow-y: auto` with
   `overflow-x: visible` computes to `overflow-x: auto` in CSS. Any child wider
   than the body (a nowrap chip row, a two-chip `flex` row) produced a real
   horizontal scrollbar inside the sheet. Fix: `.sheet-body` states
   `overflow-x: hidden` explicitly — *after* the offending children were fixed.
3. **Form controls scrolled sideways on purpose.** Category / account / date
   chip rows, the amount ladder and the scrollable `Segmented` were nested
   horizontal scrollers inside a vertical scroller. Fix: they wrap now
   (`ChipRow`, `FormActions`) or became a grid (`ChoiceGrid`).

### Geometry

| Layer | Rule |
| --- | --- |
| `.sheet-layer` | `position: fixed`, `width: 100%`, `max-width: 100vw`, Telegram/dynamic viewport height; no overflow clipping used to hide width bugs |
| `.sheet-dialog` | `width: 100%`, `max-width: 100vw`, `min-width: 0`, `max-h-[92dvh]`, desktop `max-w-[520px]`; bottom-aligned at every breakpoint |
| `.sheet-body` | the ONLY scroll container: `overflow-y: auto`, `overflow-x: hidden`, `overscroll-behavior: contain` |
| `.sheet-form > *` | `min-width: 0`, `max-width: 100%` — one shared rule instead of per-component patches |
| `.sheet-footer` | `width: 100%`, wrapping button row, safe-area padding |

### Choice controls

| Primitive | Use |
| --- | --- |
| `ChoiceGrid` | radio-style choices: `repeat(n, minmax(0,1fr))`, `gap: 8px`, 44–48px targets, wrapping labels, `role="radiogroup"` + roving focus |
| `CompactSegmented` | the small type switch at the top of a form (Chiqim · Kirim · Transfer) |
| `Chip` | pill selection inside a **wrapping** row; long values shrink and ellipsize |
| `FormRow` | two controls side by side ≥380px, stacked below, both tracks `minmax(0,1fr)` |
| `FormActions` | wrapping button group — three buttons are never squeezed into one line |
| `Segmented` (`ui.tsx`) | **navigation only** — keeps its horizontal scroll for long tab sets |

Selection never changes geometry: both states carry one 1px border and the
active state adds an **inset ring** (`ring-2 ring-inset`) plus `accent-soft`
background — no border-width switch, no negative margins, no border overlap.

## 7. Guards

`tests/form-kit.test.ts` covers the pure behaviour (amount formatting,
ranking, chips, defaults, dirty detection, success copy).
`tests/add-flow.test.ts` is structural: it fails the build if a screen
re-introduces its own add button, its own sheet footer, its own amount input or
its own unsaved-data dialog.
`tests/add-flow-responsive.test.ts` guards the geometry above: sheet layer /
dialog / body rules, no horizontal scroller inside a form, grid-based choice
controls with inset-ring selection, `minmax(0,1fr)` tracks and single-column
page grids that cannot stretch the mobile layout viewport.
