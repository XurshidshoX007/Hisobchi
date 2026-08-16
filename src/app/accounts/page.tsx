"use client";
/* eslint-disable react-hooks/set-state-in-effect -- modal form draft reset is synchronized to open state */

import { useEffect, useState } from "react";
import { useFinance } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Money,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  TextInput,
} from "@/components/ui";
import { compact, formatAmount } from "@/lib/money";
import type { AccountView, CategoryView } from "@/lib/finance";

const TYPES = [
  { value: "cash", label: "Naqd pul" },
  { value: "uzcard", label: "Uzcard" },
  { value: "humo", label: "Humo" },
  { value: "bank", label: "Bank" },
  { value: "ewallet", label: "Elektron hamyon" },
  { value: "other", label: "Boshqa" },
];

const TYPE_ICON: Record<string, string> = {
  cash: "💵",
  uzcard: "💳",
  humo: "💳",
  bank: "🏦",
  ewallet: "📱",
  other: "•",
};

export default function AccountsPage() {
  const { state, loading, mutate } = useFinance();
  const [tab, setTab] = useState<"accounts" | "categories">("accounts");
  const [sheet, setSheet] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountView | null>(null);
  const [catSheet, setCatSheet] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryView | null>(null);

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  // §35: ONE canonical balance source — the same ledger-based figure the
  // Dashboard hero shows; never re-summed independently in the UI.
  const total = state.forecast.currentBalance;
  const max = Math.max(1, ...state.accounts.map((a) => Math.abs(a.currentBalance)));

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader title="Hisoblar va kategoriyalar" subtitle="Pul qayerda turgani" />

      <div className="max-w-md">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "accounts", label: "💳 Hisoblar" },
            { value: "categories", label: "📂 Kategoriyalar" },
          ]}
        />
      </div>

      {tab === "accounts" ? (
        <div className="space-y-4">
          <Card>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Joriy balans · taqsimot</p>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  <Money value={total} size="lg" />
                  <span className="text-sm text-muted">{state.user.currency}</span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingAccount(null);
                  setSheet(true);
                }}
              >
                ➕ Hisob
              </Button>
            </div>
            <Divider />
            <div className="mt-4 space-y-3">
              {state.accounts.map((a) => (
                <div key={a.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">
                      {TYPE_ICON[a.type] ?? "•"} {a.name}
                    </span>
                    <span className="num shrink-0 text-[13px]">{formatAmount(a.currentBalance)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${(Math.abs(a.currentBalance) / max) * 100}%`, background: "var(--fg)", opacity: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            {state.accounts.map((a) => (
              <Card key={a.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-3 text-lg">
                      {TYPE_ICON[a.type] ?? "•"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-medium">{a.name}</p>
                      <p className="truncate text-[11.5px] text-muted">
                        {TYPES.find((t) => t.value === a.type)?.label ?? a.type} · {a.txCount} ta
                      </p>
                    </div>
                  </div>
                  {!a.isActive ? <Badge tone="neutral">noaktiv</Badge> : null}
                </div>
                <div className="mt-3">
                  <Money value={a.currentBalance} size="lg" tone={a.currentBalance < 0 ? "negative" : "default"} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted">
                  <span>tushum {compact(a.inflow)}</span>
                  <span>chiqim {compact(a.outflow)}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAccount(a);
                      setSheet(true);
                    }}
                    className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                  >
                    Tahrir
                  </button>
                  <button
                    type="button"
                    onClick={() => mutate("account", "update", { id: a.id, isActive: !a.isActive })}
                    className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                  >
                    {a.isActive ? "Noaktiv" : "Faol"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditingCategory(null);
                setCatSheet(true);
              }}
            >
              ➕ Kategoriya
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["expense", "income"] as const).map((type) => (
              <Card key={type} className="overflow-hidden" padded={false}>
                <div className="border-b border-line px-4 py-3 sm:px-5">
                  <p className="text-[15px] font-semibold">{type === "expense" ? "Xarajat kategoriyalari" : "Daromad kategoriyalari"}</p>
                </div>
                <div className="divide-y divide-line px-4 sm:px-5">
                  {state.categories
                    .filter((c) => c.type === type)
                    .map((c) => (
                      <CategoryRow
                        key={c.id}
                        node={c}
                        onEdit={(category) => {
                          setEditingCategory(category);
                          setCatSheet(true);
                        }}
                      />
                    ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <AccountSheet
        open={sheet}
        onClose={() => {
          setSheet(false);
          setEditingAccount(null);
        }}
        editing={editingAccount}
      />
      <CategorySheet
        open={catSheet}
        onClose={() => {
          setCatSheet(false);
          setEditingCategory(null);
        }}
        editing={editingCategory}
      />
    </div>
  );
}

function CategoryRow({ node, onEdit }: { node: CategoryView; onEdit: (category: CategoryView) => void }) {
  const { mutate } = useFinance();
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <span className="text-base">{node.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{node.name}</p>
          {node.isEssential ? <p className="text-[11px] text-muted">majburiy</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onEdit(node)}
          className="min-h-8 rounded-full border border-line bg-surface px-2.5 text-[11px] font-medium text-fg-soft transition-colors hover:text-fg active:bg-surface-3 touch-manipulation"
        >
          tahrir
        </button>
        <button
          type="button"
          onClick={() => mutate("category", "update", { id: node.id, isActive: !node.isActive })}
          className="min-h-8 rounded-full border border-line bg-surface px-2.5 text-[11px] font-medium text-muted transition-colors hover:text-fg active:bg-surface-3 touch-manipulation"
        >
          {node.isActive ? "yashir" : "ko‘rsat"}
        </button>
      </div>
      {node.children.length ? (
        <div className="mt-2 ml-7 space-y-1.5 border-l-2 border-line pl-3">
          {node.children.map((ch) => (
            <div key={ch.id} className="flex items-center gap-2">
              <span className="text-sm">{ch.icon}</span>
              <span className="flex-1 truncate text-[13px] text-fg-soft">{ch.name}</span>
              {ch.isEssential ? <Badge tone="neutral">majburiy</Badge> : null}
              <button type="button" onClick={() => onEdit(ch)} className="min-h-8 px-1.5 text-[11px] font-medium text-accent-text">
                tahrir
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AccountSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: AccountView | null;
}) {
  const { mutate } = useFinance();
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [initialBalance, setInitialBalance] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setType(editing?.type ?? "cash");
    setInitialBalance(editing ? String(editing.initialBalance) : "");
  }, [open, editing]);

  async function save() {
    if (!name.trim()) return;
    const res = await mutate("account", editing ? "update" : "create", { id: editing?.id, name: name.trim(), type, initialBalance: Number(initialBalance.replace(/\s/g, "") || 0) });
    if (res.ok) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Hisobni tahrirlash" : "Yangi hisob"}
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
      <Field label="Hisob nomi">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Naqd pul / Humo / Click" />
      </Field>
      <Field label="Turi">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Boshlang‘ich balans">
        <TextInput value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} inputMode="decimal" placeholder="0" />
      </Field>
    </Sheet>
  );
}

function CategorySheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: CategoryView | null }) {
  const { state, mutate } = useFinance();
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [icon, setIcon] = useState("•");
  const [parentId, setParentId] = useState("");
  const [isEssential, setIsEssential] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setType(editing?.type ?? "expense");
    setIcon(editing?.icon ?? "•");
    setParentId(editing?.parentId ? String(editing.parentId) : "");
    setIsEssential(editing?.isEssential ?? false);
  }, [open, editing]);

  const parents = (state?.categories ?? []).filter((c) => c.type === type && !c.parentId && c.id !== editing?.id);

  async function save() {
    if (!name.trim()) return;
    const res = await mutate("category", editing ? "update" : "create", {
      id: editing?.id,
      name: name.trim(),
      type,
      icon: icon || "•",
      parentId: parentId ? Number(parentId) : null,
      isEssential,
    });
    if (res.ok) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Kategoriyani tahrirlash" : "Yangi kategoriya"}
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
        value={type}
        onChange={setType}
        options={[
          { value: "expense", label: "Xarajat" },
          { value: "income", label: "Daromad" },
        ]}
      />
      <Field label="Nomi">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Misol: Bolalar" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ikona (emoji)">
          <TextInput value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🧸" />
        </Field>
        <Field label="Muhimlik">
          <Select value={isEssential ? "1" : "0"} onChange={(e) => setIsEssential(e.target.value === "1")}>
            <option value="0">Ixtiyoriy</option>
            <option value="1">Majburiy</option>
          </Select>
        </Field>
      </div>
      <Field label="Ota kategoriya" hint="Misol: Uy → Ijara">
        <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Yuqori daraja</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </Select>
      </Field>
    </Sheet>
  );
}
