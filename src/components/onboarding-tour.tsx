"use client";
/* eslint-disable react-hooks/set-state-in-effect -- local first-use preference must be read after hydration */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { useFinance } from "@/components/providers";
import { Button } from "@/components/ui";
import { shouldStartOnboarding } from "@/lib/onboarding";

const STORAGE_KEY = "hisobchi:onboarding:v1";

export const ONBOARDING_STEPS = [
  { href: "/", navLabel: "Asosiy", icon: "nav-home", title: "Moliyangiz bir joyda", body: "Balans, shu oyning natijasi va tezkor daromad yoki xarajat qo‘shish shu yerda." },
  { href: "/transactions", navLabel: "Tarix", icon: "nav-history", title: "Har bir operatsiya nazoratda", body: "Kiritilgan xarajat va daromadlarni ko‘ring, qidiring hamda kerak bo‘lsa tahrirlang." },
  { href: "/plans", navLabel: "Reja", icon: "nav-plans", title: "Kelajakni rejalang", body: "To‘lovlar va kutilayotgan daromadlarni kiriting — ular Pul oqimi prognoziga qo‘shiladi." },
  { href: "/analytics", navLabel: "Tahlil", icon: "nav-analytics", title: "Raqamlar sizga gapiradi", body: "Pul oqimi, trendlar va xarajat kategoriyalari ma’lumotlar kiritilgach shu yerda paydo bo‘ladi." },
] as const;

/** First-use guide. It is local-only so it never changes a user's finance data. */
export function OnboardingTour({ onStepChange }: { onStepChange: (href: string | null) => void }) {
  const { state, loading } = useFinance();
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);

  const isEmptyAccount = state ? shouldStartOnboarding(state) : false;

  useEffect(() => {
    if (loading || !state || !isEmptyAccount) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "done") setStep(0);
    } catch {
      setStep(0);
    }
  }, [isEmptyAccount, loading, state]);

  useEffect(() => {
    onStepChange(step === null ? null : ONBOARDING_STEPS[step].href);
    return () => onStepChange(null);
  }, [onStepChange, step]);

  if (step === null) return null;
  const currentIndex = step;
  const current = ONBOARDING_STEPS[currentIndex];

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      // Storage can be unavailable in private mode; closing still works now.
    }
    setStep(null);
  }

  function next() {
    if (currentIndex === ONBOARDING_STEPS.length - 1) {
      finish();
      router.push("/");
      return;
    }
    const nextStep = currentIndex + 1;
    setStep(nextStep);
    router.push(ONBOARDING_STEPS[nextStep].href);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/45 px-3 pb-[calc(var(--bottom-nav-height)+var(--app-safe-area-bottom)+16px)] pt-10 backdrop-blur-[1px] sm:items-center sm:justify-center sm:pb-10" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="animate-fade-up w-full max-w-sm rounded-[24px] border border-line-strong bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-text animate-pulse-subtle" aria-hidden="true">
            <Icon name={current.icon} size={21} />
          </div>
          <button type="button" onClick={finish} className="min-h-9 shrink-0 px-1 text-[12px] font-semibold text-muted transition-colors hover:text-fg touch-manipulation">O‘tkazib yuborish</button>
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-text">{currentIndex + 1} / {ONBOARDING_STEPS.length} · {current.navLabel}</p>
        <h2 id="onboarding-title" className="mt-1 text-[19px] font-bold tracking-tight">{current.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{current.body}</p>
        <div className="mt-5 flex gap-1.5" aria-label={`${currentIndex + 1}-qadam`}>
          {ONBOARDING_STEPS.map((item, index) => <span key={item.href} className={`h-1.5 flex-1 rounded-full transition-colors ${index <= currentIndex ? "bg-primary" : "bg-surface-3"}`} />)}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={finish}>Keyinroq</Button>
          <Button onClick={next}>{currentIndex === ONBOARDING_STEPS.length - 1 ? "Boshlash" : "Keyingi"}</Button>
        </div>
      </section>
    </div>
  );
}
