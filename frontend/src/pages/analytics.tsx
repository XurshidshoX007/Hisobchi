import { Link } from "react-router-dom";

/**
 * The analytics engine is already shared by Dashboard, Budgets and the bot.
 * This route stays intentionally gated while presenting a trustworthy preview
 * of the product direction instead of an empty placeholder.
 */
export function AnalyticsPage() {
  return (
    <div className="animate-fade-up mx-auto w-full max-w-4xl">
      <section className="card relative overflow-hidden p-5 sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent opacity-[0.08] blur-3xl" />
        <div className="grid items-center gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-12">
          <div className="relative z-10 text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-text">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Ishlab chiqilmoqda
            </span>
            <div className="mx-auto mt-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-fg shadow-lg shadow-primary/10 lg:mx-0" aria-hidden="true">
              <AnalyticsIcon />
            </div>
            <h1 className="mt-5 text-[26px] font-bold tracking-[-0.045em] sm:text-3xl">Tez kunda</h1>
            <p className="mx-auto mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-muted lg:mx-0">
              Raqamlar shunchaki jadval bo‘lib qolmaydi. Hisobchi sarf odatlari, oylik trend va imkoniyatlarni aniq xulosalarga aylantiradi.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4.5 text-sm font-semibold text-primary-fg shadow-[0_12px_24px_-16px_rgba(10,40,30,0.8)] transition-all hover:bg-primary-hover active:scale-[0.98] touch-manipulation"
            >
              Asosiy sahifaga qaytish <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="analytics-preview-grid relative min-h-[290px] overflow-hidden rounded-[20px] border border-line bg-surface-2 p-4 shadow-inner sm:min-h-[330px] sm:p-5" aria-label="Kelajakdagi tahlil interfeysi namunasi">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-muted">Oylik dinamika</p>
                <p className="mt-1 text-lg font-bold tracking-[-0.03em]">Barqaror o‘sish</p>
              </div>
              <span className="rounded-lg bg-positive-soft px-2.5 py-1.5 text-[11px] font-bold text-positive-text">+12.4%</span>
            </div>

            <div className="mt-8 flex h-32 items-end gap-2 sm:gap-3" aria-hidden="true">
              {[34, 48, 42, 62, 56, 78, 88].map((height, index) => (
                <div key={height + index} className="flex h-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t-lg ${index === 6 ? "bg-accent" : "bg-primary/15 dark:bg-white/15"}`}
                    style={{ height: `${height}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 text-center text-[9px] font-medium text-faint" aria-hidden="true">
              <span>Yan</span><span>Fev</span><span>Mar</span><span>Apr</span><span>May</span><span>Iyn</span><span>Iyl</span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <PreviewMetric label="Trend" value="Ijobiy" tone="positive" />
              <PreviewMetric label="Tejash" value="18%" tone="accent" />
              <PreviewMetric label="Nazorat" value="Yaxshi" tone="neutral" />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Feature icon={<TrendIcon />} title="Sarf trendlari" text="Davrlar bo‘yicha aniq taqqoslash" />
        <Feature icon={<CategoryIcon />} title="Kategoriya tahlili" text="Pul qayerga ketayotganini ko‘ring" />
        <Feature icon={<InsightIcon />} title="Aqlli xulosalar" text="Amalga tatbiq qilinadigan tavsiyalar" />
      </div>
    </div>
  );
}

function PreviewMetric({ label, value, tone }: { label: string; value: string; tone: "positive" | "accent" | "neutral" }) {
  const toneClass = tone === "positive" ? "text-positive-text" : tone === "accent" ? "text-accent-text" : "text-fg";
  return (
    <div className="rounded-xl border border-line bg-surface/90 p-2.5 text-center backdrop-blur-sm">
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`mt-1 truncate text-[12px] font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="card flex items-start gap-3 p-4 sm:block sm:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">{icon}</span>
      <div className="min-w-0 sm:mt-4">
        <p className="text-[13.5px] font-bold tracking-[-0.015em]">{title}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{text}</p>
      </div>
    </div>
  );
}

function AnalyticsIcon() {
  return <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>;
}
function TrendIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></svg>;
}
function CategoryIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3v9h9" /></svg>;
}
function InsightIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4" /><path d="M8.5 15.5A7 7 0 1 1 15.5 15.5c-.9.7-1.5 1.4-1.5 2.5h-4c0-1.1-.6-1.8-1.5-2.5Z" /></svg>;
}
