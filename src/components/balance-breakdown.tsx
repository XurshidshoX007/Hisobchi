"use client";

import Link from "next/link";
import type { BalanceGroup, BalanceGroupKey } from "@/lib/dashboard";
import { currencyLabel } from "@/lib/money";
import { ContextualBottomSheet, Money } from "./ui";

/**
 * Tone → paired background + text tokens.
 *
 * Kept in one place so light/dark themes pick up the same design tokens as
 * the rest of the app (see globals.css).
 */
const TONE_STYLES: Record<BalanceGroup["tone"], { bar: string; chipBg: string; chipText: string; dot: string }> = {
  positive: { bar: "bg-positive", chipBg: "bg-positive-soft", chipText: "text-positive-text", dot: "bg-positive" },
  accent: { bar: "bg-accent", chipBg: "bg-accent-soft", chipText: "text-accent-text", dot: "bg-accent" },
  info: { bar: "bg-primary", chipBg: "bg-surface-3", chipText: "text-fg-soft", dot: "bg-primary" },
  warning: { bar: "bg-warning", chipBg: "bg-warning-soft", chipText: "text-warning-text", dot: "bg-warning" },
  neutral: { bar: "bg-surface-3", chipBg: "bg-surface-3", chipText: "text-fg-soft", dot: "bg-fg-soft" },
};

function formatPercent(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "0%";
  const pct = share * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  // Keep 1 decimal for small slivers so a 3.4% wedge doesn't collapse to "3%".
  return `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
}

/**
 * Hero-embedded, always-visible balance composition.
 *
 * §26/§13: a compact reference to the per-account balances that live in
 * /accounts. It never re-derives money — it consumes the same `balanceGroups`
 * projection the sheet uses.
 */
export function BalanceDistributionBar({
  groups,
  onOpen,
}: {
  groups: BalanceGroup[];
  onOpen: () => void;
}) {
  const positiveGroups = groups.filter((group) => group.amount > 0);
  const positiveTotal = positiveGroups.reduce((sum, group) => sum + group.amount, 0);
  // A bar without at least one positive slice would be misleading (or empty).
  // We still render the legend so an overdrawn state is not silently hidden.
  const hasBar = positiveTotal > 0 && positiveGroups.length >= 1;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Balans taqsimotini ochish"
      className="balance-distribution group mt-3.5 block w-full select-none rounded-xl p-1.5 text-left transition-all duration-200 hover:bg-surface-2/80 active:bg-surface-3 active:scale-[0.99] touch-manipulation"
    >
      {hasBar ? (
        <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3 p-[1px]" role="presentation">
          {positiveGroups.map((group) => {
            const width = Math.max(2, (group.amount / positiveTotal) * 100);
            const tone = TONE_STYLES[group.tone];
            return (
              <span
                key={group.key}
                className={`${tone.bar} h-full rounded-full transition-all duration-500 ease-out group-hover:brightness-105`}
                style={{ width: `${width}%` }}
                aria-hidden="true"
              />
            );
          })}
        </div>
      ) : null}

      <div className="mt-2.5 flex min-w-0 items-center gap-3 overflow-hidden">
        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {groups.map((group) => {
            const tone = TONE_STYLES[group.tone];
            return (
              <li key={group.key} className="flex min-w-0 items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full shadow-2xs ${tone.dot}`} aria-hidden="true" />
                <span className="truncate text-[11.5px] font-medium text-fg-soft">{group.label}</span>
                <span className="text-[11.5px] font-semibold tabular-nums text-muted">
                  {formatPercent(group.share)}
                </span>
              </li>
            );
          })}
        </ul>
        <ChevronDown />
      </div>
    </button>
  );
}

function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-muted transition-transform duration-200 group-hover:translate-y-0.5"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/**
 * Detail peek — total, per-group rows with account subtitles, and a link to
 * /accounts (the PRIMARY home for account management).
 */
export function BalanceBreakdownSheet({
  open,
  onClose,
  groups,
  total,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  groups: BalanceGroup[];
  total: number;
  currency: string;
}) {
  const unit = currencyLabel(currency);
  const positiveTotal = groups.reduce((sum, group) => (group.amount > 0 ? sum + group.amount : sum), 0);

  return (
    <ContextualBottomSheet
      open={open}
      onClose={onClose}
      title="Balans taqsimoti"
      subtitle="Faol hisoblar bo‘yicha bugungi qoldiq"
      footer={
        <Link
          href="/accounts"
          onClick={onClose}
          className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-2 text-[15px] font-semibold text-accent-text shadow-xs transition-all duration-200 hover:border-line-strong hover:bg-surface-2 active:scale-[0.98] active:bg-surface-3 touch-manipulation"
        >
          Hisoblarni boshqarish
          <span className="inline-block transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">→</span>
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-line bg-surface-2/60 px-4 py-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Jami</p>
          <div className="mt-1">
            <Money whole value={total} size="xl" tone={total < 0 ? "negative" : "default"} currency={unit} />
          </div>
        </div>

        {positiveTotal > 0 ? (
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3 p-[1px]" role="presentation">
            {groups
              .filter((group) => group.amount > 0)
              .map((group) => {
                const width = Math.max(2, (group.amount / positiveTotal) * 100);
                const tone = TONE_STYLES[group.tone];
                return (
                  <span
                    key={group.key}
                    className={`${tone.bar} h-full rounded-full transition-all duration-500 ease-out`}
                    style={{ width: `${width}%` }}
                    aria-hidden="true"
                  />
                );
              })}
          </div>
        ) : null}

        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-xs">
          {groups.map((group) => (
            <BreakdownRow key={group.key} group={group} unit={unit} />
          ))}
        </ul>
      </div>
    </ContextualBottomSheet>
  );
}

function BreakdownRow({ group, unit }: { group: BalanceGroup; unit: string }) {
  const tone = TONE_STYLES[group.tone];
  const isZero = Math.round(group.amount) === 0;
  const subtitle = groupSubtitle(group);

  return (
    <li className="group flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-2/60">
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg shadow-xs transition-transform duration-200 group-hover:scale-105 ${tone.chipBg} ${tone.chipText}`}
        aria-hidden="true"
      >
        {group.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14.5px] font-semibold ${isZero ? "text-fg-soft" : "text-fg"}`}>{group.label}</p>
        {subtitle ? <p className="mt-0.5 truncate text-[11.5px] text-muted">{subtitle}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <Money
          whole
          value={group.amount}
          size="md"
          tone={group.amount < 0 ? "negative" : isZero ? "muted" : "default"}
          currency={unit}
        />
        <p className="mt-0.5 text-[11px] font-medium tabular-nums text-muted">{formatPercent(group.share)}</p>
      </div>
    </li>
  );
}

function groupSubtitle(group: BalanceGroup): string | null {
  if (!group.accounts.length) return null;
  if (group.key === "cards") {
    // "Uzcard · Humo · Uzcard" → dedupe with insertion order preserved.
    const seen = new Set<string>();
    const names: string[] = [];
    for (const account of group.accounts) {
      const label = cardTypeLabel(account.type);
      if (label && !seen.has(label)) {
        seen.add(label);
        names.push(label);
      }
    }
    if (names.length) return names.join(" · ");
  }
  if (group.accounts.length === 1) return group.accounts[0].name;
  return `${group.accounts.length} ta hisob`;
}

function cardTypeLabel(type: string): string | null {
  switch (type as BalanceGroupKey | string) {
    case "uzcard":
      return "Uzcard";
    case "humo":
      return "Humo";
    default:
      return null;
  }
}
