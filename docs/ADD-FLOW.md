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
| `/transactions` History (any filter) | Kirim · Chiqim · Transfer | `QuickAddSheet` | `transaction.create/update` |
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
page → FAB (z 50) → bottom nav (z 40) → sheet overlay/sheet (z 80)
```

While any sheet is open, `document.body[data-sheet-open]` makes the FAB recede
(opacity 0, `pointer-events: none`), so it can never sit above a modal and a
second tap cannot open a sheet behind the overlay.

## 6. Guards

`tests/form-kit.test.ts` covers the pure behaviour (amount formatting,
ranking, chips, defaults, dirty detection, success copy).
`tests/add-flow.test.ts` is structural: it fails the build if a screen
re-introduces its own add button, its own sheet footer, its own amount input or
its own unsaved-data dialog.
