"use client";
/* eslint-disable react-hooks/set-state-in-effect -- sheet drafts synchronize to the selected record when opened */

import { useEffect, useMemo, useState } from "react";
import { parseDraft } from "@/lib/nlp";
import { addDays, humanDate, todayISO } from "@/lib/money";
import type { TxView } from "@/lib/finance";
import { useFinance } from "./providers";
import { Button, Field, Segmented, Select, Sheet, TextInput } from "./ui";

const CHIPS = [10_000, 50_000, 100_000, 500_000, 1_000_000, 2_500_000];

export function QuickAddSheet({
  open,
  onClose,
  defaultType = "expense",
  editing = null,
}: {
  open: boolean;
  onClose: () => void;
  defaultType?: "income" | "expense" | "transfer";
  editing?: TxView | null;
}) {
  const { state, mutate } = useFinance();
  const [type, setType] = useState<"income" | "expense" | "transfer">(defaultType);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [quickText, setQuickText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? defaultType);
    setAmount(editing ? String(editing.amount) : "");
    setCategoryId(editing?.categoryId ? String(editing.categoryId) : "");
    setAccountId(editing?.accountId ? String(editing.accountId) : "");
    setToAccountId(editing?.toAccountId ? String(editing.toAccountId) : "");
    setDate(editing?.date ?? todayISO());
    setNote(editing?.note ?? "");
    setQuickText("");
    setSaving(false);
  }, [open, defaultType, editing]);

  const accounts = state?.accounts.filter((a) => a.isActive) ?? [];
  const categories = useMemo(
    () => (state?.flatCategories ?? []).filter((c) => c.type === (type === "income" ? "income" : "expense") && c.isActive),
    [state?.flatCategories, type],
  );

  const draft = useMemo(() => (quickText.trim() ? parseDraft(quickText) : null), [quickText]);

  function applyDraft() {
    if (!draft || draft.amount === null) return;
    setType(draft.type);
    setAmount(String(Math.round(draft.amount)));
    setDate(draft.date);
    setNote(draft.note);
    const match = categories.find((c) => c.name === draft.categoryName);
    if (match) setCategoryId(String(match.id));
  }

  async function save() {
    // Fixed regex: was /\s/g which matches literal \s, now /\s/g
    const cleaned = amount.replace(/\s/g, "").replace(",", ".");
    const value = Number(cleaned);
    if (!value || value <= 0) return;
    setSaving(true);
    try {
      const res = await mutate("transaction", editing ? "update" : "create", {
        id: editing?.id,
        type,
        amount: value,
        categoryId: type === "transfer" ? null : categoryId ? Number(categoryId) : null,
        accountId: accountId ? Number(accountId) : accounts[0]?.id,
        toAccountId: type === "transfer" && toAccountId ? Number(toAccountId) : null,
        date,
        note: note || (type === "income" ? "Kirim" : type === "transfer" ? "Transfer" : "Chiqim"),
        source: "miniapp",
      });
      if (res.ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Operatsiyani tahrirlash" : "Tezkor operatsiya"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Bekor qilish
          </Button>
          <Button onClick={save} disabled={saving || !amount} className="flex-[2]">
            {saving ? "Saqlanmoqda…" : editing ? "Yangilash" : "Saqlash"}
          </Button>
        </>
      }
    >
      <Segmented
        value={type}
        onChange={(v) => {
          setType(v);
          setCategoryId("");
        }}
        options={[
          { value: "expense", label: "➖ Chiqim" },
          { value: "income", label: "➕ Kirim" },
          { value: "transfer", label: "↔️ Transfer" },
        ]}
      />

      <div className="rounded-2xl border border-line bg-surface-2 p-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Summa</span>
        <div className="mt-1 flex items-baseline gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="num w-full min-w-0 bg-transparent text-[32px] font-bold leading-none outline-none placeholder:text-muted"
            autoFocus
          />
          <span className="shrink-0 text-sm font-medium text-muted">{state?.user.currency ?? "UZS"}</span>
        </div>
        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setAmount(String((Number(amount.replace(/\s/g, "") || 0) || 0) + c))}
              className="min-h-9 shrink-0 touch-manipulation rounded-full border border-line bg-surface px-3 text-xs font-medium text-fg-soft transition-colors hover:border-accent hover:text-accent-text active:scale-95 active:bg-surface-3"
            >
              +{c >= 1_000_000 ? `${c / 1_000_000} mln` : `${c / 1000} ming`}
            </button>
          ))}
        </div>
      </div>

      <Field label="Tabiiy tilda" hint="“150 ming ovqatga ketdi” yoki “1,5 mln maosh keldi”">
        <div className="flex gap-2">
          <TextInput
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="150 ming ovqatga ketdi"
            className="min-w-0"
          />
          <Button variant="secondary" onClick={applyDraft} disabled={!draft?.ok} className="shrink-0">
            To‘ldir
          </Button>
        </div>
        {draft && draft.amount ? (
          <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-[11.5px] leading-snug text-accent-text">
            {draft.type === "income" ? "Kirim" : draft.type === "transfer" ? "Transfer" : "Chiqim"} ·{" "}
            {Math.round(draft.amount).toLocaleString("ru-RU")} · {draft.categoryName ?? "kategoriya yo‘q"} ·{" "}
            {humanDate(draft.date)}
          </p>
        ) : null}
      </Field>

      {type !== "transfer" ? (
        <Field label="Kategoriya">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanlanmagan</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label={type === "transfer" ? "Qaysi hisobdan" : "Hisob"}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {type === "transfer" ? (
          <Field label="Qaysi hisobga">
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Sana">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
      </div>

      {type === "transfer" ? (
        <Field label="Sana">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      ) : null}

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {[
          { label: "Bugun", value: todayISO() },
          { label: "Kecha", value: addDays(todayISO(), -1) },
          { label: "Ertaga", value: addDays(todayISO(), 1) },
        ].map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => setDate(d.value)}
            className={`min-h-9 shrink-0 touch-manipulation whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors ${
              date === d.value
                ? "border-accent bg-accent-soft text-accent-text"
                : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <Field label="Izoh">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ixtiyoriy" />
      </Field>
    </Sheet>
  );
}
