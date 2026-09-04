"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertsSheet } from "@/components/app-shell";
import { useFinance } from "@/components/providers";
import { Badge, Card, ContextualBottomSheet, Label, Skeleton } from "@/components/ui";
import { Icon } from "@/components/icon";
import type { TranslationKey } from "@/lib/i18n";

/**
 * MENU = NAVIGATION HUB (§37). It routes to secondary tools and nothing more.
 * Balances, budget usage, debt totals and goal progress each have exactly ONE
 * primary home — their own pages. So every row carries a COUNT or a STATUS,
 * never a sum: "is there anything in there, and does it need me?" is
 * navigation information; the amount itself is not.
 */
const LINKS: Array<{ href: string; icon: string; titleKey: TranslationKey }> = [
  { href: "/accounts", icon: "card", titleKey: "menu.accounts" },
  { href: "/budgets", icon: "target", titleKey: "menu.budgets" },
  { href: "/debts", icon: "doc", titleKey: "menu.debts" },
  { href: "/goals", icon: "goal", titleKey: "menu.goals" },
  { href: "/bot", icon: "telegram", titleKey: "menu.telegramBot" },
  { href: "/settings", icon: "settings", titleKey: "menu.settings" },
];

export default function MorePage() {
  const { state, loading, theme, setTheme, telegram, exportXlsx, t } = useFinance();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportReady, setExportReady] = useState<{ url: string; filename: string } | null>(null);

  if (loading && !state) return <Skeleton className="h-96 w-full" />;
  if (!state) return null;

  const user = state.user;
  const accountCount = state.accounts.filter((a) => a.isActive).length;
  const exceeded = state.budgets.filter((b) => b.status === "exceeded").length;
  const unread = state.alerts.length + state.notifications.filter((n) => !n.isRead).length;

  /**
   * A row's trailing slot is a status when something needs attention, and a
   * plain count otherwise. An over-limit budget is the one case on this screen
   * that is genuinely urgent, so it is the one case that gets a tone.
   */
  const status = (href: string): { node: React.ReactNode } | null => {
    if (href === "/budgets" && exceeded > 0) {
      return { node: <Badge tone="negative">{t("menu.exceeded", { count: exceeded })}</Badge> };
    }
    if (href === "/bot") {
      return telegram ? { node: <Badge tone="positive">{t("common.connected")}</Badge> } : null;
    }
    const counts: Record<string, number> = {
      "/accounts": accountCount,
      "/budgets": state.budgets.length,
      "/debts": state.debts.length,
      "/goals": state.goals.length,
    };
    const count = counts[href];
    return count ? { node: <span className="text-[12px] font-semibold text-faint">{count}</span> } : null;
  };

  const themeLabel = theme === "dark" ? t("theme.dark") : theme === "light" ? t("theme.light") : t("theme.system");

  async function downloadExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportXlsx();
      if (result.ok && result.url) {
        setExportReady({ url: result.url, filename: result.filename ?? "hisobchi-eksport.xlsx" });
      }
    } finally {
      setExporting(false);
    }
  }

  function closeExportReady() {
    if (exportReady) URL.revokeObjectURL(exportReady.url);
    setExportReady(null);
  }

  return (
    <div className="animate-fade-up space-y-3.5">
      {/* Identity, centred — the Menu's own header. It states WHO, never how
          much: the balance has exactly one home and this is not it. */}
      <Card className="text-center">
        <div
          className="mx-auto grid h-[62px] w-[62px] place-items-center rounded-[21px] text-[23px] font-extrabold"
          style={{ background: "var(--gold-gradient)", color: "var(--gold-on)" }}
          aria-hidden="true"
        >
          <span className="num">{(user.firstName || "?").trim().charAt(0).toUpperCase()}</span>
        </div>
        <p className="mt-3 truncate text-[18px] font-bold leading-tight">{user.firstName}</p>
        <p className="mt-1 truncate text-[11.5px] text-faint">
          {user.username ? `@${user.username} · ` : ""}Telegram Mini App
        </p>
      </Card>

      {/* Personal controls belong directly below the profile, before the
          navigation hub's first destination (Hisoblar). */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          className="card flex items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99] touch-manipulation"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--tint-gold)", color: "var(--gold)" }} aria-hidden="true">
            <Icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "monitor"} size={17} />
          </span>
          <span className="min-w-0">
            <Label className="block">{t("menu.mode")}</Label>
            <span className="mt-0.5 block truncate text-[13.5px] font-bold">{themeLabel}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAlertsOpen(true)}
          className="card flex items-center gap-3 p-3.5 text-left transition-transform active:scale-[0.99] touch-manipulation"
          aria-label={`${t("alerts.title")}${unread ? `, ${t("common.unreadLabel", { count: unread })}` : ""}`}
        >
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--tint-blue)", color: "var(--blue)" }} aria-hidden="true">
            <Icon name="bell" size={17} />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-negative shadow-[0_0_0_2px_var(--surface)]" />
            ) : null}
          </span>
          <span className="min-w-0">
            <Label className="block">{t("menu.reminder")}</Label>
            <span className="mt-0.5 block truncate text-[13.5px] font-bold">
              {unread > 0 ? t("common.unreadCount", { count: unread }) : t("common.noNew")}
            </span>
          </span>
        </button>
      </div>

      <nav aria-label={t("menu.sections")} className="divide-y divide-hairline rounded-2xl border border-line bg-surface">
        {LINKS.map((l) => {
          const trailing = status(l.href);
          if (l.href === "/settings") {
            return (
              <div key={l.href}>
                <button
                  type="button"
                  onClick={() => void downloadExcel()}
                  disabled={exporting}
                  className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2 disabled:opacity-55 touch-manipulation"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text" aria-hidden="true">
                    <Icon name="doc" size={17} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{t("menu.excelExport")}</span>
                  <span className="shrink-0 text-[11.5px] font-semibold text-accent-text">{exporting ? t("common.preparing") : t("common.download")}</span>
                </button>
                <Link
                  href={l.href}
                  className="flex min-h-13 items-center gap-3 border-t border-hairline px-4 py-2.5 transition-colors last:rounded-b-2xl hover:bg-surface-2 active:bg-surface-2 touch-manipulation"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-soft text-fg-soft" aria-hidden="true">
                    <Icon name={l.icon} size={17} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{t(l.titleKey)}</span>
                  <Icon name="chevron-right" size={13} className="shrink-0 text-text-4" />
                </Link>
              </div>
            );
          }
          return (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-13 items-center gap-3 px-4 py-2.5 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2 active:bg-surface-2 touch-manipulation"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-soft text-fg-soft" aria-hidden="true">
                <Icon name={l.icon} size={17} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{t(l.titleKey)}</span>
              {trailing ? <span className="shrink-0">{trailing.node}</span> : null}
              <Icon name="chevron-right" size={13} className="shrink-0 text-text-4" />
            </Link>
          );
        })}
      </nav>

      <AlertsSheet open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      <ContextualBottomSheet
        open={Boolean(exportReady)}
        onClose={closeExportReady}
        title={t("menu.exportReady")}
        subtitle={t("menu.exportSubtitle")}
        icon="doc"
        iconTone="accent"
        footer={
          exportReady ? (
            <a
              href={exportReady.url}
              download={exportReady.filename}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[15px] font-bold text-white shadow-lg shadow-accent/20 transition-transform active:scale-[0.98] touch-manipulation"
            >
              <Icon name="doc" size={17} />
              {t("menu.exportAction")}
            </a>
          ) : null
        }
      >
        <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3.5 text-[13px] leading-relaxed text-muted">
          {t("menu.exportDescription")}
        </div>
      </ContextualBottomSheet>
    </div>
  );
}
