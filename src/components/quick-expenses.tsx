"use client";

import { useEffect, useMemo, useState } from "react";
import { formatAmount } from "@/lib/money";
import type { QuickExpenseView } from "@/lib/types";
import { AccountPicker, AmountField, CategoryPicker, FormSheet } from "@/components/form-kit";
import { Icon } from "@/components/icon";
import { useFinance } from "@/components/providers";
import { Button, ContextualBottomSheet } from "@/components/ui";

type Editor = QuickExpenseView | "new" | null;

/**
 * One-tap, user-owned expense shortcuts. These are intentionally not recurring
 * plans: no background job or page visit can create a transaction.
 */
export function QuickExpenses() {
  const { state, mutate, mutating } = useFinance();
  const [editor, setEditor] = useState<Editor>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const presets = state?.quickExpenses ?? [];

  async function record(preset: QuickExpenseView) {
    await mutate("quickExpense", "record", { id: preset.id });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label={`Tezkor xarajatlarni ochish${presets.length ? `, ${presets.length} ta` : ""}`}
        className="group mt-3 flex min-h-9 w-full items-center gap-2 rounded-xl border border-line bg-surface-2/70 px-2.5 text-left transition-[background-color,transform] hover:bg-surface-3 active:scale-[0.98] touch-manipulation"
      >
        <span className="flex -space-x-1.5" aria-hidden="true">
          {presets.slice(0, 3).map((preset, index) => (
            <span key={preset.id} className="grid h-6 w-6 place-items-center rounded-lg border border-surface bg-negative-soft text-negative-text" style={{ zIndex: 3 - index }}>
              <Icon name={preset.icon || "transport"} size={12} />
            </span>
          ))}
          {!presets.length ? <span className="grid h-6 w-6 place-items-center rounded-lg bg-negative-soft text-negative-text"><Icon name="transport" size={12} /></span> : null}
        </span>
        <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold text-fg-soft">Tezkorlar</span>
        {presets.length ? <span className="num text-[10px] font-bold text-muted">{presets.length} ta</span> : <span className="text-[10px] font-semibold text-muted">Sozlang</span>}
        <Icon name="chevron-right" size={13} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </button>

      <ContextualBottomSheet
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Tezkor xarajatlar"
        subtitle="Bir bosishda xarajatni kiritish"
        icon="transport"
        iconTone="negative"
      >
        <div className="space-y-2.5">
          {presets.map((preset) => (
            <div key={preset.id} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface-2 px-3">
              <button
                type="button"
                onClick={() => void record(preset)}
                disabled={mutating}
                aria-label={`${preset.name}: ${formatAmount(preset.amount)} so‘mlik xarajat qo‘shish`}
                className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-70 disabled:opacity-55 touch-manipulation"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-negative-soft text-negative-text" aria-hidden="true">
                  <Icon name={preset.icon || "transport"} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-fg">{preset.name}</span>
                  <span className="num mt-0.5 block text-[12px] font-bold text-negative-text">{formatAmount(preset.amount)} so‘m</span>
                </span>
              </button>
              <button type="button" onClick={() => setEditor(preset)} aria-label={`${preset.name}ni tahrirlash`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-fg-soft active:scale-[0.94] touch-manipulation">
                <Icon name="more" size={16} />
              </button>
            </div>
          ))}
          {presets.length ? null : <p className="rounded-2xl border border-dashed border-line bg-surface-2 px-4 py-5 text-center text-[12px] leading-relaxed text-muted">Metro, avtobus yoki boshqa tez-tez yoziladigan xarajatni qo‘shing.</p>}
        </div>
        <button
          type="button"
          onClick={() => setEditor("new")}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-[13px] font-semibold text-fg-soft transition-colors hover:bg-surface-2 active:scale-[0.98] touch-manipulation"
        >
          <Icon name="plus" size={16} /> Tezkor xarajat qo‘shish
        </button>
      </ContextualBottomSheet>

      <QuickExpenseEditor editor={editor} presets={presets} onClose={() => setEditor(null)} onEdit={setEditor} />
    </>
  );
}

function QuickExpenseEditor({ editor, presets, onClose, onEdit }: { editor: Editor; presets: QuickExpenseView[]; onClose: () => void; onEdit: (value: Editor) => void }) {
  const { state, mutate } = useFinance();
  const transportCategory = useMemo(
    () => state?.flatCategories.find((category) => category.type === "expense" && (category.icon === "transport" || category.name.toLocaleLowerCase("uz").includes("transport"))),
    [state?.flatCategories],
  );
  const firstAccount = state?.accounts.find((account) => account.isActive);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (!editor) return;
    if (editor === "new") {
      setName("Metro");
      setAmount("");
      setCategoryId(transportCategory ? String(transportCategory.id) : "");
      setAccountId(firstAccount ? String(firstAccount.id) : "");
      return;
    }
    setName(editor.name);
    setAmount(formatAmount(editor.amount));
    setCategoryId(editor.categoryId ? String(editor.categoryId) : "");
    setAccountId(editor.accountId ? String(editor.accountId) : "");
  }, [editor, transportCategory, firstAccount]);

  const isEditing = editor !== null && editor !== "new";
  const valid = Boolean(name.trim() && amount.trim() && categoryId && accountId);

  return (
    <FormSheet
      open={editor !== null}
      onClose={onClose}
      title={isEditing ? "Tezkor xarajatni tahrirlash" : "Tezkor xarajat"}
      subtitle="Faqat siz bosganingizda xarajat yaratiladi"
      icon="transport"
      iconTone="positive"
      submitLabel={isEditing ? "Saqlash" : "Qo‘shish"}
      canSubmit={valid}
      dirty={Boolean(name || amount || categoryId || accountId)}
      onSubmit={async () => {
        const result = await mutate("quickExpense", isEditing ? "update" : "create", {
          ...(isEditing ? { id: editor.id } : {}), name, amount, categoryId, accountId,
        });
        return result;
      }}
    >
      {presets.length && !isEditing ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button key={preset.id} type="button" onClick={() => onEdit(preset)} className="rounded-full border border-line bg-surface-2 px-3 py-2 text-[12px] font-semibold text-fg-soft active:scale-[0.97] touch-manipulation">
              {preset.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Nomi</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Masalan, Metro" className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-base outline-none transition-colors placeholder:text-muted focus:border-accent focus:bg-surface" />
        </label>
        <AmountField value={amount} onChange={setAmount} currency={state?.user.currency} quick={false} />
        <CategoryPicker type="expense" value={categoryId} onChange={setCategoryId} />
        <AccountPicker value={accountId} onChange={setAccountId} />
        {isEditing ? <Button variant="danger" size="sm" onClick={async () => { const result = await mutate("quickExpense", "delete", { id: editor.id }); if (result.ok) onClose(); }}>Olib tashlash</Button> : null}
      </div>
    </FormSheet>
  );
}
