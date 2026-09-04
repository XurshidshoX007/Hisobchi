"use client";
/* eslint-disable react-hooks/set-state-in-effect -- editable settings draft synchronizes to loaded server state */

import { useEffect, useState } from "react";
import { useFinance } from "@/components/providers";
import { Button, Card, Divider, Field, Segmented, Select, Skeleton, TextInput } from "@/components/ui";
import { formatAmount } from "@/lib/money";
import { LOCALE_OPTIONS, normalizeLocale, type AppLocale } from "@/lib/i18n";

export default function SettingsPage() {
  const { state, loading, mutate, theme, setTheme, telegram, locale, setLocale, t } = useFinance();
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
          locale,
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

  async function changeLanguage(next: AppLocale) {
    const previous = locale;
    setLocale(next);
    const result = await mutate("settings", "update", {}, { silent: true, settings: { locale: next } });
    if (!result.ok) setLocale(previous);
  }

  return (
    <div className="animate-fade-up space-y-4 sm:space-y-5">
      {/* §19/§22: swipe-back replaces the old ‹ Menyu back link. */}

      <Card>
        <p className="mb-4 text-[15px] font-semibold">{t("settings.profile")}</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
          <Field label={t("settings.name")}>
            <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label={t("settings.currency")}>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled>
              <option value="UZS">UZS — so‘m</option>
              <option value="USD">USD — dollar</option>
              <option value="EUR">EUR — yevro</option>
            </Select>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">
              {t("settings.currencyLocked")}
            </p>
          </Field>
          <Field label={t("settings.language")}>
            <Select
              value={locale}
              onChange={(event) => void changeLanguage(normalizeLocale(event.target.value))}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
            <p className="mt-1.5 text-[11px] leading-snug text-muted">{t("settings.languageHint")}</p>
          </Field>
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-muted">
          {state.user.isDemo ? t("common.demo") : `ID: ${state.user.id}`}
          {telegram ? ` · ${t("common.miniApp")}` : ""}
        </p>
      </Card>

      <Card>
        <p className="mb-1 text-[15px] font-semibold">{t("settings.safeToSpend")}</p>
        <p className="mb-4 text-[12px] leading-snug text-muted">{t("settings.basedOnValues")}</p>
        <Field label={t("settings.minReserve")}>
          <TextInput value={minReserve} onChange={(e) => setMinReserve(e.target.value)} inputMode="decimal" />
        </Field>
        <div className="mt-4">
          <Field
            label={t("settings.confidence", { value: confidence })}
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
              <span>{t("settings.confidenceZero")}</span>
              <span>{t("settings.confidenceFull")}</span>
            </div>
          </Field>
        </div>
        <Divider />
        <div className="mt-4 space-y-2 text-[12.5px]">
          <div className="flex justify-between gap-2">
            <span className="truncate text-muted">{t("settings.balance")}</span>
            <span className="num shrink-0 font-medium">{formatAmount(state.forecast.currentBalance)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="truncate text-muted">{t("settings.exactIncome")}</span>
            <span className="num shrink-0 font-medium">{formatAmount(state.forecast.income.exactBase)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="truncate text-muted">{t("settings.estimatedIncome")}</span>
            <span className="num shrink-0 font-medium">{formatAmount(state.forecast.safeToSpendParts.estimatedIncomeWeighted)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="truncate text-muted">{t("settings.mandatoryPayment")}</span>
            <span className="num shrink-0 font-medium">−{formatAmount(state.forecast.expense.mandatoryBase)}</span>
          </div>
          <div className="flex justify-between gap-2 border-t border-line pt-2 font-semibold">
            <span>{t("settings.safeToSpend")}</span>
            <span className="num">{formatAmount(state.forecast.safeToSpend)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <p className="mb-4 text-[15px] font-semibold">{t("settings.reminders")}</p>
        <div className="space-y-4">
          {(
            [
              { key: "payments" as const, label: t("settings.payment"), desc: t("settings.paymentDesc") },
              { key: "income" as const, label: t("settings.income"), desc: t("settings.incomeDesc") },
              { key: "budget" as const, label: t("settings.budget"), desc: t("settings.budgetDesc") },
              { key: "risk" as const, label: t("settings.risk"), desc: t("settings.riskDesc") },
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
                // 40×23 with an 18px knob — the design's switch geometry. Gold
                // when on, because "on" is a brand-positive state here.
                className={`relative h-[23px] w-10 shrink-0 touch-manipulation rounded-full border transition-colors ${
                  notif[row.key] ? "border-transparent" : "border-line bg-surface-3"
                }`}
                style={notif[row.key] ? { background: "var(--gold)" } : undefined}
              >
                <span
                  className={`absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full transition-all ${
                    notif[row.key] ? "left-[20px]" : "left-[2px] bg-muted"
                  }`}
                  style={notif[row.key] ? { background: "var(--gold-on)" } : undefined}
                />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-4 text-[15px] font-semibold">{t("settings.appearance")}</p>
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: t("theme.light"), icon: "sun" },
            { value: "dark", label: t("theme.dark"), icon: "moon" },
            { value: "system", label: t("theme.system"), icon: "monitor" },
          ]}
        />

      </Card>

      <div className="flex justify-end pt-2">
        <Button type="button" onClick={save} className="w-full sm:w-auto">
          {t("common.save")}
        </Button>
      </div>

    </div>
  );
}
