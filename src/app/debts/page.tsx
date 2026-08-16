"use client";
/* eslint-disable react-hooks/set-state-in-effect -- modal payment drafts synchronize to selected debt */

import { useEffect, useState } from "react";
import { useFinance } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  MetricGrid,
  Money,
  PageHeader,
  Progress,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  TextInput,
} from "@/components/ui";
import { formatAmount, humanDate } from "@/lib/money";
import type { DebtView } from "@/lib/finance";

export default function DebtsPage() {
  const { state, loading, mutate } = useFinance();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<DebtView | null>(null);
  const [payFor, setPayFor] = useState<DebtView | null>(null);

  function openCreate() {
    setEditing(null);
    setSheet(true);
  }

  function closeSheet() {
    setSheet(false);
    setEditing(null);
  }

  if (loading && !state) return <Skeleton className="h-72 w-full" />;
  if (!state) return null;

  const iOwe = state.debts.filter((d) => d.direction === "i_owe");
  const toMe = state.debts.filter((d) => d.direction === "owed_to_me");
  const iOweTotal = iOwe.reduce((s, d) => s + d.remainingAmount, 0);
  const toMeTotal = toMe.reduce((s, d) => s + d.remainingAmount, 0);

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      <PageHeader
        title="Qarzdorlik"
        subtitle="Men qarzdorman / menga qarzdor"
        action={
          <Button type="button" size="sm" onClick={openCreate}>
            ➕ Qarz
          </Button>
        }
      />

      <MetricGrid className="sm:grid-cols-3">
        <div className="min-w-0 p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Men qarzdorman</p>
          <div className="mt-1.5"><Money value={iOweTotal} size="lg" tone="negative" /></div>
          <p className="mt-1 text-[11.5px] text-muted">{iOwe.length} ta yozuv</p>
        </div>
        <div className="min-w-0 p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Menga qarzdor</p>
          <div className="mt-1.5"><Money value={toMeTotal} size="lg" tone="positive" /></div>
          <p className="mt-1 text-[11.5px] text-muted">{toMe.length} ta yozuv</p>
        </div>
        <div className="min-w-0 p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Sof holat</p>
          <div className="mt-1.5"><Money value={toMeTotal - iOweTotal} size="lg" tone={toMeTotal - iOweTotal >= 0 ? "positive" : "negative"} /></div>
          <p className="mt-1 text-[11.5px] text-muted">farqi</p>
        </div>
      </MetricGrid>

      {(["i_owe", "owed_to_me"] as const).map((dir) => {
        const list = dir === "i_owe" ? iOwe : toMe;
        return (
          <Card key={dir} className="overflow-hidden" padded={false}>
            <div className="border-b border-line px-4 py-3 sm:px-5">
              <p className="text-[15px] font-semibold">{dir === "i_owe" ? "Men qarzdorman" : "Menga qarzdor"}</p>
            </div>
            {list.length ? (
              <div className="divide-y divide-line px-4 sm:px-5">
                {list.map((d) => (
                  <div key={d.id} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-medium">{d.personName}</p>
                        <p className="mt-0.5 text-[11.5px] text-muted">
                          {d.dueDate ? `${humanDate(d.dueDate)} gacha` : "muddat yo‘q"}
                          {d.daysLeft !== null && d.daysLeft < 0 ? " · kechikkan" : ""}
                        </p>
                        {d.note ? <p className="mt-1 text-[11.5px] text-muted">{d.note}</p> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <Money value={d.remainingAmount} size="md" tone={dir === "i_owe" ? "negative" : "positive"} />
                        <p className="num mt-0.5 text-[11px] text-muted">/ {formatAmount(d.amount)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Progress value={d.progress} height={6} />
                      <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="num break-words text-[11.5px] text-muted">to‘langan {formatAmount(d.paidAmount)}</span>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <button
                            type="button"
                            onClick={() => setPayFor(d)}
                            className="min-h-8 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-accent hover:text-accent-text active:bg-surface-3 touch-manipulation"
                          >
                            To‘lov
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(d);
                              setSheet(true);
                            }}
                            className="min-h-8 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:text-fg active:bg-surface-3 touch-manipulation"
                          >
                            Tahrir
                          </button>
                          <button
                            type="button"
                            onClick={() => mutate("debt", "delete", { id: d.id })}
                            className="min-h-8 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-muted transition-colors hover:text-fg active:bg-surface-3 touch-manipulation"
                          >
                            Arxiv
                          </button>
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
              </div>
            ) : (
              <p className="px-5 py-4 text-[13px] text-muted">
                {dir === "i_owe" ? "Faol qarz yo‘q — yaxshi holat." : "Qarzdorlar yo‘q."}
              </p>
            )}
          </Card>
        );
      })}

      {!state.debts.length ? (
        <EmptyState
          icon="📋"
          title="Qarzdorlik yozuvlari yo‘q"
          description="Qarzlarni qo‘shing — tizim muddat va to‘lovlarni kuzatadi."
          action={
            <Button type="button" onClick={openCreate}>
              ➕ Qarz qo‘shish
            </Button>
          }
        />
      ) : null}

      <DebtSheet open={sheet} onClose={closeSheet} editing={editing} />
      <PaySheet debt={payFor} onClose={() => setPayFor(null)} />
    </div>
  );
}

function DebtSheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: DebtView | null }) {
  const { mutate } = useFinance();
  const [direction, setDirection] = useState<"i_owe" | "owed_to_me">("i_owe");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setDirection(editing?.direction ?? "i_owe");
    setPersonName(editing?.personName ?? "");
    setAmount(editing ? String(editing.amount) : "");
    setDueDate(editing?.dueDate ?? "");
    setNote(editing?.note ?? "");
  }, [open, editing]);

  async function save() {
    const value = Number(amount.replace(/\s/g, ""));
    if (!personName.trim() || !value) return;
    const res = await mutate("debt", editing ? "update" : "create", {
      id: editing?.id,
      direction,
      personName: personName.trim(),
      amount: value,
      remainingAmount: value,
      dueDate: dueDate || null,
      note: note.trim() || null,
    });
    if (res.ok) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Qarzdorlikni tahrirlash" : "Yangi qarzdorlik"}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button className="flex-[2]" onClick={save}>
            Saqlash
          </Button>
        </>
      }
    >
      <Segmented
        value={direction}
        onChange={setDirection}
        options={[
          { value: "i_owe", label: "Men qarzdorman" },
          { value: "owed_to_me", label: "Menga qarzdor" },
        ]}
      />
      <Field label="Kimga / kim">
        <TextInput value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Alisher / Bank NBU" />
      </Field>
      <Field label="Summa">
        <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="1500000" />
      </Field>
      <Field label="Qaytarish sanasi">
        <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>
      <Field label="Izoh">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ixtiyoriy" />
      </Field>
    </Sheet>
  );
}

function PaySheet({ debt, onClose }: { debt: DebtView | null; onClose: () => void }) {
  const { state, mutate } = useFinance();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (debt) {
      setAmount("");
      setAccountId("");
    }
  }, [debt]);

  if (!debt) return null;
  const record = debt;

  async function save() {
    const value = Number(amount.replace(/\s/g, ""));
    if (!value) return;
    const res = await mutate("debt", "pay", {
      id: record.id,
      amount: value,
      accountId: accountId ? Number(accountId) : null,
    });
    if (res.ok) onClose();
  }

  return (
    <Sheet
      open={Boolean(debt)}
      onClose={onClose}
      title={`To‘lov: ${record.personName}`}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button className="flex-[2]" onClick={save}>
            Qayd etish
          </Button>
        </>
      }
    >
      <div className="flat-card p-4">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted">Qoldi</span>
          <Money value={record.remainingAmount} size="sm" tone={record.direction === "i_owe" ? "negative" : "positive"} />
        </div>
        <Divider />
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="text-muted">To‘langan</span>
          <Money value={record.paidAmount} size="sm" />
        </div>
      </div>
      <Field label="To‘lov summasi">
        <TextInput
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder={String(record.remainingAmount)}
        />
      </Field>
      <Field
        label="Hisob"
        hint={record.direction === "i_owe" ? "Xarajat sifatida qayd etiladi" : "Kirim sifatida qayd etiladi"}
      >
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Standart hisob</option>
          {(state?.accounts ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="rounded-xl bg-accent-soft px-3 py-2.5 text-[11.5px] leading-snug text-accent-text">
        To‘lov avtomatik operatsiyalar tarixiga tushadi.
      </div>
    </Sheet>
  );
}

function Divider() {
  return <div className="my-2 h-px w-full bg-line" />;
}
