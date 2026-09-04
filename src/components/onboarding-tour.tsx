"use client";
/* eslint-disable react-hooks/set-state-in-effect -- local first-use preference must be read after hydration */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { useFinance } from "@/components/providers";
import { Button } from "@/components/ui";
import { onboardingStorageKey, shouldStartOnboarding } from "@/lib/onboarding";
import type { TranslationKey } from "@/lib/i18n";

export const ONBOARDING_STEPS: ReadonlyArray<{
  href: string;
  navKey: TranslationKey;
  icon: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { href: "/", navKey: "nav.home", icon: "nav-home", titleKey: "onboarding.homeTitle", bodyKey: "onboarding.homeBody" },
  { href: "/transactions", navKey: "nav.history", icon: "nav-history", titleKey: "onboarding.historyTitle", bodyKey: "onboarding.historyBody" },
  { href: "/plans", navKey: "nav.plans", icon: "nav-plans", titleKey: "onboarding.plansTitle", bodyKey: "onboarding.plansBody" },
  { href: "/analytics", navKey: "nav.analytics", icon: "nav-analytics", titleKey: "onboarding.analyticsTitle", bodyKey: "onboarding.analyticsBody" },
];

/** First-use guide. It is local-only so it never changes a user's finance data. */
export function OnboardingTour({ onStepChange }: { onStepChange: (href: string | null) => void }) {
  const { state, loading, t } = useFinance();
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);

  const isEmptyAccount = state ? shouldStartOnboarding(state) : false;
  const storageKey = state ? onboardingStorageKey(state.user.id) : null;

  useEffect(() => {
    // A background state refresh can happen while the guide switches routes.
    // Never re-initialize an already visible step back to 1/4.
    if (step !== null || loading || !state || !isEmptyAccount || !storageKey) return;
    try {
      if (localStorage.getItem(storageKey) !== "done") setStep(0);
    } catch {
      setStep(0);
    }
  }, [isEmptyAccount, loading, state, step, storageKey]);

  useEffect(() => {
    onStepChange(step === null ? null : ONBOARDING_STEPS[step].href);
  }, [onStepChange, step]);

  useEffect(() => {
    return () => onStepChange(null);
  }, [onStepChange]);

  if (step === null) return null;
  const currentIndex = step;
  const current = ONBOARDING_STEPS[currentIndex];

  function finish() {
    try {
      if (storageKey) localStorage.setItem(storageKey, "done");
    } catch {
      // Storage can be unavailable in private mode; closing still works now.
    }
    setStep(null);
  }

  function next() {
    if (currentIndex === ONBOARDING_STEPS.length - 1) {
      finish();
      router.replace("/");
      return;
    }
    const nextStep = currentIndex + 1;
    setStep(nextStep);
    // The guide owns a single temporary route. Replacing avoids creating a
    // back-stack of explanatory pages or racing two quick Next taps.
    router.replace(ONBOARDING_STEPS[nextStep].href);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/30 px-3 pb-[calc(var(--bottom-nav-height)+var(--app-safe-area-bottom)+16px)] pt-10 sm:items-center sm:justify-center sm:pb-10" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="onboarding-sheet animate-fade-up w-full max-w-sm overflow-hidden rounded-[var(--radius-sheet)] border border-line-strong p-5 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-faint/50" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4">
          <div className="tour-icon-orbit grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text" aria-hidden="true">
            <Icon name={current.icon} size={22} />
          </div>
          <button type="button" onClick={finish} className="min-h-9 shrink-0 rounded-full px-2 text-[12px] font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg touch-manipulation">{t("onboarding.skip")}</button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-text">{t(current.navKey)}</p>
          <span className="rounded-full border border-warning/35 bg-warning-soft px-2 py-1 text-[10px] font-bold text-warning-text">{currentIndex + 1} / {ONBOARDING_STEPS.length}</span>
        </div>
        <h2 id="onboarding-title" className="mt-1.5 text-[20px] font-bold tracking-tight">{t(current.titleKey)}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{t(current.bodyKey)}</p>
        <div className="mt-5 flex gap-1.5" aria-label={t("onboarding.stepLabel", { step: currentIndex + 1 })}>
          {ONBOARDING_STEPS.map((item, index) => <span key={item.href} className={`h-1 flex-1 rounded-full transition-colors ${index <= currentIndex ? "bg-primary" : "bg-surface-3"}`} />)}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={finish}>{t("onboarding.later")}</Button>
          <Button className="min-w-[116px]" onClick={next}>{currentIndex === ONBOARDING_STEPS.length - 1 ? t("onboarding.start") : t("onboarding.next")}</Button>
        </div>
      </section>
    </div>
  );
}
