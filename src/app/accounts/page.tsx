"use client";
/* eslint-disable react-hooks/set-state-in-effect -- modal form draft reset is synchronized to open state */

import { useEffect, useRef, useState } from "react";
import { useFinance } from "@/components/providers";
import { useFab, useFabPage } from "@/components/fab";
import { AdvancedSection, AmountField, ChoiceGrid, CompactSegmented, FormRow, FormSheet } from "@/components/form-kit";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Money,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  TextInput,
} from "@/components/ui";
import { formatAmountInput, isDirtyDraft, parseAmountInput } from "@/lib/form-kit";
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

  // Global FAB: account vs category depends on the active sub-tab.
  useFabPage(
    { accountsTab: tab },
    {
      account: () => {
        setEditingAccount(null);
        setSheet(true);
      },
      category: () => {
        setEditingCategory(null);
        setCatSheet(true);
      },
    },
  );

  // Routed creates (Menu → "+ Hisob" / "+ Kategoriya").
  const { consume } = useFab();
  useEffect(() => {
    const routed = consume();
    if (!routed) return;
    if (routed.id === "account") {
      setTab("accounts");
      setEditingAccount(null);
      setSheet(true);
    } else if (routed.id === "category") {
      setTab("categories");
      setEditingCategory(null);
      setCatSheet(true);
    }
  }, [consume]);

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  return (
    <div className="animate-fade-up space-y-4">
      {/* §22: internal page = compact back + title. No profile/balance header —
          the global real balance lives on the Dashboard only (§12/§26). */}
      <PageHeader title="Hisoblar" back={{ href: "/more", label: "Menyu" }} />

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
        state.accounts.length ? (
          /* §13: one account = one compact row. Per-account balance has its
             single home here — no extra distribution hero above the list. */
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {state.accounts.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-base" aria-hidden="true">
                    {TYPE_ICON[a.type] ?? "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium">{a.name}</p>
                    <p className="truncate text-[11.5px] text-muted">
                      {TYPES.find((t) => t.value === a.type)?.label ?? a.type} · {a.txCount} ta operatsiya
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money value={a.currentBalance} size="md" tone={a.currentBalance < 0 ? "negative" : "default"} />
                    {!a.isActive ? (
                      <div className="mt-0.5 flex justify-end">
                        <Badge tone="neutral">Noaktiv</Badge>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAccount(a);
                      setSheet(true);
                    }}
                    aria-label={`${a.name} hisobini tahrirlash`}
                    className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                  >
                    Tahrir
                  </button>
                  <button
                    type="button"
                    onClick={() => mutate("account", "update", { id: a.id, isActive: !a.isActive })}
                    aria-label={`${a.name} hisobini ${a.isActive ? "noaktiv qilish" : "faollashtirish"}`}
                    className="min-h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-line-strong active:bg-surface-3 touch-manipulation"
                  >
                    {a.isActive ? "Noaktiv" : "Faol"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon="💳" title="Hisoblar yo‘q." description="Pastdagi + tugmasi orqali hisob qo‘shing." />
        )
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          {node.isEssential ? <p className="text-[11px] text-muted">Majburiy</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onEdit(node)}
          className="min-h-8 rounded-full border border-line bg-surface px-2.5 text-[11px] font-medium text-fg-soft transition-colors hover:text-fg active:bg-surface-3 touch-manipulation"
        >
          Tahrir
        </button>
        <button
          type="button"
          onClick={() => mutate("category", "update", { id: node.id, isActive: !node.isActive })}
          className="min-h-8 rounded-full border border-line bg-surface px-2.5 text-[11px] font-medium text-muted transition-colors hover:text-fg active:bg-surface-3 touch-manipulation"
        >
          {node.isActive ? "Yashirish" : "Ko‘rsatish"}
        </button>
      </div>
      {node.children.length ? (
        <div className="mt-2 ml-7 space-y-1.5 border-l-2 border-line pl-3">
          {node.children.map((ch) => (
            <div key={ch.id} className="flex items-center gap-2">
              <span className="text-sm">{ch.icon}</span>
              <span className="flex-1 truncate text-[13px] text-fg-soft">{ch.name}</span>
              {ch.isEssential ? <Badge tone="neutral">Majburiy</Badge> : null}
              <button type="button" onClick={() => onEdit(ch)} className="min-h-8 px-1.5 text-[11px] font-medium text-accent-text">
                Tahrir
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * §21: name, type, opening balance. Anything the product already supports
 * beyond that stays optional.
 */
function AccountSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: AccountView | null;
}) {
  const { mutate, toast } = useFinance();
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [initialBalance, setInitialBalance] = useState("");
  const [touched, setTouched] = useState(false);
  const [initialDraft, setInitialDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const draft = {
      name: editing?.name ?? "",
      type: editing?.type ?? "cash",
      initialBalance: editing ? formatAmountInput(String(editing.initialBalance)) : "",
    };
    setName(draft.name);
    setType(draft.type);
    setInitialBalance(draft.initialBalance);
    setTouched(false);
    setInitialDraft(draft);
  }, [open, editing]);

  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = "Hisob nomini kiriting";
  const valid = Object.keys(errors).length === 0;
  const dirty = isDirtyDraft({ name, type, initialBalance }, initialDraft);

  async function submit() {
    setTouched(true);
    if (!valid) return { ok: false, message: Object.values(errors)[0] };
    const res = await mutate(
      "account",
      editing ? "update" : "create",
      {
        id: editing?.id,
        name: name.trim(),
        type,
        initialBalance: parseAmountInput(initialBalance) ?? 0,
      },
      { silent: true },
    );
    if (res.ok) toast(editing ? "Hisob yangilandi" : `“${name.trim()}” hisobi saqlandi`, "success");
    return res;
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? "Hisobni tahrirlash" : "+ Hisob"}
      subtitle={editing ? undefined : "Pul qayerda turadi?"}
      submitLabel="Saqlash"
      canSubmit={valid}
      dirty={dirty}
      onSubmit={submit}
    >
      <Field label="Hisob nomi" error={touched ? errors.name ?? null : null}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Naqd pul / Humo / Click" />
      </Field>

      {/* §7/§13: the six account types are a choice GRID — equal cells, own
          borders, wrapping labels. No horizontal scrolling inside the sheet. */}
      <ChoiceGrid
        label="Turi"
        ariaLabel="Hisob turi"
        value={type}
        onChange={setType}
        columns={2}
        options={TYPES.map((t) => ({ value: t.value, label: t.label, icon: TYPE_ICON[t.value] ?? "•" }))}
      />

      <AmountField
        value={initialBalance}
        onChange={setInitialBalance}
        label="Boshlang‘ich balans"
        currency="UZS"
        quick={false}
      />
    </FormSheet>
  );
}

/** §22: name + direction. Icon and hierarchy are optional details. */
function CategorySheet({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: CategoryView | null }) {
  const { state, mutate, toast } = useFinance();
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [icon, setIcon] = useState("•");
  const [parentId, setParentId] = useState("");
  const [isEssential, setIsEssential] = useState(false);
  const [touched, setTouched] = useState(false);
  const [initialDraft, setInitialDraft] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (!open) return;
    const draft = {
      name: editing?.name ?? "",
      type: editing?.type ?? "expense",
      icon: editing?.icon ?? "•",
      parentId: editing?.parentId ? String(editing.parentId) : "",
      isEssential: editing?.isEssential ?? false,
    };
    setName(draft.name);
    setType(draft.type as "expense" | "income");
    setIcon(draft.icon);
    setParentId(draft.parentId);
    setIsEssential(draft.isEssential);
    setTouched(false);
    setInitialDraft(draft);
  }, [open, editing]);

  const parents = (state?.categories ?? []).filter((c) => c.type === type && !c.parentId && c.id !== editing?.id);
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = "Kategoriya nomini kiriting";
  const valid = Object.keys(errors).length === 0;
  const dirty = isDirtyDraft({ name, type, icon, parentId, isEssential }, initialDraft);

  async function submit() {
    setTouched(true);
    if (!valid) return { ok: false, message: Object.values(errors)[0] };
    const res = await mutate(
      "category",
      editing ? "update" : "create",
      {
        id: editing?.id,
        name: name.trim(),
        type,
        icon: icon || "•",
        parentId: parentId ? Number(parentId) : null,
        isEssential,
      },
      { silent: true },
    );
    if (res.ok) toast(editing ? "Kategoriya yangilandi" : `“${name.trim()}” kategoriyasi saqlandi`, "success");
    return res;
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? "Kategoriyani tahrirlash" : "+ Kategoriya"}
      subtitle={editing ? undefined : "Daromad yoki xarajat toifasi"}
      submitLabel="Saqlash"
      canSubmit={valid}
      dirty={dirty}
      onSubmit={submit}
    >
      <CompactSegmented
        value={type}
        ariaLabel="Kategoriya turi"
        onChange={setType}
        options={[
          { value: "expense", label: "Xarajat" },
          { value: "income", label: "Daromad" },
        ]}
      />

      <Field label="Nomi" error={touched ? errors.name ?? null : null}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Misol: Bolalar" />
      </Field>

      <AdvancedSection>
        <FormRow>
          <Field label="Ikona (emoji)">
            <TextInput value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🧸" />
          </Field>
          <Field label="Muhimlik">
            <Select value={isEssential ? "1" : "0"} onChange={(e) => setIsEssential(e.target.value === "1")}>
              <option value="0">Ixtiyoriy</option>
              <option value="1">Majburiy</option>
            </Select>
          </Field>
        </FormRow>
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
      </AdvancedSection>
    </FormSheet>
  );
}
