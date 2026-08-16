"use client";
/* eslint-disable react-hooks/set-state-in-effect -- editable settings draft synchronizes to loaded server state */

import { useEffect, useState } from "react";
import { useFinance } from "@/components/providers";
import { Button, Card, Divider, Field, PageHeader, Segmented, Select, Skeleton, TextInput } from "@/components/ui";
import { formatAmount } from "@/lib/money";
import { TERMS } from "@/lib/copy";

export default function SettingsPage() {
  const { state, loading, mutate, theme, setTheme, telegram } = useFinance();
  const [firstName, setFirstName] = useState("");
  const [currency, setCurrency] = useState("UZS");
  const [minReserve, setMinReserve] = useState("0");
  const [confidence, setConfidence] = useState(50);
  const [notif, setNotif] = useState({ payments: true, income: true, budget: true, risk: true });

  useEffect(() => {
    if (state) {
      setFirstName(state.user.firstName ?? "");
      setCurrency(state.user.currency ?? "UZS");
      setMinReserve(String(state.user.minReserve ?? 0));
      setConfidence(state.user.estimatedIncomeConfidence ?? 50);
      setNotif({
        payments: state.user.notifyPayments ?? true,
        income: state.user.notifyIncome ?? true,
        budget: state.user.notifyBudget ?? true,
        risk: state.user.notifyRisk ?? true,
      });
    }
  }, [state]);

  if (loading && !state) return <Skeleton className="h-72 w-full" />;
  if (!state) return null;

  async function save() {
    await mutate(
      "settings",
      "update",
      {},
      {
        settings: {
          firstName,
          currency,
          minReserve: Number(minReserve.replace(/\s/g, "") || 0),
          estimatedIncomeConfidence: Number(confidence),
          notifyPayments: notif.payments,
          notifyIncome: notif.income,
          notifyBudget: notif.budget,
          notifyRisk: notif.risk,
        },
      },
    );
  }

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      {/* §19/§22: back + title only — no repeated profile header. */}
      <PageHeader title="Sozlamalar" back={{ href: "/more", label: "Menyu" }} />

      <Card>
        <p className="mb-4 text-[15px] font-semibold">Profil</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Field label="Ism">
            <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Valyuta">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="UZS">UZS — so‘m</option>
              <option value="USD">USD — dollar</option>
              <option value="EUR">EUR — yevro</option>
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-muted">
          {state.user.isDemo ? "Demo rejim. Telegram orqali kiring." : `ID: ${state.user.id}`}
          {telegram ? " · Mini App" : ""}
        </p>
      </Card>

      <Card>
        <p className="mb-1 text-[15px] font-semibold">{TERMS.safeToSpend}</p>
        <p className="mb-4 text-[12px] leading-snug text-muted">Shu qiymatlar asosida hisoblanadi.</p>
        <Field label="Minimal zaxira">
          <TextInput value={minReserve} onChange={(e) => setMinReserve(e.target.value)} inputMode="decimal" />
        </Field>
        <div className="mt-4">
          <Field
            label={`Taxminiy daromad ishonchliligi: ${confidence}%`}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="h-2 w-full touch-manipulation accent-[var(--accent)]"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>0% — hisobga olinmaydi</span>
              <span>100% — to‘liq</span>
            </div>
          </Field>
        </div>
        <Divider />
        <div className="mt-4 space-y-2 text-[12.5px]">
          <div className="flex justify-between gap-2">
            <span className="truncate text-muted">{TERMS.balance}</span>
            <span className="num shrink-0 font-medium">{formatAmount(state.forecast.currentBalance)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="truncate text-muted">Aniq daromad</span>
            <span className="num shrink-0 font-medium">{formatAmount(state.forecast.income.exactBase)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="truncate text-muted">Taxminiy daromad</span>
            <span className="num shrink-0 font-medium">{formatAmount(state.forecast.safeToSpendParts.estimatedIncomeWeighted)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="truncate text-muted">Majburiy to‘lov</span>
            <span className="num shrink-0 font-medium">−{formatAmount(state.forecast.expense.mandatoryBase)}</span>
          </div>
          <div className="flex justify-between gap-2 border-t border-line pt-2 font-semibold">
            <span>{TERMS.safeToSpend}</span>
            <span className="num">{formatAmount(state.forecast.safeToSpend)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <p className="mb-4 text-[15px] font-semibold">Eslatmalar</p>
        <div className="space-y-4">
          {(
            [
              { key: "payments" as const, label: "To‘lov", desc: "Ertaga to‘lov bor" },
              { key: "income" as const, label: "Daromad", desc: "Daromad kutilmoqda" },
              { key: "budget" as const, label: "Budjet", desc: "Limit oshishi yaqin" },
              { key: "risk" as const, label: "Xavf", desc: "Balans yetmasligi mumkin" },
            ] as const
          ).map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{row.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{row.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => setNotif((prev) => ({ ...prev, [row.key]: !prev[row.key as keyof typeof prev] }))}
                role="switch"
                aria-checked={notif[row.key]}
                aria-label={row.label}
                className={`relative h-7 w-12 shrink-0 touch-manipulation rounded-full border transition-colors ${
                  notif[row.key] ? "border-transparent bg-positive" : "border-line bg-surface-3"
                }`}
              >
                <span
                  className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow-sm transition-all ${
                    notif[row.key] ? "left-[26px] bg-positive-fg" : "left-[3px] bg-muted"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-4 text-[15px] font-semibold">Ko‘rinish</p>
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "☀️ Kunduzgi" },
            { value: "dark", label: "🌙 Tungi" },
            { value: "system", label: "🖥 Tizim" },
          ]}
        />

      </Card>

      <div className="flex justify-end pt-2">
        <Button type="button" onClick={save} className="w-full sm:w-auto">
          Saqlash
        </Button>
      </div>

    </div>
  );
}
