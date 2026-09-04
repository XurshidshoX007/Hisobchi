"use client";

import { useState } from "react";
import { useFinance } from "@/components/providers";
import { Button } from "@/components/ui";
import { LOCALE_OPTIONS, needsLocaleConfirmation, type AppLocale } from "@/lib/i18n";

const LANGUAGE_CODES: Record<AppLocale, string> = {
  "uz-Latn": "UZ",
  "uz-Cyrl": "ЎЗ",
  ru: "RU",
};

/** One-time language choice shown before onboarding for newly-created profiles. */
export function LanguageGate() {
  const { state, locale, setLocale, mutate, t } = useFinance();
  const [selected, setSelected] = useState<AppLocale | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state || !needsLocaleConfirmation(state.user.localeConfirmedAt)) return null;
  const chosen = selected ?? locale;

  function choose(next: AppLocale) {
    if (saving) return;
    setSelected(next);
    setLocale(next);
    setError(null);
  }

  async function confirm() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await mutate(
      "settings",
      "update",
      {},
      { silent: true, settings: { locale: chosen, confirmLocale: true } },
    );
    if (!result.ok) setError(t("errors.save"));
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[90] grid min-h-dvh place-items-center overflow-y-auto bg-bg px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="language-title">
      <section className="w-full max-w-sm rounded-[28px] border border-line-strong bg-surface p-5 shadow-2xl sm:p-6">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-[15px] font-extrabold text-primary-fg shadow-lg shadow-primary/15" aria-hidden="true">
          ₮
        </div>
        <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Til · Тил · Язык</p>
        <h1 id="language-title" className="mt-1 text-center text-[22px] font-extrabold tracking-tight">{t("language.title")}</h1>
        <p className="mx-auto mt-2 max-w-[280px] text-center text-[12.5px] leading-relaxed text-muted">{t("language.subtitle")}</p>

        <div className="mt-5 grid gap-2" role="radiogroup" aria-label="Til · Тил · Язык">
          {LOCALE_OPTIONS.map((option) => {
            const active = option.value === chosen;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => choose(option.value)}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3.5 text-left transition-all active:scale-[0.99] disabled:pointer-events-none ${
                  active
                    ? "border-primary bg-accent-soft shadow-[0_0_0_1px_var(--primary)]"
                    : "border-line bg-surface-2 hover:border-line-strong"
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-extrabold ${active ? "bg-primary text-primary-fg" : "bg-surface-3 text-fg-soft"}`} aria-hidden="true">
                  {LANGUAGE_CODES[option.value]}
                </span>
                <span className="min-w-0 flex-1 text-[14.5px] font-bold">{option.label}</span>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${active ? "border-primary bg-primary" : "border-line-strong"}`} aria-hidden="true">
                  {active ? <span className="h-1.5 w-1.5 rounded-full bg-primary-fg" /> : null}
                </span>
              </button>
            );
          })}
        </div>

        {error ? <p className="mt-3 text-center text-[12px] font-semibold text-negative-text" role="alert">{error}</p> : null}

        <Button className="mt-5 w-full" size="lg" disabled={saving} onClick={() => void confirm()}>
          {saving ? t("language.saving") : t("language.continue")}
        </Button>
        <p className="mt-3 text-center text-[10.5px] leading-relaxed text-faint">{t("language.changeLater")}</p>
      </section>
    </div>
  );
}
