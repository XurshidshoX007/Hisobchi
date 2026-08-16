"use client";

import { useId } from "react";
import { Money, Progress } from "./ui";
import { dayMonth, formatAmount, relativeDayShort } from "@/lib/money";

/**
 * ONE monthly financial surface for Plans → To‘lovlar (§28/§29).
 *
 * These two components are PURE PRESENTATION: every number arrives already
 * calculated by the finance layer (`buildCurrentMonthPlan`, `isActivePlanLoad`,
 * …). Nothing here derives money, and nothing here fetches.
 *
 * Hierarchy the layout encodes, strongest first:
 *   1. this month's mandatory load
 *   2. paid / remaining (+ progress)
 *   3. the nearest payment
 *   4. optional / active / yearly / term remaining  → SecondaryPlanMetrics
 */

export type NearestPaymentView = {
  id: number;
  name: string;
  date: string;
  daysLeft: number;
  base: number;
  mandatory: boolean;
  status: "overdue" | "today" | "upcoming";
};

const LABEL = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted";

/** Counts read as quiet context, never as a second amount. */
function countSuffix(count: number): string {
  return count ? ` · ${count} ta` : "";
}

export function MonthlyPlanSummary({
  monthLabel,
  mandatory,
  paid,
  remaining,
  progress,
  paidCount = 0,
  remainingCount = 0,
  overdueCount = 0,
  overdueAmount = 0,
  activeCount = 0,
  nearestPayment,
  onNearestClick,
}: {
  monthLabel: string;
  mandatory: number;
  paid: number;
  remaining: number;
  /** 0…1, already clamped by the finance layer. */
  progress: number;
  paidCount?: number;
  remainingCount?: number;
  overdueCount?: number;
  overdueAmount?: number;
  activeCount?: number;
  nearestPayment: NearestPaymentView | null;
  onNearestClick?: () => void;
}) {
  const headingId = useId();
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  // §26: nothing planned, nothing paid → a two-line card, not a giant blank one.
  if (!activeCount && mandatory === 0 && paid === 0 && remaining === 0) {
    return (
      <section className="card p-4 sm:p-5" aria-labelledby={headingId}>
        <h2 id={headingId} className={LABEL}>
          Bu oy · {monthLabel}
        </h2>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="text-[12px] text-muted">
            Majburiy <span className="num text-[17px] font-semibold text-fg">0</span>
          </p>
          <p className="text-[12px] text-muted">
            Faol rejalar <span className="num text-[17px] font-semibold text-fg">0</span>
          </p>
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-muted">Faol to‘lov rejasi yo‘q.</p>
      </section>
    );
  }

  // @container/summary: the two-column split depends on the CARD's width, not
  // on the viewport — the same card stays correct in a phone and in a sidebar.
  return (
    <section className="card @container/summary p-4 sm:p-5" aria-labelledby={headingId}>
      <div className="@min-[640px]/summary:grid @min-[640px]/summary:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] @min-[640px]/summary:gap-5">
        {/* ---------- Level 1 + 2: mandatory load, paid / remaining, progress ---------- */}
        <div>
          <h2 id={headingId} className={LABEL}>
            Bu oy · {monthLabel}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <Money value={mandatory} size="xl" />
            <span className="text-[11.5px] text-muted">majburiy yuk</span>
          </div>

          <div className="mt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px] text-muted">
              <p>
                To‘langan <span className="num font-semibold text-positive-text">{formatAmount(paid)}</span>
                {countSuffix(paidCount)}
              </p>
              <p>
                Qolgan <span className="num font-semibold text-fg">{formatAmount(remaining)}</span>
                {countSuffix(remainingCount)}
              </p>
            </div>
            <div className="mt-1.5">
              <Progress
                value={progress}
                tone="accent"
                height={5}
                ariaLabel={`Bu oy majburiy to‘lovlar bajarildi: ${pct}%`}
              />
            </div>
          </div>
        </div>

        {/* ---------- Level 3: nearest payment — a row, never a nested card ---------- */}
        <div className="mt-2.5 border-t border-line pt-2.5 @min-[640px]/summary:mt-0 @min-[640px]/summary:border-l @min-[640px]/summary:border-t-0 @min-[640px]/summary:pl-5 @min-[640px]/summary:pt-0">
          <p className={LABEL}>Eng yaqin to‘lov</p>
          {nearestPayment ? (
            <NearestPaymentRow payment={nearestPayment} onClick={onNearestClick} />
          ) : remaining === 0 && paid > 0 ? (
            <p className="mt-1.5 text-[13px] font-medium text-positive-text">✓ Reja yakunlangan</p>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted">Bu oyda ochiq to‘lov qolmadi.</p>
          )}

          {/* §27: overdue stays INSIDE this surface — no separate warning card. */}
          {overdueCount > 1 ? (
            <p className="mt-2 text-[11.5px] font-medium text-negative-text">
              🔴 {overdueCount} ta kechikkan to‘lov · <span className="num">{formatAmount(overdueAmount)}</span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NearestPaymentRow({ payment, onClick }: { payment: NearestPaymentView; onClick?: () => void }) {
  const overdue = payment.status === "overdue";
  const dateTone = overdue ? "text-negative-text" : payment.status === "today" ? "text-warning-text" : "text-muted";
  const content = (
    <>
      <div className="w-[62px] shrink-0">
        <p className="num text-[13px] font-semibold leading-tight text-fg">{dayMonth(payment.date)}</p>
        <p className={`text-[11px] leading-tight ${dateTone}`}>
          {overdue ? "Kechikkan" : relativeDayShort(payment.daysLeft)}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold leading-tight">{payment.name}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-muted">{payment.mandatory ? "majburiy" : "ixtiyoriy"}</p>
      </div>
      <div className="shrink-0 text-right">
        <Money value={payment.base} size="md" tone={overdue ? "negative" : "default"} />
      </div>
    </>
  );

  const rowClass = "mt-1.5 flex w-full items-center gap-3 text-left";
  if (!onClick) {
    return (
      <div role="group" aria-label="Eng yaqin to‘lov" className={rowClass}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Eng yaqin to‘lov: ${payment.name}, ${dayMonth(payment.date)}, ${formatAmount(payment.base)} so‘m`}
      className={`${rowClass} -mx-1 min-h-11 rounded-xl px-1 transition-colors hover:bg-surface-2 active:bg-surface-3 touch-manipulation`}
    >
      {content}
    </button>
  );
}

/**
 * Level 4 (§9/§11): four supporting numbers on ONE flat surface — no border,
 * no shadow and no card per metric.
 */
export function SecondaryPlanMetrics({
  optional,
  optionalCount = 0,
  active,
  pausedCount = 0,
  yearly,
  recurringCount = 0,
  termRemaining,
  termCount = 0,
}: {
  optional: number;
  optionalCount?: number;
  active: number;
  pausedCount?: number;
  yearly: number;
  recurringCount?: number;
  termRemaining: number;
  termCount?: number;
}) {
  const items = [
    { label: "Ixtiyoriy", value: formatAmount(optional), context: optionalCount ? `${optionalCount} ta reja` : "reja yo‘q" },
    { label: "Faol", value: String(active), context: pausedCount ? `${pausedCount} ta pauzada` : "pauzada yo‘q" },
    { label: "Yillik", value: formatAmount(yearly), context: recurringCount ? "doimiy rejalar" : "doimiy reja yo‘q" },
    {
      label: "Muddatli",
      value: formatAmount(termRemaining),
      context: termCount ? `${termCount} ta reja` : "muddatli reja yo‘q",
    },
  ];

  return (
    /*
     * Container query, not a viewport query: the strip reflows on ITS OWN
     * width, so 4-up only appears when a column can still hold "3 760 000".
     * 362px == a 390px phone minus the app shell's 14px page gutters.
     */
    <div className="@container">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-2xl bg-surface-2 px-3.5 py-2.5 @min-[362px]:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{item.label}</dt>
            <dd className="mt-0.5">
              <span className="num block break-words text-[13.5px] font-semibold leading-tight text-fg">{item.value}</span>
              <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted">{item.context}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
