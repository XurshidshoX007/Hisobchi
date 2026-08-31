"use client";
/* eslint-disable react-hooks/set-state-in-effect -- modal payment drafts synchronize to selected debt */

import { useEffect, useRef, useState } from "react";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import {
  AccountPicker,
  AdvancedSection,
  AmountField,
  Chip,
  ChoiceGrid,
  DateField,
  FormActions,
  FormSheet,
  NoteField,
  PreviewCard,
} from "@/components/form-kit";
import { Icon } from "@/components/icon";
import {
  Card,
  EmptyState,
  Label,
  Field,
  Money,
  Progress,
  Segmented,
  Skeleton,
  TextInput,
} from "@/components/ui";
import {
  amountError,
  formatAmountInput,
  isDirtyDraft,
  lastAccountId,
  parseAmountInput,
  rememberAccountId,
} from "@/lib/form-kit";
import { compact, formatAmount, humanDate, todayISO } from "@/lib/money";
import type { DebtView } from "@/lib/finance";
import { filterDebtsByTab, isSettledDebt, type DebtListFilter } from "@/lib/debt-lifecycle";
import { RowActionsButton, RowActionsSheet } from "@/components/row-actions";

export default function DebtsPage() {
  const { state, loading, mutate } = useFinance();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<DebtView | null>(null);
  const [menuDebt, setMenuDebt] = useState<DebtView | null>(null);
  const [payFor, setPayFor] = useState<DebtView | null>(null);
  const [filter, setFilter] = useState<DebtListFilter>("i_owe");

  function openCreate() {
    setEditing(null);
    setSheet(true);
  }

  // Global FAB → existing DebtSheet (no transaction detour).
  useFabPage({}, { debt: () => openCreate() });

  // Routed creates (Menu → "+ Qarz").
  const { consume } = useFab();
  useEffect(() => {
    const routed = consume();
    if (routed?.id === "debt") openCreate();
  }, [consume]);

  function closeSheet() {
    setSheet(false);
    setEditing(null);
  }

  if (loading && !state) return <Skeleton className="h-72 w-full" />;
  if (!state) return null;

  const activeDebts = state.debts.filter((d) => !isSettledDebt(d));
  const iOwe = activeDebts.filter((d) => d.direction === "i_owe");
  const toMe = activeDebts.filter((d) => d.direction === "owed_to_me");
  const iOweTotal = iOwe.reduce((s, d) => s + d.remainingAmount, 0);
  const toMeTotal = toMe.reduce((s, d) => s + d.remainingAmount, 0);
  const visibleDebts = filterDebtsByTab(state.debts, filter);

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      {/* §22: swipe-back replaces the old ‹ Menyu back link. */}

      {activeDebts.length ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <Card className="p-4" style={{ borderColor: "rgba(255,122,122,.3)" }}>
              <Label>Men qarzdorman</Label>
              <div className="mt-1.5">
                <Money value={iOweTotal > 0 ? -iOweTotal : 0} size="lg" tone="negative" signed />
              </div>
              <p className="mt-1 text-[11.5px] text-muted">{iOwe.length} ta yozuv</p>
            </Card>
            <Card className="p-4" style={{ borderColor: "rgba(78,216,160,.3)" }}>
              <Label>Menga qarzdor</Label>
              <div className="mt-1.5">
                <Money value={toMeTotal} size="lg" tone="positive" />
              </div>
              <p className="mt-1 text-[11.5px] text-muted">{toMe.length} ta yozuv</p>
            </Card>
          </div>

          {/* The debt page manages open balances; settled movements remain in History. */}
          <div className="max-w-md">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "i_owe", label: "Men qarzdorman" },
                { value: "owed_to_me", label: "Menga qarzdor" },
              ]}
            />
          </div>

          <div className="space-y-2">
            {visibleDebts.map((d) => (
                <div key={d.id} className="flat-card overflow-hidden px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium">{d.personName}</p>
                      {/* §16: direction is stated in TEXT, never color alone. */}
                      <p
                        className={`lb mt-0.5 ${
                          d.direction === "i_owe" ? "text-negative-text!" : "text-positive-text!"
                        }`}
                      >
                        {d.direction === "i_owe" ? "Men qarzdorman" : "Menga qarzdor"}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {d.dueDate ? `${humanDate(d.dueDate)} gacha` : "muddat yo‘q"}
                        {d.daysLeft !== null && d.daysLeft < 0 ? " · kechikkan" : ""}
                      </p>
                      {d.note ? <p className="mt-1 truncate text-[11.5px] text-muted">{d.note}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <Money value={d.direction === "i_owe" ? -d.remainingAmount : d.remainingAmount} size="md" tone={d.direction === "i_owe" ? "negative" : "positive"} signed />
                      <p className="num mt-0.5 text-[11px] text-muted">/ {formatAmount(d.amount)}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress value={d.progress} height={6} ariaLabel={`${d.personName} qarz to‘lovi progressi`} />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11.5px] text-muted">to‘langan {compact(d.paidAmount)}</span>
                      {/* Recording a payment is what this row is FOR; editing,
                          cancelling and archiving are housekeeping. */}
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPayFor(d)}
                          aria-label={`${d.personName} uchun to‘lov kiritish`}
                          className="min-h-9 min-w-[84px] rounded-xl px-3.5 text-[12px] font-bold transition-[filter] hover:brightness-105 active:scale-[0.98] touch-manipulation"
                          style={{ background: "var(--gold-gradient)", color: "var(--gold-on)" }}
                        >
                          To‘lov
                        </button>
                        <RowActionsButton label={d.personName} onClick={() => setMenuDebt(d)} />
                      </div>
                    </div>
                  </div>
                  {d.payments.length ? (
                    <div className="mt-3 space-y-1 border-l-2 border-line pl-3">
                      {d.payments.slice(0, 3).map((p) => (
                        <p key={p.id} className="text-[11px] leading-snug text-muted">
                          {humanDate(p.date)} · {formatAmount(p.amount)} {p.note ? `· ${p.note}` : ""}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            {visibleDebts.length === 0 ? (
              <p className="flat-card px-4 py-4 text-[13px] text-muted">
                {filter === "i_owe" ? "Qarz yo‘q." : "Qarzdorlar yo‘q."}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState icon="doc" title="Faol qarzlar yo‘q." description="Yopilgan qarz operatsiyalari Tarixda saqlanadi." />
      )}

      <RowActionsSheet
        open={Boolean(menuDebt)}
        onClose={() => setMenuDebt(null)}
        title={menuDebt?.personName ?? ""}
        eyebrow="Qarz"
        icon="doc"
        iconTone={menuDebt?.direction === "i_owe" ? "negative" : "positive"}
        actions={[
          { id: "edit", label: "Tahrirlash", icon: "edit", description: "Summa, muddat, izoh" },
          ...(menuDebt && menuDebt.paidAmount === 0
            ? [
                {
                  id: "cancel",
                  label: "Bekor qilish",
                  icon: "ban",
                  tone: "danger" as const,
                  description: "Hech qanday to‘lov kiritilmagan",
                  confirm: {
                    title: "Qarzni bekor qilish",
                    body: "Yozuv bekor qilinadi. Bu qarz bo‘yicha hech qanday to‘lov kiritilmagani uchun hisob-kitobga ta’sir qilmaydi.",
                    verb: "Bekor qilish",
                    busyVerb: "Bekor qilinmoqda…",
                  },
                },
              ]
            : []),
          {
            id: "archive",
            label: "Arxivlash",
            icon: "close",
            tone: "danger",
            description: "Ro‘yxatdan olib tashlanadi",
            confirm: {
              title: "Qarzni arxivlash",
              body: "Yozuv ro‘yxatdan olib tashlanadi. Kiritilgan to‘lovlar tarixda qoladi.",
              verb: "Arxivlash",
              busyVerb: "Arxivlanmoqda…",
            },
          },
        ]}
        onSelect={(id) => {
          const target = menuDebt;
          if (!target) return;
          if (id === "edit") {
            setEditing(target);
            setSheet(true);
            return;
          }
          if (id === "cancel") return mutate("debt", "cancel", { id: target.id });
          return mutate("debt", "delete", { id: target.id });
        }}
      />

      <DebtSheet open={sheet} onClose={closeSheet} editing={editing} />
      <PaySheet debt={payFor} onClose={() => setPayFor(null)} />
    </div>
  );
}

/**
 * §18: the debt form asks the ONE question that changes everything first
 * (which way does the money go?), then person → amount → deadline. Everything
 * else is optional and collapsed.
 */
function DebtSheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: DebtView | null }) {
  const { mutate, toast } = useFinance();
  const [direction, setDirection] = useState<"i_owe" | "owed_to_me">("i_owe");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [initialDraft, setInitialDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const draft = {
      direction: editing?.direction ?? "i_owe",
      personName: editing?.personName ?? "",
      amount: editing ? formatAmountInput(String(editing.amount)) : "",
      accountId: editing ? "" : String(lastAccountId() ?? ""),
      date: todayISO(),
      dueDate: editing?.dueDate ?? "",
      note: editing?.note ?? "",
    };
    setDirection(draft.direction);
    setPersonName(draft.personName);
    setAmount(draft.amount);
    setAccountId(draft.accountId);
    setDate(draft.date);
    setDueDate(draft.dueDate);
    setNote(draft.note);
    setTouched(false);
    setInitialDraft(draft);
  }, [open, editing]);

  const errors: Record<string, string> = {};
  if (!personName.trim()) errors.personName = "Shaxs yoki tashkilot nomini kiriting";
  const amountMsg = amountError(amount);
  if (amountMsg) errors.amount = amountMsg;
  const valid = Object.keys(errors).length === 0;
  const showError = (key: string) => (touched ? errors[key] ?? null : null);
  const parsed = parseAmountInput(amount) ?? 0;

  const dirty = isDirtyDraft({ direction, personName, amount, accountId, date, dueDate, note }, initialDraft);

  async function submit() {
    setTouched(true);
    if (!valid) return { ok: false, message: Object.values(errors)[0] };
    const res = await mutate(
      "debt",
      editing ? "update" : "create",
      {
        id: editing?.id,
        direction,
        personName: personName.trim(),
        amount: parsed,
        remainingAmount: parsed,
        accountId: accountId ? Number(accountId) : null,
        ...(!editing ? { date } : {}),
        dueDate: dueDate || null,
        note: note.trim() || null,
      },
      { silent: true },
    );
    if (res.ok) {
      if (!editing) rememberAccountId(Number(accountId) || null);
      toast(editing ? "Qarz yangilandi" : `${formatAmount(parsed)} so‘mlik qarz saqlandi`, "success");
    }
    return res;
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? "Qarzni tahrirlash" : "Qarz"}
      subtitle={editing ? undefined : "Kim kimga qarzdor?"}
      icon="doc"
      iconTone={direction === "i_owe" ? "negative" : "positive"}
      submitLabel="Saqlash"
      canSubmit={valid}
      dirty={dirty}
      onSubmit={submit}
    >
      {/* §7/§11: a two-cell choice grid — the long Uzbek labels wrap inside
          their own boxes instead of scrolling the sheet sideways. */}
      <ChoiceGrid
        value={direction}
        ariaLabel="Qarz yo‘nalishi"
        onChange={setDirection}
        options={[
          { value: "i_owe", label: "Men qarzdorman" },
          { value: "owed_to_me", label: "Menga qarzdor" },
        ]}
      />

      <Field label="Shaxs" error={showError("personName")}>
        <TextInput value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Alisher / Bank NBU" />
      </Field>

      <AmountField value={amount} onChange={setAmount} error={showError("amount")} currency="UZS" autoFocus={!editing} />

      {!editing ? <DateField value={date} onChange={setDate} label="Qarz olingan sana" /> : null}

      {parsed > 0 && personName.trim() ? (
        <PreviewCard>
          <p className="min-w-0 break-words text-[13px]">
            <span className="font-semibold">{personName.trim()}</span> ·{" "}
            <span className="num">{formatAmount(parsed)}</span> so‘m ·{" "}
            <span className={direction === "i_owe" ? "text-negative-text" : "text-positive-text"}>
              {direction === "i_owe" ? "men qarzdorman" : "menga qarzdor"}
            </span>
            {dueDate ? ` · ${humanDate(dueDate)} gacha` : ""}
          </p>
        </PreviewCard>
      ) : null}

      <AdvancedSection>
        {!editing ? <AccountPicker value={accountId} onChange={setAccountId} /> : null}
        <DateField value={dueDate} onChange={setDueDate} label="Qaytarish muddati" chips={false} />
        <NoteField value={note} onChange={setNote} />
      </AdvancedSection>
    </FormSheet>
  );
}

/** Debt repayment — same grammar as every other sheet, one primary action. */
function PaySheet({ debt, onClose }: { debt: DebtView | null; onClose: () => void }) {
  const { mutate, toast } = useFinance();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!debt) return;
    setAmount("");
    setTouched(false);
    const remembered = lastAccountId();
    setAccountId(remembered ? String(remembered) : "");
  }, [debt]);

  // Retain the selected record until the shared primitive finishes its exit;
  // otherwise clearing page state would unmount the whole sheet mid-motion.
  const [record, setRecord] = useState<DebtView | null>(debt);
  useEffect(() => {
    if (debt) setRecord(debt);
  }, [debt]);
  const parsed = parseAmountInput(amount);
  const errors: Record<string, string> = {};
  const amountMsg = amountError(amount, "To‘lov summasini kiriting");
  if (amountMsg) errors.amount = amountMsg;
  else if (record && parsed !== null && parsed > record.remainingAmount) {
    errors.amount = `Qolgan qarz ${formatAmount(record.remainingAmount)} so‘m — undan katta bo‘lmasin`;
  }
  const valid = Object.keys(errors).length === 0;

  async function submit() {
    setTouched(true);
    if (!record || !valid || parsed === null) return { ok: false, message: Object.values(errors)[0] };
    const res = await mutate(
      "debt",
      "pay",
      { id: record.id, amount: parsed, accountId: accountId ? Number(accountId) : null },
      { silent: true },
    );
    if (res.ok) {
      rememberAccountId(Number(accountId) || null);
      toast(`${formatAmount(parsed)} so‘mlik to‘lov qayd etildi`, "success");
    }
    return res;
  }

  if (!record) return null;

  return (
    <FormSheet
      open={Boolean(debt)}
      onClose={onClose}
      title={`To‘lov: ${record.personName}`}
      subtitle={`Qoldi ${formatAmount(record.remainingAmount)} so‘m`}
      icon="receipt"
      iconTone={record.direction === "i_owe" ? "negative" : "positive"}
      submitLabel="Saqlash"
      canSubmit={valid}
      dirty={Boolean(amount)}
      onSubmit={submit}
    >
      <AmountField
        value={amount}
        onChange={setAmount}
        label="To‘lov summasi"
        currency="UZS"
        error={touched ? errors.amount ?? null : null}
        autoFocus
      />
      <FormActions>
        <Chip onClick={() => setAmount(formatAmountInput(String(Math.round(record.remainingAmount))))}>
          To‘liq {compact(record.remainingAmount)}
        </Chip>
      </FormActions>
      <AccountPicker value={accountId} onChange={setAccountId} />
      <p className="text-[11.5px] leading-snug text-muted">
        {record.direction === "i_owe" ? "Xarajat" : "Daromad"} sifatida tarixga yoziladi.
      </p>
    </FormSheet>
  );
}
