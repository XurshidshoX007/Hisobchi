"use client";

import { useEffect, useMemo, useState } from "react";
import { formatAmount } from "@/lib/money";
import type { QuickExpenseView } from "@/lib/types";
import { AccountPicker, AmountField, CategoryPicker, FormSheet } from "@/components/form-kit";
import { Icon } from "@/components/icon";
import { useFinance } from "@/components/providers";
import { Button, Label } from "@/components/ui";

type Editor = QuickExpenseView | "new" | null;

/**
 * One-tap, user-owned expense shortcuts. These are intentionally not recurring
 * plans: no background job or page visit can create a transaction.
 */
export function QuickExpenses() {
  const { state, mutate, mutating } = useFinance();
  const [editor, setEditor] = useState<Editor>(null);
  const presets = state?.quickExpenses ?? [];

  async function record(preset: QuickExpenseView) {
    await mutate("quickExpense", "record", { id: preset.id });
  }

  return (
    <section className="mt-4.5 min-w-0" aria-labelledby="quick-expenses-title">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label className="block" >Tezkor xarajatlar</Label>
          <p id="quick-expenses-title" className="mt-0.5 text-[11.5px] text-muted">
            Faqat bosilganda kiritiladi
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor("new")}
          className="min-h-9 shrink-0 rounded-full border border-line px-3 text-[12px] font-semibold text-fg-soft transition-colors hover:bg-surface-2 active:scale-[0.97] touch-manipulation"
        >
          Sozlash
        </button>
      </div>

      {presets.length ? (
        <div className="grid grid-cols-2 gap-2">
          {presets.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => void record(preset)}
              disabled={mutating}
              aria-label={`${preset.name}: ${formatAmount(preset.amount)} so‘mlik xarajat qo‘shish`}
              className="group flex min-h-15 min-w-0 items-center gap-2.5 rounded-[17px] border border-line-strong bg-surface-raised px-3 text-left transition-[background-color,transform] active:scale-[0.98] disabled:opacity-55 touch-manipulation"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.07)" }}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-positive-soft text-positive-text" aria-hidden="true">
                <Icon name={preset.icon || "transport"} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-fg">{preset.name}</span>
                <span className="num mt-0.5 block truncate text-[11px] font-bold text-positive-text">{formatAmount(preset.amount)}</span>
              </span>
              <Icon name="plus" size={14} className="shrink-0 text-faint group-active:text-positive-text" aria-hidden="true" />
            </button>
          ))}
          {presets.length < 4 ? (
            <button
              type="button"
              onClick={() => setEditor("new")}
              className="flex min-h-15 items-center justify-center gap-2 rounded-[17px] border border-dashed border-line-strong bg-surface/45 px-3 text-[12px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg-soft active:scale-[0.98] touch-manipulation"
            >
              <Icon name="plus" size={15} /> Qo‘shish
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditor("new")}
          className="flex min-h-15 w-full items-center gap-3 rounded-[17px] border border-dashed border-line-strong bg-surface/45 px-3.5 text-left transition-colors hover:bg-surface-2 active:scale-[0.99] touch-manipulation"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-positive-soft text-positive-text"><Icon name="transport" size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-fg-soft">Metro, avtobus va boshqalar</span>
            <span className="mt-0.5 block text-[11px] text-muted">Bir marta sozlang — keyin bitta bosish yetadi</span>
          </span>
          <Icon name="plus" size={16} className="shrink-0 text-faint" />
        </button>
      )}

      <QuickExpenseEditor editor={editor} presets={presets} onClose={() => setEditor(null)} onEdit={setEditor} />
    </section>
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
