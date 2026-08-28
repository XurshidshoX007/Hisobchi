"use client";

import Link from "next/link";
import type { DashboardFacts } from "@/lib/dashboard";
import { compact, currencyLabel } from "@/lib/money";
import { CategoryDonut } from "./charts";
import { Card, Label, Money, Skeleton } from "./ui";
import { Icon } from "@/components/icon";
import { useBalanceHidden, useFinance } from "./providers";

/* =============================== HERO =============================== */

const GROUP_FILL: Record<string, string> = {
  bank: "var(--gold-gradient)",
  cards: "var(--blue)",
  cash: "var(--green)",
  ewallet: "var(--red)",
  other: "rgba(255,255,255,.12)",
};

/**
 * One balance, one panel. The old design nested a second card inside this one
 * for the account split; here the split is a segmented bar plus a divided
 * footer row, so the whole composition reads as a single object.
 */
export function DashboardHero({
  facts,
  currency,
  onOpenBreakdown,
}: {
  facts: DashboardFacts;
  currency: string;
  onOpenBreakdown?: () => void;
}) {
  const unit = currencyLabel(currency);
  const hidden = useBalanceHidden();
  const { setBalanceHidden } = useFinance();

  const positive = facts.balanceGroups.filter((group) => group.amount > 0);
  const positiveTotal = positive.reduce((sum, group) => sum + group.amount, 0);
  // The footer names at most three sources; a fourth would not fit at 320px
  // and the full list already has a primary home in /accounts.
  const footer = positive.slice(0, 3);

  return (
    <Card
      padded={false}
      className="relative overflow-hidden"
      style={{ borderRadius: "var(--radius-hero)" }}
    >
      {/* A gold hairline across the top edge and a soft glow behind the corner.
          Both are decoration only — they carry no state. */}
      <span
        className="pointer-events-none absolute left-[22px] right-[22px] top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(245,181,68,.75), transparent)" }}
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-[210px] w-[210px]"
        style={{ background: "radial-gradient(circle, rgba(245,181,68,.14), transparent 68%)" }}
        aria-hidden="true"
      />

      <div className="dashboard-value-transition relative min-w-0 px-5 pb-4.5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <Label>Umumiy balans</Label>
          <button
            type="button"
            onClick={() => setBalanceHidden(!hidden)}
            aria-pressed={hidden}
            aria-label={hidden ? "Summalarni ko‘rsatish" : "Summalarni yashirish"}
            className="-mr-1 grid h-7.5 w-7.5 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:text-fg-soft active:bg-surface-3 touch-manipulation"
          >
            <Icon name="eye" size={16} />
          </button>
        </div>

        <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2">
          <Money whole value={facts.balance} size="hero" tone={facts.balance < 0 ? "negative" : "default"} />
          <span className={`text-[13px] font-semibold ${facts.balance < 0 ? "text-negative-text" : "text-faint"}`}>
            {unit}
          </span>
        </div>

        {facts.hasBalanceBreakdown && positiveTotal > 0 ? (
          <BalanceSegments groups={positive} total={positiveTotal} onOpen={onOpenBreakdown} />
        ) : null}
      </div>

      {footer.length >= 2 ? (
        <div
          className="relative grid border-t border-line"
          style={{
            background: "rgba(0,0,0,.22)",
            gridTemplateColumns: `repeat(${footer.length}, minmax(0, 1fr))`,
          }}
        >
          {footer.map((group, index) => (
            <div key={group.key} className={`min-w-0 px-4 py-3 ${index ? "border-l border-line" : ""}`}>
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-[2px]"
                  style={{ background: GROUP_FILL[group.key] ?? "var(--text-3)" }}
                  aria-hidden="true"
                />
                <span className="truncate text-[10.5px] font-bold text-faint">{group.label}</span>
              </span>
              <p className="num mt-1 truncate text-[13px] font-bold">
                {/* Compact form: three full amounts side by side do not fit at
                    320px, and this row is a reference, not the primary figure. */}
                {hidden ? "•••••" : compact(group.amount)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function BalanceSegments({
  groups,
  total,
  onOpen,
}: {
  groups: DashboardFacts["balanceGroups"];
  total: number;
  onOpen?: () => void;
}) {
  const bar = (
    <div className="flex h-2 w-full gap-[3px]" role="presentation">
      {groups.map((group) => (
        <span
          key={group.key}
          className="h-full rounded transition-[width] duration-500 ease-out"
          style={{
            width: `${Math.max(3, (group.amount / total) * 100)}%`,
            background: GROUP_FILL[group.key] ?? "var(--text-3)",
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );

  if (!onOpen) return <div className="mt-4">{bar}</div>;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Balans taqsimotini ochish"
      className="mt-4 block w-full rounded-lg text-left transition-opacity active:opacity-70 touch-manipulation"
    >
      {bar}
    </button>
  );
}

/* =========================== QUICK ACTIONS =========================== */

export type QuickActionId = "income" | "expense" | "transfer";

const QUICK_ACTIONS: Array<{
  id: QuickActionId;
  label: string;
  icon: string;
  color: string;
  tint: string;
}> = [
  { id: "income", label: "Daromad", icon: "arrow-up", color: "var(--green)", tint: "var(--tint-green)" },
  { id: "expense", label: "Xarajat", icon: "arrow-down", color: "var(--red)", tint: "var(--tint-red)" },
  { id: "transfer", label: "Transfer", icon: "transfer", color: "var(--blue)", tint: "var(--tint-blue)" },
];

/**
 * Replaces the floating add button ON THIS SCREEN. The FAB cost two taps —
 * open the menu, then pick a direction — for the app's most frequent action;
 * these tiles open the add sheet with the type already chosen.
 *
 * The fourth tile is a receipt. The Mini App has no camera intake yet (photos
 * are parsed by the Telegram bot), so it links to the bot rather than opening
 * a control that would do nothing.
 */
export function QuickActions({ onAdd }: { onAdd: (id: QuickActionId) => void }) {
  const tile =
    "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[17px] border border-line-strong py-3 transition-transform active:scale-[0.97] touch-manipulation";
  const raised = { background: "var(--surface-raised)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.09)" };

  return (
    <div className="mt-5 grid grid-cols-4 gap-2">
      {QUICK_ACTIONS.map((action) => (
        <button key={action.id} type="button" onClick={() => onAdd(action.id)} className={tile} style={raised}>
          <span
            className="grid h-8 w-8 place-items-center rounded-[10px]"
            style={{ background: action.tint, color: action.color }}
            aria-hidden="true"
          >
            <Icon name={action.icon} size={16} />
          </span>
          <span className="text-[10px] font-bold text-fg-soft">{action.label}</span>
        </button>
      ))}
      <Link href="/bot" className={tile} style={raised}>
        <span
          className="grid h-8 w-8 place-items-center rounded-[10px]"
          style={{ background: "var(--tint-gold)", color: "var(--gold)" }}
          aria-hidden="true"
        >
          <Icon name="camera" size={16} />
        </span>
        <span className="text-[10px] font-bold text-fg-soft">Chek</span>
      </Link>
    </div>
  );
}

/* =========================== MONTH RESULT =========================== */

export function MonthResult({ facts, currency }: { facts: DashboardFacts; currency: string }) {
  const unit = currencyLabel(currency);
  const cells = [
    { label: "Daromad", value: facts.income, icon: "arrow-up", color: "var(--green)", tint: "var(--tint-green)", tone: "positive" as const },
    { label: "Xarajat", value: facts.expense, icon: "arrow-down", color: "var(--red)", tint: "var(--tint-red)", tone: "negative" as const },
  ];

  return (
    <div className="mt-4.5 grid min-w-0 grid-cols-2 gap-2.5">
      {cells.map((cell) => (
        <Card key={cell.label} padded={false} className="min-w-0 p-3.75">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
              style={{ background: cell.tint, color: cell.color }}
              aria-hidden="true"
            >
              <Icon name={cell.icon} size={13} strokeWidth={2} />
            </span>
            <Label className="truncate">{cell.label}</Label>
          </span>
          <div className="mt-2 min-w-0 leading-tight">
            <Money whole value={cell.value} size="lg" tone={cell.tone} currency={unit} />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ========================= EXPENSE BREAKDOWN ========================= */

const DONUT_COLORS = [
  "var(--gold)",
  "var(--blue)",
  "var(--green)",
  "var(--red)",
  "#c084fc",
  "#22c5b6",
  "#f973a5",
  "#fb923c",
];

/**
 * Shows every category that has spending in the current month. One chart answers
 * "where did it go?" and the readable legend preserves the complete breakdown.
 */
export function ExpenseBreakdown({ facts, monthLabel }: { facts: DashboardFacts; monthLabel: string }) {
  const items = facts.expenseCategories.map((category, index) => ({
    id: category.id,
    name: category.name,
    share: category.share,
    color: DONUT_COLORS[index % DONUT_COLORS.length],
  }));

  if (!items.length) return null;

  // Keep the donut and its legend visually connected at every width. Detailed
  // lists gain a little chart presence, while the legend only becomes two
  // columns once each column still has room for a readable category name.
  const hasDetailedBreakdown = items.length > 4;
  const donutSize = hasDetailedBreakdown ? 140 : 124;
  const summary = items.map((i) => `${i.name} ${Math.round(i.share * 100)}%`).join(", ");

  return (
    <Card className="mt-3.5">
      <Label>Xarajat taqsimoti · {monthLabel.split(" ")[0].toUpperCase()}</Label>
      <figure
        className={`mt-3.5 grid min-w-0 grid-cols-[7.75rem_minmax(0,1fr)] items-center gap-x-4 ${
          hasDetailedBreakdown
            ? "min-[520px]:grid-cols-[9rem_minmax(0,1fr)] min-[520px]:gap-x-5"
            : ""
        }`}
      >
        <div className="flex justify-center">
          <CategoryDonut items={items} size={donutSize} />
        </div>
        <figcaption
          className={`min-w-0 ${
            hasDetailedBreakdown
              ? "space-y-2.5 min-[520px]:grid min-[520px]:grid-cols-2 min-[520px]:gap-x-4 min-[520px]:gap-y-2.5 min-[520px]:space-y-0"
              : "space-y-2.5"
          }`}
        >
          {items.map((item) => (
            <span key={item.id ?? item.name} className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: item.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{item.name}</span>
              <span className="num shrink-0 text-[12.5px] font-bold text-faint">
                {Math.round(item.share * 100)}%
              </span>
            </span>
          ))}
          <span className="sr-only">{summary}</span>
        </figcaption>
      </figure>
    </Card>
  );
}

/* ============================== LOADING ============================== */

export function DashboardLoading() {
  return (
    <div aria-label="Ma’lumotlar yuklanmoqda" aria-busy="true">
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="flex-1"><Skeleton className="h-2.5 w-20" /><Skeleton className="mt-1.5 h-4 w-32" /></div>
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <div className="card overflow-hidden" style={{ borderRadius: "var(--radius-hero)" }}>
        <div className="px-5 pb-4.5 pt-5">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-2.5 h-10 w-4/5 max-w-72" />
          <Skeleton className="mt-4 h-2 w-full rounded" />
        </div>
        <div className="grid grid-cols-3 border-t border-line">
          {[0, 1, 2].map((cell) => (
            <div key={cell} className={`px-4 py-3 ${cell ? "border-l border-line" : ""}`}>
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="mt-1.5 h-3.5 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((tile) => (
          <Skeleton key={tile} className="h-16 rounded-[17px]" />
        ))}
      </div>
      <div className="mt-4.5 grid grid-cols-2 gap-2.5">
        {[0, 1].map((cell) => (
          <div key={cell} className="card p-3.75"><Skeleton className="h-6 w-24" /><Skeleton className="mt-2 h-5 w-4/5" /></div>
        ))}
      </div>
    </div>
  );
}
