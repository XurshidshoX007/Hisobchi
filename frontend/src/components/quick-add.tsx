/* eslint-disable react-hooks/set-state-in-effect -- draft form state is re-hydrated from the editing prop after mount */


import { useEffect, useMemo, useRef, useState } from "react";
import { parseDraft } from "@hisobchi/shared/lib/nlp";
import { formatAmount, humanDate, todayISO } from "@hisobchi/shared/lib/money";
import type { TxView } from "@hisobchi/shared/lib/finance";
import { rememberTxType } from "@/lib/fab";
import { TX_LABEL } from "@hisobchi/shared/lib/copy";
import {
  amountError,
  formatAmountInput,
  isDirtyDraft,
  lastAccountId,
  parseAmountInput,
  rememberAccountId,
  resolveDefaultAccountId,
  savedMessage,
} from "@/lib/form-kit";
import { useFinance } from "./providers";
import {
  AccountPicker,
  AdvancedSection,
  AmountField,
  CategoryPicker,
  CompactSegmented,
  DateField,
  FormActions,
  FormSheet,
  NoteField,
  PreviewCard,
} from "./form-kit";
import { Button, Money, TextInput } from "./ui";

type TxType = "income" | "expense" | "transfer";

const TYPE_TITLE: Record<TxType, string> = {
  income: "+ Daromad",
  expense: "+ Xarajat",
  transfer: "+ Transfer",
};

/**
 * The daily-use form (§7/§36). The direction is already chosen by the global
 * FAB, so the sheet opens straight on the amount: SUMMA → KATEGORIYA → SAQLASH
 * is the whole happy path; date, account and note carry smart defaults and stay
 * one tap away.
 */
export function QuickAddSheet({
  open,
  onClose,
  defaultType = "expense",
  editing = null,
}: {
  open: boolean;
  onClose: () => void;
  defaultType?: TxType;
  editing?: TxView | null;
}) {
  const { state, mutate, toast } = useFinance();
  const [type, setType] = useState<TxType>(defaultType);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [quickText, setQuickText] = useState("");
  const [touched, setTouched] = useState(false);
  const [initialDraft, setInitialDraft] = useState<Record<string, string>>({});

  const accounts = useMemo(() => (state?.accounts ?? []).filter((a) => a.isActive), [state?.accounts]);
  // A background state refresh must never rewrite what the user is typing, so
  // account defaults are read from a snapshot instead of an effect dependency
  // (§42: typing never re-runs the draft initializer).
  const accountsSnapshot = useRef(accounts);
  useEffect(() => {
    accountsSnapshot.current = accounts;
  }, [accounts]);

  useEffect(() => {
    if (!open) return;
    const nextType = editing?.type ?? defaultType;
    // §37: smart defaults are visible and editable — last used account, today,
    // and the direction the FAB was tapped with.
    const fallbackAccount = resolveDefaultAccountId(accountsSnapshot.current, lastAccountId());
    const nextAccount = editing?.accountId ? String(editing.accountId) : fallbackAccount ? String(fallbackAccount) : "";
    const nextTo = editing?.toAccountId ? String(editing.toAccountId) : "";
    const draft = {
      type: nextType,
      amount: editing ? formatAmountInput(String(editing.amount)) : "",
      categoryId: editing?.categoryId ? String(editing.categoryId) : "",
      accountId: nextAccount,
      toAccountId: nextTo,
      date: editing?.date ?? todayISO(),
      note: editing?.note ?? "",
    };
    setType(draft.type);
    setAmount(draft.amount);
    setCategoryId(draft.categoryId);
    setAccountId(draft.accountId);
    setToAccountId(draft.toAccountId);
    setDate(draft.date);
    setNote(draft.note);
    setQuickText("");
    setTouched(false);
    setInitialDraft(draft);
  }, [open, defaultType, editing]);

  const draft = useMemo(
    () => ({ type, amount, categoryId, accountId, toAccountId, date, note }),
    [type, amount, categoryId, accountId, toAccountId, date, note],
  );
  const dirty = isDirtyDraft(draft, initialDraft);

  const parsed = parseAmountInput(amount);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const amountMsg = amountError(amount);
    if (amountMsg) e.amount = amountMsg;
    if (type !== "transfer" && !categoryId) e.category = "Kategoriyani tanlang";
    if (type === "transfer") {
      if (!toAccountId) e.toAccount = "Qaysi hisobga o‘tkazishni tanlang";
      else if (toAccountId === accountId) e.toAccount = "Boshqa hisobni tanlang";
    }
    if (!date) e.date = "Sanani tanlang";
    return e;
  }, [amount, type, categoryId, toAccountId, accountId, date]);

  const valid = Object.keys(errors).length === 0;
  const showError = (key: string) => (touched ? errors[key] ?? null : null);

  const nlpDraft = useMemo(() => (quickText.trim() ? parseDraft(quickText) : null), [quickText]);
  const categories = useMemo(
    () => (state?.flatCategories ?? []).filter((c) => c.type === (type === "income" ? "income" : "expense") && c.isActive),
    [state?.flatCategories, type],
  );

  function applyDraft() {
    if (!nlpDraft || nlpDraft.amount === null) return;
    setType(nlpDraft.type);
    // Preserve the parser's numeric(18,2) value exactly; rounding here used to
    // make the NLP preview, edit form and persisted transaction disagree.
    setAmount(formatAmountInput(String(nlpDraft.amount)));
    setDate(nlpDraft.date);
    setNote(nlpDraft.note);
    const match = categories.find((c) => c.name === nlpDraft.categoryName);
    if (match) setCategoryId(String(match.id));
  }

  const fromAccount = accounts.find((a) => String(a.id) === accountId);
  const toAccount = accounts.find((a) => String(a.id) === toAccountId);

  async function submit() {
    setTouched(true);
    if (!valid || !parsed) return { ok: false, message: Object.values(errors)[0] };
    const res = await mutate(
      "transaction",
      editing ? "update" : "create",
      {
        id: editing?.id,
        type,
        amount: parsed,
        categoryId: type === "transfer" ? null : categoryId ? Number(categoryId) : null,
        accountId: accountId ? Number(accountId) : accounts[0]?.id,
        toAccountId: type === "transfer" && toAccountId ? Number(toAccountId) : null,
        date,
        note: note || TX_LABEL[type],
        source: "miniapp",
      },
      { silent: true },
    );
    if (res.ok) {
      // §37: remember the direction and the account so the next entry is faster.
      rememberTxType(type);
      rememberAccountId(Number(accountId) || null);
      toast(editing ? "Operatsiya yangilandi" : savedMessage(type, parsed, state?.user.currency === "UZS" ? "so‘m" : (state?.user.currency ?? "so‘m")), "success");
    }
    return res;
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? "Operatsiyani tahrirlash" : TYPE_TITLE[type]}
      subtitle={editing ? undefined : "Summa va kategoriya"}
      submitLabel="Saqlash"
      canSubmit={valid}
      dirty={dirty}
      onSubmit={submit}
    >
      {/* The direction is already chosen by the FAB; this stays only as a
          one-tap correction, not as a first decision (§7/§19). A compact grid
          of three equal cells — never a horizontally scrolling tab strip
          inside a form (§13). */}
      <CompactSegmented
        value={type}
        ariaLabel="Operatsiya turi"
        onChange={(v) => {
          setType(v);
          setCategoryId("");
        }}
        options={[
          { value: "expense", label: TX_LABEL.expense },
          { value: "income", label: TX_LABEL.income },
          { value: "transfer", label: TX_LABEL.transfer },
        ]}
      />

      <AmountField
        value={amount}
        onChange={setAmount}
        currency={state?.user.currency ?? "UZS"}
        error={showError("amount")}
        autoFocus
      />

      {type !== "transfer" ? (
        <CategoryPicker type={type === "income" ? "income" : "expense"} value={categoryId} onChange={setCategoryId} error={showError("category")} />
      ) : (
        <>
          <AccountPicker value={accountId} onChange={setAccountId} label="Qayerdan" excludeId={toAccountId} />
          <AccountPicker value={toAccountId} onChange={setToAccountId} label="Qayerga" excludeId={accountId} error={showError("toAccount")} />
          {fromAccount && toAccount && parsed ? (
            <PreviewCard>
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
                <span className="min-w-0 break-words font-semibold">
                  {fromAccount.name} → {toAccount.name}
                </span>
                <Money value={parsed} size="sm" />
              </p>
            </PreviewCard>
          ) : null}
        </>
      )}

      <DateField value={date} onChange={setDate} error={showError("date")} />

      {type !== "transfer" ? <AccountPicker value={accountId} onChange={setAccountId} /> : null}

      <NoteField value={note} onChange={setNote} />

      <AdvancedSection label="Tabiiy tilda kiritish">
        {/* §14: input + action wrap instead of being squeezed into one line. */}
        <FormActions className="items-center gap-2">
          <TextInput
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="150 ming ovqatga ketdi"
            aria-label="Tabiiy tilda kiritish"
            className="min-w-0 flex-[3_1_140px]"
          />
          <Button variant="secondary" onClick={applyDraft} disabled={!nlpDraft?.ok} className="flex-[1_1_88px]">
            To‘ldir
          </Button>
        </FormActions>
        {nlpDraft && nlpDraft.amount ? (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-[11.5px] leading-snug text-accent-text [overflow-wrap:anywhere]">
            {TX_LABEL[nlpDraft.type]} ·{" "}
            {formatAmount(nlpDraft.amount)} · {nlpDraft.categoryName ?? "kategoriya yo‘q"} ·{" "}
            {humanDate(nlpDraft.date)}
          </p>
        ) : null}
      </AdvancedSection>
    </FormSheet>
  );
}
