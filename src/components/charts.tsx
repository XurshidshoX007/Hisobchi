"use client";

import { useRef, useState, type CSSProperties } from "react";
import { compact, formatAmount, monthLabel, shortDate } from "@/lib/money";
import { Icon } from "@/components/icon";

type Pt = { x: number; y: number };
const line = (pts: Pt[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

/** Income vs Expense grouped bars */
export function IncomeExpenseBars({
  data,
  height = 150,
}: {
  data: Array<{ month: string; income: number; expense: number }>;
  height?: number;
}) {
  const W = 320;
  const H = height;
  const pad = { top: 8, bottom: 22, left: 4, right: 4 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const group = innerW / Math.max(1, data.length);
  const barW = Math.max(4, group * 0.28);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
          x1={pad.left}
          x2={W - pad.right}
          y1={pad.top + innerH * (1 - g)}
          y2={pad.top + innerH * (1 - g)}
          stroke="var(--chart-grid)"
          strokeWidth="1"
        />
      ))}
      {data.map((d, i) => {
        const cx = pad.left + group * i + group / 2;
        const hi = (d.income / max) * innerH;
        const he = (d.expense / max) * innerH;
        return (
          <g key={d.month}>
            <rect
              x={cx - barW - 1.5}
              y={pad.top + innerH - hi}
              width={barW}
              height={Math.max(1, hi)}
              rx={Math.min(3, barW / 2)}
              fill="var(--positive)"
            />
            <rect
              x={cx + 1.5}
              y={pad.top + innerH - he}
              width={barW}
              height={Math.max(1, he)}
              rx={Math.min(3, barW / 2)}
              fill="var(--fg)"
              opacity={0.75}
            />
            <text x={cx} y={H - 6} textAnchor="middle" fontSize="8.5" fill="var(--muted)">
              {monthLabel(d.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Forecast projection with min/max uncertainty band and risk markers */
export function ForecastArea({
  data,
  height = 160,
  description = "Balans prognozi: min, o‘rta va max.",
}: {
  data: Array<{
    date: string;
    projectedMin: number;
    projectedBase: number;
    projectedMax: number;
    actual?: boolean;
    events?: Array<{ label: string; base: number }>;
  }>;
  height?: number;
  description?: string;
}) {
  const W = 320;
  const H = height;
  const pad = { top: 10, bottom: 18, left: 4, right: 4 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const values = data.flatMap((d) => [d.projectedMin, d.projectedMax, d.projectedBase]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => pad.left + (innerW * i) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.top + innerH - ((v - min) / span) * innerH;

  const base = data.map((d, i) => ({ x: x(i), y: y(d.projectedBase) }));
  const top = data.map((d, i) => ({ x: x(i), y: y(d.projectedMax) }));
  const bottom = [...data].reverse().map((d, i) => ({ x: x(data.length - 1 - i), y: y(d.projectedMin) }));
  const zeroY = y(0);

  const risks = data
    .map((d, i) => ({ ...d, i }))
    .filter((d) => d.projectedMin < 0);

  return (
    <ForecastAreaInteractive data={data} description={description} W={W} H={H} pad={pad} x={x} y={y} innerH={innerH}>
      <defs>
        <linearGradient id="fa-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line(top)} ${line(bottom).replace("M", "L")} Z`} fill="var(--fg)" opacity={0.07} />
      <path
        d={`${line(base)} L ${x(data.length - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`}
        fill="url(#fa-fill)"
      />
      {min < 0 ? (
        <line x1={pad.left} x2={W - pad.right} y1={zeroY} y2={zeroY} stroke="var(--negative)" strokeWidth="1" strokeDasharray="3 3" />
      ) : null}
      {(() => {
        const lastActual = data.reduce((last, item, index) => (item.actual ? index : last), -1);
        const actual = lastActual >= 0 ? base.slice(0, lastActual + 1) : [];
        const projected = lastActual >= 0 ? base.slice(Math.max(0, lastActual)) : base;
        return (
          <>
            {actual.length > 1 ? <path d={line(actual)} fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinecap="round" /> : null}
            {projected.length > 1 ? <path d={line(projected)} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeDasharray={lastActual >= 0 ? "5 5" : undefined} /> : null}
          </>
        );
      })()}
      {risks.map((r) => (
        <circle key={r.date} cx={x(r.i)} cy={y(r.projectedMin)} r="4.5" fill="var(--negative)" />
      ))}
      {[0, Math.floor(data.length / 2), data.length - 1].map((i) => (
        <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize="8.5" fill="var(--muted)">
          {shortDate(data[i]?.date ?? "")}
        </text>
      ))}
    </ForecastAreaInteractive>
  );
}

/** Hover/tap layer: crosshair + tooltip (date, min/base/max) for the forecast. */
function ForecastAreaInteractive({
  data,
  description,
  W,
  H,
  pad,
  x,
  y,
  innerH,
  children,
}: {
  data: Array<{
    date: string;
    projectedMin: number;
    projectedBase: number;
    projectedMax: number;
    actual?: boolean;
    events?: Array<{ label: string; base: number }>;
  }>;
  description: string;
  W: number;
  H: number;
  pad: { top: number; bottom: number; left: number; right: number };
  x: (i: number) => number;
  y: (v: number) => number;
  innerH: number;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const pick = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || data.length === 0) return;
    const rel = ((clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((rel - pad.left) / Math.max(1, W - pad.left - pad.right)) * (data.length - 1));
    setActive(Math.max(0, Math.min(data.length - 1, idx)));
  };

  const d = active !== null ? data[active] : null;
  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label={description}
        tabIndex={0}
        onFocus={() => setActive((value) => value ?? Math.max(0, data.length - 1))}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setActive((value) => Math.max(0, Math.min(data.length - 1, (value ?? 0) + (event.key === "ArrowRight" ? 1 : -1))));
        }}
        onMouseMove={(e) => pick(e.clientX)}
        onMouseLeave={() => setActive(null)}
        onTouchStart={(e) => pick(e.touches[0]?.clientX ?? 0)}
        onTouchMove={(e) => pick(e.touches[0]?.clientX ?? 0)}
        onTouchEnd={() => setActive(null)}
      >
        {children}
        {d && active !== null ? (
          <g>
            <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={x(active)} cy={y(d.projectedBase)} r="3.4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
          </g>
        ) : null}
      </svg>
      {d ? (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-1.5 text-[11px] shadow-lg">
          <span className="font-semibold">{shortDate(d.date)}</span>
          <span className="num ml-2">{compact(d.projectedBase)}</span>
          <span className="ml-2 text-muted">
            {compact(d.projectedMin)}–{compact(d.projectedMax)}
          </span>
          {d.events?.length ? <span className="mt-0.5 block max-w-56 truncate text-muted">Sabab: {d.events.map((event) => event.label).join(", ")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Balance history line */
export function BalanceLine({
  data,
  height = 130,
}: {
  data: Array<{ date: string; balance: number }>;
  height?: number;
}) {
  const W = 320;
  const H = height;
  const pad = { top: 10, bottom: 16, left: 4, right: 4 };
  const innerH = H - pad.top - pad.bottom;
  const innerW = W - pad.left - pad.right;
  if (data.length < 2) return <div className="h-24" />;
  const max = Math.max(...data.map((d) => d.balance));
  const min = Math.min(...data.map((d) => d.balance));
  const span = max - min || 1;
  const pts = data.map((d, i) => ({
    x: pad.left + (innerW * i) / (data.length - 1),
    y: pad.top + innerH - ((d.balance - min) / span) * innerH,
  }));
  const area = `${line(pts)} L ${pts[pts.length - 1].x} ${pad.top + innerH} L ${pts[0].x} ${pad.top + innerH} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <defs>
        <linearGradient id="bl-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--fg)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--fg)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#bl-fill)" />
      <path d={line(pts)} fill="none" stroke="var(--fg)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="3" fill="var(--fg)" />
      <circle cx={last.x} cy={last.y} r="6" fill="var(--fg)" opacity="0.15" />
    </svg>
  );
}

/** Horizontal category spending bars */
export function CategoryBars({
  items,
}: {
  items: Array<{ name: string; icon: string; amount: number; share: number }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  return (
    <div className="space-y-3.5">
      {items.map((c) => (
        <div key={c.name}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-medium">
              <Icon name={c.icon} size={14} className="mr-1.5 inline-block shrink-0 align-[-2px] text-muted" />
              {c.name}
            </span>
            <span className="num shrink-0 text-[13px] text-fg-soft">
              {formatAmount(c.amount)}
              <span className="ml-1.5 text-[11px] text-faint">{(c.share * 100).toFixed(0)}%</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${(c.amount / max) * 100}%`, background: "var(--fg)", opacity: 0.82 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Multi-segment donut for a category split.
 *
 * Geometry follows the design handoff: a 42-unit viewBox with r = 15.9 makes
 * the circumference ≈ 100, so a segment's stroke-dasharray IS its percentage —
 * no circumference maths at the call site, and no rounding drift between the
 * arc and the legend beside it.
 *
 * The chart is decorative markup; the readable version is the legend, so the
 * SVG is aria-hidden and the whole figure carries one text summary instead.
 */
export function CategoryDonut({
  items,
  size = 112,
}: {
  items: Array<{ name: string; share: number; color: string }>;
  size?: number;
}) {
  const R = 15.9155;
  // Each slice starts where the previous one ended, so the offsets are a
  // running total computed up front — no mutation during render.
  const slices = items.reduce<Array<{ name: string; color: string; pct: number; start: number }>>(
    (acc, item) => {
      const pct = Math.max(0, Math.min(100, item.share * 100));
      const previous = acc[acc.length - 1];
      const start = previous ? previous.start + previous.pct : 0;
      return pct > 0 ? [...acc, { name: item.name, color: item.color, pct, start }] : acc;
    },
    [],
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 42 42"
      className="shrink-0 -rotate-90"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="21" cy="21" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
      {slices.map((slice, index) => (
        <circle
          key={slice.name}
          cx="21"
          cy="21"
          r={R}
          fill="none"
          stroke={slice.color}
          strokeWidth="7"
          strokeDasharray={`${slice.pct} ${100 - slice.pct}`}
          /* dashoffset runs backwards along the path, hence the negation. */
          strokeDashoffset={-slice.start}
          style={{
            "--donut-dash": `${slice.pct} ${100 - slice.pct}`,
            "--donut-offset": `${-slice.start}`,
            animationDelay: `${index * 70}ms`,
          } as CSSProperties}
          className="donut-segment transition-[stroke-dasharray,stroke-dashoffset] duration-700 ease-out"
        />
      ))}
    </svg>
  );
}

/** Progress ring used for health score / budget usage */
export function Ring({
  value,
  size = 116,
  label,
  sublabel,
  tone = "auto",
  color: colorOverride,
  strokeWidth = 10,
}: {
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
  tone?: "auto" | "accent";
  /** Explicit colour when the ring's meaning is not "high is good". */
  color?: string;
  strokeWidth?: number;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 46;
  const c = 2 * Math.PI * r;
  const color =
    colorOverride ??
    (tone === "accent"
      ? "var(--accent)"
      : pct >= 0.8
        ? "var(--positive)"
        : pct >= 0.6
          ? "var(--warning)"
          : "var(--negative)");
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-3)" strokeWidth={strokeWidth} />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          className="transition-[stroke-dasharray] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute text-center">
        {label ? <div className="num text-xl font-semibold leading-none">{label}</div> : null}
        {sublabel ? <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">{sublabel}</div> : null}
      </div>
    </div>
  );
}

/** Small sparkline for savings trend */
export function Sparkline({ values, height = 44 }: { values: number[]; height?: number }) {
  const W = 120;
  const H = height;
  if (values.length < 2) return <div style={{ height: H }} />;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (W * i) / (values.length - 1),
    y: H - 4 - ((v - min) / span) * (H - 8),
  }));
  const positive = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none">
      <path
        d={line(pts)}
        fill="none"
        stroke={positive ? "var(--positive)" : "var(--negative)"}
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Cash flow calendar strip: green/red bars per day */
export function CashFlowStrip({
  data,
}: {
  data: Array<{ date: string; inflow: number; outflow: number; projectedBase: number }>;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.inflow, d.outflow)));
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {data.map((d) => {
        const hasEvent = d.inflow > 0 || d.outflow > 0;
        const negative = d.projectedBase < 0;
        return (
          <div
            key={d.date}
            className="flex w-[34px] shrink-0 flex-col items-center gap-1"
            title={`${shortDate(d.date)} · +${compact(d.inflow)} / -${compact(d.outflow)}`}
          >
            <div className="flex h-20 w-full flex-col justify-end gap-0.5">
              <div
                className="w-full rounded-sm bg-positive"
                style={{ height: `${(d.inflow / max) * 100}%`, minHeight: d.inflow > 0 ? 3 : 0 }}
              />
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${(d.outflow / max) * 100}%`,
                  minHeight: d.outflow > 0 ? 3 : 0,
                  background: negative ? "var(--negative)" : "var(--fg)",
                  opacity: 0.8,
                }}
              />
            </div>
            <span className={`text-[9px] ${hasEvent ? "text-muted" : "text-faint"}`}>{shortDate(d.date).split("-")[0]}</span>
          </div>
        );
      })}
    </div>
  );
}
