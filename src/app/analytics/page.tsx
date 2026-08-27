import Link from "next/link";
import { Icon } from "@/components/icon";

/**
 * ANALYTICS — "Tez kunda" (coming soon).
 *
 * The analytics ENGINE (state.analytics, buildAnalytics, finance/forecast/health
 * helpers and every chart component) is intentionally left untouched: Dashboard,
 * Budgets and the Telegram bot still consume the same shared analytics data.
 * Only this page's PRESENTATION is gated — the dashboard UI is not rendered, so
 * no expensive analytics-only client components are mounted for this route.
 *
 * The route itself stays valid: direct visits and refreshes render this state
 * (never a 404), and the bottom-nav "Tahlil" item keeps its name + icon.
 */
export default function AnalyticsPage() {
  return (
    <div className="animate-fade-up flex min-h-[62dvh] flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft text-accent-text"
        aria-hidden="true"
      >
        <Icon name="chart" size={30} />
      </div>

      <h1 className="mt-5 text-xl font-bold tracking-tight sm:text-[22px]">Tez kunda</h1>

      <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-muted">
        Tahlil va trendlar shu bo‘limda paydo bo‘ladi.
      </p>

      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:border-line-strong hover:bg-surface-2 active:scale-[0.98] touch-manipulation"
      >
        Asosiy sahifa
      </Link>
    </div>
  );
}
